-- D3.2 Material Organization: flat folders, workspace-private tags and a
-- bounded, database-backed search path. Existing materials remain unfiled and
-- untagged; lesson_materials and the D3.1 material type model are unchanged.

create extension if not exists pg_trgm with schema extensions;

create table public.material_folders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  name_key text generated always as (
    lower(regexp_replace(trim(name), '\s+', ' ', 'g'))
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint material_folders_name_not_blank check (length(trim(name)) between 1 and 80),
  unique (id, workspace_id),
  unique (workspace_id, name_key)
);

create table public.material_tags (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  name_key text generated always as (
    lower(regexp_replace(trim(name), '\s+', ' ', 'g'))
  ) stored,
  created_at timestamptz not null default now(),
  constraint material_tags_name_not_blank check (length(trim(name)) between 1 and 50),
  unique (id, workspace_id),
  unique (workspace_id, name_key)
);

alter table public.materials
  add column folder_id uuid;

alter table public.materials
  add constraint materials_folder_workspace_fk
  foreign key (folder_id, workspace_id)
  references public.material_folders(id, workspace_id)
  on delete restrict;

create table public.material_tag_assignments (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  material_id uuid not null,
  tag_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (material_id, tag_id),
  foreign key (material_id, workspace_id)
    references public.materials(id, workspace_id) on delete cascade,
  foreign key (tag_id, workspace_id)
    references public.material_tags(id, workspace_id) on delete cascade
);

create index material_folders_workspace_name_idx
  on public.material_folders (workspace_id, name);
create index material_tags_workspace_name_idx
  on public.material_tags (workspace_id, name);
create index material_tags_name_trgm_idx
  on public.material_tags using gin (name extensions.gin_trgm_ops);
create index materials_workspace_folder_active_idx
  on public.materials (workspace_id, folder_id, updated_at desc)
  where archived_at is null;
create index material_tag_assignments_workspace_tag_idx
  on public.material_tag_assignments (workspace_id, tag_id, material_id);
create index materials_search_trgm_idx
  on public.materials using gin ((
    coalesce(title, '') || ' ' || coalesce(description, '') || ' ' ||
    coalesce(subject, '') || ' ' || coalesce(level, '') || ' ' ||
    coalesce(text_content, '')
  ) extensions.gin_trgm_ops);

alter table public.material_folders enable row level security;
alter table public.material_tags enable row level security;
alter table public.material_tag_assignments enable row level security;

create policy material_folders_select_member
  on public.material_folders for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));
create policy material_folders_insert_writable_member
  on public.material_folders for insert to authenticated
  with check ((select private.can_mutate_workspace(workspace_id)));
create policy material_folders_update_writable_member
  on public.material_folders for update to authenticated
  using ((select private.can_mutate_workspace(workspace_id)))
  with check ((select private.can_mutate_workspace(workspace_id)));
create policy material_folders_delete_writable_member
  on public.material_folders for delete to authenticated
  using ((select private.can_mutate_workspace(workspace_id)));

create policy material_tags_select_member
  on public.material_tags for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));
create policy material_tags_insert_writable_member
  on public.material_tags for insert to authenticated
  with check ((select private.can_mutate_workspace(workspace_id)));
create policy material_tags_update_writable_member
  on public.material_tags for update to authenticated
  using ((select private.can_mutate_workspace(workspace_id)))
  with check ((select private.can_mutate_workspace(workspace_id)));
create policy material_tags_delete_writable_member
  on public.material_tags for delete to authenticated
  using ((select private.can_mutate_workspace(workspace_id)));

create policy material_tag_assignments_select_member
  on public.material_tag_assignments for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));
create policy material_tag_assignments_insert_writable_member
  on public.material_tag_assignments for insert to authenticated
  with check ((select private.can_mutate_workspace(workspace_id)));
create policy material_tag_assignments_delete_writable_member
  on public.material_tag_assignments for delete to authenticated
  using ((select private.can_mutate_workspace(workspace_id)));

grant select, insert, update, delete on public.material_folders to authenticated;
grant select, insert, update, delete on public.material_tags to authenticated;
grant select, insert, delete on public.material_tag_assignments to authenticated;

create or replace function private.unfile_materials_before_folder_delete()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.materials
  set folder_id = null, updated_at = now()
  where workspace_id = old.workspace_id and folder_id = old.id;
  return old;
end;
$$;

revoke all on function private.unfile_materials_before_folder_delete() from public;

create trigger material_folders_unfile_before_delete
before delete on public.material_folders
for each row execute function private.unfile_materials_before_folder_delete();

create or replace function public.set_material_organization(
  target_material_id uuid,
  target_folder_id uuid default null,
  target_tag_ids uuid[] default '{}',
  new_tag_names text[] default '{}'
)
returns table (id uuid, name text)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_workspace_id uuid;
  raw_name text;
  clean_name text;
