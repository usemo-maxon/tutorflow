begin;
select plan(13);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('61000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'materials-a@example.test', '', '{}', '{"full_name":"Tutor Materials A"}', now(), now()),
  ('61000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'materials-b@example.test', '', '{}', '{"full_name":"Tutor Materials B"}', now(), now());

select is((select public from storage.buckets where id = 'material-files'), false, 'material file bucket is private');
select is((select file_size_limit::bigint from storage.buckets where id = 'material-files'), 10485760::bigint, 'bucket enforces the 10 MB limit');

set local role authenticated;
set local request.jwt.claims = '{"sub":"61000000-0000-4000-8000-000000000001","role":"authenticated"}';

select lives_ok($$
  insert into public.materials (id, workspace_id, owner_user_id, title, description, type, file_url, storage_path, original_filename, mime_type, file_size_bytes, subject, level)
  values ('62000000-0000-4000-8000-000000000001', (select workspace_id from public.tutor_profiles where user_id = '61000000-0000-4000-8000-000000000001'), '61000000-0000-4000-8000-000000000001', 'Worksheet', 'Grammar practice', 'file', '/api/materials/62000000-0000-4000-8000-000000000001/open', 'workspace/material/file.pdf', 'file.pdf', 'application/pdf', 1024, 'English', 'B1');
  insert into public.materials (id, workspace_id, owner_user_id, title, type, external_url, subject, level)
  values ('62000000-0000-4000-8000-000000000002', (select workspace_id from public.tutor_profiles where user_id = '61000000-0000-4000-8000-000000000001'), '61000000-0000-4000-8000-000000000001', 'BBC Learning English', 'link', 'https://www.bbc.co.uk/learningenglish', 'English', 'B2');
  insert into public.materials (id, workspace_id, owner_user_id, title, type, text_content, subject, level)
  values ('62000000-0000-4000-8000-000000000003', (select workspace_id from public.tutor_profiles where user_id = '61000000-0000-4000-8000-000000000001'), '61000000-0000-4000-8000-000000000001', 'Speaking — Travel', 'note', '1. Where did you travel last?', 'English', 'B1')
$$, 'file, link and text materials can be created');

select is((select count(*)::integer from public.materials), 3, 'library lists all workspace materials');
select lives_ok($$update public.materials set title = 'Updated worksheet', updated_at = now() where id = '62000000-0000-4000-8000-000000000001'$$, 'material metadata can be edited');
select is((select count(*)::integer from public.materials where title ilike '%worksheet%' or description ilike '%worksheet%'), 1, 'title and description search matches workspace rows');

insert into public.students (id, workspace_id, first_name, display_name)
values ('63000000-0000-4000-8000-000000000001', (select workspace_id from public.tutor_profiles where user_id = '61000000-0000-4000-8000-000000000001'), 'History', 'History Student');
insert into public.lessons (id, workspace_id, tutor_id, student_id, title, starts_at, ends_at, timezone)
values ('64000000-0000-4000-8000-000000000001', (select workspace_id from public.tutor_profiles where user_id = '61000000-0000-4000-8000-000000000001'), '61000000-0000-4000-8000-000000000001', '63000000-0000-4000-8000-000000000001', 'Historical lesson', '2032-01-10T10:00:00Z', '2032-01-10T11:00:00Z', 'Europe/Warsaw');
insert into public.lesson_materials (workspace_id, lesson_id, material_id)
values ((select workspace_id from public.tutor_profiles where user_id = '61000000-0000-4000-8000-000000000001'), '64000000-0000-4000-8000-000000000001', '62000000-0000-4000-8000-000000000001');
update public.materials set archived_at = now() where id = '62000000-0000-4000-8000-000000000001';

select is((select count(*)::integer from public.materials where archived_at is null), 2, 'archived material is hidden from the default active query');
select is((select count(*)::integer from public.lesson_materials where material_id = '62000000-0000-4000-8000-000000000001'), 1, 'archiving preserves the historical lesson reference');

select throws_ok($$
  insert into public.materials (workspace_id, owner_user_id, title, type, external_url)
  values ((select workspace_id from public.tutor_profiles where user_id = '61000000-0000-4000-8000-000000000001'), '61000000-0000-4000-8000-000000000001', 'Unsafe link', 'link', 'javascript:alert(1)')
$$, '23514', null, 'invalid external URL is rejected');
select throws_ok($$
  insert into public.materials (workspace_id, owner_user_id, title, type, file_url, file_size_bytes)
  values ((select workspace_id from public.tutor_profiles where user_id = '61000000-0000-4000-8000-000000000001'), '61000000-0000-4000-8000-000000000001', 'Huge file', 'file', '/api/materials/huge/open', 10485761)
$$, '23514', null, 'oversized file metadata is rejected');

set local request.jwt.claims = '{"sub":"61000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is((select count(*)::integer from public.materials), 0, 'another workspace cannot read materials');
select is((select count(*)::integer from storage.objects where bucket_id = 'material-files'), 0, 'another workspace cannot list private material files');

set local role postgres;
update public.subscriptions set read_only = true where teacher_id = '61000000-0000-4000-8000-000000000001';
set local role authenticated;
set local request.jwt.claims = '{"sub":"61000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok($$
  insert into public.materials (workspace_id, owner_user_id, title, type, external_url)
  values ((select workspace_id from public.tutor_profiles where user_id = '61000000-0000-4000-8000-000000000001'), '61000000-0000-4000-8000-000000000001', 'Blocked', 'link', 'https://example.test')
$$, '42501', null, 'read-only account cannot create a material');

select * from finish();
rollback;
