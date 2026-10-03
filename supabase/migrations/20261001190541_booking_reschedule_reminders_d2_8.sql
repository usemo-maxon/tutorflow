-- D2.8: atomic guest rescheduling and idempotent daily booking reminders.
alter table public.booking_availability_settings
  add column reschedule_notice_hours integer not null default 24,
  add column reminder_24_hours_enabled boolean not null default true,
  add constraint booking_availability_settings_reschedule_check
    check (reschedule_notice_hours between 0 and 720);

alter table public.bookings
  add column management_token_ciphertext text,
  add column rescheduled_at timestamptz,
  add column reschedule_count integer not null default 0,
  add constraint bookings_reschedule_count_check check (reschedule_count >= 0);

-- Tutor-facing reads do not need either token representation. Column grants
-- keep these server-only even though the booking row itself is tutor-visible.
revoke select on public.bookings from authenticated;
grant select (
  id, workspace_id, student_id, tutor_id, starts_at, ends_at, timezone,
  status, source, converted_lesson_id, created_at, updated_at, event_type_id,
  event_type_name, duration_minutes, price_grosz, currency, format,
  guest_name, guest_email, guest_phone, guest_level, guest_goal, guest_message,
  converted_at, confirmation_email_sent_at, cancelled_at, cancelled_by,
  rescheduled_at, reschedule_count
) on public.bookings to authenticated;

-- These RPCs must retain table access after the token columns are removed from
-- authenticated grants. Each validates the acting tutor through auth.uid().
alter function public.convert_public_booking(uuid, text, uuid, jsonb) security definer;
alter function private.cancel_public_booking_transition(uuid, text, text, uuid) security definer;
alter function public.cancel_public_booking_as_tutor(uuid) security definer;
revoke execute on function private.cancel_public_booking_transition(uuid, text, text, uuid) from authenticated;

-- The canonical D2.3/D2.4 predicate remains the only availability algorithm.
-- A transaction-local exclusion lets the current booking release its own range
-- while a reschedule is being evaluated.
create or replace function private.public_booking_slot_is_available(
  p_workspace_id uuid,
  p_tutor_id uuid,
  p_timezone text,
  p_duration integer,
  p_starts_at timestamptz,
  p_ends_at timestamptz
)
returns boolean
language plpgsql stable security invoker set search_path = '' as $$
declare
  v_notice integer := 12;
  v_horizon integer := 30;
  v_local_start timestamp;
  v_local_date date;
  v_start_minute integer;
  v_end_minute integer;
  v_excluded_booking_id uuid;
