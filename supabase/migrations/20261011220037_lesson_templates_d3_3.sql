-- D3.3 Reusable lesson templates. Templates are workspace-private plans. Applying
-- one copies reusable content into a lesson; lessons never retain a live template
-- dependency.

create table public.lesson_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  title text not null,
  description text,
  subject text,
  level text,
  objective text,
  teacher_notes text,
  estimated_duration_minutes integer,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lesson_templates_title_not_blank check (length(trim(title)) between 1 and 160),
  constraint lesson_templates_description_length check (length(coalesce(description, '')) <= 2000),
  constraint lesson_templates_objective_length check (length(coalesce(objective, '')) <= 5000),
  constraint lesson_templates_notes_length check (length(coalesce(teacher_notes, '')) <= 20000),
  constraint lesson_templates_duration_range check (estimated_duration_minutes is null or estimated_duration_minutes between 1 and 480),
  unique (id, workspace_id)
);

create table public.lesson_template_sections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  template_id uuid not null,
  title text not null,
  content text,
  estimated_minutes integer,
  position integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (template_id, workspace_id) references public.lesson_templates(id, workspace_id) on delete cascade,
  constraint lesson_template_sections_title_not_blank check (length(trim(title)) between 1 and 120),
  constraint lesson_template_sections_content_length check (length(coalesce(content, '')) <= 5000),
  constraint lesson_template_sections_minutes_range check (estimated_minutes is null or estimated_minutes between 1 and 480),
  constraint lesson_template_sections_position_nonnegative check (position >= 0),
  unique (template_id, position),
  unique (id, workspace_id)
);

create table public.lesson_template_materials (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  template_id uuid not null,
  material_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (template_id, material_id),
  foreign key (template_id, workspace_id) references public.lesson_templates(id, workspace_id) on delete cascade,
  foreign key (material_id, workspace_id) references public.materials(id, workspace_id) on delete restrict
);

create table public.lesson_template_tag_assignments (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  template_id uuid not null,
  tag_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (template_id, tag_id),
  foreign key (template_id, workspace_id) references public.lesson_templates(id, workspace_id) on delete cascade,
  foreign key (tag_id, workspace_id) references public.material_tags(id, workspace_id) on delete cascade
);

create index lesson_templates_workspace_active_idx on public.lesson_templates (workspace_id, updated_at desc) where archived_at is null;
create index lesson_templates_search_trgm_idx on public.lesson_templates using gin ((
  coalesce(title, '') || ' ' || coalesce(description, '') || ' ' ||
  coalesce(subject, '') || ' ' || coalesce(level, '')
) extensions.gin_trgm_ops);
create index lesson_template_sections_order_idx on public.lesson_template_sections (template_id, position);
create index lesson_template_materials_material_idx on public.lesson_template_materials (workspace_id, material_id);
create index lesson_template_tags_tag_idx on public.lesson_template_tag_assignments (workspace_id, tag_id);

alter table public.lesson_templates enable row level security;
alter table public.lesson_template_sections enable row level security;
alter table public.lesson_template_materials enable row level security;
alter table public.lesson_template_tag_assignments enable row level security;

create policy lesson_templates_select_member on public.lesson_templates for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));
create policy lesson_templates_insert_writable_member on public.lesson_templates for insert to authenticated
  with check ((select private.can_mutate_workspace(workspace_id)) and owner_user_id = (select auth.uid()));
create policy lesson_templates_update_writable_member on public.lesson_templates for update to authenticated
  using ((select private.can_mutate_workspace(workspace_id)))
  with check ((select private.can_mutate_workspace(workspace_id)));
create policy lesson_templates_delete_writable_member on public.lesson_templates for delete to authenticated
  using ((select private.can_mutate_workspace(workspace_id)));

create policy lesson_template_sections_select_member on public.lesson_template_sections for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));
create policy lesson_template_sections_insert_writable_member on public.lesson_template_sections for insert to authenticated
  with check ((select private.can_mutate_workspace(workspace_id)));
create policy lesson_template_sections_update_writable_member on public.lesson_template_sections for update to authenticated
  using ((select private.can_mutate_workspace(workspace_id)))
  with check ((select private.can_mutate_workspace(workspace_id)));
create policy lesson_template_sections_delete_writable_member on public.lesson_template_sections for delete to authenticated
  using ((select private.can_mutate_workspace(workspace_id)));

create policy lesson_template_materials_select_member on public.lesson_template_materials for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));
create policy lesson_template_materials_insert_writable_member on public.lesson_template_materials for insert to authenticated
  with check ((select private.can_mutate_workspace(workspace_id)));
