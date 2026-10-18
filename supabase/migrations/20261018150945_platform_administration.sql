-- Easy4Tutor platform administration. Cross-account access remains isolated
-- behind service-only, permission-checked functions and server-side queries.

alter table public.platform_admins
  add column role text not null default 'platform_admin',
  add column status text not null default 'active',
  add column reason text,
  add column revoked_at timestamptz,
  add column revoked_by uuid references auth.users(id) on delete set null;

alter table public.platform_admins
  add constraint platform_admins_role_check
    check (role in ('platform_owner', 'platform_admin', 'support_moderator')),
  add constraint platform_admins_status_check
    check (status in ('active', 'revoked')),
  add constraint platform_admins_reason_check
    check (reason is null or length(trim(reason)) between 1 and 500),
  add constraint platform_admins_revocation_check check (
    (status = 'active' and revoked_at is null and revoked_by is null)
    or (status = 'revoked' and revoked_at is not null and revoked_by is not null)
  );

-- The service client still needs SQL privileges even though it bypasses RLS.
-- Grant only the columns used by minimized administrative projections.
grant usage on schema public to service_role;
grant select on table public.profiles to service_role;
grant select on table public.subscriptions to service_role;
grant select on table public.payu_orders to service_role;
grant select on table public.workspace_members to service_role;

create index platform_admins_active_role_idx
  on public.platform_admins (role, granted_at)
  where status = 'active';

grant select on table public.platform_admins to service_role;

create table public.platform_admin_audit_logs (
  id bigint generated always as identity primary key,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  action text not null,
  target_type text not null,
  target_id text,
  reason text not null,
  metadata jsonb not null default '{}'::jsonb,
  succeeded boolean not null default true,
  occurred_at timestamptz not null default now(),
  constraint platform_admin_audit_action_check
    check (length(trim(action)) between 1 and 120),
  constraint platform_admin_audit_target_check
    check (length(trim(target_type)) between 1 and 80),
  constraint platform_admin_audit_reason_check
    check (length(trim(reason)) between 1 and 500),
  constraint platform_admin_audit_metadata_size_check
    check (octet_length(metadata::text) <= 8192)
);

create index platform_admin_audit_recent_idx
  on public.platform_admin_audit_logs (occurred_at desc, id desc);
create index platform_admin_audit_actor_idx
  on public.platform_admin_audit_logs (actor_user_id, occurred_at desc);
create index platform_admin_audit_target_idx
  on public.platform_admin_audit_logs (target_type, target_id, occurred_at desc);

create table public.account_suspensions (
  user_id uuid primary key references auth.users(id) on delete restrict,
  suspended_at timestamptz not null default now(),
  suspended_by uuid not null references auth.users(id) on delete restrict,
  reason text not null,
  restored_at timestamptz,
  restored_by uuid references auth.users(id) on delete restrict,
  restore_reason text,
  constraint account_suspension_reason_check
    check (length(trim(reason)) between 3 and 500),
  constraint account_restoration_check check (
    (restored_at is null and restored_by is null and restore_reason is null)
    or (restored_at is not null and restored_by is not null
      and length(trim(restore_reason)) between 3 and 500)
  )
);

create index account_suspensions_active_idx
  on public.account_suspensions (suspended_at desc)
  where restored_at is null;

create table public.subscription_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  kind text not null,
  tier text not null,
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id) on delete restrict,
  reason text not null,
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete restrict,
  revoke_reason text,
  constraint subscription_overrides_kind_check
    check (kind in ('promotional', 'support', 'billing_correction')),
  constraint subscription_overrides_tier_check
    check (tier in ('pro', 'founder')),
  constraint subscription_overrides_reason_check
    check (length(trim(reason)) between 3 and 500),
  constraint subscription_overrides_expiry_check
    check (expires_at is null or expires_at > created_at),
  constraint subscription_overrides_revocation_check check (
    (revoked_at is null and revoked_by is null and revoke_reason is null)
    or (revoked_at is not null and revoked_by is not null
      and length(trim(revoke_reason)) between 3 and 500)
  )
);

