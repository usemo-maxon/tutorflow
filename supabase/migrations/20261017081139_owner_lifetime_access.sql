-- Platform Owner lifetime access is an internal authorization grant. It is
-- intentionally independent from workspace ownership and paid subscriptions.

create table public.internal_access_grants (
  user_id uuid not null references auth.users(id) on delete restrict,
  grant_type text not null,
  granted_at timestamptz not null default now(),
  granted_by uuid not null references auth.users(id) on delete restrict,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete restrict,
  reason text not null,
  platform_admin_managed boolean not null default false,
  prior_read_only boolean not null default false,
  primary key (user_id, grant_type),
  constraint internal_access_grants_type_check
    check (grant_type = 'owner_lifetime'),
  constraint internal_access_grants_reason_check
    check (length(trim(reason)) between 1 and 500),
  constraint internal_access_grants_revocation_check check (
    (revoked_at is null and revoked_by is null)
    or (revoked_at is not null and revoked_by is not null)
  )
);

create table public.internal_access_grant_audit (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete restrict,
  grant_type text not null,
  action text not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  reason text not null,
  occurred_at timestamptz not null default now(),
  constraint internal_access_grant_audit_type_check
    check (grant_type = 'owner_lifetime'),
  constraint internal_access_grant_audit_action_check
    check (action in ('grant', 'revoke')),
  constraint internal_access_grant_audit_reason_check
    check (length(trim(reason)) between 1 and 500)
);

create index internal_access_grant_audit_user_idx
  on public.internal_access_grant_audit (user_id, occurred_at desc);

alter table public.internal_access_grants enable row level security;
alter table public.internal_access_grant_audit enable row level security;

revoke all on table public.internal_access_grants
  from public, anon, authenticated;
revoke all on table public.internal_access_grant_audit
  from public, anon, authenticated;
revoke insert, update, delete, truncate, references, trigger
  on table public.internal_access_grants from service_role;
revoke insert, update, delete, truncate, references, trigger
  on table public.internal_access_grant_audit from service_role;
grant select on table public.internal_access_grants to service_role;
grant select on table public.internal_access_grant_audit to service_role;

create or replace function private.has_owner_lifetime_access(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.internal_access_grants access_grant
    where access_grant.user_id = target_user_id
      and access_grant.grant_type = 'owner_lifetime'
      and access_grant.revoked_at is null
  );
$$;

revoke all on function private.has_owner_lifetime_access(uuid) from public;

create or replace function public.current_user_has_owner_lifetime_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_owner_lifetime_access((select auth.uid()));
$$;

revoke all on function public.current_user_has_owner_lifetime_access()
  from public, anon;
grant execute on function public.current_user_has_owner_lifetime_access()
  to authenticated;

-- All grant and revocation writes go through this service-only procedure. The
-- actor must already be an explicitly provisioned platform administrator.
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
  platform_admin_was_present boolean;
  managed_platform_admin boolean;
  previous_read_only boolean;
