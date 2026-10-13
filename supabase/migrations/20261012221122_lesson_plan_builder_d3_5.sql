-- D3.5 Lesson Plan Builder. The plan remains lesson-specific and deliberately
-- separate from participant outcomes / Student Memory. Existing plan rows are
-- upgraded in place so historic lessons keep their content.

alter table public.lesson_plan_items
  add column title text,
  add column instructions text,
  add column estimated_minutes integer,
  add column completed boolean not null default false,
  add constraint lesson_plan_items_estimated_minutes_range
    check (estimated_minutes is null or estimated_minutes between 1 and 480);

update public.lesson_plan_items
set title = content
where title is null;

create or replace function public.replace_lesson_plan(
  target_lesson_id uuid,
  expected_updated_at timestamptz,
  lesson_topic text,
  lesson_objective text,
  plan_items jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_workspace_id uuid;
  target_status public.lesson_status;
begin
  select workspace_id, status
  into target_workspace_id, target_status
  from public.lessons
  where id = target_lesson_id
    and updated_at = expected_updated_at
  for update;

  if target_workspace_id is null then
    if exists (select 1 from public.lessons where id = target_lesson_id) then
      raise exception 'STALE_LESSON' using errcode = '40001';
    end if;
    raise exception 'lesson is unavailable' using errcode = '42501';
  end if;
  if not private.can_mutate_workspace(target_workspace_id) then
    raise exception 'lesson is unavailable' using errcode = '42501';
  end if;
  if target_status in ('cancelled', 'no_show') then
    raise exception 'LESSON_NOT_EDITABLE' using errcode = '23514';
  end if;
  if jsonb_typeof(coalesce(plan_items, '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(plan_items, '[]'::jsonb)) > 100 then
    raise exception 'INVALID_PLAN' using errcode = '22023';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(coalesce(plan_items, '[]'::jsonb)) item
    where nullif(trim(item->>'title'), '') is null
      or length(item->>'title') > 160
      or length(coalesce(item->>'instructions', '')) > 5000
      or (
        item->>'minutes' is not null
        and ((item->>'minutes')::integer < 1 or (item->>'minutes')::integer > 480)
      )
  ) then
    raise exception 'INVALID_PLAN_ITEM' using errcode = '22023';
  end if;

  update public.lessons
  set title = trim(coalesce(lesson_topic, '')), updated_at = now()
  where id = target_lesson_id and workspace_id = target_workspace_id;

  insert into public.lesson_notes (
    workspace_id, lesson_id, author_user_id, content, visibility, note_type
  ) values (
    target_workspace_id, target_lesson_id, auth.uid(),
    trim(coalesce(lesson_objective, '')), 'private', 'objectives'
  )
  on conflict (lesson_id, author_user_id, note_type) do update
    set content = excluded.content, updated_at = now();

  delete from public.lesson_plan_items
  where lesson_id = target_lesson_id and workspace_id = target_workspace_id;

  insert into public.lesson_plan_items (
    id, workspace_id, lesson_id, position, content, title, instructions,
    estimated_minutes, completed
  )
  select
    (item->>'id')::uuid,
    target_workspace_id,
    target_lesson_id,
    ordinality::integer - 1,
    trim(item->>'title'),
    trim(item->>'title'),
    nullif(trim(coalesce(item->>'instructions', '')), ''),
    case when item->>'minutes' is null then null else (item->>'minutes')::integer end,
    coalesce((item->>'completed')::boolean, false)
  from jsonb_array_elements(coalesce(plan_items, '[]'::jsonb))
    with ordinality as plan_item(item, ordinality);
end;
$$;

revoke all on function public.replace_lesson_plan(uuid, timestamptz, text, text, jsonb) from public, anon;
grant execute on function public.replace_lesson_plan(uuid, timestamptz, text, text, jsonb) to authenticated;

-- Preserve D3.3 copy semantics: objective, sections and materials are appended,
-- never silently substituted, and the copied plan has no live template link.
create or replace function public.apply_lesson_template(target_lesson_id uuid, target_template_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_workspace_id uuid;
  template_record public.lesson_templates%rowtype;
  current_objective text;
  current_notes text;
  next_position integer;
begin
  select workspace_id into target_workspace_id
  from public.lessons
  where id = target_lesson_id and status not in ('cancelled', 'no_show');
  if target_workspace_id is null or not private.can_mutate_workspace(target_workspace_id) then
    raise exception 'lesson is unavailable' using errcode = '42501';
  end if;
  select * into template_record from public.lesson_templates
  where id = target_template_id and workspace_id = target_workspace_id and archived_at is null;
  if not found then raise exception 'template is unavailable' using errcode = 'P0002'; end if;

  select content into current_objective from public.lesson_notes
  where lesson_id = target_lesson_id and author_user_id = auth.uid() and note_type = 'objectives';
  if nullif(trim(template_record.objective), '') is not null then
    insert into public.lesson_notes (workspace_id, lesson_id, author_user_id, content, visibility, note_type)
    values (target_workspace_id, target_lesson_id, auth.uid(),
      concat_ws(E'\n\n', nullif(trim(current_objective), ''), trim(template_record.objective)), 'private', 'objectives')
    on conflict (lesson_id, author_user_id, note_type) do update
      set content = excluded.content, updated_at = now();
  end if;

  select content into current_notes from public.lesson_notes
  where lesson_id = target_lesson_id and author_user_id = auth.uid() and note_type = 'general';
  if nullif(trim(template_record.teacher_notes), '') is not null then
    insert into public.lesson_notes (workspace_id, lesson_id, author_user_id, content, visibility, note_type)
    values (target_workspace_id, target_lesson_id, auth.uid(),
      concat_ws(E'\n\n', nullif(trim(current_notes), ''), trim(template_record.teacher_notes)), 'private', 'general')
    on conflict (lesson_id, author_user_id, note_type) do update
      set content = excluded.content, updated_at = now();
  end if;

  select coalesce(max(position) + 1, 0) into next_position
  from public.lesson_plan_items where lesson_id = target_lesson_id;
  insert into public.lesson_plan_items (
    workspace_id, lesson_id, position, content, title, instructions,
    estimated_minutes, completed
  )
  select
    target_workspace_id,
    target_lesson_id,
    next_position + position,
    title,
    title,
    nullif(trim(content), ''),
    estimated_minutes,
    false
  from public.lesson_template_sections
  where template_id = target_template_id
  order by position;

  insert into public.lesson_materials (workspace_id, lesson_id, material_id)
  select target_workspace_id, target_lesson_id, material_id
  from public.lesson_template_materials
  where template_id = target_template_id
  on conflict (lesson_id, material_id) do nothing;

  update public.lessons set updated_at = now() where id = target_lesson_id;
end;
$$;

revoke all on function public.apply_lesson_template(uuid, uuid) from public;
grant execute on function public.apply_lesson_template(uuid, uuid) to authenticated;
