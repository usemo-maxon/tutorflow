-- Stage 1B: relational scheduling commands, calendar blocks and availability.
-- All command functions are SECURITY INVOKER and therefore retain table RLS.

alter table public.lessons
  add column if not exists subject text,
  add column if not exists client_request_id uuid;

alter table public.recurring_lesson_series
  add column if not exists client_request_id uuid;

alter table public.availability_rules
  add column if not exists is_available boolean not null default false;

create index if not exists lessons_request_idx
  on public.lessons (workspace_id, client_request_id)
  where client_request_id is not null;
create unique index if not exists recurring_series_request_idx
  on public.recurring_lesson_series (workspace_id, client_request_id)
  where client_request_id is not null;
create index if not exists lessons_range_idx
  on public.lessons (workspace_id, ends_at, starts_at);
create index if not exists calendar_blocks_range_idx
  on public.calendar_blocks (workspace_id, ends_at, starts_at);

-- The integration table contains provider secrets and is intentionally not
-- readable through the Data API. This narrow helper exposes only a boolean.
create or replace function private.has_google_calendar_connection(
  p_workspace_id uuid,
  p_tutor_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is distinct from p_tutor_id
    or not private.is_workspace_member(p_workspace_id) then
    raise exception 'WORKSPACE_ACCESS_DENIED' using errcode = '42501';
  end if;
  return exists (
    select 1 from public.integration_connections
    where workspace_id = p_workspace_id and teacher_id = p_tutor_id
      and provider = 'google' and status = 'connected'
  );
end;
$$;

create or replace function private.is_outside_availability(
  p_workspace_id uuid,
  p_tutor_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_timezone text
)
returns boolean
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_date date := (p_starts_at at time zone p_timezone)::date;
  v_end_date date := (p_ends_at at time zone p_timezone)::date;
  v_start time := (p_starts_at at time zone p_timezone)::time;
  v_end time := (p_ends_at at time zone p_timezone)::time;
  v_weekday smallint := extract(isodow from p_starts_at at time zone p_timezone)::smallint;
  v_has_schedule boolean;
begin
  -- Explicit unavailable exceptions always win.
  if exists (
    select 1 from public.availability_exceptions e
    where e.workspace_id = p_workspace_id
      and e.tutor_id = p_tutor_id
      and e.exception_date = v_date
      and e.kind = 'unavailable'
      and (
        e.start_time is null
        or (v_start < e.end_time and v_end > e.start_time)
      )
  ) then
    return true;
  end if;

  -- An available exception replaces the weekly schedule for that date.
  if exists (
    select 1 from public.availability_exceptions e
    where e.workspace_id = p_workspace_id
      and e.tutor_id = p_tutor_id
      and e.exception_date = v_date
      and e.kind = 'available'
  ) then
    return not exists (
      select 1 from public.availability_exceptions e
      where e.workspace_id = p_workspace_id
        and e.tutor_id = p_tutor_id
        and e.exception_date = v_date
        and e.kind = 'available'
        and (
          e.start_time is null
          or (v_date = v_end_date and v_start >= e.start_time and v_end <= e.end_time)
        )
    );
  end if;

  -- Legacy unavailable rules are soft constraints.
  if exists (
    select 1 from public.availability_rules r
    where r.workspace_id = p_workspace_id
      and r.tutor_id = p_tutor_id
      and not r.is_available
      and (
        (r.kind = 'single' and p_starts_at < r.ends_at and p_ends_at > r.starts_at)
        or (
          r.kind = 'recurring'
          and r.day_of_week = v_weekday
          and (r.all_day or (v_start < r.end_time and v_end > r.start_time))
        )
      )
  ) then
    return true;
  end if;

  select exists (
    select 1 from public.availability_rules r
    where r.workspace_id = p_workspace_id
      and r.tutor_id = p_tutor_id
      and r.is_available
      and r.kind = 'recurring'
  ) into v_has_schedule;

  if not v_has_schedule then
    return false;
  end if;

  return not exists (
    select 1 from public.availability_rules r
    where r.workspace_id = p_workspace_id
      and r.tutor_id = p_tutor_id
      and r.is_available
      and r.kind = 'recurring'
      and r.day_of_week = v_weekday
      and not r.all_day
      and v_date = v_end_date
      and v_start >= r.start_time
      and v_end <= r.end_time
  );
end;
$$;

create or replace function private.enqueue_lesson_side_effects(
  p_workspace_id uuid,
  p_tutor_id uuid,
  p_lesson_id uuid,
  p_starts_at timestamptz,
  p_status public.lesson_status,
  p_sync_status text
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_sync_status = 'pending' then
    insert into public.google_sync_jobs (
      workspace_id, teacher_id, lesson_id, google_event_id, status,
      attempts, next_attempt_at, last_error, locked_at
    ) values (
      p_workspace_id, p_tutor_id, p_lesson_id,
      substr(md5(p_tutor_id::text || ':' || p_lesson_id::text), 1, 32),
      'pending', 0, now(), null, null
    )
    on conflict (teacher_id, lesson_id) do update set
      status = 'pending', attempts = 0, next_attempt_at = now(),
      last_error = null, locked_at = null, updated_at = now();
  end if;

  delete from public.reminder_deliveries
  where workspace_id = p_workspace_id
    and lesson_id = p_lesson_id
    and status in ('pending', 'failed');

  if p_status = 'scheduled' and p_starts_at > now() then
    insert into public.reminder_deliveries (
      workspace_id, teacher_id, lesson_id, lead_minutes, scheduled_for,
      status, attempts, next_attempt_at, last_error
    )
    select p_workspace_id, p_tutor_id, p_lesson_id, lead,
      p_starts_at - make_interval(mins => lead), 'pending', 0, now(), null
    from unnest(array[60, 1440]) as lead
    on conflict (teacher_id, lesson_id, lead_minutes) do update set
      scheduled_for = excluded.scheduled_for, status = 'pending', attempts = 0,
      next_attempt_at = now(), last_error = null, updated_at = now();
  end if;
end;
$$;

create or replace function public.create_lesson_schedule(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_workspace_id uuid;
  v_target_type text := p_payload->>'targetType';
  v_target_id uuid := (p_payload->>'targetId')::uuid;
  v_request_id uuid := (p_payload->>'requestId')::uuid;
  v_mode public.lesson_creation_mode := (p_payload->>'mode')::public.lesson_creation_mode;
  v_timezone text := p_payload->>'timezone';
  v_occurrence jsonb;
  v_plan jsonb;
  v_lesson_id uuid;
  v_series_id uuid;
  v_student_id uuid;
  v_group_id uuid;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_duration integer;
  v_sync_status text;
  v_ids uuid[] := '{}';
  v_position integer;
  v_plan_id uuid;
  v_member record;
  v_existing uuid[];
  v_series jsonb := p_payload->'recurrence';
begin
  if v_user_id is null then
    raise exception 'UNAUTHENTICATED' using errcode = '42501';
  end if;
  select workspace_id into v_workspace_id
  from public.tutor_profiles
  where user_id = v_user_id and id = v_user_id;
  if v_workspace_id is null then
    raise exception 'WORKSPACE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = v_timezone) then
    raise exception 'INVALID_TIMEZONE' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user_id::text, 0));

  select array_agg(id order by starts_at) into v_existing
  from public.lessons
  where workspace_id = v_workspace_id and client_request_id = v_request_id;
  if cardinality(v_existing) > 0 then
    return jsonb_build_object('ids', to_jsonb(v_existing), 'id', v_existing[1]);
  end if;

  if v_target_type = 'student' then
    select id into v_student_id from public.students
    where id = v_target_id and workspace_id = v_workspace_id and status = 'active';
    if v_student_id is null then
      raise exception 'TARGET_NOT_ACTIVE' using errcode = 'P0002';
    end if;
  elsif v_target_type = 'group' then
    select id into v_group_id from public.groups
    where id = v_target_id and workspace_id = v_workspace_id
      and status = 'active' and not is_ad_hoc;
    if v_group_id is null then
      raise exception 'TARGET_NOT_ACTIVE' using errcode = 'P0002';
    end if;
    if not exists (
      select 1 from public.group_members gm
      join public.students s on s.id = gm.student_id and s.workspace_id = gm.workspace_id
      where gm.workspace_id = v_workspace_id and gm.group_id = v_group_id
        and gm.status = 'active' and s.status = 'active'
    ) then
      raise exception 'GROUP_HAS_NO_ACTIVE_MEMBERS' using errcode = '22023';
    end if;
  else
    raise exception 'INVALID_TARGET' using errcode = '22023';
  end if;

  select case when private.has_google_calendar_connection(v_workspace_id, v_user_id)
    then 'pending' else 'disabled' end into v_sync_status;

  if v_mode = 'recurring' then
    insert into public.recurring_lesson_series (
      workspace_id, tutor_id, student_id, group_id, frequency,
      recurrence_interval, days_of_week, starts_on, ends_on, start_time,
      duration_minutes, timezone, effective_from, client_request_id
    ) values (
      v_workspace_id, v_user_id, v_student_id, v_group_id, 'weekly',
      coalesce((v_series->>'intervalWeeks')::integer, 1),
      array(select jsonb_array_elements_text(v_series->'daysOfWeek')::smallint),
      (v_series->>'startDate')::date,
      nullif(v_series->>'endDate', '')::date,
      (v_series->>'startTime')::time,
      (v_series->>'durationMinutes')::integer,
      v_timezone, (v_series->>'startDate')::date, v_request_id
    ) returning id into v_series_id;
  end if;

  for v_occurrence in select value from jsonb_array_elements(p_payload->'occurrences') loop
    v_starts_at := (v_occurrence->>'startsAt')::timestamptz;
    v_duration := (v_occurrence->>'durationMinutes')::integer;
    v_ends_at := v_starts_at + make_interval(mins => v_duration);
    if v_duration < 15 or v_duration > 480 then
      raise exception 'INVALID_DURATION' using errcode = '22023';
    end if;
    if exists (
      select 1 from public.lessons l
      where l.workspace_id = v_workspace_id and l.tutor_id = v_user_id
        and l.status <> 'cancelled' and l.starts_at < v_ends_at and l.ends_at > v_starts_at
    ) or exists (
      select 1 from public.calendar_blocks b
      where b.workspace_id = v_workspace_id and b.tutor_id = v_user_id
        and b.starts_at < v_ends_at and b.ends_at > v_starts_at
    ) then
      raise exception 'LESSON_CONFLICT' using errcode = '23P01';
    end if;
    if not coalesce((p_payload->>'allowOutsideAvailability')::boolean, false)
      and private.is_outside_availability(
        v_workspace_id, v_user_id, v_starts_at, v_ends_at, v_timezone
      ) then
      raise exception 'OUTSIDE_AVAILABILITY' using errcode = 'P0001';
    end if;

    v_lesson_id := gen_random_uuid();
    insert into public.lessons (
      id, workspace_id, tutor_id, student_id, group_id, title, subject,
      starts_at, ends_at, timezone, status, format, location, meeting_url,
      price_grosz, currency, billing_type, creation_mode,
      recurring_series_id, recurrence_original_starts_at, sync_status,
      client_request_id
    ) values (
      v_lesson_id, v_workspace_id, v_user_id, v_student_id, v_group_id,
      coalesce(p_payload->>'title', ''), nullif(p_payload->>'subject', ''),
      v_starts_at, v_ends_at, v_timezone, 'scheduled',
      (p_payload->>'format')::public.lesson_format,
      case when p_payload->>'format' = 'offline' then nullif(p_payload->>'location', '') end,
      case when p_payload->>'format' = 'online' then nullif(p_payload->>'location', '') end,
      nullif(p_payload->>'priceGrosz', '')::bigint, 'PLN',
      (case when (p_payload->>'priceGrosz') is null then 'trial' else 'per_lesson' end)::public.lesson_billing_type,
      v_mode, v_series_id,
      case when v_series_id is not null then v_starts_at end,
      v_sync_status, v_request_id
    );

    if v_student_id is not null then
      insert into public.lesson_participants (workspace_id, lesson_id, student_id)
      values (v_workspace_id, v_lesson_id, v_student_id);
      insert into public.attendances (workspace_id, lesson_id, student_id)
      values (v_workspace_id, v_lesson_id, v_student_id);
    else
      for v_member in
        select gm.student_id from public.group_members gm
        join public.students s on s.id = gm.student_id and s.workspace_id = gm.workspace_id
        where gm.workspace_id = v_workspace_id and gm.group_id = v_group_id
          and gm.status = 'active' and s.status = 'active'
        order by gm.joined_at, gm.student_id
      loop
        insert into public.lesson_participants (workspace_id, lesson_id, student_id)
        values (v_workspace_id, v_lesson_id, v_member.student_id);
        insert into public.attendances (workspace_id, lesson_id, student_id)
        values (v_workspace_id, v_lesson_id, v_member.student_id);
      end loop;
    end if;

    v_position := 0;
    for v_plan in select value from jsonb_array_elements(coalesce(p_payload->'plan', '[]'::jsonb)) loop
      if length(trim(v_plan #>> '{}')) > 0 then
        v_plan_id := gen_random_uuid();
        insert into public.lesson_plan_items (id, workspace_id, lesson_id, position, content)
        values (v_plan_id, v_workspace_id, v_lesson_id, v_position, trim(v_plan #>> '{}'));
        v_position := v_position + 1;
      end if;
    end loop;

    perform private.enqueue_lesson_side_effects(
      v_workspace_id, v_user_id, v_lesson_id, v_starts_at, 'scheduled', v_sync_status
    );
    v_ids := array_append(v_ids, v_lesson_id);
  end loop;

  return jsonb_build_object('ids', to_jsonb(v_ids), 'id', v_ids[1], 'seriesId', v_series_id);
end;
$$;

create or replace function public.reschedule_lesson_relational(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_workspace_id uuid;
  v_lesson public.lessons%rowtype;
  v_series public.recurring_lesson_series%rowtype;
  v_scope text := coalesce(p_payload->>'scope', 'single');
  v_new_start timestamptz := (p_payload->>'startsAt')::timestamptz;
  v_new_duration integer;
  v_delta interval;
  v_ids uuid[];
  v_target record;
  v_new_series_id uuid;
  v_cutoff date;
begin
  select workspace_id into v_workspace_id from public.tutor_profiles
  where user_id = v_user_id and id = v_user_id;
  select * into v_lesson from public.lessons
  where id = (p_payload->>'lessonId')::uuid and workspace_id = v_workspace_id;
  if v_lesson.id is null then raise exception 'LESSON_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_lesson.status = 'completed' then raise exception 'COMPLETED_LESSON_IMMUTABLE' using errcode = 'P0001'; end if;
  if nullif(p_payload->>'expectedUpdatedAt', '') is not null
    and v_lesson.updated_at <> (p_payload->>'expectedUpdatedAt')::timestamptz then
    raise exception 'STALE_WRITE' using errcode = '40001';
  end if;
  v_new_duration := coalesce((p_payload->>'durationMinutes')::integer,
    extract(epoch from (v_lesson.ends_at - v_lesson.starts_at))::integer / 60);
  if v_new_duration < 15 or v_new_duration > 480 then
    raise exception 'INVALID_DURATION' using errcode = '22023';
  end if;
  v_delta := v_new_start - v_lesson.starts_at;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user_id::text, 0));

  if v_scope = 'single' or v_lesson.recurring_series_id is null then
    v_ids := array[v_lesson.id];
  elsif v_scope = 'future' then
    select array_agg(id) into v_ids from public.lessons
    where workspace_id = v_workspace_id
      and recurring_series_id = v_lesson.recurring_series_id
      and recurrence_original_starts_at >= v_lesson.recurrence_original_starts_at
      and status not in ('completed', 'cancelled');
  elsif v_scope = 'series' then
    select array_agg(id) into v_ids from public.lessons
    where workspace_id = v_workspace_id
      and recurring_series_id = v_lesson.recurring_series_id
      and starts_at >= now() and status not in ('completed', 'cancelled');
  else
    raise exception 'INVALID_SCOPE' using errcode = '22023';
  end if;
  v_ids := coalesce(v_ids, array[v_lesson.id]);

  for v_target in select * from public.lessons where id = any(v_ids) order by starts_at loop
    if exists (
      select 1 from public.lessons l where l.workspace_id = v_workspace_id
        and l.id <> all(v_ids) and l.status <> 'cancelled'
        and l.starts_at < (v_target.starts_at + v_delta + make_interval(mins => v_new_duration))
        and l.ends_at > (v_target.starts_at + v_delta)
    ) or exists (
      select 1 from public.calendar_blocks b where b.workspace_id = v_workspace_id
        and b.starts_at < (v_target.starts_at + v_delta + make_interval(mins => v_new_duration))
        and b.ends_at > (v_target.starts_at + v_delta)
    ) then
      raise exception 'LESSON_CONFLICT' using errcode = '23P01';
    end if;
    if not coalesce((p_payload->>'allowOutsideAvailability')::boolean, false)
      and private.is_outside_availability(
        v_workspace_id, v_user_id, v_target.starts_at + v_delta,
        v_target.starts_at + v_delta + make_interval(mins => v_new_duration), v_target.timezone
      ) then
      raise exception 'OUTSIDE_AVAILABILITY' using errcode = 'P0001';
    end if;
  end loop;

  if v_lesson.recurring_series_id is not null then
    select * into v_series from public.recurring_lesson_series
    where id = v_lesson.recurring_series_id and workspace_id = v_workspace_id;
    if v_scope = 'future' then
      v_cutoff := (v_lesson.recurrence_original_starts_at at time zone v_series.timezone)::date;
      insert into public.recurring_lesson_series (
        workspace_id, tutor_id, student_id, group_id, parent_series_id,
        frequency, recurrence_interval, days_of_week, starts_on, ends_on,
        start_time, duration_minutes, timezone, status, effective_from
      ) values (
        v_workspace_id, v_user_id, v_series.student_id, v_series.group_id, v_series.id,
        v_series.frequency, v_series.recurrence_interval, v_series.days_of_week,
        (v_new_start at time zone v_series.timezone)::date, v_series.ends_on,
        (v_new_start at time zone v_series.timezone)::time, v_new_duration,
        v_series.timezone, 'active', (v_new_start at time zone v_series.timezone)::date
      ) returning id into v_new_series_id;
      if v_cutoff > v_series.starts_on then
        update public.recurring_lesson_series set ends_on = v_cutoff - 1, updated_at = now()
        where id = v_series.id;
      else
        update public.recurring_lesson_series set status = 'cancelled', updated_at = now()
        where id = v_series.id;
      end if;
      update public.lessons set recurring_series_id = v_new_series_id
      where id = any(v_ids);
    elsif v_scope = 'series' then
      update public.recurring_lesson_series set
        start_time = (v_new_start at time zone timezone)::time,
        duration_minutes = v_new_duration, updated_at = now()
      where id = v_series.id;
    end if;
  end if;

  for v_target in select * from public.lessons where id = any(v_ids) loop
    update public.lessons set
      starts_at = v_target.starts_at + v_delta,
      ends_at = v_target.starts_at + v_delta + make_interval(mins => v_new_duration),
      sync_status = case when private.has_google_calendar_connection(v_workspace_id, v_user_id)
        then 'pending' else 'disabled' end,
      updated_at = now()
    where id = v_target.id;
    perform private.enqueue_lesson_side_effects(
      v_workspace_id, v_user_id, v_target.id, v_target.starts_at + v_delta,
      v_target.status,
      case when private.has_google_calendar_connection(v_workspace_id, v_user_id)
        then 'pending' else 'disabled' end
    );
  end loop;
  return jsonb_build_object('ids', to_jsonb(v_ids), 'seriesId', v_new_series_id);
end;
$$;

create or replace function public.cancel_lesson_relational(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_workspace_id uuid;
  v_lesson public.lessons%rowtype;
  v_scope text := coalesce(p_payload->>'scope', 'single');
  v_ids uuid[];
  v_target record;
  v_cutoff date;
begin
  select workspace_id into v_workspace_id from public.tutor_profiles
  where user_id = v_user_id and id = v_user_id;
  select * into v_lesson from public.lessons
  where id = (p_payload->>'lessonId')::uuid and workspace_id = v_workspace_id;
  if v_lesson.id is null then raise exception 'LESSON_NOT_FOUND' using errcode = 'P0002'; end if;
  if v_lesson.status = 'completed' then raise exception 'COMPLETED_LESSON_IMMUTABLE' using errcode = 'P0001'; end if;
  if nullif(p_payload->>'expectedUpdatedAt', '') is not null
    and v_lesson.updated_at <> (p_payload->>'expectedUpdatedAt')::timestamptz then
    raise exception 'STALE_WRITE' using errcode = '40001';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user_id::text, 0));
  if v_scope = 'single' or v_lesson.recurring_series_id is null then
    v_ids := array[v_lesson.id];
  elsif v_scope = 'future' then
    select array_agg(id) into v_ids from public.lessons
    where workspace_id = v_workspace_id and recurring_series_id = v_lesson.recurring_series_id
      and recurrence_original_starts_at >= v_lesson.recurrence_original_starts_at
      and status <> 'completed';
  elsif v_scope = 'series' then
    select array_agg(id) into v_ids from public.lessons
    where workspace_id = v_workspace_id and recurring_series_id = v_lesson.recurring_series_id
      and starts_at >= now() and status <> 'completed';
  else
    raise exception 'INVALID_SCOPE' using errcode = '22023';
  end if;
  v_ids := coalesce(v_ids, array[v_lesson.id]);
  for v_target in select * from public.lessons where id = any(v_ids) loop
    update public.lessons set status = 'cancelled', cancelled_at = coalesce(cancelled_at, now()),
      completed_at = null, sync_status = case when private.has_google_calendar_connection(v_workspace_id, v_user_id)
        then 'pending' else 'disabled' end, updated_at = now()
    where id = v_target.id and status <> 'completed';
    perform private.enqueue_lesson_side_effects(
      v_workspace_id, v_user_id, v_target.id, v_target.starts_at, 'cancelled',
      case when private.has_google_calendar_connection(v_workspace_id, v_user_id)
        then 'pending' else 'disabled' end
    );
  end loop;
  if v_lesson.recurring_series_id is not null and v_scope in ('future', 'series') then
    if v_scope = 'future' then
      select (v_lesson.recurrence_original_starts_at at time zone timezone)::date into v_cutoff
      from public.recurring_lesson_series where id = v_lesson.recurring_series_id;
      update public.recurring_lesson_series set
        ends_on = case when v_cutoff > starts_on then v_cutoff - 1 else starts_on end,
        status = case when v_cutoff > starts_on then status else 'cancelled' end,
        updated_at = now()
      where id = v_lesson.recurring_series_id;
    else
      update public.recurring_lesson_series set status = 'cancelled', updated_at = now()
      where id = v_lesson.recurring_series_id;
    end if;
  end if;
  return jsonb_build_object('ids', to_jsonb(v_ids));
end;
$$;

create or replace function public.upsert_calendar_block_relational(p_payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_workspace_id uuid;
  v_block_id uuid := nullif(p_payload->>'blockId', '')::uuid;
  v_starts_at timestamptz := (p_payload->>'startsAt')::timestamptz;
  v_ends_at timestamptz := (p_payload->>'endsAt')::timestamptz;
  v_timezone text := p_payload->>'timezone';
  v_updated_at timestamptz;
begin
  select workspace_id into v_workspace_id from public.tutor_profiles
  where user_id = v_user_id and id = v_user_id;
  if v_workspace_id is null then
    raise exception 'WORKSPACE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_ends_at <= v_starts_at then
    raise exception 'INVALID_TIME_RANGE' using errcode = '22023';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = v_timezone) then
    raise exception 'INVALID_TIMEZONE' using errcode = '22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user_id::text, 0));

  if v_block_id is not null then
    select updated_at into v_updated_at from public.calendar_blocks
    where id = v_block_id and workspace_id = v_workspace_id and tutor_id = v_user_id;
    if v_updated_at is null then
      raise exception 'CALENDAR_BLOCK_NOT_FOUND' using errcode = 'P0002';
    end if;
    if nullif(p_payload->>'expectedUpdatedAt', '') is not null
      and v_updated_at <> (p_payload->>'expectedUpdatedAt')::timestamptz then
      raise exception 'STALE_WRITE' using errcode = '40001';
    end if;
  end if;

  if exists (
    select 1 from public.lessons l
    where l.workspace_id = v_workspace_id and l.tutor_id = v_user_id
      and l.status <> 'cancelled'
      and l.starts_at < v_ends_at and l.ends_at > v_starts_at
  ) or exists (
    select 1 from public.calendar_blocks b
    where b.workspace_id = v_workspace_id and b.tutor_id = v_user_id
      and (v_block_id is null or b.id <> v_block_id)
      and b.starts_at < v_ends_at and b.ends_at > v_starts_at
  ) then
    raise exception 'LESSON_CONFLICT' using errcode = '23P01';
  end if;

  if v_block_id is null then
    insert into public.calendar_blocks (
      workspace_id, tutor_id, title, starts_at, ends_at, timezone
    ) values (
      v_workspace_id, v_user_id, trim(p_payload->>'title'),
      v_starts_at, v_ends_at, v_timezone
    ) returning id into v_block_id;
  else
    update public.calendar_blocks set
      title = trim(p_payload->>'title'), starts_at = v_starts_at,
      ends_at = v_ends_at, timezone = v_timezone, updated_at = now()
    where id = v_block_id and workspace_id = v_workspace_id and tutor_id = v_user_id;
  end if;
  return jsonb_build_object('id', v_block_id);
end;
$$;

revoke all on function public.create_lesson_schedule(jsonb) from public, anon;
revoke all on function public.reschedule_lesson_relational(jsonb) from public, anon;
revoke all on function public.cancel_lesson_relational(jsonb) from public, anon;
revoke all on function public.upsert_calendar_block_relational(jsonb) from public, anon;
revoke all on function private.has_google_calendar_connection(uuid, uuid) from public, anon;
revoke all on function private.is_outside_availability(uuid, uuid, timestamptz, timestamptz, text) from public, anon;
revoke all on function private.enqueue_lesson_side_effects(uuid, uuid, uuid, timestamptz, public.lesson_status, text) from public, anon;
grant execute on function public.create_lesson_schedule(jsonb) to authenticated;
grant execute on function public.reschedule_lesson_relational(jsonb) to authenticated;
grant execute on function public.cancel_lesson_relational(jsonb) to authenticated;
grant execute on function public.upsert_calendar_block_relational(jsonb) to authenticated;
grant execute on function private.has_google_calendar_connection(uuid, uuid) to authenticated;
grant execute on function private.is_outside_availability(uuid, uuid, timestamptz, timestamptz, text) to authenticated;
grant execute on function private.enqueue_lesson_side_effects(uuid, uuid, uuid, timestamptz, public.lesson_status, text) to authenticated;
