-- D3.6 Previous Lesson Reuse. The import receipt makes a single user action
-- idempotent while a new UUID permits an intentional second import.

create table public.lesson_reuse_imports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  target_lesson_id uuid not null,
  source_lesson_id uuid not null,
  import_key uuid not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (target_lesson_id, workspace_id)
    references public.lessons(id, workspace_id) on delete cascade,
  foreign key (source_lesson_id, workspace_id)
    references public.lessons(id, workspace_id) on delete restrict,
  unique (target_lesson_id, import_key),
  unique (id, workspace_id)
);

create index lesson_reuse_imports_workspace_created_idx
  on public.lesson_reuse_imports (workspace_id, created_at desc);

alter table public.lesson_reuse_imports enable row level security;
revoke all on table public.lesson_reuse_imports from anon, authenticated;
grant select, insert on table public.lesson_reuse_imports to authenticated;

create policy lesson_reuse_imports_select_member
  on public.lesson_reuse_imports for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));
create policy lesson_reuse_imports_insert_writable_member
  on public.lesson_reuse_imports for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (select private.can_mutate_workspace(workspace_id))
  );

create or replace function public.apply_previous_lesson_preparation(
  target_lesson_id uuid,
  source_lesson_id uuid,
  selected_section_ids uuid[],
  selected_material_ids uuid[],
  include_objective boolean,
  import_key uuid
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_record public.lessons%rowtype;
  source_record public.lessons%rowtype;
  next_position integer;
  source_objective text;
  current_objective text;
  receipt_id uuid;
begin
  select * into target_record
  from public.lessons
  where id = target_lesson_id
  for update;

  if target_record.id is null
    or not private.can_mutate_workspace(target_record.workspace_id) then
    raise exception 'lesson is unavailable' using errcode = '42501';
  end if;
  if target_record.status not in ('scheduled', 'needs_completion') then
    raise exception 'LESSON_NOT_EDITABLE' using errcode = '23514';
  end if;
  if cardinality(coalesce(selected_section_ids, array[]::uuid[])) > 100
    or cardinality(coalesce(selected_material_ids, array[]::uuid[])) > 500 then
    raise exception 'INVALID_REUSE_SELECTION' using errcode = '22023';
  end if;

  select * into source_record
  from public.lessons
  where id = source_lesson_id
    and workspace_id = target_record.workspace_id
    and status = 'completed'
    and starts_at < target_record.starts_at
    and (
      (
        target_record.student_id is not null
        and student_id = target_record.student_id
        and group_id is null
      )
      or (
        target_record.group_id is not null
        and group_id = target_record.group_id
        and student_id is null
      )
    );
  if source_record.id is null then
    raise exception 'REUSE_SOURCE_UNAVAILABLE' using errcode = 'P0002';
  end if;

  insert into public.lesson_reuse_imports (
    workspace_id, target_lesson_id, source_lesson_id, import_key, created_by
  ) values (
    target_record.workspace_id, target_lesson_id, source_lesson_id,
    import_key, auth.uid()
  )
  on conflict on constraint lesson_reuse_imports_target_lesson_id_import_key_key
    do nothing
  returning id into receipt_id;

  -- A transport retry with the same key has already applied this exact action.
  if receipt_id is null then return; end if;

  select coalesce(max(position) + 1, 0) into next_position
  from public.lesson_plan_items
  where lesson_id = target_lesson_id;

  insert into public.lesson_plan_items (
    workspace_id, lesson_id, position, content, title, instructions,
    estimated_minutes, completed
  )
  select
    target_record.workspace_id,
    target_lesson_id,
    next_position + (row_number() over (order by source_item.position))::integer - 1,
    source_item.title,
    source_item.title,
    source_item.instructions,
    source_item.estimated_minutes,
    false
  from public.lesson_plan_items source_item
  where source_item.workspace_id = target_record.workspace_id
    and source_item.lesson_id = source_lesson_id
    and source_item.id = any(coalesce(selected_section_ids, array[]::uuid[]))
  order by source_item.position;

  insert into public.lesson_materials (workspace_id, lesson_id, material_id)
  select target_record.workspace_id, target_lesson_id, source_link.material_id
  from public.lesson_materials source_link
  join public.materials material
    on material.id = source_link.material_id
    and material.workspace_id = source_link.workspace_id
  where source_link.workspace_id = target_record.workspace_id
    and source_link.lesson_id = source_lesson_id
    and source_link.material_id = any(
      coalesce(selected_material_ids, array[]::uuid[])
    )
  on conflict (lesson_id, material_id) do nothing;

  if coalesce(include_objective, false) then
    select content into source_objective
    from public.lesson_notes
    where workspace_id = target_record.workspace_id
      and lesson_id = source_lesson_id
      and author_user_id = auth.uid()
      and note_type = 'objectives';

    if nullif(trim(source_objective), '') is not null then
      select content into current_objective
      from public.lesson_notes
      where workspace_id = target_record.workspace_id
        and lesson_id = target_lesson_id
        and author_user_id = auth.uid()
        and note_type = 'objectives';

      insert into public.lesson_notes (
        workspace_id, lesson_id, author_user_id, content, visibility, note_type
      ) values (
        target_record.workspace_id,
        target_lesson_id,
        auth.uid(),
        concat_ws(E'\n\n', nullif(trim(current_objective), ''), trim(source_objective)),
        'private',
        'objectives'
      )
      on conflict (lesson_id, author_user_id, note_type) do update
        set content = excluded.content, updated_at = now();
    end if;
  end if;

  update public.lessons set updated_at = now()
  where id = target_lesson_id and workspace_id = target_record.workspace_id;
end;
$$;

revoke all on function public.apply_previous_lesson_preparation(
  uuid, uuid, uuid[], uuid[], boolean, uuid
) from public, anon;
grant execute on function public.apply_previous_lesson_preparation(
  uuid, uuid, uuid[], uuid[], boolean, uuid
) to authenticated;