begin
  if not exists (
    select 1 from public.platform_admins administrator
    where administrator.user_id = actor_user_id
  ) then
    raise exception 'trusted platform administrator required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from auth.users account where account.id = target_user_id
  ) then
    raise exception 'target auth user not found' using errcode = 'P0002';
  end if;
  if length(normalized_reason) not between 1 and 500 then
    raise exception 'audit reason required' using errcode = '22023';
  end if;

  if access_action = 'grant' then
    select access_grant.platform_admin_managed, access_grant.prior_read_only
    into managed_platform_admin, previous_read_only
    from public.internal_access_grants access_grant
    where access_grant.user_id = target_user_id
      and access_grant.grant_type = 'owner_lifetime'
      and access_grant.revoked_at is null
    for update;

    if not found then
      select exists (
        select 1 from public.platform_admins administrator
        where administrator.user_id = target_user_id
      ) into platform_admin_was_present;
      select coalesce(subscription.read_only, false)
      into previous_read_only
      from public.subscriptions subscription
      where subscription.teacher_id = target_user_id;
      managed_platform_admin := not platform_admin_was_present;
    end if;

    insert into public.platform_admins (user_id, granted_by)
    values (target_user_id, actor_user_id)
    on conflict (user_id) do nothing;

    insert into public.internal_access_grants (
      user_id, grant_type, granted_at, granted_by, revoked_at, revoked_by,
      reason, platform_admin_managed, prior_read_only
    ) values (
      target_user_id, 'owner_lifetime', now(), actor_user_id, null, null,
      normalized_reason, managed_platform_admin,
      coalesce(previous_read_only, false)
    )
    on conflict (user_id, grant_type) do update
    set granted_at = excluded.granted_at,
        granted_by = excluded.granted_by,
        revoked_at = null,
        revoked_by = null,
        reason = excluded.reason,
        platform_admin_managed = excluded.platform_admin_managed,
        prior_read_only = excluded.prior_read_only;

    -- Existing subscription data and billing history remain intact. This only
    -- clears the operational write lock while the lifetime grant is active.
    update public.subscriptions
    set read_only = false,
        updated_at = now()
    where teacher_id = target_user_id;

    insert into public.internal_access_grant_audit (
      user_id, grant_type, action, actor_user_id, reason
    ) values (
      target_user_id, 'owner_lifetime', 'grant', actor_user_id,
      normalized_reason
    );
  elsif access_action = 'revoke' then
    select access_grant.platform_admin_managed, access_grant.prior_read_only
    into managed_platform_admin, previous_read_only
    from public.internal_access_grants access_grant
    where access_grant.user_id = target_user_id
      and access_grant.grant_type = 'owner_lifetime'
      and access_grant.revoked_at is null
    for update;

    if not found then
      raise exception 'active owner lifetime grant not found' using errcode = 'P0002';
    end if;

    update public.internal_access_grants
    set revoked_at = now(),
        revoked_by = actor_user_id,
        reason = normalized_reason
    where user_id = target_user_id
      and grant_type = 'owner_lifetime';

    update public.subscriptions
    set read_only = coalesce(previous_read_only, false)
        or status in ('past_due', 'read_only', 'cancelled'),
        updated_at = now()
    where teacher_id = target_user_id;

    if managed_platform_admin then
      delete from public.platform_admins
      where user_id = target_user_id;
    end if;

    insert into public.internal_access_grant_audit (
      user_id, grant_type, action, actor_user_id, reason
    ) values (
      target_user_id, 'owner_lifetime', 'revoke', actor_user_id,
      normalized_reason
    );
  else
    raise exception 'invalid owner lifetime access action' using errcode = '22023';
  end if;
end;
$$;

