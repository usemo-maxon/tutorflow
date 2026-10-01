-- D2.5: a public booking remains acquisition history while conversion creates
-- an ordinary Student + Lesson atomically in the booking's own workspace.
alter table public.bookings
  add column converted_at timestamptz;

alter table public.bookings
  drop constraint bookings_public_guest_check,
  drop constraint bookings_conversion_consistent,
  add constraint bookings_conversion_consistent check (
    (status = 'converted') =
      (student_id is not null and converted_lesson_id is not null and converted_at is not null)
  ),
  add constraint bookings_public_guest_check check (
    source <> 'public_booking' or (
      event_type_id is not null
      and event_type_name is not null and duration_minutes is not null
      and price_grosz is not null and currency is not null and format is not null
      and guest_name is not null and guest_email is not null
      and status in ('confirmed', 'cancelled', 'converted')
      and (
        (status = 'converted' and student_id is not null
          and converted_lesson_id is not null and converted_at is not null)
        or (status in ('confirmed', 'cancelled') and student_id is null
          and converted_lesson_id is null and converted_at is null)
      )
    )
  );

create index bookings_workspace_upcoming_idx
  on public.bookings (workspace_id, tutor_id, starts_at)
  where source = 'public_booking' and status in ('confirmed', 'converted');

create function public.convert_public_booking(
  p_booking_id uuid,
  p_mode text,
  p_existing_student_id uuid default null,
  p_student jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security invoker
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
