-- Google all-day events are display-only in easy4tutor. Only timed events may
-- participate in lesson/public-booking conflicts, and per-calendar busy
-- preferences remain independent from visibility.

create or replace function private.reject_external_google_event_conflict()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.status in ('scheduled', 'needs_completion') and exists (
    select 1
    from public.external_google_events event
    left join public.google_calendars calendar
      on calendar.connection_id = event.connection_id
     and calendar.calendar_id = event.calendar_id
    where event.workspace_id = new.workspace_id
      and event.teacher_id = new.tutor_id
      and coalesce(calendar.sync_enabled, true)
      and coalesce(calendar.count_as_busy, true)
      and not event.all_day
      and event.status <> 'cancelled'
      and event.transparency = 'opaque'
      and new.starts_at < event.ends_at
      and new.ends_at > event.starts_at
  ) then
    raise exception 'EXTERNAL_GOOGLE_EVENT_CONFLICT' using errcode = '23P01';
  end if;
  return new;
end;
$$;
revoke all on function private.reject_external_google_event_conflict() from public;

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
    select 1
    from public.external_google_events g
    join public.integration_connections i on i.id = g.connection_id
    left join public.google_calendars calendar
      on calendar.connection_id = g.connection_id
     and calendar.calendar_id = g.calendar_id
    where g.workspace_id = p_workspace_id and g.teacher_id = p_tutor_id
      and i.status = 'connected'
      and coalesce(calendar.sync_enabled, true)
      and coalesce(calendar.count_as_busy, true)
      and not g.all_day
      and g.status <> 'cancelled'
      and g.transparency = 'opaque'
      and p_starts_at < g.ends_at and p_ends_at > g.starts_at
  ) then return false; end if;

  return true;
end;
$$;
revoke all on function private.public_booking_slot_is_available(
  uuid, uuid, text, integer, timestamptz, timestamptz
) from public;

-- Keep the atomic booking conversion and the owner-lifetime student-cap
-- exemption from the latest definition; only the external conflict predicate
-- changes here.
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
      left join public.google_calendars calendar
        on calendar.connection_id = event.connection_id
       and calendar.calendar_id = event.calendar_id
      where event.workspace_id = v_workspace_id
        and event.teacher_id = v_user_id
        and coalesce(calendar.sync_enabled, true)
        and coalesce(calendar.count_as_busy, true)
        and not event.all_day
        and event.status <> 'cancelled'
        and event.transparency = 'opaque'
        and event.starts_at < v_booking.ends_at
        and event.ends_at > v_booking.starts_at
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
