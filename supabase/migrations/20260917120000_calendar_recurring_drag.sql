-- Recurring calendar drag scopes, wall-clock-safe series splits, and historical
-- completed occurrence references.

create or replace function private.safe_local_wall_time(
  p_date date,
  p_time time,
  p_timezone text
)
returns timestamptz
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_local timestamp := p_date + p_time;
  v_result timestamptz;
  v_probe interval;
begin
  if not exists (
    select 1 from pg_catalog.pg_timezone_names where name = p_timezone
  ) then
    raise exception 'INVALID_LOCAL_TIME' using errcode = '22023';
  end if;

  v_result := v_local at time zone p_timezone;
  if v_result at time zone p_timezone <> v_local then
    raise exception 'INVALID_LOCAL_TIME' using errcode = '22023';
  end if;

  foreach v_probe in array array[interval '30 minutes', interval '60 minutes', interval '120 minutes'] loop
    if (v_result - v_probe) at time zone p_timezone = v_local
      or (v_result + v_probe) at time zone p_timezone = v_local then
      raise exception 'INVALID_LOCAL_TIME' using errcode = '22023';
    end if;
  end loop;

  return v_result;
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
  v_split_lesson public.lessons%rowtype;
  v_series public.recurring_lesson_series%rowtype;
  v_scope text := coalesce(p_payload->>'scope', 'single');
  v_new_start timestamptz := (p_payload->>'startsAt')::timestamptz;
  v_new_duration integer;
  v_delta interval;
  v_ids uuid[];
  v_family_ids uuid[];
  v_target record;
  v_new_series_id uuid;
  v_cutoff date;
  v_reference_original timestamptz;
  v_split_original timestamptz;
  v_target_date date;
  v_target_time time;
  v_day_shift integer;
  v_candidate_start timestamptz;
  v_new_ends_on date;
  v_shifted_days smallint[];
  v_all_already_moved boolean := true;