begin
  v_excluded_booking_id := nullif(
    pg_catalog.current_setting('easy4tutor.exclude_booking_id', true), ''
  )::uuid;
  select minimum_notice_hours, booking_horizon_days
    into v_notice, v_horizon
  from public.booking_availability_settings
  where tutor_id = p_tutor_id;
  v_notice := coalesce(v_notice, 12);
  v_horizon := coalesce(v_horizon, 30);
  v_local_start := p_starts_at at time zone p_timezone;
  v_local_date := v_local_start::date;
  v_start_minute := extract(hour from v_local_start)::integer * 60
    + extract(minute from v_local_start)::integer;
  v_end_minute := v_start_minute + p_duration;

  if p_duration < 1 or p_ends_at <> p_starts_at + make_interval(mins => p_duration)
    or extract(second from v_local_start) <> 0
    or mod(v_start_minute, 15) <> 0 or v_end_minute > 1440
    or p_starts_at < now() + make_interval(hours => v_notice)
    or p_starts_at > now() + make_interval(days => v_horizon) then
    return false;
  end if;

  if exists (
    select 1 from public.availability_exceptions x
    where x.workspace_id = p_workspace_id and x.tutor_id = p_tutor_id
      and x.exception_date = v_local_date and x.kind = 'unavailable'
      and (x.start_time is null or (
        v_start_minute < extract(hour from x.end_time) * 60 + extract(minute from x.end_time)
        and v_end_minute > extract(hour from x.start_time) * 60 + extract(minute from x.start_time)
      ))
  ) then return false; end if;

  if exists (
    select 1 from public.availability_exceptions x
    where x.workspace_id = p_workspace_id and x.tutor_id = p_tutor_id
      and x.exception_date = v_local_date and x.kind = 'available'
  ) and not exists (
    select 1 from public.availability_exceptions x
    where x.workspace_id = p_workspace_id and x.tutor_id = p_tutor_id
      and x.exception_date = v_local_date and x.kind = 'available'
      and (x.start_time is null or (
        v_start_minute >= extract(hour from x.start_time) * 60 + extract(minute from x.start_time)
        and v_end_minute <= extract(hour from x.end_time) * 60 + extract(minute from x.end_time)
      ))
  ) then return false; end if;

  if exists (
    select 1 from public.availability_rules r
    where r.workspace_id = p_workspace_id and r.tutor_id = p_tutor_id
      and not r.is_available and (
        (r.kind = 'single' and p_starts_at < r.ends_at and p_ends_at > r.starts_at)
        or (r.kind = 'recurring' and r.day_of_week = extract(isodow from v_local_date)
          and (r.all_day or (
            v_start_minute < extract(hour from r.end_time) * 60 + extract(minute from r.end_time)
            and v_end_minute > extract(hour from r.start_time) * 60 + extract(minute from r.start_time)
          )))
      )
  ) then return false; end if;

  if exists (
    select 1 from public.availability_rules r
    where r.workspace_id = p_workspace_id and r.tutor_id = p_tutor_id
      and r.is_available and r.kind = 'recurring'
  ) and not exists (
    select 1 from public.availability_rules r
    where r.workspace_id = p_workspace_id and r.tutor_id = p_tutor_id
      and r.is_available and r.kind = 'recurring'
      and r.day_of_week = extract(isodow from v_local_date)
      and (r.all_day or (
        v_start_minute >= extract(hour from r.start_time) * 60 + extract(minute from r.start_time)
        and v_end_minute <= extract(hour from r.end_time) * 60 + extract(minute from r.end_time)
      ))
  ) then return false; end if;

  if exists (
    select 1 from public.lessons l
    where l.workspace_id = p_workspace_id and l.tutor_id = p_tutor_id
      and l.status <> 'cancelled' and p_starts_at < l.ends_at and p_ends_at > l.starts_at
  ) or exists (
    select 1 from public.calendar_blocks b
    where b.workspace_id = p_workspace_id and b.tutor_id = p_tutor_id
      and p_starts_at < b.ends_at and p_ends_at > b.starts_at
  ) or exists (
    select 1 from public.bookings b
    where b.workspace_id = p_workspace_id and b.tutor_id = p_tutor_id
      and b.status in ('pending', 'confirmed')
      and (v_excluded_booking_id is null or b.id <> v_excluded_booking_id)
      and p_starts_at < b.ends_at and p_ends_at > b.starts_at
  ) or exists (
    select 1 from public.external_google_events g
    join public.integration_connections i on i.id = g.connection_id
    where g.workspace_id = p_workspace_id and g.teacher_id = p_tutor_id
      and i.status = 'connected' and g.status <> 'cancelled'
      and g.transparency <> 'transparent'
      and ((not g.all_day and p_starts_at < g.ends_at and p_ends_at > g.starts_at)
        or (g.all_day and v_local_date >= g.start_date and v_local_date < g.end_date))
  ) then return false; end if;

  return true;
end;
$$;

create function public.get_public_booking_reschedule_availability(
  p_token_hash text,
  p_start_date date,
  p_end_date date
)
returns table (date date, starts_at timestamptz, ends_at timestamptz, timezone text)
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_booking public.bookings%rowtype;
  v_slug text;
  v_notice integer := 24;
  v_previous_exclusion text;