create policy lesson_template_materials_delete_writable_member on public.lesson_template_materials for delete to authenticated
  using ((select private.can_mutate_workspace(workspace_id)));

create policy lesson_template_tags_select_member on public.lesson_template_tag_assignments for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));
create policy lesson_template_tags_insert_writable_member on public.lesson_template_tag_assignments for insert to authenticated
  with check ((select private.can_mutate_workspace(workspace_id)));
create policy lesson_template_tags_delete_writable_member on public.lesson_template_tag_assignments for delete to authenticated
  using ((select private.can_mutate_workspace(workspace_id)));

grant select, insert, update, delete on public.lesson_templates to authenticated;
grant select, insert, update, delete on public.lesson_template_sections to authenticated;
grant select, insert, delete on public.lesson_template_materials to authenticated;
grant select, insert, delete on public.lesson_template_tag_assignments to authenticated;

create or replace function public.replace_lesson_template_content(
  target_template_id uuid,
  template_sections jsonb default '[]'::jsonb,
  material_ids uuid[] default '{}',
  tag_ids uuid[] default '{}'
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_workspace_id uuid;
begin
  select workspace_id into target_workspace_id from public.lesson_templates where id = target_template_id;
  if target_workspace_id is null or not private.can_mutate_workspace(target_workspace_id) then
    raise exception 'template is unavailable' using errcode = '42501';
  end if;
  if exists (select 1 from unnest(coalesce(material_ids, '{}')) chosen(material_id) where not exists (
    select 1 from public.materials material where material.id = chosen.material_id and material.workspace_id = target_workspace_id
  )) then raise exception 'material is outside template workspace' using errcode = '23503'; end if;
  if exists (select 1 from unnest(coalesce(tag_ids, '{}')) chosen(tag_id) where not exists (
    select 1 from public.material_tags tag where tag.id = chosen.tag_id and tag.workspace_id = target_workspace_id
  )) then raise exception 'tag is outside template workspace' using errcode = '23503'; end if;

  delete from public.lesson_template_sections where template_id = target_template_id;
  insert into public.lesson_template_sections (id, workspace_id, template_id, title, content, estimated_minutes, position)
  select coalesce(nullif(item->>'id', '')::uuid, gen_random_uuid()), target_workspace_id, target_template_id,
    trim(item->>'title'), nullif(trim(item->>'content'), ''),
    case when item->>'estimatedMinutes' is null then null else (item->>'estimatedMinutes')::integer end,
    ordinality::integer - 1
  from jsonb_array_elements(coalesce(template_sections, '[]'::jsonb)) with ordinality as section(item, ordinality);

  delete from public.lesson_template_materials where template_id = target_template_id;
  insert into public.lesson_template_materials (workspace_id, template_id, material_id)
  select target_workspace_id, target_template_id, chosen.material_id from (select distinct unnest(coalesce(material_ids, '{}')) material_id) chosen;

  delete from public.lesson_template_tag_assignments where template_id = target_template_id;
  insert into public.lesson_template_tag_assignments (workspace_id, template_id, tag_id)
  select target_workspace_id, target_template_id, chosen.tag_id from (select distinct unnest(coalesce(tag_ids, '{}')) tag_id) chosen;
end;
$$;

revoke all on function public.replace_lesson_template_content(uuid, jsonb, uuid[], uuid[]) from public;
grant execute on function public.replace_lesson_template_content(uuid, jsonb, uuid[], uuid[]) to authenticated;

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
  select workspace_id into target_workspace_id from public.lessons where id = target_lesson_id;
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

  select coalesce(max(position) + 1, 0) into next_position from public.lesson_plan_items where lesson_id = target_lesson_id;
  insert into public.lesson_plan_items (workspace_id, lesson_id, position, content)
  select target_workspace_id, target_lesson_id, next_position + position,
    case when nullif(trim(content), '') is null then title else title || E' — ' || trim(content) end
  from public.lesson_template_sections where template_id = target_template_id order by position;

  insert into public.lesson_materials (workspace_id, lesson_id, material_id)
  select target_workspace_id, target_lesson_id, material_id from public.lesson_template_materials
  where template_id = target_template_id on conflict (lesson_id, material_id) do nothing;

  update public.lessons set updated_at = now() where id = target_lesson_id;
end;
$$;

revoke all on function public.apply_lesson_template(uuid, uuid) from public;
grant execute on function public.apply_lesson_template(uuid, uuid) to authenticated;