create unique index subscription_overrides_one_active_idx
  on public.subscription_overrides (user_id)
  where revoked_at is null;
create index subscription_overrides_admin_list_idx
  on public.subscription_overrides (created_at desc, id desc);

create table public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete restrict,
  subject text not null,
  description text not null,
  category text not null,
  priority text not null default 'normal',
  status text not null default 'open',
  assigned_to uuid references public.platform_admins(user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_user_message_at timestamptz not null default now(),
  constraint support_ticket_subject_check
    check (length(trim(subject)) between 3 and 160),
  constraint support_ticket_description_check
    check (length(trim(description)) between 10 and 5000),
  constraint support_ticket_category_check
    check (category in ('account', 'billing', 'calendar', 'lessons', 'other')),
  constraint support_ticket_priority_check
    check (priority in ('low', 'normal', 'high', 'urgent')),
  constraint support_ticket_status_check
    check (status in ('open', 'in_progress', 'waiting_for_user', 'resolved', 'closed'))
);

create index support_tickets_user_idx
  on public.support_tickets (user_id, updated_at desc);
create index support_tickets_queue_idx
  on public.support_tickets (status, priority, updated_at desc);

create table public.support_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  author_user_id uuid not null references auth.users(id) on delete restrict,
  body text not null,
  internal_note boolean not null default false,
  created_at timestamptz not null default now(),
  constraint support_ticket_message_body_check
    check (length(trim(body)) between 1 and 5000)
);

create index support_ticket_messages_ticket_idx
  on public.support_ticket_messages (ticket_id, created_at, id);

create table public.platform_operational_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  severity text not null,
  service text not null,
  status text not null default 'open',
  summary text not null,
  sanitized_metadata jsonb not null default '{}'::jsonb,
  retry_count integer not null default 0,
  idempotency_key text,
  occurred_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint platform_event_type_check
    check (length(trim(event_type)) between 1 and 100),
  constraint platform_event_severity_check
    check (severity in ('info', 'warning', 'error', 'critical')),
  constraint platform_event_service_check
    check (service in ('application', 'database', 'google_calendar', 'payu', 'webhook', 'scheduler')),
  constraint platform_event_status_check
    check (status in ('open', 'retrying', 'resolved', 'ignored')),
  constraint platform_event_summary_check
    check (length(trim(summary)) between 1 and 500),
  constraint platform_event_metadata_size_check
    check (octet_length(sanitized_metadata::text) <= 8192),
  constraint platform_event_retry_check check (retry_count >= 0),
  constraint platform_event_resolution_check check (
    (status in ('open', 'retrying') and resolved_at is null)
    or (status in ('resolved', 'ignored') and resolved_at is not null)
  )
);

create unique index platform_operational_events_idempotency_idx
  on public.platform_operational_events (idempotency_key)
  where idempotency_key is not null;
create index platform_operational_events_queue_idx
  on public.platform_operational_events (status, severity, occurred_at desc);

create table public.platform_settings (
  key text primary key,
  value jsonb not null,
  description text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete restrict,
  constraint platform_setting_key_check
    check (key in ('application_name', 'support_email', 'maintenance_notice',
      'registration_enabled', 'feature_flags', 'subscription_display')),
  constraint platform_setting_value_size_check
    check (octet_length(value::text) <= 16384)
);

insert into public.platform_settings (key, value, description) values
  ('application_name', '"Easy4Tutor"'::jsonb, 'Publiczna nazwa aplikacji'),
  ('support_email', '"support@easy4tutor.pl"'::jsonb, 'Publiczny adres pomocy'),
  ('maintenance_notice', 'null'::jsonb, 'Opcjonalny komunikat serwisowy'),
  ('registration_enabled', 'true'::jsonb, 'Dostępność rejestracji'),
  ('feature_flags', '{}'::jsonb, 'Bezpieczne flagi funkcji'),
  ('subscription_display', '{}'::jsonb, 'Konfiguracja prezentacji planów')
