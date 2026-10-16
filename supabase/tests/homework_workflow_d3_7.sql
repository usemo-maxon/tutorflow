begin;
select plan(21);

select has_table('public', 'homework_assignments', 'recipient assignments exist');
select has_table('public', 'homework_materials', 'homework material references exist');
select has_function(
  'public', 'upsert_lesson_homework',
  array['uuid','text','text','timestamp with time zone','uuid[]','uuid[]'],
  'atomic homework upsert exists'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('a3700000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'homework-a@example.test', '', '{}', '{"full_name":"Homework A"}', now(), now()),
  ('a3700000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'homework-b@example.test', '', '{}', '{"full_name":"Homework B"}', now(), now());

select set_config('test.homework_workspace_a', (select workspace_id::text from public.tutor_profiles where user_id = 'a3700000-0000-4000-8000-000000000001'), true);
select set_config('test.homework_workspace_b', (select workspace_id::text from public.tutor_profiles where user_id = 'a3700000-0000-4000-8000-000000000002'), true);

set local role authenticated;
set local request.jwt.claims = '{"sub":"a3700000-0000-4000-8000-000000000001","role":"authenticated"}';

insert into public.students (id, workspace_id, first_name, display_name, status, default_lesson_duration_minutes, currency, default_format)
values
  ('b3700000-0000-4000-8000-000000000001', current_setting('test.homework_workspace_a')::uuid, 'Anna', 'Anna', 'active', 60, 'PLN', 'online'),
  ('b3700000-0000-4000-8000-000000000002', current_setting('test.homework_workspace_a')::uuid, 'Kasia', 'Kasia', 'active', 60, 'PLN', 'online'),
  ('b3700000-0000-4000-8000-000000000003', current_setting('test.homework_workspace_a')::uuid, 'Marek', 'Marek', 'active', 60, 'PLN', 'online');
insert into public.groups (id, workspace_id, name, status, default_duration_minutes, currency)
values ('c3700000-0000-4000-8000-000000000001', current_setting('test.homework_workspace_a')::uuid, 'B1', 'active', 60, 'PLN');
insert into public.group_members (workspace_id, group_id, student_id)
values
  (current_setting('test.homework_workspace_a')::uuid, 'c3700000-0000-4000-8000-000000000001', 'b3700000-0000-4000-8000-000000000001'),
  (current_setting('test.homework_workspace_a')::uuid, 'c3700000-0000-4000-8000-000000000001', 'b3700000-0000-4000-8000-000000000002');
insert into public.lessons (
  id, workspace_id, tutor_id, group_id, title, starts_at, ends_at, timezone,
  status, format, price_grosz, currency, billing_type
)
values (
  'd3700000-0000-4000-8000-000000000001', current_setting('test.homework_workspace_a')::uuid,
  'a3700000-0000-4000-8000-000000000001', 'c3700000-0000-4000-8000-000000000001',
  'Present Perfect', now(), now() + interval '1 hour', 'Europe/Warsaw',
  'scheduled', 'online', 1000, 'PLN', 'per_student'
);
insert into public.lesson_participants (workspace_id, lesson_id, student_id)
values
  (current_setting('test.homework_workspace_a')::uuid, 'd3700000-0000-4000-8000-000000000001', 'b3700000-0000-4000-8000-000000000001'),
  (current_setting('test.homework_workspace_a')::uuid, 'd3700000-0000-4000-8000-000000000001', 'b3700000-0000-4000-8000-000000000002');
insert into public.materials (id, workspace_id, owner_user_id, title, type, external_url)
values ('f3700000-0000-4000-8000-000000000001', current_setting('test.homework_workspace_a')::uuid, 'a3700000-0000-4000-8000-000000000001', 'Workbook', 'link', 'https://example.test/workbook');

select lives_ok($$
  select public.upsert_lesson_homework(
    'd3700000-0000-4000-8000-000000000001', 'Workbook page 24', 'Exercises 1-4',
    '2026-10-20T21:59:00Z',
    array['b3700000-0000-4000-8000-000000000001'::uuid,'b3700000-0000-4000-8000-000000000002'::uuid],
    array['f3700000-0000-4000-8000-000000000001'::uuid]
  )
$$, 'group homework is created');
select is((select count(*)::integer from public.homeworks where lesson_id = 'd3700000-0000-4000-8000-000000000001'), 1, 'one canonical homework exists per lesson');
select is((select count(*)::integer from public.homework_assignments), 2, 'participants receive independent assignment rows');
select is((select count(*)::integer from public.homework_materials), 1, 'canonical material id is referenced once');
select is((select due_at::text from public.homeworks where lesson_id = 'd3700000-0000-4000-8000-000000000001'), '2026-10-20 21:59:00+00', 'deadline is stored as timestamptz');

update public.homework_assignments set status = 'reviewed', feedback = 'Dobrze opanowane podstawy.', completed_at = now(), reviewed_at = now()
where student_id = 'b3700000-0000-4000-8000-000000000001';
select is((select status::text from public.homework_assignments where student_id = 'b3700000-0000-4000-8000-000000000001'), 'reviewed', 'one participant can be marked reviewed');
select is((select status::text from public.homework_assignments where student_id = 'b3700000-0000-4000-8000-000000000002'), 'assigned', 'another participant status is unchanged');
select is((select feedback from public.homework_assignments where student_id = 'b3700000-0000-4000-8000-000000000001'), 'Dobrze opanowane podstawy.', 'feedback stays on the recipient assignment');

delete from public.group_members where student_id = 'b3700000-0000-4000-8000-000000000002';
insert into public.group_members (workspace_id, group_id, student_id)
values (current_setting('test.homework_workspace_a')::uuid, 'c3700000-0000-4000-8000-000000000001', 'b3700000-0000-4000-8000-000000000003');
select ok(exists(select 1 from public.homework_assignments where student_id = 'b3700000-0000-4000-8000-000000000002'), 'former group member retains historical homework');
select ok(not exists(select 1 from public.homework_assignments where student_id = 'b3700000-0000-4000-8000-000000000003'), 'new group member does not inherit historical homework');
select throws_ok($$
  select public.upsert_lesson_homework(
    'd3700000-0000-4000-8000-000000000001', 'Invalid recipient', '', null,
    array['b3700000-0000-4000-8000-000000000003'::uuid], array[]::uuid[]
  )
$$, '23503', null, 'recipient must belong to the lesson snapshot');

select lives_ok($$
  select public.upsert_lesson_homework(
    'd3700000-0000-4000-8000-000000000001', 'Workbook page 24 edited', 'Exercises 1-5',
    '2026-10-21T21:59:00Z',
    array['b3700000-0000-4000-8000-000000000001'::uuid,'b3700000-0000-4000-8000-000000000002'::uuid],
    array['f3700000-0000-4000-8000-000000000001'::uuid]
  )
$$, 'editing and retrying uses the same canonical assignment');
select is((select count(*)::integer from public.homeworks where lesson_id = 'd3700000-0000-4000-8000-000000000001'), 1, 'edit does not duplicate homework');
select is((select status::text from public.homework_assignments where student_id = 'b3700000-0000-4000-8000-000000000001'), 'reviewed', 'edit preserves participant review state');
select is((select count(*)::integer from public.lesson_student_outcomes where lesson_id = 'd3700000-0000-4000-8000-000000000001'), 0, 'homework does not infer learning outcomes');
select is((select count(*)::integer from public.package_usages where lesson_id = 'd3700000-0000-4000-8000-000000000001'), 0, 'homework does not mutate finance');

set local role postgres;
update public.subscriptions set read_only = true where teacher_id = 'a3700000-0000-4000-8000-000000000001';
set local role authenticated;
set local request.jwt.claims = '{"sub":"a3700000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok($$
  select public.upsert_lesson_homework(
    'd3700000-0000-4000-8000-000000000001', 'Blocked', '', null,
    array['b3700000-0000-4000-8000-000000000001'::uuid], array[]::uuid[]
  )
$$, 'P0001', null, 'read-only workspace cannot mutate homework');

set local role postgres;
insert into public.students (id, workspace_id, first_name, display_name, status, default_lesson_duration_minutes, currency, default_format)
values ('b3700000-0000-4000-8000-000000000099', current_setting('test.homework_workspace_b')::uuid, 'Foreign', 'Foreign', 'active', 60, 'PLN', 'online');
insert into public.lessons (id, workspace_id, tutor_id, student_id, title, starts_at, ends_at, timezone, status, format, price_grosz, currency, billing_type)
values ('d3700000-0000-4000-8000-000000000099', current_setting('test.homework_workspace_b')::uuid, 'a3700000-0000-4000-8000-000000000002', 'b3700000-0000-4000-8000-000000000099', 'Foreign', now(), now() + interval '1 hour', 'Europe/Warsaw', 'scheduled', 'online', 1000, 'PLN', 'per_lesson');
insert into public.lesson_participants (workspace_id, lesson_id, student_id)
values (current_setting('test.homework_workspace_b')::uuid, 'd3700000-0000-4000-8000-000000000099', 'b3700000-0000-4000-8000-000000000099');
update public.subscriptions set read_only = false where teacher_id = 'a3700000-0000-4000-8000-000000000001';
set local role authenticated;
set local request.jwt.claims = '{"sub":"a3700000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok($$
  select public.upsert_lesson_homework(
    'd3700000-0000-4000-8000-000000000099', 'Foreign', '', null,
    array['b3700000-0000-4000-8000-000000000099'::uuid], array[]::uuid[]
  )
$$, 'P0001', null, 'workspace isolation blocks foreign homework');

select * from finish();
rollback;
