-- D3.7 Homework Workflow. `homeworks` remains the canonical lesson-level
-- assignment. The two new join tables add immutable recipient snapshots and
-- material references without changing lesson, finance or outcome records.

create type public.homework_assignment_status as enum (
  'assigned',
  'completed',
  'reviewed',
  'not_completed'
);

create table public.homework_assignments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  homework_id uuid not null,
  student_id uuid not null,
  status public.homework_assignment_status not null default 'assigned',
  feedback text,
  completed_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint homework_assignments_homework_fk
    foreign key (homework_id, workspace_id)
    references public.homeworks(id, workspace_id) on delete cascade,
  constraint homework_assignments_student_fk
    foreign key (student_id, workspace_id)
    references public.students(id, workspace_id) on delete restrict,
  constraint homework_assignments_feedback_length
    check (feedback is null or char_length(feedback) <= 2000),
  constraint homework_assignments_timestamps_check check (
    (status <> 'completed' or completed_at is not null)
    and (status <> 'reviewed' or reviewed_at is not null)
  ),
  unique (homework_id, student_id),
  unique (id, workspace_id)
);

create index homework_assignments_student_status_idx
  on public.homework_assignments (workspace_id, student_id, status, updated_at desc);

create table public.homework_materials (
  workspace_id uuid not null references public.workspaces(id) on delete restrict,
  homework_id uuid not null,
  material_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (homework_id, material_id),
  foreign key (homework_id, workspace_id)
    references public.homeworks(id, workspace_id) on delete cascade,
  foreign key (material_id, workspace_id)
    references public.materials(id, workspace_id) on delete restrict
);

create index homework_materials_material_idx
  on public.homework_materials (workspace_id, material_id);

create or replace function private.validate_homework_assignment_participant()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.homeworks homework
    join public.lesson_participants participant
      on participant.workspace_id = homework.workspace_id
     and participant.lesson_id = homework.lesson_id
     and participant.student_id = new.student_id
    where homework.id = new.homework_id
      and homework.workspace_id = new.workspace_id
  ) then
    raise exception 'INVALID_HOMEWORK_RECIPIENT' using errcode = '23503';
  end if;
  return new;
end;
$$;

revoke all on function private.validate_homework_assignment_participant()
  from public, anon, authenticated;

create trigger homework_assignments_validate_participant
before insert or update of workspace_id, homework_id, student_id
on public.homework_assignments
for each row execute function private.validate_homework_assignment_participant();

create trigger homework_assignments_set_updated_at
before update on public.homework_assignments
for each row execute function private.set_updated_at();

alter table public.homework_assignments enable row level security;
alter table public.homework_materials enable row level security;

create policy homework_assignments_select_member
  on public.homework_assignments for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));
create policy homework_assignments_insert_writable_member
  on public.homework_assignments for insert to authenticated
  with check ((select private.can_mutate_workspace(workspace_id)));
create policy homework_assignments_update_writable_member
  on public.homework_assignments for update to authenticated
  using ((select private.can_mutate_workspace(workspace_id)))
  with check ((select private.can_mutate_workspace(workspace_id)));
create policy homework_assignments_delete_writable_member
  on public.homework_assignments for delete to authenticated
  using ((select private.can_mutate_workspace(workspace_id)));

create policy homework_materials_select_member
  on public.homework_materials for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));
create policy homework_materials_insert_writable_member
  on public.homework_materials for insert to authenticated
  with check ((select private.can_mutate_workspace(workspace_id)));
create policy homework_materials_delete_writable_member
  on public.homework_materials for delete to authenticated
  using ((select private.can_mutate_workspace(workspace_id)));

revoke all on table public.homework_assignments, public.homework_materials
  from anon, authenticated;
grant select, insert, update, delete on public.homework_assignments to authenticated;
grant select, insert, delete on public.homework_materials to authenticated;

-- The original broad workspace policies pre-date subscription read-only mode.
drop policy if exists homeworks_insert_member on public.homeworks;
drop policy if exists homeworks_update_member on public.homeworks;
drop policy if exists homeworks_delete_member on public.homeworks;
create policy homeworks_insert_writable_member
  on public.homeworks for insert to authenticated
  with check ((select private.can_mutate_workspace(workspace_id)));
create policy homeworks_update_writable_member
  on public.homeworks for update to authenticated
  using ((select private.can_mutate_workspace(workspace_id)))
  with check ((select private.can_mutate_workspace(workspace_id)));