on conflict (key) do nothing;

alter table public.platform_admin_audit_logs enable row level security;
alter table public.account_suspensions enable row level security;
alter table public.subscription_overrides enable row level security;
alter table public.support_tickets enable row level security;
alter table public.support_ticket_messages enable row level security;
alter table public.platform_operational_events enable row level security;
alter table public.platform_settings enable row level security;

revoke all on table public.platform_admin_audit_logs from public, anon, authenticated, service_role;
revoke all on table public.account_suspensions from public, anon, authenticated, service_role;
revoke all on table public.subscription_overrides from public, anon, authenticated, service_role;
revoke all on table public.platform_operational_events from public, anon, authenticated, service_role;
revoke all on table public.platform_settings from public, anon, authenticated, service_role;
revoke all on table public.support_tickets from public, anon, authenticated;
revoke all on table public.support_ticket_messages from public, anon, authenticated;

grant select on table public.platform_admin_audit_logs to service_role;
grant select on table public.account_suspensions to service_role;
grant select on table public.subscription_overrides to service_role;
grant select on table public.platform_operational_events to service_role;
grant select on table public.platform_settings to service_role;
grant select, insert, update on table public.support_tickets to service_role;
grant select, insert on table public.support_ticket_messages to service_role;

grant select on table public.support_tickets to authenticated;
grant select on table public.support_ticket_messages to authenticated;

create policy support_tickets_read_own on public.support_tickets
  for select to authenticated
  using (user_id = (select auth.uid()));
create policy support_tickets_create_own on public.support_tickets
  for insert to authenticated
  with check (
    user_id = (select auth.uid()) and status = 'open'
    and assigned_to is null
    and created_at >= now() - interval '1 minute'
  );
create policy support_messages_read_own_public on public.support_ticket_messages
  for select to authenticated
  using (
    not internal_note and exists (
      select 1 from public.support_tickets ticket
      where ticket.id = ticket_id and ticket.user_id = (select auth.uid())
    )
  );
create policy support_messages_create_own on public.support_ticket_messages
  for insert to authenticated
  with check (
    author_user_id = (select auth.uid()) and not internal_note
    and exists (
      select 1 from public.support_tickets ticket
      where ticket.id = ticket_id and ticket.user_id = (select auth.uid())
        and ticket.status not in ('closed')
    )
  );

