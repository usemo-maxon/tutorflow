-- D1.2 keeps the deployed three-argument completion function intact and adds a
-- versioned contract that persists participant outcomes in the same database
-- transaction as lifecycle and finance mutations.
create function public.complete_lesson_workspace_v2(
  p_workspace_id uuid,
  p_lesson_id uuid,
  p_idempotency_key text,
  p_expected_updated_at timestamptz,
  p_outcomes jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  lesson_row public.lessons%rowtype;
  package_row public.packages%rowtype;
  participant_row record;
  outcome_row jsonb;
  outcome_student_id uuid;
  progress_value text;
  difficulty_value text;
  difficulty_note_value text;
  next_step_value text;
  unresolved_count integer;
  remaining_units integer;
  due_days integer;
begin
  if not (select private.is_workspace_member(p_workspace_id)) then
    raise exception 'WORKSPACE_ACCESS_DENIED' using errcode = '42501';
  end if;
  if length(trim(p_idempotency_key)) < 8 then
    raise exception 'INVALID_IDEMPOTENCY_KEY' using errcode = '22023';
  end if;
  if p_outcomes is null or jsonb_typeof(p_outcomes) <> 'array' then
    raise exception 'INVALID_OUTCOME_PAYLOAD' using errcode = '22023';
  end if;

  select * into lesson_row from public.lessons
  where id = p_lesson_id and workspace_id = p_workspace_id for update;
  if lesson_row.id is null then raise exception 'LESSON_NOT_FOUND'; end if;
  if lesson_row.status = 'cancelled' then raise exception 'CANCELLED_LESSON_CANNOT_BE_COMPLETED'; end if;
  if lesson_row.status = 'no_show' then raise exception 'NO_SHOW_LESSON_CANNOT_BE_COMPLETED'; end if;
  if lesson_row.status = 'completed' then
    return jsonb_build_object('status', 'completed', 'remainingLessons', null);
  end if;
  if lesson_row.updated_at <> p_expected_updated_at then
    raise exception 'STALE_LESSON' using errcode = '40001';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_outcomes) entry
    group by entry ->> 'studentId'
    having count(*) > 1
  ) then
    raise exception 'DUPLICATE_OUTCOME_PARTICIPANT' using errcode = '22023';
  end if;

  select count(*)::integer into unresolved_count
  from public.lesson_participants participant
  left join public.attendances attendance
    on attendance.lesson_id = participant.lesson_id
    and attendance.student_id = participant.student_id
    and attendance.workspace_id = participant.workspace_id
  where participant.workspace_id = p_workspace_id
    and participant.lesson_id = p_lesson_id
    and (attendance.id is null or attendance.status = 'unknown');
  if unresolved_count > 0 then raise exception 'ATTENDANCE_REQUIRED' using errcode = '23514'; end if;

  for outcome_row in select value from jsonb_array_elements(p_outcomes)
  loop
    if jsonb_typeof(outcome_row) <> 'object'
      or not (outcome_row ? 'studentId')
      or exists (
        select 1 from jsonb_object_keys(outcome_row) key
        where key not in ('studentId', 'progressSummary', 'difficultyLevel', 'difficultyNote', 'nextStep')
      )
      or (outcome_row ? 'progressSummary' and jsonb_typeof(outcome_row -> 'progressSummary') not in ('string', 'null'))
      or (outcome_row ? 'difficultyLevel' and jsonb_typeof(outcome_row -> 'difficultyLevel') not in ('string', 'null'))
      or (outcome_row ? 'difficultyNote' and jsonb_typeof(outcome_row -> 'difficultyNote') not in ('string', 'null'))
      or (outcome_row ? 'nextStep' and jsonb_typeof(outcome_row -> 'nextStep') not in ('string', 'null'))
    then
      raise exception 'INVALID_OUTCOME_PAYLOAD' using errcode = '22023';
    end if;

    begin
      outcome_student_id := (outcome_row ->> 'studentId')::uuid;
    exception when invalid_text_representation then
      raise exception 'INVALID_OUTCOME_PAYLOAD' using errcode = '22023';
    end;
    progress_value := nullif(trim(outcome_row ->> 'progressSummary'), '');
    difficulty_value := nullif(trim(outcome_row ->> 'difficultyLevel'), '');
    difficulty_note_value := nullif(trim(outcome_row ->> 'difficultyNote'), '');
    next_step_value := nullif(trim(outcome_row ->> 'nextStep'), '');

    if difficulty_value is not null and difficulty_value not in ('easy', 'mixed', 'hard') then
      raise exception 'INVALID_OUTCOME_PAYLOAD' using errcode = '22023';
    end if;
    if char_length(progress_value) > 2000
      or char_length(difficulty_note_value) > 2000
      or char_length(next_step_value) > 2000
    then
      raise exception 'INVALID_OUTCOME_PAYLOAD' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.lesson_participants participant
      where participant.workspace_id = p_workspace_id
        and participant.lesson_id = p_lesson_id
        and participant.student_id = outcome_student_id
    ) then
      raise exception 'INVALID_OUTCOME_PARTICIPANT' using errcode = '23503';
    end if;

    if progress_value is not null or difficulty_value is not null
      or difficulty_note_value is not null or next_step_value is not null
    then
      insert into public.lesson_student_outcomes (
        workspace_id, lesson_id, student_id, progress_summary,
        difficulty_level, difficulty_note, next_step
      ) values (
        p_workspace_id, p_lesson_id, outcome_student_id, progress_value,
        difficulty_value, difficulty_note_value, next_step_value
      )
      on conflict (workspace_id, lesson_id, student_id) do update set
        progress_summary = excluded.progress_summary,
        difficulty_level = excluded.difficulty_level,
        difficulty_note = excluded.difficulty_note,
        next_step = excluded.next_step;
    end if;
  end loop;

  select payment_due_days into due_days from public.workspaces where id = p_workspace_id;
  if lesson_row.billing_type = 'package' and lesson_row.student_id is not null then
    select * into package_row from public.packages
    where workspace_id = p_workspace_id and student_id = lesson_row.student_id
      and status = 'active' and (expires_at is null or expires_at >= now())
    order by expires_at asc nulls last, purchased_at, created_at
    limit 1 for update;
    if package_row.id is not null then
      remaining_units := public.complete_lesson_with_package(
        p_workspace_id, p_lesson_id, lesson_row.student_id, package_row.id, p_idempotency_key
      );
    else
      update public.lessons set status = 'completed', completed_at = coalesce(completed_at, now()),
        cancelled_at = null, updated_at = now()
      where id = p_lesson_id and workspace_id = p_workspace_id;
    end if;
  else
    update public.lessons set status = 'completed', completed_at = coalesce(completed_at, now()),
      cancelled_at = null, updated_at = now()
    where id = p_lesson_id and workspace_id = p_workspace_id;
    if lesson_row.billing_type in ('per_lesson', 'per_student') and coalesce(lesson_row.price_grosz, 0) > 0 then
      for participant_row in
        select student_id from public.lesson_participants
        where workspace_id = p_workspace_id and lesson_id = p_lesson_id
      loop
        insert into public.charges (
          workspace_id, student_id, lesson_id, type, description,
          amount_grosz, currency, due_at
        ) values (
          p_workspace_id, participant_row.student_id, p_lesson_id, 'lesson',
          coalesce(nullif(lesson_row.title, ''), 'Lekcja'), lesson_row.price_grosz,
          lesson_row.currency, now() + make_interval(days => due_days)
        ) on conflict do nothing;
      end loop;
    end if;
  end if;
  return jsonb_build_object('status', 'completed', 'remainingLessons', remaining_units);
end;
$$;

revoke all on function public.complete_lesson_workspace_v2(uuid, uuid, text, timestamptz, jsonb) from public, anon;
grant execute on function public.complete_lesson_workspace_v2(uuid, uuid, text, timestamptz, jsonb) to authenticated;
