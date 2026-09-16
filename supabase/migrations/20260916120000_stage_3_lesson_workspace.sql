-- Stage 3: transactional Lesson Workspace lifecycle operations.

create or replace function public.complete_lesson_workspace(
  p_workspace_id uuid,
  p_lesson_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  lesson_row public.lessons%rowtype;
  package_row public.packages%rowtype;
  unresolved_count integer;
  remaining_units integer;
begin
  if not (select private.is_workspace_member(p_workspace_id)) then
    raise exception 'WORKSPACE_ACCESS_DENIED' using errcode = '42501';
  end if;
  if length(trim(p_idempotency_key)) < 8 then
    raise exception 'INVALID_IDEMPOTENCY_KEY' using errcode = '22023';
  end if;

  select * into lesson_row
  from public.lessons
  where id = p_lesson_id and workspace_id = p_workspace_id
  for update;
  if lesson_row.id is null then raise exception 'LESSON_NOT_FOUND'; end if;
  if lesson_row.status = 'cancelled' then
    raise exception 'CANCELLED_LESSON_CANNOT_BE_COMPLETED';
  end if;
  if lesson_row.status = 'no_show' then
    raise exception 'NO_SHOW_LESSON_CANNOT_BE_COMPLETED';
  end if;
  if lesson_row.status = 'completed' then
    return jsonb_build_object('status', 'completed', 'remainingLessons', null);
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
  if unresolved_count > 0 then
    raise exception 'ATTENDANCE_REQUIRED' using errcode = '23514';
  end if;

  if lesson_row.billing_type = 'package' and lesson_row.student_id is not null then
    select * into package_row
    from public.packages
    where workspace_id = p_workspace_id
      and student_id = lesson_row.student_id
      and status = 'active'
    order by purchased_at, created_at
    limit 1
    for update;

    if package_row.id is not null then
      remaining_units := public.complete_lesson_with_package(
        p_workspace_id,
        p_lesson_id,
        lesson_row.student_id,
        package_row.id,
        p_idempotency_key
      );
    else
      update public.lessons
      set status = 'completed', completed_at = coalesce(completed_at, now()),
        cancelled_at = null, updated_at = now()
      where id = p_lesson_id and workspace_id = p_workspace_id;
    end if;
  else
    update public.lessons
    set status = 'completed', completed_at = coalesce(completed_at, now()),
      cancelled_at = null, updated_at = now()
    where id = p_lesson_id and workspace_id = p_workspace_id;
  end if;

  return jsonb_build_object(
    'status', 'completed',
    'remainingLessons', remaining_units
  );
end;
$$;

revoke all on function public.complete_lesson_workspace(uuid, uuid, text) from public, anon;
grant execute on function public.complete_lesson_workspace(uuid, uuid, text) to authenticated;

create or replace function public.mark_lesson_no_show(
  p_workspace_id uuid,
  p_lesson_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare current_status public.lesson_status;
begin
  if not (select private.is_workspace_member(p_workspace_id)) then
    raise exception 'WORKSPACE_ACCESS_DENIED' using errcode = '42501';
  end if;
  if length(trim(p_idempotency_key)) < 8 then
    raise exception 'INVALID_IDEMPOTENCY_KEY' using errcode = '22023';
  end if;

  select status into current_status
  from public.lessons
  where id = p_lesson_id and workspace_id = p_workspace_id
  for update;
  if current_status is null then raise exception 'LESSON_NOT_FOUND'; end if;
  if current_status = 'completed' then
    raise exception 'COMPLETED_LESSON_CANNOT_BE_NO_SHOW';
  end if;
  if current_status = 'cancelled' then
    raise exception 'CANCELLED_LESSON_CANNOT_BE_NO_SHOW';
  end if;
  if current_status = 'no_show' then
    return jsonb_build_object('status', 'no_show');
  end if;

  update public.attendances attendance
  set status = 'absent', marked_at = coalesce(attendance.marked_at, now()),
    updated_at = now()
  where attendance.workspace_id = p_workspace_id
    and attendance.lesson_id = p_lesson_id
    and exists (
      select 1 from public.lesson_participants participant
      where participant.workspace_id = p_workspace_id
        and participant.lesson_id = p_lesson_id
        and participant.student_id = attendance.student_id
    );

  update public.lessons
  set status = 'no_show', completed_at = null, cancelled_at = null,
    updated_at = now()
  where id = p_lesson_id and workspace_id = p_workspace_id;

  return jsonb_build_object('status', 'no_show');
end;
$$;

revoke all on function public.mark_lesson_no_show(uuid, uuid, text) from public, anon;
grant execute on function public.mark_lesson_no_show(uuid, uuid, text) to authenticated;

-- Stage 0 intentionally granted only read/create/update for most domain tables.
-- The focused workspace owns the safe, RLS-scoped delete paths for stale plan
-- rows, homework removal, and material detachment.
grant delete on public.lesson_plan_items, public.homeworks, public.lesson_materials to authenticated;