revoke all on function public.manage_owner_lifetime_access(uuid, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.manage_owner_lifetime_access(uuid, text, text, uuid)
  to service_role;

-- Billing and maintenance writes may update subscription state, but cannot put
-- an active lifetime owner into read-only mode.
create or replace function private.preserve_owner_lifetime_write_access()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.has_owner_lifetime_access(new.teacher_id) then
    new.read_only := false;
  end if;
  return new;
end;
$$;

revoke all on function private.preserve_owner_lifetime_write_access()
  from public;

create trigger preserve_owner_lifetime_write_access
before insert or update on public.subscriptions
for each row execute function private.preserve_owner_lifetime_write_access();

-- PayU still records a genuine completed order, but it never rewrites the
-- subscription of a lifetime owner. Checkout is also blocked in the app.
create or replace function public.confirm_payu_order(
  p_ext_order_id text,
  p_payu_order_id text
)
returns table (teacher_id uuid, plan text, founder_awarded boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare target public.payu_orders%rowtype;
declare award_founder boolean := false;
declare owner_lifetime boolean := false;
begin
  perform pg_advisory_xact_lock(hashtext('tutorflow-founder-slots'));
  select * into target
  from public.payu_orders
  where ext_order_id = p_ext_order_id
  for update;

  if target.id is null then
    raise exception 'ORDER_NOT_FOUND';
  end if;
  if target.status = 'completed' then
    return query select target.teacher_id, target.plan, target.founder_awarded;
    return;
  end if;

  owner_lifetime := private.has_owner_lifetime_access(target.teacher_id);
  if not owner_lifetime and target.plan = 'monthly' and (
    select count(*)
    from public.subscriptions as subscription
    where subscription.plan = 'founder'
      and subscription.status = 'active'
  ) < 50 then
    award_founder := true;
  end if;

  update public.payu_orders
  set status = 'completed',
      payu_order_id = p_payu_order_id,
      founder_awarded = award_founder,
      updated_at = now()
  where id = target.id;

  if not owner_lifetime then
    update public.subscriptions
    set status = 'active',
        read_only = false,
        plan = case when award_founder then 'founder' else target.plan end,
        tier = case when award_founder then 'founder' else 'pro' end,
        billing_interval = case when award_founder then 'monthly' else target.plan end,
        renews_at = case
          when target.plan = 'annual' then now() + interval '1 year'
          else now() + interval '1 month'
        end,
        updated_at = now()
    where subscriptions.teacher_id = target.teacher_id;
  end if;

  return query
  select target.teacher_id,
    case when award_founder then 'founder' else target.plan end,
    award_founder;
end;
$$;

revoke all on function public.confirm_payu_order(text, text)
  from public, anon, authenticated;
grant execute on function public.confirm_payu_order(text, text) to service_role;

-- Public-booking conversion has its own database-enforced Free student cap.
-- Keep that enforcement for every normal account while exempting only the
-- internal lifetime grant.
create or replace function public.convert_public_booking(
  p_booking_id uuid,
  p_mode text,
  p_existing_student_id uuid default null,
  p_student jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_workspace_id uuid;
  v_booking public.bookings%rowtype;
  v_student_id uuid;
  v_lesson_id uuid;
  v_converted_at timestamptz;
  v_sync_status text;
  v_subscription record;
  v_first_name text;
  v_last_name text;
  v_email text;
  v_phone text;
  v_level text;
  v_goal text;
begin
  if v_user_id is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;

  select tutor.workspace_id
    into v_workspace_id
  from public.tutor_profiles tutor
  join public.workspace_members member
    on member.workspace_id = tutor.workspace_id
    and member.user_id = tutor.user_id and member.status = 'active'
  where tutor.id = v_user_id and tutor.user_id = v_user_id;
  if v_workspace_id is null then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0002';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 0)
  );
  select * into v_booking
  from public.bookings booking
  where booking.id = p_booking_id
    and booking.workspace_id = v_workspace_id
    and booking.tutor_id = v_user_id
    and booking.source = 'public_booking'
  for update;
  if v_booking.id is null then
    raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0002';
  end if;

  -- A network retry returns the committed references and cannot duplicate work.
  if v_booking.status = 'converted' then
    return jsonb_build_object(
      'bookingId', v_booking.id,
      'studentId', v_booking.student_id,
      'lessonId', v_booking.converted_lesson_id,
      'convertedAt', v_booking.converted_at,
      'alreadyConverted', true
    );
  end if;
  if v_booking.status <> 'confirmed' then
    raise exception 'BOOKING_NOT_CONVERTIBLE' using errcode = 'P0001';
  end if;

  select subscription.status, subscription.tier, subscription.read_only
    into v_subscription
  from public.subscriptions subscription
  where subscription.teacher_id = v_user_id;
  if v_subscription.read_only then
    raise exception 'READ_ONLY' using errcode = '42501';
  end if;

  -- The booking itself is the expected occupant. Only later lesson/block/
  -- external-calendar conflicts prevent conversion.
  if exists (
    select 1 from public.lessons lesson
    where lesson.workspace_id = v_workspace_id and lesson.tutor_id = v_user_id
      and lesson.status <> 'cancelled'
      and lesson.starts_at < v_booking.ends_at
      and lesson.ends_at > v_booking.starts_at
  ) or exists (
    select 1 from public.calendar_blocks block
    where block.workspace_id = v_workspace_id and block.tutor_id = v_user_id
      and block.starts_at < v_booking.ends_at
      and block.ends_at > v_booking.starts_at
  ) or (
    private.has_google_calendar_connection(v_workspace_id, v_user_id)
    and exists (
    select 1
    from public.external_google_events event
    where event.workspace_id = v_workspace_id and event.teacher_id = v_user_id
      and event.status <> 'cancelled' and event.transparency = 'opaque'
      and (
        (not event.all_day and event.starts_at < v_booking.ends_at
          and event.ends_at > v_booking.starts_at)
        or (event.all_day
          and (v_booking.starts_at at time zone v_booking.timezone)::date < event.end_date
          and (v_booking.ends_at at time zone v_booking.timezone)::date >= event.start_date)
      )
    )
  ) then
    raise exception 'BOOKING_CONFLICT' using errcode = '23P01';
  end if;

  if p_mode = 'existing' then
    select student.id into v_student_id
    from public.students student
    where student.id = p_existing_student_id
      and student.workspace_id = v_workspace_id
      and student.status = 'active';
    if v_student_id is null then
      raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0002';
    end if;
  elsif p_mode = 'new' then
    v_first_name := btrim(coalesce(p_student->>'firstName', ''));
    v_last_name := btrim(coalesce(p_student->>'lastName', ''));
    v_email := lower(btrim(coalesce(p_student->>'email', '')));
    v_phone := btrim(coalesce(p_student->>'phone', ''));
    v_level := btrim(coalesce(p_student->>'level', ''));
    v_goal := btrim(coalesce(p_student->>'goal', ''));
    if char_length(v_first_name) not between 1 and 120
      or char_length(v_last_name) > 120
      or char_length(v_email) > 255
      or (v_email <> '' and v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$')
      or char_length(v_phone) > 50 or char_length(v_level) > 80
      or char_length(v_goal) > 500 then
      raise exception 'INVALID_STUDENT' using errcode = '22023';
    end if;
    if v_subscription.tier = 'free' and v_subscription.status <> 'trial'
      and not private.has_owner_lifetime_access(v_user_id)
      and (select count(*) from public.students student
        where student.workspace_id = v_workspace_id and student.status = 'active') >= 3 then
      raise exception 'STUDENT_LIMIT_REACHED' using errcode = 'P0001';
    end if;
    insert into public.students (
      workspace_id, first_name, last_name, display_name, email, phone,
      timezone, status, level, goal, default_lesson_duration_minutes,
      default_lesson_price_grosz, currency, default_format
    ) values (
      v_workspace_id, v_first_name, v_last_name,
      concat_ws(' ', v_first_name, nullif(v_last_name, '')),
      nullif(v_email, ''), nullif(v_phone, ''), v_booking.timezone, 'active',
      nullif(v_level, ''), nullif(v_goal, ''), v_booking.duration_minutes,
      v_booking.price_grosz, v_booking.currency, v_booking.format::public.lesson_format
    ) returning id into v_student_id;
  else
    raise exception 'INVALID_CONVERSION_MODE' using errcode = '22023';
  end if;

  v_lesson_id := gen_random_uuid();
  v_converted_at := now();
  select case when private.has_google_calendar_connection(v_workspace_id, v_user_id)
    then 'pending' else 'disabled' end into v_sync_status;
  insert into public.lessons (
    id, workspace_id, tutor_id, student_id, title, subject,
    starts_at, ends_at, timezone, status, format, price_grosz, currency,
    billing_type, creation_mode, sync_status, client_request_id
  ) values (
    v_lesson_id, v_workspace_id, v_user_id, v_student_id,
    v_booking.event_type_name, null, v_booking.starts_at, v_booking.ends_at,
    v_booking.timezone, 'scheduled', v_booking.format::public.lesson_format,
    v_booking.price_grosz, v_booking.currency, 'per_lesson', 'single',
    v_sync_status, v_booking.id
  );
  insert into public.lesson_participants (workspace_id, lesson_id, student_id)
  values (v_workspace_id, v_lesson_id, v_student_id);
  insert into public.attendances (workspace_id, lesson_id, student_id)
  values (v_workspace_id, v_lesson_id, v_student_id);
  perform private.enqueue_lesson_side_effects(
    v_workspace_id, v_user_id, v_lesson_id, v_booking.starts_at,
    'scheduled', v_sync_status
  );

  update public.bookings
  set student_id = v_student_id,
      converted_lesson_id = v_lesson_id,
      converted_at = v_converted_at,
      status = 'converted',
      updated_at = v_converted_at
  where id = v_booking.id;

  return jsonb_build_object(
    'bookingId', v_booking.id,
    'studentId', v_student_id,
    'lessonId', v_lesson_id,
    'convertedAt', v_converted_at,
    'alreadyConverted', false
  );
end;
$$;

revoke all on function public.convert_public_booking(uuid, text, uuid, jsonb)
  from public, anon;
grant execute on function public.convert_public_booking(uuid, text, uuid, jsonb)
  to authenticated;