begin
  select workspace_id into v_workspace_id
  from public.tutor_profiles
  where user_id = v_user_id and id = v_user_id;

  select * into v_lesson
  from public.lessons
  where id = (p_payload->>'lessonId')::uuid
    and workspace_id = v_workspace_id;

  if v_lesson.id is null then
    raise exception 'LESSON_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_scope not in ('single', 'future', 'series') then
    raise exception 'INVALID_SCOPE' using errcode = '22023';
  end if;
  if v_lesson.status = 'cancelled' then
    raise exception 'COMPLETED_LESSON_IMMUTABLE' using errcode = 'P0001';
  end if;

  v_new_duration := coalesce(
    (p_payload->>'durationMinutes')::integer,
    extract(epoch from (v_lesson.ends_at - v_lesson.starts_at))::integer / 60
  );
  if v_new_duration < 15 or v_new_duration > 480 then
    raise exception 'INVALID_DURATION' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_user_id::text, 0)
  );

  if v_scope = 'single' or v_lesson.recurring_series_id is null then
    if v_lesson.status = 'completed' then
      raise exception 'COMPLETED_LESSON_IMMUTABLE' using errcode = 'P0001';
    end if;
    if v_lesson.starts_at = v_new_start
      and extract(epoch from (v_lesson.ends_at - v_lesson.starts_at))::integer / 60 = v_new_duration then
      return jsonb_build_object('ids', jsonb_build_array(v_lesson.id), 'seriesId', null);
    end if;
    if nullif(p_payload->>'expectedUpdatedAt', '') is not null
      and v_lesson.updated_at <> (p_payload->>'expectedUpdatedAt')::timestamptz then
      raise exception 'STALE_WRITE' using errcode = '40001';
    end if;

    if exists (
      select 1 from public.lessons l
      where l.workspace_id = v_workspace_id
        and l.id <> v_lesson.id
        and l.status <> 'cancelled'
        and l.starts_at < v_new_start + make_interval(mins => v_new_duration)
        and l.ends_at > v_new_start
    ) or exists (
      select 1 from public.calendar_blocks b
      where b.workspace_id = v_workspace_id
        and b.starts_at < v_new_start + make_interval(mins => v_new_duration)
        and b.ends_at > v_new_start
    ) then
      raise exception 'LESSON_CONFLICT' using errcode = '23P01';
    end if;
    if not coalesce((p_payload->>'allowOutsideAvailability')::boolean, false)
      and private.is_outside_availability(
        v_workspace_id,
        v_user_id,
        v_new_start,
        v_new_start + make_interval(mins => v_new_duration),
        v_lesson.timezone
      ) then
      raise exception 'OUTSIDE_AVAILABILITY' using errcode = 'P0001';
    end if;

    update public.lessons
    set starts_at = v_new_start,
      ends_at = v_new_start + make_interval(mins => v_new_duration),
      sync_status = case when private.has_google_calendar_connection(v_workspace_id, v_user_id)
        then 'pending' else 'disabled' end,
      updated_at = now()
    where id = v_lesson.id;

    perform private.enqueue_lesson_side_effects(
      v_workspace_id,
      v_user_id,
      v_lesson.id,
      v_new_start,
      v_lesson.status,
      case when private.has_google_calendar_connection(v_workspace_id, v_user_id)
        then 'pending' else 'disabled' end
    );
    return jsonb_build_object('ids', jsonb_build_array(v_lesson.id), 'seriesId', null);
  end if;

  if v_scope = 'series' then
    if v_lesson.status = 'completed' then
      raise exception 'COMPLETED_LESSON_IMMUTABLE' using errcode = 'P0001';
    end if;
    if nullif(p_payload->>'expectedUpdatedAt', '') is not null
      and v_lesson.updated_at <> (p_payload->>'expectedUpdatedAt')::timestamptz then
      raise exception 'STALE_WRITE' using errcode = '40001';
    end if;
    select array_agg(id order by starts_at) into v_ids
    from public.lessons
    where workspace_id = v_workspace_id
      and recurring_series_id = v_lesson.recurring_series_id
      and starts_at >= now()
      and status not in ('completed', 'cancelled');
    if coalesce(pg_catalog.cardinality(v_ids), 0) = 0 then
      raise exception 'NO_FUTURE_OCCURRENCES' using errcode = 'P0001';
    end if;
    v_delta := v_new_start - v_lesson.starts_at;

    for v_target in
      select * from public.lessons where id = any(v_ids) order by starts_at
    loop
      v_candidate_start := v_target.starts_at + v_delta;
      if exists (
        select 1 from public.lessons l
        where l.workspace_id = v_workspace_id
          and l.id <> all(v_ids)
          and l.status <> 'cancelled'
          and l.starts_at < v_candidate_start + make_interval(mins => v_new_duration)
          and l.ends_at > v_candidate_start
      ) or exists (
        select 1 from public.calendar_blocks b
        where b.workspace_id = v_workspace_id
          and b.starts_at < v_candidate_start + make_interval(mins => v_new_duration)
          and b.ends_at > v_candidate_start
      ) then
        raise exception 'LESSON_CONFLICT' using errcode = '23P01';
      end if;
      if not coalesce((p_payload->>'allowOutsideAvailability')::boolean, false)
        and private.is_outside_availability(
          v_workspace_id,
          v_user_id,
          v_candidate_start,
          v_candidate_start + make_interval(mins => v_new_duration),
          v_target.timezone
        ) then
        raise exception 'OUTSIDE_AVAILABILITY' using errcode = 'P0001';
      end if;
    end loop;

    update public.recurring_lesson_series
    set start_time = (v_new_start at time zone timezone)::time,
      duration_minutes = v_new_duration,
      updated_at = now()
    where id = v_lesson.recurring_series_id;

    for v_target in select * from public.lessons where id = any(v_ids) loop
      v_candidate_start := v_target.starts_at + v_delta;
      update public.lessons
      set starts_at = v_candidate_start,
        ends_at = v_candidate_start + make_interval(mins => v_new_duration),
        sync_status = case when private.has_google_calendar_connection(v_workspace_id, v_user_id)
          then 'pending' else 'disabled' end,
        updated_at = now()
      where id = v_target.id;
      perform private.enqueue_lesson_side_effects(
        v_workspace_id,
        v_user_id,
        v_target.id,
        v_candidate_start,
        v_target.status,
        case when private.has_google_calendar_connection(v_workspace_id, v_user_id)
          then 'pending' else 'disabled' end
      );
    end loop;
    return jsonb_build_object('ids', to_jsonb(v_ids), 'seriesId', v_lesson.recurring_series_id);
  end if;

  select * into v_series
  from public.recurring_lesson_series
  where id = v_lesson.recurring_series_id
    and workspace_id = v_workspace_id;
  v_reference_original := coalesce(
    v_lesson.recurrence_original_starts_at,
    v_lesson.starts_at
  );

  if v_lesson.status = 'completed' then
    with recursive family as (
      select id
      from public.recurring_lesson_series
      where id = v_lesson.recurring_series_id
        and workspace_id = v_workspace_id
      union all
      select child.id
      from public.recurring_lesson_series child
      join family parent on child.parent_series_id = parent.id
      where child.workspace_id = v_workspace_id
    )
    select l.* into v_split_lesson
    from public.lessons l
    join family f on f.id = l.recurring_series_id
    where l.workspace_id = v_workspace_id
      and l.starts_at > now()
      and l.status not in ('completed', 'cancelled')
    order by l.starts_at, l.id
    limit 1;
    if v_split_lesson.id is null then
      raise exception 'NO_FUTURE_OCCURRENCES' using errcode = 'P0001';
    end if;
  else
    v_split_lesson := v_lesson;
  end if;

  select * into v_series
  from public.recurring_lesson_series
  where id = v_split_lesson.recurring_series_id
    and workspace_id = v_workspace_id;
  if v_series.id is null then
    raise exception 'NO_FUTURE_OCCURRENCES' using errcode = 'P0001';
  end if;

  v_split_original := coalesce(
    v_split_lesson.recurrence_original_starts_at,
    v_split_lesson.starts_at
  );
  v_target_date := (v_new_start at time zone v_series.timezone)::date;
  v_target_time := (v_new_start at time zone v_series.timezone)::time;
  v_day_shift := v_target_date
    - (v_reference_original at time zone v_series.timezone)::date;

  with recursive family as (
    select id, ends_on
    from public.recurring_lesson_series
    where id = v_series.id and workspace_id = v_workspace_id
    union all
    select child.id, child.ends_on
    from public.recurring_lesson_series child
    join family parent on child.parent_series_id = parent.id
    where child.workspace_id = v_workspace_id
  )
  select array_agg(id),
    case when bool_or(ends_on is null) then null else max(ends_on) + v_day_shift end
  into v_family_ids, v_new_ends_on
  from family;

  select array_agg(id order by recurrence_original_starts_at, starts_at, id)
  into v_ids
  from public.lessons
  where workspace_id = v_workspace_id
    and recurring_series_id = any(v_family_ids)
    and coalesce(recurrence_original_starts_at, starts_at) >= v_split_original
    and status not in ('completed', 'cancelled');
  if coalesce(pg_catalog.cardinality(v_ids), 0) = 0 then
    raise exception 'NO_FUTURE_OCCURRENCES' using errcode = 'P0001';
  end if;

  for v_target in
    select * from public.lessons where id = any(v_ids) order by starts_at
  loop
    v_candidate_start := private.safe_local_wall_time(
      (coalesce(v_target.recurrence_original_starts_at, v_target.starts_at)
        at time zone v_series.timezone)::date + v_day_shift,
      v_target_time,
      v_series.timezone
    );
    if v_target.starts_at <> v_candidate_start
      or extract(epoch from (v_target.ends_at - v_target.starts_at))::integer / 60 <> v_new_duration then
      v_all_already_moved := false;
    end if;
  end loop;

  if v_all_already_moved then
    return jsonb_build_object(
      'ids', to_jsonb(v_ids),
      'seriesId', v_split_lesson.recurring_series_id
    );
  end if;

  if nullif(p_payload->>'expectedUpdatedAt', '') is not null
    and v_lesson.updated_at <> (p_payload->>'expectedUpdatedAt')::timestamptz then
    raise exception 'STALE_WRITE' using errcode = '40001';
  end if;

  for v_target in
    select * from public.lessons where id = any(v_ids) order by starts_at
  loop
    v_candidate_start := private.safe_local_wall_time(
      (coalesce(v_target.recurrence_original_starts_at, v_target.starts_at)
        at time zone v_series.timezone)::date + v_day_shift,
      v_target_time,
      v_series.timezone
    );
    if exists (
      select 1 from public.lessons l
      where l.workspace_id = v_workspace_id
        and l.id <> all(v_ids)
        and l.status <> 'cancelled'
        and l.starts_at < v_candidate_start + make_interval(mins => v_new_duration)
        and l.ends_at > v_candidate_start
    ) or exists (
      select 1 from public.calendar_blocks b
      where b.workspace_id = v_workspace_id
        and b.starts_at < v_candidate_start + make_interval(mins => v_new_duration)
        and b.ends_at > v_candidate_start
    ) then
      raise exception 'LESSON_CONFLICT' using errcode = '23P01';
    end if;
    if not coalesce((p_payload->>'allowOutsideAvailability')::boolean, false)
      and private.is_outside_availability(
        v_workspace_id,
        v_user_id,
        v_candidate_start,
        v_candidate_start + make_interval(mins => v_new_duration),
        v_series.timezone
      ) then
      raise exception 'OUTSIDE_AVAILABILITY' using errcode = 'P0001';
    end if;
  end loop;

  select array_agg(
    (((day_number - 1 + ((v_day_shift % 7 + 7) % 7)) % 7) + 1)::smallint
    order by ordinal
  )
  into v_shifted_days
  from unnest(v_series.days_of_week) with ordinality as days(day_number, ordinal);

  v_cutoff := (v_split_original at time zone v_series.timezone)::date;
  insert into public.recurring_lesson_series (
    workspace_id,
    tutor_id,
    student_id,
    group_id,
    parent_series_id,
    frequency,
    recurrence_interval,
    days_of_week,
    starts_on,
    ends_on,
    start_time,
    duration_minutes,
    timezone,
    status,
    effective_from
  ) values (
    v_workspace_id,
    v_user_id,
    v_series.student_id,
    v_series.group_id,
    v_series.id,
    v_series.frequency,
    v_series.recurrence_interval,
    v_shifted_days,
    v_cutoff + v_day_shift,
    v_new_ends_on,
    v_target_time,
    v_new_duration,
    v_series.timezone,
    'active',
    v_cutoff + v_day_shift
  )
  returning id into v_new_series_id;

  if v_cutoff > v_series.starts_on then
    update public.recurring_lesson_series
    set ends_on = v_cutoff - 1, updated_at = now()
    where id = v_series.id;
  else
    update public.recurring_lesson_series
    set status = 'cancelled', updated_at = now()
    where id = v_series.id;
  end if;

  update public.recurring_lesson_series
  set status = 'cancelled', updated_at = now()
  where id = any(v_family_ids)
    and id <> v_series.id;

  update public.lessons
  set recurring_series_id = v_new_series_id
  where id = any(v_ids);

  for v_target in select * from public.lessons where id = any(v_ids) loop
    v_candidate_start := private.safe_local_wall_time(
      (coalesce(v_target.recurrence_original_starts_at, v_target.starts_at)
        at time zone v_series.timezone)::date + v_day_shift,
      v_target_time,
      v_series.timezone
    );
    update public.lessons
    set starts_at = v_candidate_start,
      ends_at = v_candidate_start + make_interval(mins => v_new_duration),
      sync_status = case when private.has_google_calendar_connection(v_workspace_id, v_user_id)
        then 'pending' else 'disabled' end,
      updated_at = now()
    where id = v_target.id;
    perform private.enqueue_lesson_side_effects(
      v_workspace_id,
      v_user_id,
      v_target.id,
      v_candidate_start,
      v_target.status,
      case when private.has_google_calendar_connection(v_workspace_id, v_user_id)
        then 'pending' else 'disabled' end
    );
  end loop;

  return jsonb_build_object('ids', to_jsonb(v_ids), 'seriesId', v_new_series_id);
end;
$$;

revoke all on function private.safe_local_wall_time(date, time, text) from public, anon;
grant execute on function private.safe_local_wall_time(date, time, text) to authenticated;

