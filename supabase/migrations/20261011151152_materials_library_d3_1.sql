-- D3.1 Materials Library: practical metadata, reusable text content and
-- workspace-private file storage. Existing material ids and lesson joins stay
-- untouched so historical lesson references continue to resolve.

alter table public.materials
  add column subject text,
  add column level text,
  add column text_content text,
  add column storage_path text,
  add column original_filename text,
  add column mime_type text,
  add column file_size_bytes bigint;

alter table public.materials
  drop constraint materials_location,
  add constraint materials_location check (
    -- Legacy note rows did not have text_content. The API requires content for
    -- new text materials, while this compatible constraint keeps old rows valid.
    (type = 'note' and file_url is null and external_url is null)
    or (type = 'file' and file_url is not null and external_url is null and text_content is null)
    or (type = 'link' and external_url is not null and file_url is null and text_content is null)
  ),
  add constraint materials_external_url_http check (
    external_url is null or external_url ~* '^https?://'
  ),
  add constraint materials_file_size check (
    file_size_bytes is null or (file_size_bytes > 0 and file_size_bytes <= 10485760)
  );

create index materials_workspace_subject_idx
  on public.materials (workspace_id, subject)
  where archived_at is null and subject is not null;

create index materials_workspace_level_idx
  on public.materials (workspace_id, level)
  where archived_at is null and level is not null;

create or replace function private.can_mutate_workspace(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members member
    join public.subscriptions subscription
      on subscription.teacher_id = member.user_id
    where member.workspace_id = target_workspace_id
      and member.user_id = (select auth.uid())
      and member.status = 'active'
      and subscription.read_only = false
  );
$$;

revoke all on function private.can_mutate_workspace(uuid) from public;
grant execute on function private.can_mutate_workspace(uuid) to authenticated;

drop policy if exists materials_insert_member on public.materials;
drop policy if exists materials_update_member on public.materials;
create policy materials_insert_writable_member
  on public.materials for insert to authenticated
  with check (
    owner_user_id = (select auth.uid())
    and (select private.can_mutate_workspace(workspace_id))
  );
create policy materials_update_writable_member
  on public.materials for update to authenticated
  using ((select private.can_mutate_workspace(workspace_id)))
  with check (
    owner_user_id = (select auth.uid())
    and (select private.can_mutate_workspace(workspace_id))
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'material-files',
  'material-files',
  false,
  10485760,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy material_files_select_workspace_member
  on storage.objects for select to authenticated
  using (
    bucket_id = 'material-files'
    and (select private.is_workspace_member(((storage.foldername(name))[1])::uuid))
  );

create policy material_files_insert_writable_member
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'material-files'
    and owner_id = (select auth.uid()::text)
    and (select private.can_mutate_workspace(((storage.foldername(name))[1])::uuid))
  );

create policy material_files_update_writable_member
  on storage.objects for update to authenticated
  using (
    bucket_id = 'material-files'
    and owner_id = (select auth.uid()::text)
    and (select private.can_mutate_workspace(((storage.foldername(name))[1])::uuid))
  )
  with check (
    bucket_id = 'material-files'
    and owner_id = (select auth.uid()::text)
    and (select private.can_mutate_workspace(((storage.foldername(name))[1])::uuid))
  );

create policy material_files_delete_writable_member
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'material-files'
    and owner_id = (select auth.uid()::text)
    and (select private.can_mutate_workspace(((storage.foldername(name))[1])::uuid))
  );

grant select, insert, update, delete on storage.objects to authenticated;