begin
  if p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'BOOKING_UNAVAILABLE' using errcode = 'P0002';
  end if;
  select booking.* into v_booking
  from public.bookings booking
  where booking.management_token_hash = p_token_hash
    and booking.source = 'public_booking'
  limit 1;
  if v_booking.id is null then
    raise exception 'BOOKING_UNAVAILABLE' using errcode = 'P0002';
  end if;
  select profile.slug, coalesce(settings.reschedule_notice_hours, 24)
    into v_slug, v_notice
  from public.tutor_public_profiles profile
  left join public.booking_availability_settings settings
    on settings.tutor_id = v_booking.tutor_id
  where profile.tutor_id = v_booking.tutor_id
    and profile.workspace_id = v_booking.workspace_id
  limit 1;
  if v_booking.status = 'converted' then
    raise exception 'BOOKING_CONVERTED' using errcode = 'P0001';
  end if;
  if v_booking.status = 'cancelled' then
    raise exception 'BOOKING_CANCELLED' using errcode = 'P0001';
  end if;
  if now() >= v_booking.starts_at - make_interval(hours => v_notice) then
    raise exception 'BOOKING_RESCHEDULE_DEADLINE' using errcode = 'P0001';
  end if;
  v_previous_exclusion := pg_catalog.current_setting(
    'easy4tutor.exclude_booking_id', true
  );
  perform pg_catalog.set_config(
    'easy4tutor.exclude_booking_id', v_booking.id::text, true
  );
  return query select available.date, available.starts_at,
    available.ends_at, available.timezone
  from public.get_public_tutor_availability(
    v_slug, v_booking.event_type_id, p_start_date, p_end_date
  ) available;
  perform pg_catalog.set_config(
    'easy4tutor.exclude_booking_id', coalesce(v_previous_exclusion, ''), true
  );
end;
$$;
revoke all on function public.get_public_booking_reschedule_availability(text, date, date)
  from public, anon, authenticated;
grant execute on function public.get_public_booking_reschedule_availability(text, date, date)
  to service_role;

create function public.reschedule_public_booking_by_token(
  p_token_hash text,
  p_starts_at timestamptz
)
returns table (
  booking_id uuid, tutor_id uuid, event_type_id uuid, event_type_name text,
  duration_minutes integer, price_grosz bigint, currency text, format text,
  starts_at timestamptz, ends_at timestamptz, timezone text,
  guest_name text, guest_email text, tutor_public_name text,
  public_location text, rescheduled_at timestamptz, reschedule_count integer,
  reschedule_notice_hours integer, cancellation_notice_hours integer,
  created_at timestamptz
)
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_booking public.bookings%rowtype;
  v_tutor_id uuid;
  v_notice integer := 24;
  v_cancel_notice integer := 24;
  v_public_name text;
  v_public_location text;
  v_ends_at timestamptz;
  v_previous_exclusion text;
begin
  if p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'BOOKING_UNAVAILABLE' using errcode = 'P0002';
  end if;
  select booking.tutor_id into v_tutor_id
  from public.bookings booking
  where booking.management_token_hash = p_token_hash
    and booking.source = 'public_booking';
  if v_tutor_id is null then
    raise exception 'BOOKING_UNAVAILABLE' using errcode = 'P0002';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_tutor_id::text, 0)
  );
  select booking.* into v_booking
  from public.bookings booking
  where booking.management_token_hash = p_token_hash
    and booking.source = 'public_booking'
  for update;
  if v_booking.id is null then
    raise exception 'BOOKING_UNAVAILABLE' using errcode = 'P0002';
  end if;
  select coalesce(settings.reschedule_notice_hours, 24),
      coalesce(settings.cancellation_notice_hours, 24), profile.public_name,
      case when v_booking.format = 'offline'
        then nullif(btrim(profile.city), '') end
    into v_notice, v_cancel_notice, v_public_name, v_public_location
  from public.tutor_public_profiles profile
  left join public.booking_availability_settings settings
    on settings.tutor_id = v_booking.tutor_id
  where profile.tutor_id = v_booking.tutor_id
    and profile.workspace_id = v_booking.workspace_id;
  if v_booking.status = 'converted' then
    raise exception 'BOOKING_CONVERTED' using errcode = 'P0001';
  end if;
  if v_booking.status = 'cancelled' then
    raise exception 'BOOKING_CANCELLED' using errcode = 'P0001';
  end if;
  if v_booking.status <> 'confirmed' then
    raise exception 'BOOKING_UNAVAILABLE' using errcode = 'P0002';
  end if;
  if now() >= v_booking.starts_at - make_interval(hours => v_notice) then
    raise exception 'BOOKING_RESCHEDULE_DEADLINE' using errcode = 'P0001';
  end if;

  v_ends_at := p_starts_at + make_interval(mins => v_booking.duration_minutes);
  v_previous_exclusion := pg_catalog.current_setting(
    'easy4tutor.exclude_booking_id', true
  );
  perform pg_catalog.set_config(
    'easy4tutor.exclude_booking_id', v_booking.id::text, true
  );
  if not private.public_booking_slot_is_available(
    v_booking.workspace_id, v_booking.tutor_id, v_booking.timezone,
    v_booking.duration_minutes, p_starts_at, v_ends_at
  ) then
    raise exception 'BOOKING_SLOT_UNAVAILABLE' using errcode = 'P0001';
  end if;

  begin
    update public.bookings booking
    set starts_at = p_starts_at, ends_at = v_ends_at,
      rescheduled_at = now(), reschedule_count = booking.reschedule_count + 1,
      updated_at = now()
    where booking.id = v_booking.id
    returning booking.* into v_booking;
  exception when exclusion_violation or unique_violation then
    raise exception 'BOOKING_SLOT_UNAVAILABLE' using errcode = 'P0001';
  end;
  perform pg_catalog.set_config(
    'easy4tutor.exclude_booking_id', coalesce(v_previous_exclusion, ''), true
  );

  return query select v_booking.id, v_booking.tutor_id,
    v_booking.event_type_id, v_booking.event_type_name,
    v_booking.duration_minutes, v_booking.price_grosz, v_booking.currency,
    v_booking.format, v_booking.starts_at, v_booking.ends_at,
    v_booking.timezone, v_booking.guest_name, v_booking.guest_email,
    v_public_name, v_public_location, v_booking.rescheduled_at,
    v_booking.reschedule_count, v_notice, v_cancel_notice,
    v_booking.created_at;