create policy homeworks_delete_writable_member
  on public.homeworks for delete to authenticated
  using ((select private.can_mutate_workspace(workspace_id)));

-- Existing assignments are expanded from the lesson participant snapshot.
-- This is intentionally not based on current group membership.
insert into public.homework_assignments (
  workspace_id, homework_id, student_id, status, completed_at, reviewed_at,
  created_at, updated_at
)
select
  homework.workspace_id,
  homework.id,
  participant.student_id,
  case homework.status
    when 'completed' then 'completed'::public.homework_assignment_status
    when 'cancelled' then 'not_completed'::public.homework_assignment_status
    else 'assigned'::public.homework_assignment_status
  end,
  case when homework.status = 'completed' then homework.updated_at end,
  null,
  homework.created_at,
  homework.updated_at
from public.homeworks homework
join public.lesson_participants participant
  on participant.workspace_id = homework.workspace_id
 and participant.lesson_id = homework.lesson_id
on conflict (homework_id, student_id) do nothing;

create or replace function public.upsert_lesson_homework(
  target_lesson_id uuid,
  homework_title text,
  homework_description text,
  homework_due_at timestamptz,
  recipient_ids uuid[],
  material_ids uuid[] default '{}'::uuid[]
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_student_id uuid;
  v_group_id uuid;
  v_homework_id uuid;
begin
  select lesson.workspace_id, lesson.student_id, lesson.group_id
    into v_workspace_id, v_student_id, v_group_id
  from public.lessons lesson
  where lesson.id = target_lesson_id
    and (select private.can_mutate_workspace(lesson.workspace_id));

  if v_workspace_id is null then
    raise exception 'LESSON_NOT_FOUND_OR_READ_ONLY' using errcode = 'P0001';
  end if;
  if nullif(btrim(homework_title), '') is null
     or char_length(homework_title) > 200
     or char_length(coalesce(homework_description, '')) > 10000 then
    raise exception 'INVALID_HOMEWORK' using errcode = '22023';
  end if;
  if coalesce(cardinality(recipient_ids), 0) = 0 then
    raise exception 'HOMEWORK_RECIPIENT_REQUIRED' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(recipient_ids) recipient(student_id)
    where not exists (
      select 1 from public.lesson_participants participant
      where participant.workspace_id = v_workspace_id
        and participant.lesson_id = target_lesson_id
        and participant.student_id = recipient.student_id
    )
  ) then
    raise exception 'INVALID_HOMEWORK_RECIPIENT' using errcode = '23503';
  end if;
  if exists (
    select 1 from unnest(material_ids) requested(material_id)
    where not exists (
      select 1 from public.materials material
      where material.workspace_id = v_workspace_id
        and material.id = requested.material_id
    )
  ) then
    raise exception 'INVALID_HOMEWORK_MATERIAL' using errcode = '23503';
  end if;

  insert into public.homeworks (
    workspace_id, lesson_id, student_id, group_id, title, description, due_at,
    status, updated_at
  ) values (
    v_workspace_id, target_lesson_id, v_student_id, v_group_id,
    btrim(homework_title), nullif(btrim(homework_description), ''),
    homework_due_at, 'assigned', clock_timestamp()
  )
  on conflict (lesson_id) do update set
    title = excluded.title,
    description = excluded.description,
    due_at = excluded.due_at,
    updated_at = excluded.updated_at
  returning id into v_homework_id;

  insert into public.homework_assignments (workspace_id, homework_id, student_id)
  select v_workspace_id, v_homework_id, recipient.student_id
  from (select distinct unnest(recipient_ids) as student_id) recipient
  on conflict (homework_id, student_id) do nothing;

  delete from public.homework_assignments assignment
  where assignment.workspace_id = v_workspace_id
    and assignment.homework_id = v_homework_id
    and not (assignment.student_id = any(recipient_ids));

  insert into public.homework_materials (workspace_id, homework_id, material_id)
  select v_workspace_id, v_homework_id, requested.material_id
  from (select distinct unnest(material_ids) as material_id) requested
  on conflict (homework_id, material_id) do nothing;

  delete from public.homework_materials link
  where link.workspace_id = v_workspace_id
    and link.homework_id = v_homework_id
    and not (link.material_id = any(material_ids));

  return v_homework_id;
end;
$$;

revoke all on function public.upsert_lesson_homework(
  uuid, text, text, timestamptz, uuid[], uuid[]
) from public, anon;
grant execute on function public.upsert_lesson_homework(
  uuid, text, text, timestamptz, uuid[], uuid[]
) to authenticated;