begin
  select material.workspace_id into target_workspace_id
  from public.materials material
  where material.id = target_material_id;

  if target_workspace_id is null or not private.can_mutate_workspace(target_workspace_id) then
    raise exception 'material is unavailable' using errcode = '42501';
  end if;

  if target_folder_id is not null and not exists (
    select 1 from public.material_folders folder
    where folder.id = target_folder_id and folder.workspace_id = target_workspace_id
  ) then
    raise exception 'folder is outside material workspace' using errcode = '23503';
  end if;

  if exists (
    select 1 from unnest(coalesce(target_tag_ids, '{}')) selected_tag_id
    where not exists (
      select 1 from public.material_tags tag
      where tag.id = selected_tag_id and tag.workspace_id = target_workspace_id
    )
  ) then
    raise exception 'tag is outside material workspace' using errcode = '23503';
  end if;

  update public.materials
  set folder_id = target_folder_id, updated_at = now()
  where materials.id = target_material_id;

  foreach raw_name in array coalesce(new_tag_names, '{}') loop
    clean_name := regexp_replace(trim(raw_name), '\s+', ' ', 'g');
    if length(clean_name) between 1 and 50 then
      insert into public.material_tags (workspace_id, name)
      values (target_workspace_id, clean_name)
      on conflict (workspace_id, name_key) do nothing;
    end if;
  end loop;

  delete from public.material_tag_assignments assignment
  where assignment.material_id = target_material_id;

  insert into public.material_tag_assignments (workspace_id, material_id, tag_id)
  select target_workspace_id, target_material_id, selected.id
  from (
    select distinct unnest(coalesce(target_tag_ids, '{}')) as id
    union
    select tag.id
    from public.material_tags tag
    where tag.workspace_id = target_workspace_id
      and tag.name_key in (
        select lower(regexp_replace(trim(candidate), '\s+', ' ', 'g'))
        from unnest(coalesce(new_tag_names, '{}')) candidate
        where length(regexp_replace(trim(candidate), '\s+', ' ', 'g')) between 1 and 50
      )
  ) selected
  on conflict do nothing;

  return query
  select tag.id, tag.name
  from public.material_tags tag
  join public.material_tag_assignments assignment on assignment.tag_id = tag.id
  where assignment.material_id = target_material_id
  order by tag.name;
end;
$$;

revoke all on function public.set_material_organization(uuid, uuid, uuid[], text[]) from public;
grant execute on function public.set_material_organization(uuid, uuid, uuid[], text[]) to authenticated;

create or replace function public.search_material_library(
  target_workspace_id uuid,
  search_text text default null,
  material_kind text default null,
  subject_filter text default null,
  level_filter text default null,
  folder_filter uuid default null,
  without_folder boolean default false,
  tag_filter uuid default null,
  include_archived boolean default false,
  result_limit integer default 200
)
returns table (
  id uuid,
  title text,
  description text,
  type public.material_type,
  external_url text,
  text_content text,
  subject text,
  level text,
  original_filename text,
  mime_type text,
  file_size_bytes bigint,
  storage_path text,
  archived_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  folder_id uuid,
  folder_name text,
  tags jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    material.id,
    material.title,
    coalesce(material.description, ''),
    material.type,
    material.external_url,
    material.text_content,
    material.subject,
    material.level,
    material.original_filename,
    material.mime_type,
    material.file_size_bytes,
    material.storage_path,
    material.archived_at,
    material.created_at,
    material.updated_at,
    material.folder_id,
    folder.name,
    coalesce((
      select jsonb_agg(jsonb_build_object('id', tag.id, 'name', tag.name) order by tag.name)
      from public.material_tag_assignments assignment
      join public.material_tags tag on tag.id = assignment.tag_id
      where assignment.material_id = material.id
    ), '[]'::jsonb)
  from public.materials material
  left join public.material_folders folder on folder.id = material.folder_id
  where material.workspace_id = target_workspace_id
    and private.is_workspace_member(target_workspace_id)
    and case when include_archived then material.archived_at is not null else material.archived_at is null end
    and (material_kind is null or material_kind = '' or
      (material_kind = 'text' and material.type = 'note') or material.type::text = material_kind)
    and (subject_filter is null or subject_filter = '' or material.subject = subject_filter)
    and (level_filter is null or level_filter = '' or material.level = level_filter)
    and (folder_filter is null or material.folder_id = folder_filter)
    and (not without_folder or material.folder_id is null)
    and (tag_filter is null or exists (
      select 1 from public.material_tag_assignments assignment
      where assignment.material_id = material.id and assignment.tag_id = tag_filter
    ))
    and (search_text is null or trim(search_text) = '' or
      (coalesce(material.title, '') || ' ' || coalesce(material.description, '') || ' ' ||
       coalesce(material.subject, '') || ' ' || coalesce(material.level, '') || ' ' ||
       coalesce(material.text_content, '')) ilike '%' || trim(search_text) || '%'
      or exists (
        select 1
        from public.material_tag_assignments assignment
        join public.material_tags tag on tag.id = assignment.tag_id
        where assignment.material_id = material.id
          and tag.name ilike '%' || trim(search_text) || '%'
      )
    )
  order by material.updated_at desc
  limit least(greatest(result_limit, 1), 500);
$$;

revoke all on function public.search_material_library(uuid, text, text, text, text, uuid, boolean, uuid, boolean, integer) from public;
grant execute on function public.search_material_library(uuid, text, text, text, text, uuid, boolean, uuid, boolean, integer) to authenticated;