end;
$$;
revoke all on function public.reschedule_public_booking_by_token(text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.reschedule_public_booking_by_token(text, timestamptz)
  to service_role;

-- Replace the D2.7 command with a server-only overload that additionally keeps
-- an encrypted copy of the raw token for the scheduled reminder worker.
drop function public.create_public_booking(
  text, uuid, timestamptz, text, text, text, text, text, text, text
);
create function public.create_public_booking(
  p_slug text, p_event_type_id uuid, p_starts_at timestamptz,
  p_guest_name text, p_guest_email text, p_guest_phone text,
  p_guest_level text, p_guest_goal text, p_guest_message text,
  p_management_token_hash text, p_management_token_ciphertext text
)
returns table (
  booking_id uuid, tutor_id uuid, event_type_id uuid, event_type_name text,
  duration_minutes integer, price_grosz bigint, currency text, format text,
  starts_at timestamptz, ends_at timestamptz, timezone text, guest_name text,
  guest_email text, tutor_public_name text, public_location text,
  created_at timestamptz
)
language plpgsql volatile security definer set search_path = '' as $$
declare
  v_booking_id uuid; v_tutor_id uuid; v_workspace_id uuid; v_timezone text;
  v_event_name text; v_duration integer; v_price bigint; v_currency text;
  v_format text; v_ends_at timestamptz; v_email text; v_public_name text;
  v_public_location text; v_created_at timestamptz;
begin
  v_email := lower(btrim(coalesce(p_guest_email, '')));
  if char_length(btrim(coalesce(p_guest_name, ''))) not between 1 and 120
    or char_length(v_email) not between 3 and 255
    or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    or char_length(coalesce(p_guest_phone, '')) > 50
    or char_length(coalesce(p_guest_level, '')) > 80
    or char_length(coalesce(p_guest_goal, '')) > 500
    or char_length(coalesce(p_guest_message, '')) > 2000
    or p_management_token_hash is null
    or p_management_token_hash !~ '^[0-9a-f]{64}$'
    or char_length(coalesce(p_management_token_ciphertext, '')) < 20 then
    raise exception 'PUBLIC_BOOKING_INVALID_GUEST' using errcode = '22023';
  end if;
  select profile.tutor_id, profile.workspace_id, account.timezone, event.name,
      event.duration_minutes, event.price_grosz, event.currency, event.format,
      profile.public_name,
      case when event.format = 'offline' then nullif(btrim(profile.city), '') end
    into v_tutor_id, v_workspace_id, v_timezone, v_event_name, v_duration,
      v_price, v_currency, v_format, v_public_name, v_public_location
  from public.tutor_public_profiles profile
  join public.tutor_profiles tutor on tutor.id = profile.tutor_id
  join public.profiles account on account.id = tutor.user_id
  join public.workspace_members member on member.workspace_id = profile.workspace_id
    and member.user_id = tutor.user_id
  join public.booking_event_types event on event.id = p_event_type_id
    and event.tutor_id = profile.tutor_id and event.workspace_id = profile.workspace_id
  where profile.enabled and lower(profile.slug) = lower(btrim(p_slug))
    and member.status = 'active' and event.is_active and event.is_public
  limit 1;
  if v_tutor_id is null then
    raise exception 'PUBLIC_BOOKING_OFFER_NOT_FOUND' using errcode = 'P0001';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_tutor_id::text, 0)
  );
  v_ends_at := p_starts_at + make_interval(mins => v_duration);
  if not private.public_booking_slot_is_available(
    v_workspace_id, v_tutor_id, v_timezone, v_duration, p_starts_at, v_ends_at
  ) then
    raise exception 'PUBLIC_BOOKING_SLOT_UNAVAILABLE' using errcode = 'P0001';
  end if;
  begin
    insert into public.bookings (
      workspace_id, tutor_id, event_type_id, event_type_name, duration_minutes,
      price_grosz, currency, format, starts_at, ends_at, timezone, status,
      source, guest_name, guest_email, guest_phone, guest_level, guest_goal,
      guest_message, management_token_hash, management_token_ciphertext
    ) values (
      v_workspace_id, v_tutor_id, p_event_type_id, v_event_name, v_duration,
      v_price, v_currency, v_format, p_starts_at, v_ends_at, v_timezone,
      'confirmed', 'public_booking', btrim(p_guest_name), v_email,
      nullif(btrim(p_guest_phone), ''), nullif(btrim(p_guest_level), ''),
      nullif(btrim(p_guest_goal), ''), nullif(btrim(p_guest_message), ''),
      p_management_token_hash, p_management_token_ciphertext
    ) returning id, public.bookings.created_at into v_booking_id, v_created_at;
  exception when exclusion_violation or unique_violation then
    raise exception 'PUBLIC_BOOKING_SLOT_UNAVAILABLE' using errcode = 'P0001';
  end;
  return query select v_booking_id, v_tutor_id, p_event_type_id, v_event_name,
    v_duration, v_price, v_currency, v_format, p_starts_at, v_ends_at,
    v_timezone, btrim(p_guest_name), v_email, v_public_name,
    v_public_location, v_created_at;
