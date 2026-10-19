begin;
select plan(11);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('10000000-0000-0000-0000-000000000071', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'profile-a@example.test', '', '{}', '{"full_name":"Profil A"}', now(), now()),
  ('10000000-0000-0000-0000-000000000072', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'profile-b@example.test', '', '{}', '{"full_name":"Profil B"}', now(), now());

select set_config('test.profile_workspace_a', (select id::text from public.workspaces where owner_user_id = '10000000-0000-0000-0000-000000000071'), true);

insert into public.tutor_public_profiles (tutor_id, workspace_id, enabled, slug, public_name)
values ('10000000-0000-0000-0000-000000000071', current_setting('test.profile_workspace_a')::uuid, false, 'profil-a', 'Profil A');

select is((select draft_slug from public.tutor_public_profiles where tutor_id = '10000000-0000-0000-0000-000000000071'), 'profil-a', 'legacy inserts receive a draft slug');
select ok((select draft_data is not null from public.tutor_public_profiles where tutor_id = '10000000-0000-0000-0000-000000000071'), 'legacy inserts receive draft data');
select is((select count(*)::integer from public.get_published_tutor_profile('profil-a')), 0, 'draft profile is not public');
select ok(not has_table_privilege('anon', 'public.tutor_public_profiles', 'select'), 'anonymous callers cannot read private profile rows');
select ok(not has_table_privilege('anon', 'public.tutor_public_profile_redirects', 'select'), 'anonymous callers cannot enumerate redirects');
select ok(has_function_privilege('authenticated', 'public.publish_own_tutor_profile(jsonb,text)', 'execute'), 'authenticated tutors can call the publish operation');
select ok(not has_function_privilege('anon', 'public.publish_own_tutor_profile(jsonb,text)', 'execute'), 'anonymous callers cannot publish');

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000071","role":"authenticated"}';
select lives_ok($$select public.publish_own_tutor_profile('{"publicName":"Profil A","headline":"Matematyka jasno","subjects":["Matematyka"],"levels":[],"lessonFormats":["online"],"contactLinks":[]}'::jsonb, 'profil-a')$$, 'owner publishes a sanitized snapshot');
reset role;

select is((select count(*)::integer from public.get_published_tutor_profile('profil-a')), 1, 'published snapshot is publicly resolvable');

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000071","role":"authenticated"}';
select lives_ok($$select public.publish_own_tutor_profile('{"publicName":"Profil A","headline":"Matematyka jasno","subjects":["Matematyka"],"levels":[],"lessonFormats":["online"],"contactLinks":[]}'::jsonb, 'profil-a-nowy')$$, 'owner can change the public slug');
reset role;

select is((select slug from public.get_published_tutor_profile('profil-a')), 'profil-a-nowy', 'old slug resolves to the canonical profile for redirect');

select * from finish();
rollback;
