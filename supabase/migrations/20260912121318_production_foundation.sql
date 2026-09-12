create schema if not exists private;

create type public.account_role as enum ('teacher', 'admin');
create type public.integration_provider as enum ('google', 'telegram', 'payu');
create type public.job_status as enum ('pending', 'processing', 'succeeded', 'failed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null default '',
  timezone text not null default 'Europe/Warsaw',
  role public.account_role not null default 'teacher',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_timezone_not_blank check (length(trim(timezone)) > 0)
);

create table public.subscriptions (
  teacher_id uuid primary key references public.profiles(id) on delete cascade,
  status text not null default 'trial' check (status in ('trial','active','past_due','read_only','cancelled')),
  plan text not null default 'trial' check (plan in ('trial','monthly','annual','founder')),
  read_only boolean not null default false,
  trial_ends_at timestamptz,
  renews_at timestamptz,
  updated_at timestamptz not null default now()
);

-- The existing domain service operates on one atomic aggregate per teacher.
-- Keeping that aggregate avoids rewriting validated product logic while moving
-- persistence to durable Postgres. version provides optimistic concurrency.
create table public.teacher_states (
  teacher_id uuid primary key references public.profiles(id) on delete cascade,
  state jsonb not null default '{"students":[],"lessons":[],"availability":[]}'::jsonb,
  version bigint not null default 1,
  updated_at timestamptz not null default now(),
  constraint teacher_states_shape check (
    jsonb_typeof(state->'students') = 'array' and
    jsonb_typeof(state->'lessons') = 'array' and
    jsonb_typeof(state->'availability') = 'array'
  )
);

create table public.integration_connections (
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  provider public.integration_provider not null,
  status text not null default 'not_connected' check (status in ('connected','not_connected','error')),
  label text,
  encrypted_credentials text,
  last_error text,
  updated_at timestamptz not null default now(),
  primary key (teacher_id, provider)
);

create table public.oauth_states (
  token_hash text primary key,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  provider public.integration_provider not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index oauth_states_expiry_idx on public.oauth_states (expires_at) where consumed_at is null;

create table public.google_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  lesson_id uuid not null,
  google_event_id text not null,
  status public.job_status not null default 'pending',
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  locked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (teacher_id, lesson_id)
);
create index google_sync_jobs_due_idx on public.google_sync_jobs (next_attempt_at) where status in ('pending','failed');

create table public.reminder_deliveries (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  lesson_id uuid not null,
  lead_minutes integer not null check (lead_minutes in (60, 1440)),
  scheduled_for timestamptz not null,
  status public.job_status not null default 'pending',
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (teacher_id, lesson_id, lead_minutes)
);
create index reminder_deliveries_due_idx on public.reminder_deliveries (next_attempt_at) where status in ('pending','failed');

create table public.telegram_link_codes (
  code_hash text primary key,
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.payu_orders (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  ext_order_id text not null unique,
  payu_order_id text unique,
  plan text not null check (plan in ('monthly','annual')),
  amount_grosz integer not null check (amount_grosz > 0),
  status text not null default 'created',
  founder_awarded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payu_orders_teacher_idx on public.payu_orders (teacher_id, created_at desc);

create table public.webhook_events (
  provider public.integration_provider not null,
  external_id text not null,
  payload_hash text not null,
  processed_at timestamptz not null default now(),
  primary key (provider, external_id)
);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  lesson_id uuid,
  student_id uuid,
  object_path text not null unique,
  original_name text not null,
  content_type text not null,
  size_bytes bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  expires_at timestamptz not null default (now() + interval '6 months'),
  created_at timestamptz not null default now(),
  constraint attachments_owner_path check (split_part(object_path, '/', 1) = teacher_id::text)
);
create index attachments_expiry_idx on public.attachments (expires_at);

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'admin'
  );
$$;
revoke all on function private.is_admin() from public;
grant usage on schema private to authenticated;
grant execute on function private.is_admin() to authenticated;

create or replace function public.update_teacher_state(expected_version bigint, new_state jsonb)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare new_version bigint;
begin
  update public.teacher_states
  set state = new_state, version = version + 1, updated_at = now()
  where teacher_id = (select auth.uid()) and version = expected_version
  returning version into new_version;
  if new_version is null then
    raise exception 'STATE_VERSION_CONFLICT' using errcode = '40001';
  end if;
  return new_version;
end;
$$;
revoke all on function public.update_teacher_state(bigint, jsonb) from public;
grant execute on function public.update_teacher_state(bigint, jsonb) to authenticated;