end;
$$;
revoke all on function public.create_public_booking(
  text, uuid, timestamptz, text, text, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.create_public_booking(
  text, uuid, timestamptz, text, text, text, text, text, text, text, text
) to service_role;

-- Compatibility for already deployed D2.7 server versions during a rolling
-- deployment. New code always uses the encrypted-token overload above.
create function public.create_public_booking(
  p_slug text, p_event_type_id uuid, p_starts_at timestamptz,
  p_guest_name text, p_guest_email text, p_guest_phone text,
  p_guest_level text, p_guest_goal text, p_guest_message text,
  p_management_token_hash text
)
returns table (
  booking_id uuid, tutor_id uuid, event_type_id uuid, event_type_name text,
  duration_minutes integer, price_grosz bigint, currency text, format text,
  starts_at timestamptz, ends_at timestamptz, timezone text, guest_name text,
  guest_email text, tutor_public_name text, public_location text,
  created_at timestamptz
)
language sql volatile security definer set search_path = '' as $$
  select * from public.create_public_booking(
    p_slug, p_event_type_id, p_starts_at, p_guest_name, p_guest_email,
    p_guest_phone, p_guest_level, p_guest_goal, p_guest_message,
    p_management_token_hash, 'legacy-management-token-unavailable'
  );
$$;
revoke all on function public.create_public_booking(
  text, uuid, timestamptz, text, text, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.create_public_booking(
  text, uuid, timestamptz, text, text, text, text, text, text, text
) to service_role;

create table public.booking_reminder_deliveries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  tutor_id uuid not null references public.tutor_profiles(id) on delete cascade,
  booking_id uuid not null references public.bookings(id) on delete cascade,
  booking_starts_at timestamptz not null,
  lead_minutes integer not null default 1440 check (lead_minutes = 1440),
  scheduled_for timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'succeeded', 'failed', 'skipped')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (booking_id, booking_starts_at, lead_minutes)
);
create index booking_reminder_deliveries_due_idx
  on public.booking_reminder_deliveries (next_attempt_at, scheduled_for)
  where status in ('pending', 'failed');
