begin;
select plan(24);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('71000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'organization-a@example.test', '', '{}', '{"full_name":"Organizer A"}', now(), now()),
  ('71000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'organization-b@example.test', '', '{}', '{"full_name":"Organizer B"}', now(), now());

set local role authenticated;
set local request.jwt.claims = '{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated"}';

insert into public.materials (id, workspace_id, owner_user_id, title, description, type, text_content, subject, level)
values (
  '72000000-0000-4000-8000-000000000001',
  (select workspace_id from public.tutor_profiles where user_id = '71000000-0000-4000-8000-000000000001'),
  '71000000-0000-4000-8000-000000000001',
  'Present Perfect practice', 'Speaking revision', 'note', 'Complete the sentences', 'English', 'B1'
);

select is((select folder_id from public.materials where id = '72000000-0000-4000-8000-000000000001'), null, 'existing D3.1 material starts without a folder');
select is((select count(*)::integer from public.material_tag_assignments where material_id = '72000000-0000-4000-8000-000000000001'), 0, 'existing D3.1 material starts without tags');

select lives_ok($$
  insert into public.material_folders (id, workspace_id, name)
  values
    ('73000000-0000-4000-8000-000000000001', (select workspace_id from public.tutor_profiles where user_id = '71000000-0000-4000-8000-000000000001'), 'Grammar'),
    ('73000000-0000-4000-8000-000000000002', (select workspace_id from public.tutor_profiles where user_id = '71000000-0000-4000-8000-000000000001'), 'Speaking')
$$, 'folders can be created');
select lives_ok($$update public.material_folders set name = 'Conversation' where id = '73000000-0000-4000-8000-000000000002'$$, 'folder can be renamed');
select throws_ok($$
  insert into public.material_folders (workspace_id, name)
  values ((select workspace_id from public.tutor_profiles where user_id = '71000000-0000-4000-8000-000000000001'), '  GRAMMAR  ')
$$, '23505', null, 'folder names are normalized for duplicates');

select lives_ok($$
  select * from public.set_material_organization(
    '72000000-0000-4000-8000-000000000001',
    '73000000-0000-4000-8000-000000000001',
    '{}',
    array['Revision', ' grammar ', 'GRAMMAR']
  )
$$, 'material can be moved and assigned several tags');
select is((select folder_id from public.materials where id = '72000000-0000-4000-8000-000000000001'), '73000000-0000-4000-8000-000000000001'::uuid, 'material moved into the selected folder');
select is((select count(*)::integer from public.material_tags), 2, 'duplicate tag variants create one normalized tag');
select is((select count(*)::integer from public.material_tag_assignments where material_id = '72000000-0000-4000-8000-000000000001'), 2, 'several tags are assigned');

select lives_ok(format(
  'select * from public.set_material_organization(%L, %L, array[%L]::uuid[], %L::text[])',
  '72000000-0000-4000-8000-000000000001',
  '73000000-0000-4000-8000-000000000002',
  (select id from public.material_tags where name_key = 'revision'),
  '{}'
), 'material can move folders and remove a tag');
select is((select count(*)::integer from public.material_tag_assignments where material_id = '72000000-0000-4000-8000-000000000001'), 1, 'removed tag assignment is deleted');

select is((select count(*)::integer from public.search_material_library(
  (select workspace_id from public.tutor_profiles where user_id = '71000000-0000-4000-8000-000000000001'),
  search_text => 'revision'
)), 1, 'search matches descriptions and tag names case-insensitively');
select is((select count(*)::integer from public.search_material_library(
  (select workspace_id from public.tutor_profiles where user_id = '71000000-0000-4000-8000-000000000001'),
  search_text => 'present perf', material_kind => 'text', level_filter => 'B1',
  folder_filter => '73000000-0000-4000-8000-000000000002',
  tag_filter => (select id from public.material_tags where name_key = 'revision')
)), 1, 'folder, level, type, tag and partial search combine');
select is((select count(*)::integer from public.search_material_library(
  (select workspace_id from public.tutor_profiles where user_id = '71000000-0000-4000-8000-000000000001'),
  without_folder => true
)), 0, 'no-folder filter excludes filed material');

update public.materials set archived_at = now() where id = '72000000-0000-4000-8000-000000000001';
select is((select count(*)::integer from public.search_material_library((select workspace_id from public.tutor_profiles where user_id = '71000000-0000-4000-8000-000000000001'))), 0, 'active search hides archived material');
select is((select count(*)::integer from public.search_material_library((select workspace_id from public.tutor_profiles where user_id = '71000000-0000-4000-8000-000000000001'), include_archived => true)), 1, 'archived view returns archived material');
select is((select count(*)::integer from public.material_tag_assignments where material_id = '72000000-0000-4000-8000-000000000001'), 1, 'archiving retains tags');

delete from public.material_folders where id = '73000000-0000-4000-8000-000000000002';
select is((select folder_id from public.materials where id = '72000000-0000-4000-8000-000000000001'), null, 'deleting a folder preserves and unfiles its materials');
select is((select count(*)::integer from public.materials where id = '72000000-0000-4000-8000-000000000001'), 1, 'folder deletion never deletes material');

set local request.jwt.claims = '{"sub":"71000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is((select count(*)::integer from public.material_folders), 0, 'another workspace cannot read folders');
select is((select count(*)::integer from public.material_tags), 0, 'another workspace cannot read tags');
select is((select count(*)::integer from public.search_material_library((select workspace_id from public.tutor_profiles where user_id = '71000000-0000-4000-8000-000000000001'), include_archived => true)), 0, 'search cannot cross workspace isolation');

set local role postgres;
update public.subscriptions set read_only = true where teacher_id = '71000000-0000-4000-8000-000000000001';
set local role authenticated;
set local request.jwt.claims = '{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok($$
  insert into public.material_folders (workspace_id, name)
  values ((select workspace_id from public.tutor_profiles where user_id = '71000000-0000-4000-8000-000000000001'), 'Blocked')
$$, '42501', null, 'read-only user cannot create folders');
select throws_ok($$
  select * from public.set_material_organization('72000000-0000-4000-8000-000000000001', null, '{}', array['blocked'])
$$, '42501', null, 'read-only user cannot move or tag materials');

select * from finish();
rollback;
