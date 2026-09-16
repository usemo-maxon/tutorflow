begin;
select plan(17);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('21000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'stage1a-a@example.test', '', '{}', '{"full_name":"Tutor A"}', now(), now()),
  ('21000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'stage1a-b@example.test', '', '{}', '{"full_name":"Tutor B"}', now(), now());

set local role authenticated;
set local request.jwt.claims = '{"sub":"21000000-0000-4000-8000-000000000001","role":"authenticated"}';

insert into public.students (id, workspace_id, first_name, last_name, display_name, status, default_lesson_duration_minutes, currency, default_format)
values (
  '22000000-0000-4000-8000-000000000001',
  (select id from public.workspaces where owner_user_id = '21000000-0000-4000-8000-000000000001'),
  'Zosia', 'Testowa', 'Zosia Testowa', 'active', 60, 'PLN', 'online'
);
select is((select count(*)::integer from public.students), 1, 'member creates and reads own student');

with updated as (
  update public.students set display_name = 'Zosia Zmieniona', updated_at = now()
  where id = '22000000-0000-4000-8000-000000000001'
  returning display_name
)
select is((select display_name from updated), 'Zosia Zmieniona', 'member updates own student');

update public.students set status = 'archived', archived_at = now()
where id = '22000000-0000-4000-8000-000000000001';
select ok((select archived_at is not null from public.students where id = '22000000-0000-4000-8000-000000000001'), 'student archive records timestamp');
update public.students set status = 'active', archived_at = null
where id = '22000000-0000-4000-8000-000000000001';
select ok((select archived_at is null from public.students where id = '22000000-0000-4000-8000-000000000001'), 'student restore keeps same row');

insert into public.groups (id, workspace_id, name, status, default_duration_minutes, currency)
values (
  '23000000-0000-4000-8000-000000000001',
  (select id from public.workspaces where owner_user_id = '21000000-0000-4000-8000-000000000001'),
  'Grupa B1', 'active', 60, 'PLN'
);
select is((select count(*)::integer from public.groups), 1, 'member creates own group');
select is(public.add_group_members('23000000-0000-4000-8000-000000000001', array['22000000-0000-4000-8000-000000000001']::uuid[]), 1, 'member adds student to group');
select is(public.add_group_members('23000000-0000-4000-8000-000000000001', array['22000000-0000-4000-8000-000000000001']::uuid[]), 1, 'repeated add is idempotent');
select is((select count(*)::integer from public.group_members where status = 'active'), 1, 'duplicate active membership is not created');
update public.group_members set status = 'suspended', left_at = now()
where group_id = '23000000-0000-4000-8000-000000000001' and student_id = '22000000-0000-4000-8000-000000000001';
select is((select status::text from public.group_members where group_id = '23000000-0000-4000-8000-000000000001'), 'suspended', 'removing a member preserves the row');
select ok((select left_at is not null from public.group_members where group_id = '23000000-0000-4000-8000-000000000001'), 'removed membership records left_at');

select ok(public.create_student_contact('22000000-0000-4000-8000-000000000001', 'Anna', 'Testowa', 'shared-parent@example.test', '+48 600 222 333', 'parent', 'Mama', true, true) is not null, 'member adds a student contact');
insert into public.students (id, workspace_id, first_name, display_name, status, default_lesson_duration_minutes, currency, default_format)
values (
  '22000000-0000-4000-8000-000000000002',
  (select id from public.workspaces where owner_user_id = '21000000-0000-4000-8000-000000000001'),
  'Hania', 'Hania Testowa', 'active', 60, 'PLN', 'online'
);
select public.create_student_contact('22000000-0000-4000-8000-000000000002', 'Anna', 'Testowa', 'shared-parent@example.test', '+48 600 222 333', 'parent', 'Mama', true, false);
select is((select count(*)::integer from public.contacts where email = 'shared-parent@example.test'), 1, 'matching parent is reused in a workspace');
select is((select count(*)::integer from public.student_contacts), 2, 'one contact can link to multiple students');

set local request.jwt.claims = '{"sub":"21000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is((select count(*)::integer from public.students), 0, 'other workspace cannot read students');
insert into public.groups (id, workspace_id, name, status, default_duration_minutes, currency)
values (
  '23000000-0000-4000-8000-000000000002',
  (select id from public.workspaces where owner_user_id = '21000000-0000-4000-8000-000000000002'),
  'Grupa B2', 'active', 60, 'PLN'
);
select is_empty($$
  update public.students set display_name = 'Stolen'
  where id = '22000000-0000-4000-8000-000000000001'
  returning id
$$, 'other workspace cannot update student');
select throws_ok($$
  select public.create_student_contact('22000000-0000-4000-8000-000000000001', 'Intruz', '', '', '', 'other', '', false, false)
$$, 'P0002', null, 'cross-workspace contact link is rejected');
select throws_ok($$
  select public.add_group_members('23000000-0000-4000-8000-000000000002', array['22000000-0000-4000-8000-000000000001']::uuid[])
$$, 'P0002', null, 'cross-workspace group membership is rejected');

select * from finish();
rollback;