alter table public.booking_reminder_deliveries enable row level security;
revoke all on public.booking_reminder_deliveries from anon, authenticated;
grant select, insert, update on public.booking_reminder_deliveries to service_role;

create function public.prepare_booking_reminders()
returns void
language plpgsql volatile security definer set search_path = '' as $$
begin
  update public.booking_reminder_deliveries delivery
  set status = 'skipped', last_error = 'BOOKING_CHANGED', updated_at = now()
  where delivery.status in ('pending', 'failed', 'processing')
    and not exists (
      select 1 from public.bookings booking
      join public.booking_availability_settings settings
        on settings.tutor_id = booking.tutor_id
      where booking.id = delivery.booking_id
        and booking.status = 'confirmed'
        and booking.student_id is null
        and booking.converted_lesson_id is null
        and booking.starts_at = delivery.booking_starts_at
        and settings.reminder_24_hours_enabled
    );
  update public.booking_reminder_deliveries
  set status = 'failed', last_error = 'PROCESSING_TIMEOUT',
    next_attempt_at = now(), updated_at = now()
  where status = 'processing' and updated_at < now() - interval '15 minutes';
  insert into public.booking_reminder_deliveries (
    workspace_id, tutor_id, booking_id, booking_starts_at,
    lead_minutes, scheduled_for, next_attempt_at
  )
  select booking.workspace_id, booking.tutor_id, booking.id, booking.starts_at,
    1440, booking.starts_at - interval '24 hours', now()
  from public.bookings booking
  join public.booking_availability_settings settings
    on settings.tutor_id = booking.tutor_id
  where booking.source = 'public_booking' and booking.status = 'confirmed'
    and booking.student_id is null and booking.converted_lesson_id is null
    and settings.reminder_24_hours_enabled
    and booking.starts_at > now()
    and booking.starts_at - interval '24 hours' <= now()
  on conflict (booking_id, booking_starts_at, lead_minutes) do nothing;
end;
$$;
revoke all on function public.prepare_booking_reminders()
  from public, anon, authenticated;
grant execute on function public.prepare_booking_reminders() to service_role;

drop function public.get_public_booking_by_token(text);
create function public.get_public_booking_by_token(p_token_hash text)
returns table (
  tutor_public_name text, event_type_name text, starts_at timestamptz,
  ends_at timestamptz, timezone text, format text, public_location text,
  status public.booking_status, cancellation_notice_hours integer,
  reschedule_notice_hours integer, rescheduled_at timestamptz,
  reschedule_count integer
)
language sql stable security definer set search_path = '' as $$
  select profile.public_name, booking.event_type_name, booking.starts_at,
    booking.ends_at, booking.timezone, booking.format,
    case when booking.format = 'offline' then nullif(btrim(profile.city), '') end,
    booking.status, coalesce(settings.cancellation_notice_hours, 24),
    coalesce(settings.reschedule_notice_hours, 24), booking.rescheduled_at,
    booking.reschedule_count
  from public.bookings booking
  join public.tutor_public_profiles profile on profile.tutor_id = booking.tutor_id
    and profile.workspace_id = booking.workspace_id
  left join public.booking_availability_settings settings
    on settings.tutor_id = booking.tutor_id
  where booking.source = 'public_booking'
    and booking.management_token_hash = p_token_hash
    and p_token_hash ~ '^[0-9a-f]{64}$'
  limit 1;
$$;
revoke all on function public.get_public_booking_by_token(text)
  from public, anon, authenticated;
grant execute on function public.get_public_booking_by_token(text) to service_role;