create or replace function public.create_support_ticket(
  ticket_subject text,
  ticket_description text,
  ticket_category text,
  ticket_priority text default 'normal'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  ticket_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if (
    select count(*) from public.support_tickets ticket
    where ticket.user_id = v_user_id
      and ticket.created_at >= now() - interval '1 hour'
  ) >= 5 then
    raise exception 'support ticket rate limit exceeded' using errcode = 'P0001';
  end if;
  insert into public.support_tickets (
    user_id, subject, description, category, priority
  ) values (
    v_user_id, trim(ticket_subject), trim(ticket_description),
    ticket_category, ticket_priority
  ) returning id into ticket_id;
  insert into public.support_ticket_messages (
    ticket_id, author_user_id, body, internal_note
  ) values (ticket_id, v_user_id, trim(ticket_description), false);
  return ticket_id;
end;
$$;

revoke all on function public.create_support_ticket(text, text, text, text)
  from public, anon;
grant execute on function public.create_support_ticket(text, text, text, text)
  to authenticated;

create or replace function public.add_support_ticket_message(
  target_ticket_id uuid,
  message_body text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  message_id uuid;
begin
  if v_user_id is null or not exists (
    select 1 from public.support_tickets ticket
    where ticket.id = target_ticket_id and ticket.user_id = v_user_id
      and ticket.status <> 'closed'
  ) then
    raise exception 'support ticket not found' using errcode = 'P0002';
  end if;
  if (
    select count(*) from public.support_ticket_messages message
    where message.author_user_id = v_user_id
      and message.created_at >= now() - interval '1 hour'
  ) >= 20 then
    raise exception 'support message rate limit exceeded' using errcode = 'P0001';
  end if;
  insert into public.support_ticket_messages (
    ticket_id, author_user_id, body, internal_note
  ) values (
    target_ticket_id, v_user_id, trim(message_body), false
  ) returning id into message_id;
  update public.support_tickets
    set updated_at = now(), last_user_message_at = now(),
        status = case when status = 'waiting_for_user' then 'open' else status end
    where id = target_ticket_id;
  return message_id;
end;
$$;

revoke all on function public.add_support_ticket_message(uuid, text)
  from public, anon;
grant execute on function public.add_support_ticket_message(uuid, text)
  to authenticated;

-- Authorization helpers never consult user-editable JWT metadata.
create or replace function private.platform_admin_role(target_user_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select administrator.role
  from public.platform_admins administrator
  where administrator.user_id = target_user_id
    and administrator.status = 'active';
$$;

revoke all on function private.platform_admin_role(uuid) from public;

create or replace function private.platform_admin_has_permission(
  target_user_id uuid,
  requested_permission text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case private.platform_admin_role(target_user_id)
    when 'platform_owner' then requested_permission = any(array[
      'overview.read', 'users.read', 'users.manage', 'subscriptions.read',
      'subscriptions.manage', 'payments.read', 'support.read', 'support.manage',
      'system.read', 'system.retry', 'audit.read', 'settings.read',
      'settings.manage', 'admins.manage', 'lifetime.manage'
    ])
    when 'platform_admin' then requested_permission = any(array[
      'overview.read', 'users.read', 'users.manage', 'subscriptions.read',
      'subscriptions.manage', 'payments.read', 'support.read', 'support.manage',
      'system.read', 'system.retry', 'audit.read', 'settings.read'
    ])
    when 'support_moderator' then requested_permission = any(array[
      'users.read', 'support.read', 'support.manage'
    ])
    else false
  end;
$$;

revoke all on function private.platform_admin_has_permission(uuid, text) from public;

create or replace function public.platform_admin_user_usage(
  actor_user_id uuid,
  target_user_ids uuid[]
)
returns table (user_id uuid, active_students bigint, lessons bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select target.user_id,
    (select count(*)
      from public.workspace_members member
      join public.students student on student.workspace_id = member.workspace_id
      where member.user_id = target.user_id and member.status = 'active'
        and student.status = 'active') as active_students,
    (select count(*) from public.lessons lesson
      where lesson.tutor_id = target.user_id) as lessons
  from unnest(target_user_ids) as target(user_id)
  where private.platform_admin_has_permission(actor_user_id, 'users.read');
$$;

revoke all on function public.platform_admin_user_usage(uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.platform_admin_user_usage(uuid, uuid[])
  to service_role;

create or replace function public.current_user_platform_admin_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$ select private.platform_admin_role((select auth.uid())); $$;

create or replace function public.current_user_is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select private.platform_admin_role((select auth.uid())) is not null; $$;

create or replace function public.current_user_has_admin_permission(
  requested_permission text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.platform_admin_has_permission(
    (select auth.uid()), requested_permission
  );
$$;

revoke all on function public.current_user_platform_admin_role() from public, anon;
revoke all on function public.current_user_is_platform_admin() from public, anon;
revoke all on function public.current_user_has_admin_permission(text) from public, anon;
grant execute on function public.current_user_platform_admin_role() to authenticated;
grant execute on function public.current_user_is_platform_admin() to authenticated;
grant execute on function public.current_user_has_admin_permission(text) to authenticated;

create or replace function private.append_platform_admin_audit(
  actor_id uuid,
  audit_action text,
  resource_type text,
  resource_id text,
  audit_reason text,
  audit_metadata jsonb default '{}'::jsonb,
  was_successful boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.platform_admin_audit_logs (
    actor_user_id, action, target_type, target_id, reason, metadata, succeeded
  ) values (
    actor_id, trim(audit_action), trim(resource_type), resource_id,
    trim(audit_reason), coalesce(audit_metadata, '{}'::jsonb), was_successful
  );
end;
$$;

revoke all on function private.append_platform_admin_audit(uuid, text, text, text, text, jsonb, boolean) from public;

create or replace function public.manage_platform_admin_role(
  target_user_id uuid,
  requested_role text,
  role_action text,
  action_reason text,
  actor_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_reason text := trim(coalesce(action_reason, ''));
  active_owner_count integer;
begin
  if not private.platform_admin_has_permission(actor_user_id, 'admins.manage') then
    raise exception 'platform owner permission required' using errcode = '42501';
  end if;
  if target_user_id = actor_user_id and role_action = 'revoke' then
    raise exception 'self revocation is not allowed' using errcode = '42501';
  end if;
  if requested_role not in ('platform_owner', 'platform_admin', 'support_moderator')
    or length(normalized_reason) not between 3 and 500 then
    raise exception 'invalid administrator role request' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users account where account.id = target_user_id) then
    raise exception 'target auth user not found' using errcode = 'P0002';
  end if;

  if role_action = 'grant' then
    insert into public.platform_admins (
      user_id, granted_at, granted_by, role, status, reason, revoked_at, revoked_by
    ) values (
      target_user_id, now(), actor_user_id, requested_role, 'active',
      normalized_reason, null, null
    )
    on conflict (user_id) do update
      set granted_at = excluded.granted_at,
          granted_by = excluded.granted_by,
          role = excluded.role,
          status = 'active',
          reason = excluded.reason,
          revoked_at = null,
          revoked_by = null;
  elsif role_action = 'revoke' then
    select count(*) into active_owner_count
    from public.platform_admins administrator
    where administrator.role = 'platform_owner'
      and administrator.status = 'active';
    if exists (
      select 1 from public.platform_admins administrator
      where administrator.user_id = target_user_id
        and administrator.role = 'platform_owner'
        and administrator.status = 'active'
    ) and active_owner_count <= 1 then
      raise exception 'last platform owner cannot be removed' using errcode = '23514';
    end if;
    update public.platform_admins
      set status = 'revoked', revoked_at = now(), revoked_by = actor_user_id,
          reason = normalized_reason
      where user_id = target_user_id and status = 'active';
    if not found then
      raise exception 'active administrator not found' using errcode = 'P0002';
    end if;
  else
    raise exception 'invalid administrator action' using errcode = '22023';
  end if;

  perform private.append_platform_admin_audit(
    actor_user_id, 'administrator.' || role_action, 'platform_admin',
    target_user_id::text, normalized_reason,
    jsonb_build_object('role', requested_role)
  );
end;
$$;

revoke all on function public.manage_platform_admin_role(uuid, text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.manage_platform_admin_role(uuid, text, text, text, uuid)
  to service_role;

create or replace function public.manage_account_suspension(
  target_user_id uuid,
  suspension_action text,
  action_reason text,
  actor_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare normalized_reason text := trim(coalesce(action_reason, ''));
begin
  if not private.platform_admin_has_permission(actor_user_id, 'users.manage') then
    raise exception 'user management permission required' using errcode = '42501';
  end if;
  if target_user_id = actor_user_id
    or private.platform_admin_role(target_user_id) = 'platform_owner' then
    raise exception 'protected administrator account' using errcode = '42501';
  end if;
  if length(normalized_reason) not between 3 and 500 then
    raise exception 'audit reason required' using errcode = '22023';
  end if;
  if suspension_action = 'suspend' then
    insert into public.account_suspensions (
      user_id, suspended_at, suspended_by, reason,
      restored_at, restored_by, restore_reason
    ) values (
      target_user_id, now(), actor_user_id, normalized_reason, null, null, null
    )
    on conflict (user_id) do update
      set suspended_at = excluded.suspended_at,
          suspended_by = excluded.suspended_by,
          reason = excluded.reason,
          restored_at = null, restored_by = null, restore_reason = null;
  elsif suspension_action = 'restore' then
    update public.account_suspensions
      set restored_at = now(), restored_by = actor_user_id,
          restore_reason = normalized_reason
      where user_id = target_user_id and restored_at is null;
    if not found then
      raise exception 'active suspension not found' using errcode = 'P0002';
    end if;
  else
    raise exception 'invalid suspension action' using errcode = '22023';
  end if;
  perform private.append_platform_admin_audit(
    actor_user_id, 'account.' || suspension_action, 'user',
    target_user_id::text, normalized_reason
  );
end;
$$;

revoke all on function public.manage_account_suspension(uuid, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.manage_account_suspension(uuid, text, text, uuid)
  to service_role;

create or replace function public.manage_support_ticket(
  target_ticket_id uuid,
  ticket_action text,
  action_value text,
  message_body text,
  is_internal_note boolean,
  action_reason text,
  actor_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare normalized_reason text := trim(coalesce(action_reason, ''));
begin
  if not private.platform_admin_has_permission(actor_user_id, 'support.manage') then
    raise exception 'support permission required' using errcode = '42501';
  end if;
  if length(normalized_reason) not between 3 and 500 then
    raise exception 'audit reason required' using errcode = '22023';
  end if;
  if not exists (select 1 from public.support_tickets where id = target_ticket_id) then
    raise exception 'support ticket not found' using errcode = 'P0002';
  end if;
  if ticket_action = 'status' then
    if action_value not in ('open', 'in_progress', 'waiting_for_user', 'resolved', 'closed') then
      raise exception 'invalid support status' using errcode = '22023';
    end if;
    update public.support_tickets
      set status = action_value, updated_at = now()
      where id = target_ticket_id;
  elsif ticket_action = 'assign' then
    if action_value <> actor_user_id::text then
      raise exception 'self assignment only' using errcode = '42501';
    end if;
    update public.support_tickets
      set assigned_to = actor_user_id, status = 'in_progress', updated_at = now()
      where id = target_ticket_id;
  elsif ticket_action <> 'message' then
    raise exception 'invalid support action' using errcode = '22023';
  end if;
  if length(trim(coalesce(message_body, ''))) > 0 then
    insert into public.support_ticket_messages (
      ticket_id, author_user_id, body, internal_note
    ) values (
      target_ticket_id, actor_user_id, trim(message_body), is_internal_note
    );
    update public.support_tickets set updated_at = now()
      where id = target_ticket_id;
  end if;
  perform private.append_platform_admin_audit(
    actor_user_id, 'support.' || ticket_action, 'support_ticket',
    target_ticket_id::text, normalized_reason,
    jsonb_build_object('value', action_value, 'internalNote', is_internal_note)
  );
end;
$$;

revoke all on function public.manage_support_ticket(uuid, text, text, text, boolean, text, uuid)
  from public, anon, authenticated;
grant execute on function public.manage_support_ticket(uuid, text, text, text, boolean, text, uuid)
  to service_role;

create or replace function public.update_platform_setting(
  setting_key text,
  setting_value jsonb,
  action_reason text,
  actor_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare normalized_reason text := trim(coalesce(action_reason, ''));
begin
  if not private.platform_admin_has_permission(actor_user_id, 'settings.manage') then
    raise exception 'settings management permission required' using errcode = '42501';
  end if;
  if setting_key not in ('application_name', 'support_email', 'maintenance_notice',
    'registration_enabled', 'feature_flags', 'subscription_display')
    or length(normalized_reason) not between 3 and 500
    or octet_length(setting_value::text) > 16384 then
    raise exception 'invalid platform setting' using errcode = '22023';
  end if;
  if setting_key = 'support_email'
    and (jsonb_typeof(setting_value) <> 'string'
      or trim(both '"' from setting_value::text) !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$') then
    raise exception 'invalid support email' using errcode = '22023';
  end if;
  if setting_key = 'registration_enabled' and jsonb_typeof(setting_value) <> 'boolean' then
    raise exception 'invalid registration setting' using errcode = '22023';
  end if;
  update public.platform_settings
    set value = setting_value, updated_at = now(), updated_by = actor_user_id
    where key = setting_key;
  if not found then raise exception 'setting not found' using errcode = 'P0002'; end if;
  perform private.append_platform_admin_audit(
    actor_user_id, 'setting.update', 'platform_setting', setting_key,
    normalized_reason
  );
end;
$$;

revoke all on function public.update_platform_setting(text, jsonb, text, uuid)
  from public, anon, authenticated;
grant execute on function public.update_platform_setting(text, jsonb, text, uuid)
  to service_role;

create or replace function public.manage_subscription_override(
  target_user_id uuid,
  override_action text,
  override_kind text,
  override_tier text,
  override_expires_at timestamptz,
  action_reason text,
  actor_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_reason text := trim(coalesce(action_reason, ''));
  override_id uuid;
begin
  if not private.platform_admin_has_permission(actor_user_id, 'subscriptions.manage') then
    raise exception 'subscription management permission required' using errcode = '42501';
  end if;
  if private.platform_admin_role(actor_user_id) = 'support_moderator'
    or length(normalized_reason) not between 3 and 500 then
    raise exception 'invalid subscription override request' using errcode = '42501';
  end if;
  if override_action = 'grant' then
    if override_kind not in ('promotional', 'support', 'billing_correction')
      or override_tier not in ('pro', 'founder')
      or (override_expires_at is not null and override_expires_at <= now()) then
      raise exception 'invalid subscription override' using errcode = '22023';
    end if;
    insert into public.subscription_overrides (
      user_id, kind, tier, created_by, reason, expires_at
    ) values (
      target_user_id, override_kind, override_tier, actor_user_id,
      normalized_reason, override_expires_at
    ) returning id into override_id;
  elsif override_action = 'revoke' then
    update public.subscription_overrides
      set revoked_at = now(), revoked_by = actor_user_id,
          revoke_reason = normalized_reason
      where user_id = target_user_id and revoked_at is null
      returning id into override_id;
    if override_id is null then
      raise exception 'active override not found' using errcode = 'P0002';
    end if;
  else
    raise exception 'invalid subscription override action' using errcode = '22023';
  end if;
  perform private.append_platform_admin_audit(
    actor_user_id, 'subscription_override.' || override_action,
    'subscription_override', override_id::text, normalized_reason,
    jsonb_build_object('targetUserId', target_user_id, 'kind', override_kind,
      'tier', override_tier, 'expiresAt', override_expires_at)
  );
  return override_id;
end;
$$;

revoke all on function public.manage_subscription_override(uuid, text, text, text, timestamptz, text, uuid)
  from public, anon, authenticated;
grant execute on function public.manage_subscription_override(uuid, text, text, text, timestamptz, text, uuid)
  to service_role;

-- Owner lifetime access and administrator roles are independent. Only a
-- separately provisioned platform owner may execute this trusted procedure.
create or replace function public.manage_owner_lifetime_access(
  target_user_id uuid,
  access_action text,
  access_reason text,
  actor_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_reason text := trim(coalesce(access_reason, ''));
  previous_read_only boolean := false;
begin
  if not private.platform_admin_has_permission(actor_user_id, 'lifetime.manage') then
    raise exception 'platform owner permission required' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.users account where account.id = target_user_id) then
    raise exception 'target auth user not found' using errcode = 'P0002';
  end if;
  if length(normalized_reason) not between 3 and 500 then
    raise exception 'audit reason required' using errcode = '22023';
  end if;
  if access_action = 'grant' then
    select coalesce(subscription.read_only, false) into previous_read_only
    from public.subscriptions subscription
    where subscription.teacher_id = target_user_id;
    insert into public.internal_access_grants (
      user_id, grant_type, granted_at, granted_by, revoked_at, revoked_by,
      reason, platform_admin_managed, prior_read_only
    ) values (
      target_user_id, 'owner_lifetime', now(), actor_user_id, null, null,
      normalized_reason, false, coalesce(previous_read_only, false)
    )
    on conflict (user_id, grant_type) do update
      set granted_at = excluded.granted_at, granted_by = excluded.granted_by,
          revoked_at = null, revoked_by = null, reason = excluded.reason,
          platform_admin_managed = false,
          prior_read_only = excluded.prior_read_only;
    update public.subscriptions set read_only = false, updated_at = now()
      where teacher_id = target_user_id;
  elsif access_action = 'revoke' then
    select access_grant.prior_read_only into previous_read_only
    from public.internal_access_grants access_grant
    where access_grant.user_id = target_user_id
      and access_grant.grant_type = 'owner_lifetime'
      and access_grant.revoked_at is null
    for update;
    if not found then
      raise exception 'active owner lifetime grant not found' using errcode = 'P0002';
    end if;
    update public.internal_access_grants
      set revoked_at = now(), revoked_by = actor_user_id,
          reason = normalized_reason, platform_admin_managed = false
      where user_id = target_user_id and grant_type = 'owner_lifetime';
    update public.subscriptions
      set read_only = coalesce(previous_read_only, false)
        or status in ('past_due', 'read_only', 'cancelled'),
          updated_at = now()
      where teacher_id = target_user_id;
  else
    raise exception 'invalid owner lifetime access action' using errcode = '22023';
  end if;
  insert into public.internal_access_grant_audit (
    user_id, grant_type, action, actor_user_id, reason
  ) values (
    target_user_id, 'owner_lifetime', access_action, actor_user_id,
    normalized_reason
  );
  perform private.append_platform_admin_audit(
    actor_user_id, 'owner_lifetime.' || access_action, 'user',
    target_user_id::text, normalized_reason
  );
end;
$$;

revoke all on function public.manage_owner_lifetime_access(uuid, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.manage_owner_lifetime_access(uuid, text, text, uuid)
  to service_role;

-- Suspension is checked at request authentication boundaries and remains
-- independent from data retention. No customer data is deleted.
create or replace function public.current_user_is_suspended()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.account_suspensions suspension
    where suspension.user_id = (select auth.uid())
      and suspension.restored_at is null
  );
$$;

revoke all on function public.current_user_is_suspended() from public, anon;
grant execute on function public.current_user_is_suspended() to authenticated;

create or replace function public.current_user_subscription_override()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select jsonb_build_object(
      'id', override.id,
      'tier', override.tier,
      'kind', override.kind,
      'expiresAt', override.expires_at
    )
    from public.subscription_overrides override
    where override.user_id = (select auth.uid())
      and override.revoked_at is null
      and (override.expires_at is null or override.expires_at > now())
    order by override.created_at desc
    limit 1
  ), 'null'::jsonb);
$$;

revoke all on function public.current_user_subscription_override()
  from public, anon;
grant execute on function public.current_user_subscription_override()
  to authenticated;

create or replace function public.record_platform_operational_event(
  event_kind text,
  event_severity text,
  event_service text,
  event_summary text,
  event_metadata jsonb default '{}'::jsonb,
  event_idempotency_key text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare event_id uuid;
begin
  insert into public.platform_operational_events (
    event_type, severity, service, summary, sanitized_metadata,
    idempotency_key
  ) values (
    event_kind, event_severity, event_service, event_summary,
    coalesce(event_metadata, '{}'::jsonb), event_idempotency_key
  )
  on conflict (idempotency_key) where idempotency_key is not null
  do update set occurred_at = excluded.occurred_at,
    retry_count = public.platform_operational_events.retry_count + 1,
    summary = excluded.summary,
    sanitized_metadata = excluded.sanitized_metadata,
    status = 'open', resolved_at = null
  returning id into event_id;
  return event_id;
end;
$$;

revoke all on function public.record_platform_operational_event(text, text, text, text, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.record_platform_operational_event(text, text, text, text, jsonb, text)
  to service_role;
