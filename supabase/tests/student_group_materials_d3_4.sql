begin;
select plan(31);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('91000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'd34-a@example.test', '', '{}', '{"full_name":"D3.4 A"}', now(), now()),
  ('91000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'd34-b@example.test', '', '{}', '{"full_name":"D3.4 B"}', now(), now());

set local role authenticated;
set local request.jwt.claims = '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}';

insert into public.students (id, workspace_id, first_name, display_name)
values ('92000000-0000-4000-8000-000000000001', (select workspace_id from public.tutor_profiles where user_id = '91000000-0000-4000-8000-000000000001'), 'Ada', 'Ada');
insert into public.groups (id, workspace_id, name)
values ('93000000-0000-4000-8000-000000000001', (select workspace_id from public.tutor_profiles where user_id = '91000000-0000-4000-8000-000000000001'), 'Group B1');
insert into public.materials (id, workspace_id, owner_user_id, title, type, external_url)
values ('94000000-0000-4000-8000-000000000001', (select workspace_id from public.tutor_profiles where user_id = '91000000-0000-4000-8000-000000000001'), '91000000-0000-4000-8000-000000000001', 'Canonical workbook', 'link', 'https://example.test/workbook');

select lives_ok($$
  insert into public.student_material_assignments (workspace_id, student_id, material_id, assigned_by)
  values ((select workspace_id from public.tutor_profiles where user_id = '91000000-0000-4000-8000-000000000001'), '92000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001')
$$, 'material can be assigned to a Student');
select is((select count(*)::integer from public.student_material_assignments), 1, 'Student assignment is stored once');
select throws_ok($$
  insert into public.student_material_assignments (workspace_id, student_id, material_id, assigned_by)
  values ((select workspace_id from public.tutor_profiles where user_id = '91000000-0000-4000-8000-000000000001'), '92000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001')
$$, '23505', null, 'duplicate Student assignment is prevented');

select lives_ok($$
  insert into public.group_material_assignments (workspace_id, group_id, material_id, assigned_by)
  values ((select workspace_id from public.tutor_profiles where user_id = '91000000-0000-4000-8000-000000000001'), '93000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001')
$$, 'material can be assigned to a Group');
select is((select count(*)::integer from public.group_material_assignments), 1, 'Group assignment is stored once');
select is((select count(*)::integer from public.student_material_assignments), 1, 'Student and Group relationships stay distinct');

select lives_ok($$
  insert into public.group_members (workspace_id, group_id, student_id, status)
  values ((select workspace_id from public.tutor_profiles where user_id = '91000000-0000-4000-8000-000000000001'), '93000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001', 'active')
$$, 'Student can join a Group with materials');
select is((select count(*)::integer from public.student_material_assignments), 1, 'joining a Group does not create a personal assignment');

select lives_ok($$update public.materials set archived_at = now() where id = '94000000-0000-4000-8000-000000000001'$$, 'canonical material can be archived');
select is((select count(*)::integer from public.student_material_assignments), 1, 'archived material keeps its Student assignment');
select is((select count(*)::integer from public.group_material_assignments), 1, 'archived material keeps its Group assignment');
set local role postgres;
select throws_ok($$delete from public.materials where id = '94000000-0000-4000-8000-000000000001'$$, '23503', null, 'assigned canonical Material cannot be deleted underneath assignments');
set local role authenticated;
set local request.jwt.claims = '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select count(*)::integer from public.materials where id = '94000000-0000-4000-8000-000000000001'), 1, 'underlying Material remains');

select lives_ok($$delete from public.student_material_assignments where student_id = '92000000-0000-4000-8000-000000000001' and material_id = '94000000-0000-4000-8000-000000000001'$$, 'Student assignment can be removed');
select is((select count(*)::integer from public.student_material_assignments), 0, 'Student assignment was removed');
select is((select count(*)::integer from public.materials where id = '94000000-0000-4000-8000-000000000001'), 1, 'removing Student assignment does not delete Material');
select is((select count(*)::integer from public.group_material_assignments), 1, 'removing Student assignment does not affect Group assignment');

insert into public.lessons (id, workspace_id, tutor_id, student_id, title, starts_at, ends_at, timezone)
values ('95000000-0000-4000-8000-000000000001', (select workspace_id from public.tutor_profiles where user_id = '91000000-0000-4000-8000-000000000001'), '91000000-0000-4000-8000-000000000001', '92000000-0000-4000-8000-000000000001', 'Old lesson', '2032-01-10T10:00:00Z', '2032-01-10T11:00:00Z', 'Europe/Warsaw');
select lives_ok($$
  insert into public.lesson_materials (workspace_id, lesson_id, material_id)
  values ((select workspace_id from public.tutor_profiles where user_id = '91000000-0000-4000-8000-000000000001'), '95000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000001')
$$, 'existing Lesson Material relationship still works');
insert into public.lesson_templates (id, workspace_id, owner_user_id, title)
values ('96000000-0000-4000-8000-000000000001', (select workspace_id from public.tutor_profiles where user_id = '91000000-0000-4000-8000-000000000001'), '91000000-0000-4000-8000-000000000001', 'Old template');
select lives_ok($$
  insert into public.lesson_template_materials (workspace_id, template_id, material_id)
  values ((select workspace_id from public.tutor_profiles where user_id = '91000000-0000-4000-8000-000000000001'), '96000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000001')
$$, 'existing Template Material relationship still works');

update public.group_members set status = 'suspended', left_at = now() where group_id = '93000000-0000-4000-8000-000000000001' and student_id = '92000000-0000-4000-8000-000000000001';
select is((select count(*)::integer from public.group_members where student_id = '92000000-0000-4000-8000-000000000001' and status = 'active' and left_at is null), 0, 'former membership no longer grants current Group context');
select is((select count(*)::integer from public.student_material_assignments), 0, 'leaving a Group does not create a personal assignment');
select is((select count(*)::integer from public.group_material_assignments), 1, 'Group material remains owned by the Group after a member leaves');

select lives_ok($$delete from public.group_material_assignments where group_id = '93000000-0000-4000-8000-000000000001' and material_id = '94000000-0000-4000-8000-000000000001'$$, 'Group assignment can be removed');
select is((select count(*)::integer from public.group_material_assignments), 0, 'Group assignment was removed');
select is((select count(*)::integer from public.materials where id = '94000000-0000-4000-8000-000000000001'), 1, 'removing Group assignment does not delete Material');

set local role postgres;
insert into public.materials (id, workspace_id, owner_user_id, title, type, external_url)
values ('94000000-0000-4000-8000-000000000002', (select workspace_id from public.tutor_profiles where user_id = '91000000-0000-4000-8000-000000000002'), '91000000-0000-4000-8000-000000000002', 'Other workspace', 'link', 'https://example.test/other');
set local role authenticated;
set local request.jwt.claims = '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok($$
  insert into public.student_material_assignments (workspace_id, student_id, material_id, assigned_by)
  values ((select workspace_id from public.tutor_profiles where user_id = '91000000-0000-4000-8000-000000000001'), '92000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000002', '91000000-0000-4000-8000-000000000001')
$$, '23503', null, 'cross-workspace Student assignment is blocked');

insert into public.student_material_assignments (workspace_id, student_id, material_id, assigned_by)
values ((select workspace_id from public.tutor_profiles where user_id = '91000000-0000-4000-8000-000000000001'), '92000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001');
set local request.jwt.claims = '{"sub":"91000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is((select count(*)::integer from public.student_material_assignments), 0, 'another workspace cannot read Student assignments');
select is((select count(*)::integer from public.group_material_assignments), 0, 'another workspace cannot read Group assignments');

set local role postgres;
update public.subscriptions set read_only = true where teacher_id = '91000000-0000-4000-8000-000000000001';
set local role authenticated;
set local request.jwt.claims = '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is((select count(*)::integer from public.student_material_assignments), 1, 'read-only user can view assignments');
select throws_ok($$
  insert into public.group_material_assignments (workspace_id, group_id, material_id, assigned_by)
  values ((select workspace_id from public.tutor_profiles where user_id = '91000000-0000-4000-8000-000000000001'), '93000000-0000-4000-8000-000000000001', '94000000-0000-4000-8000-000000000001', '91000000-0000-4000-8000-000000000001')
$$, '42501', null, 'read-only user cannot assign');
delete from public.student_material_assignments where student_id = '92000000-0000-4000-8000-000000000001';
select is((select count(*)::integer from public.student_material_assignments), 1, 'read-only user cannot remove an assignment');

select * from finish();
rollback;