create or replace function public.confirm_payu_order(p_ext_order_id text, p_payu_order_id text)
returns table (teacher_id uuid, plan text, founder_awarded boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare target public.payu_orders%rowtype;
declare award_founder boolean := false;
begin
  perform pg_advisory_xact_lock(hashtext('tutorflow-founder-slots'));
  select * into target from public.payu_orders where ext_order_id = p_ext_order_id for update;
  if target.id is null then raise exception 'ORDER_NOT_FOUND'; end if;
  if target.status = 'completed' then
    return query select target.teacher_id, target.plan, target.founder_awarded;
    return;
  end if;
  if target.plan = 'monthly' and (select count(*) from public.subscriptions where plan = 'founder' and status = 'active') < 50 then
    award_founder := true;
  end if;
  update public.payu_orders set status = 'completed', payu_order_id = p_payu_order_id,
    founder_awarded = award_founder, updated_at = now() where id = target.id;
  update public.subscriptions set status = 'active', read_only = false,
    plan = case when award_founder then 'founder' else target.plan end,
    renews_at = case when target.plan = 'annual' then now() + interval '1 year' else now() + interval '1 month' end,
    updated_at = now() where subscriptions.teacher_id = target.teacher_id;
  return query select target.teacher_id, case when award_founder then 'founder' else target.plan end, award_founder;
end;
$$;
revoke all on function public.confirm_payu_order(text, text) from public, anon, authenticated;
grant execute on function public.confirm_payu_order(text, text) to service_role;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data->>'full_name', ''));
  insert into public.subscriptions (teacher_id, trial_ends_at)
  values (new.id, now() + interval '14 days');
  insert into public.teacher_states (teacher_id) values (new.id);
  return new;
end;
$$;
revoke all on function private.handle_new_user() from public;
create trigger on_auth_user_created after insert on auth.users
for each row execute function private.handle_new_user();

alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.teacher_states enable row level security;
alter table public.integration_connections enable row level security;
alter table public.oauth_states enable row level security;
alter table public.google_sync_jobs enable row level security;
alter table public.reminder_deliveries enable row level security;
alter table public.telegram_link_codes enable row level security;
alter table public.payu_orders enable row level security;
alter table public.webhook_events enable row level security;
alter table public.attachments enable row level security;

create policy profiles_select on public.profiles for select to authenticated
using (id = (select auth.uid()) or (select private.is_admin()));
create policy profiles_update_self on public.profiles for update to authenticated
using (id = (select auth.uid()) and role = 'teacher')
with check (id = (select auth.uid()) and role = 'teacher');

create policy subscriptions_select on public.subscriptions for select to authenticated
using (teacher_id = (select auth.uid()) or (select private.is_admin()));

create policy teacher_states_owner_all on public.teacher_states for all to authenticated
using (teacher_id = (select auth.uid())) with check (teacher_id = (select auth.uid()));
create policy integration_connections_owner_all on public.integration_connections for all to authenticated
using (teacher_id = (select auth.uid())) with check (teacher_id = (select auth.uid()));
create policy oauth_states_owner_all on public.oauth_states for all to authenticated
using (teacher_id = (select auth.uid())) with check (teacher_id = (select auth.uid()));
create policy google_sync_jobs_owner_select on public.google_sync_jobs for select to authenticated
using (teacher_id = (select auth.uid()));
create policy google_sync_jobs_owner_insert on public.google_sync_jobs for insert to authenticated
with check (teacher_id = (select auth.uid()));
create policy google_sync_jobs_owner_update on public.google_sync_jobs for update to authenticated
using (teacher_id = (select auth.uid())) with check (teacher_id = (select auth.uid()));
create policy reminder_deliveries_owner_select on public.reminder_deliveries for select to authenticated
using (teacher_id = (select auth.uid()));
create policy reminder_deliveries_owner_insert on public.reminder_deliveries for insert to authenticated
with check (teacher_id = (select auth.uid()));
create policy reminder_deliveries_owner_update on public.reminder_deliveries for update to authenticated
using (teacher_id = (select auth.uid())) with check (teacher_id = (select auth.uid()));
create policy reminder_deliveries_owner_delete on public.reminder_deliveries for delete to authenticated
using (teacher_id = (select auth.uid()));
create policy telegram_link_codes_owner_all on public.telegram_link_codes for all to authenticated
using (teacher_id = (select auth.uid())) with check (teacher_id = (select auth.uid()));
create policy payu_orders_owner_select on public.payu_orders for select to authenticated
using (teacher_id = (select auth.uid()));
create policy payu_orders_owner_insert on public.payu_orders for insert to authenticated
with check (teacher_id = (select auth.uid()));
create policy attachments_owner_all on public.attachments for all to authenticated
using (teacher_id = (select auth.uid())) with check (teacher_id = (select auth.uid()));

-- No authenticated/anon policies are intentionally defined on webhook_events.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attachments', 'attachments', false, 10485760,
  array['application/pdf','image/jpeg','image/png','text/plain','application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy attachments_objects_select on storage.objects for select to authenticated
using (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy attachments_objects_insert on storage.objects for insert to authenticated
with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy attachments_objects_update on storage.objects for update to authenticated
using (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text)
with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy attachments_objects_delete on storage.objects for delete to authenticated
using (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);

grant select, update on public.profiles to authenticated;
grant select on public.subscriptions to authenticated;
grant select, insert, update, delete on public.teacher_states,
  public.oauth_states, public.telegram_link_codes, public.attachments to authenticated;
revoke all on public.integration_connections from authenticated;
grant select (teacher_id, provider, status, label, last_error, updated_at)
  on public.integration_connections to authenticated;
grant select, insert, update on public.google_sync_jobs to authenticated;
grant select, insert, update, delete on public.reminder_deliveries to authenticated;
grant select, insert on public.payu_orders to authenticated;
