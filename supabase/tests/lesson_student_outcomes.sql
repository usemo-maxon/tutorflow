begin;
select plan(24);

select has_table(
  'public',
  'lesson_student_outcomes',
  'lesson student outcomes table exists'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('51000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'outcomes-a@example.test', '', '{}', '{"full_name":"Outcomes A"}', now(), now()),
  ('51000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'outcomes-b@example.test', '', '{}', '{"full_name":"Outcomes B"}', now(), now());

select set_config(
  'test.outcomes_workspace_a',
  (select workspace_id::text from public.tutor_profiles where id = '51000000-0000-4000-8000-000000000001'),
  true
);
select set_config(
  'test.outcomes_workspace_b',
  (select workspace_id::text from public.tutor_profiles where id = '51000000-0000-4000-8000-000000000002'),
  true
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"51000000-0000-4000-8000-000000000002","role":"authenticated"}';

insert into public.students (
  id, workspace_id, first_name, display_name, status,
  default_lesson_duration_minutes, currency, default_format
)
values (
  '52000000-0000-4000-8000-000000000010',
  current_setting('test.outcomes_workspace_b')::uuid,
  'Beata', 'Beata B', 'active', 60, 'PLN', 'online'
);
insert into public.lessons (
  id, workspace_id, tutor_id, student_id, title, starts_at, ends_at,
  timezone, status, format, currency, billing_type
)
values (
  '54000000-0000-4000-8000-000000000010',
  current_setting('test.outcomes_workspace_b')::uuid,
  '51000000-0000-4000-8000-000000000002',
  '52000000-0000-4000-8000-000000000010',
  'Other workspace lesson', '2040-03-12T16:00:00Z', '2040-03-12T17:00:00Z',
  'Europe/Warsaw', 'scheduled', 'online', 'PLN', 'per_lesson'
);
insert into public.lesson_participants (workspace_id, lesson_id, student_id)
values (
  current_setting('test.outcomes_workspace_b')::uuid,
  '54000000-0000-4000-8000-000000000010',
  '52000000-0000-4000-8000-000000000010'
);

set local request.jwt.claims = '{"sub":"51000000-0000-4000-8000-000000000001","role":"authenticated"}';

insert into public.students (
  id, workspace_id, first_name, display_name, status,
  default_lesson_duration_minutes, currency, default_format
)
values
  ('52000000-0000-4000-8000-000000000001', current_setting('test.outcomes_workspace_a')::uuid, 'Anna', 'Anna A', 'active', 60, 'PLN', 'online'),
  ('52000000-0000-4000-8000-000000000002', current_setting('test.outcomes_workspace_a')::uuid, 'Zosia', 'Zosia A', 'active', 60, 'PLN', 'online'),
  ('52000000-0000-4000-8000-000000000003', current_setting('test.outcomes_workspace_a')::uuid, 'Kuba', 'Kuba A', 'active', 60, 'PLN', 'online'),
  ('52000000-0000-4000-8000-000000000004', current_setting('test.outcomes_workspace_a')::uuid, 'Ola', 'Ola A', 'active', 60, 'PLN', 'online');

insert into public.groups (
  id, workspace_id, name, status, default_duration_minutes, currency
)
values (
  '53000000-0000-4000-8000-000000000001',
  current_setting('test.outcomes_workspace_a')::uuid,
  'Group B1', 'active', 60, 'PLN'
);

insert into public.lessons (
  id, workspace_id, tutor_id, student_id, group_id, title, starts_at, ends_at,
  timezone, status, format, currency, billing_type
)
values
  ('54000000-0000-4000-8000-000000000001', current_setting('test.outcomes_workspace_a')::uuid, '51000000-0000-4000-8000-000000000001', null, '53000000-0000-4000-8000-000000000001', 'Group lesson', '2040-03-10T16:00:00Z', '2040-03-10T17:00:00Z', 'Europe/Warsaw', 'scheduled', 'online', 'PLN', 'per_student'),
  ('54000000-0000-4000-8000-000000000002', current_setting('test.outcomes_workspace_a')::uuid, '51000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000004', null, 'Legacy lesson', '2040-03-11T16:00:00Z', '2040-03-11T17:00:00Z', 'Europe/Warsaw', 'scheduled', 'online', 'PLN', 'per_lesson');

insert into public.lesson_participants (workspace_id, lesson_id, student_id)
values
  (current_setting('test.outcomes_workspace_a')::uuid, '54000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000001'),
  (current_setting('test.outcomes_workspace_a')::uuid, '54000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000002'),
  (current_setting('test.outcomes_workspace_a')::uuid, '54000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000003'),
  (current_setting('test.outcomes_workspace_a')::uuid, '54000000-0000-4000-8000-000000000002', '52000000-0000-4000-8000-000000000004');

select lives_ok($$
  insert into public.lesson_student_outcomes (
    workspace_id, lesson_id, student_id, progress_summary,
    difficulty_level, difficulty_note, next_step
  ) values
    (current_setting('test.outcomes_workspace_a')::uuid, '54000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000001', 'Anna progress', 'easy', null, 'Anna next'),
    (current_setting('test.outcomes_workspace_a')::uuid, '54000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000002', 'Zosia progress', 'hard', 'Needs did', 'Zosia next'),
    (current_setting('test.outcomes_workspace_a')::uuid, '54000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000003', 'Kuba progress', 'mixed', null, 'Kuba next')
$$, 'workspace member can create participant outcomes');

select is(
  (select count(*)::integer from public.lesson_student_outcomes where lesson_id = '54000000-0000-4000-8000-000000000001'),
  3,
  'one group lesson stores three outcomes'
);
select is(
  (select count(distinct progress_summary)::integer from public.lesson_student_outcomes where lesson_id = '54000000-0000-4000-8000-000000000001'),
  3,
  'group participant outcomes remain independent'
);

select throws_ok($$
  insert into public.lesson_student_outcomes (workspace_id, lesson_id, student_id, next_step)
  values (current_setting('test.outcomes_workspace_a')::uuid, '54000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000001', 'Duplicate')
$$, '23505', null, 'duplicate lesson/student outcome is rejected');

select throws_ok($$
  insert into public.lesson_student_outcomes (workspace_id, lesson_id, student_id, difficulty_level)
  values (current_setting('test.outcomes_workspace_a')::uuid, '54000000-0000-4000-8000-000000000002', '52000000-0000-4000-8000-000000000004', 'medium')
$$, '23514', null, 'invalid difficulty is rejected');

select throws_ok($$
  insert into public.lesson_student_outcomes (workspace_id, lesson_id, student_id, progress_summary)
  values (current_setting('test.outcomes_workspace_a')::uuid, '54000000-0000-4000-8000-000000000002', '52000000-0000-4000-8000-000000000004', repeat('x', 2001))
$$, '23514', null, 'overlong outcome text is rejected');

select throws_ok($$
  insert into public.lesson_student_outcomes (workspace_id, lesson_id, student_id, next_step)
  values (current_setting('test.outcomes_workspace_a')::uuid, '54999999-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000001', 'Unknown lesson')
$$, '23503', null, 'unknown lesson is rejected');

select throws_ok($$
  insert into public.lesson_student_outcomes (workspace_id, lesson_id, student_id, next_step)
  values (current_setting('test.outcomes_workspace_a')::uuid, '54000000-0000-4000-8000-000000000001', '52999999-0000-4000-8000-000000000001', 'Unknown student')
$$, '23503', null, 'unknown student is rejected');

select throws_ok($$
  insert into public.lesson_student_outcomes (workspace_id, lesson_id, student_id, next_step)
  values (current_setting('test.outcomes_workspace_a')::uuid, '54000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000004', 'Not a participant')
$$, '23503', null, 'same-workspace non-participant is rejected');

select throws_ok($$
  insert into public.lesson_student_outcomes (workspace_id, lesson_id, student_id, next_step)
  values (current_setting('test.outcomes_workspace_a')::uuid, '54000000-0000-4000-8000-000000000010', '52000000-0000-4000-8000-000000000010', 'Cross workspace')
$$, '23503', null, 'cross-workspace lesson and student are rejected');

select set_config(
  'test.outcomes_created_at',
  (select created_at::text from public.lesson_student_outcomes where student_id = '52000000-0000-4000-8000-000000000001'),
  true
);
select set_config(
  'test.outcomes_updated_at',
  (select updated_at::text from public.lesson_student_outcomes where student_id = '52000000-0000-4000-8000-000000000001'),
  true
);
select pg_sleep(0.01);
select lives_ok($$
  update public.lesson_student_outcomes
  set progress_summary = 'Anna updated', difficulty_level = 'mixed'
  where student_id = '52000000-0000-4000-8000-000000000001'
$$, 'an existing outcome can be updated');
select is(
  (select count(*)::integer from public.lesson_student_outcomes where student_id in ('52000000-0000-4000-8000-000000000002','52000000-0000-4000-8000-000000000003') and progress_summary in ('Zosia progress','Kuba progress')),
  2,
  'updating student A does not change students B or C'
);
select is(
  (select created_at::text from public.lesson_student_outcomes where student_id = '52000000-0000-4000-8000-000000000001'),
  current_setting('test.outcomes_created_at'),
  'created_at is preserved on update'
);
select isnt(
  (select updated_at::text from public.lesson_student_outcomes where student_id = '52000000-0000-4000-8000-000000000001'),
  current_setting('test.outcomes_updated_at'),
  'updated_at changes on update'
);

update public.students
set status = 'archived', archived_at = clock_timestamp()
where id = '52000000-0000-4000-8000-000000000001';
select is(
  (select count(*)::integer from public.lesson_student_outcomes where student_id = '52000000-0000-4000-8000-000000000001'),
  1,
  'archiving a student retains outcome history'
);
select is(
  (select count(*)::integer from public.lesson_student_outcomes where lesson_id = '54000000-0000-4000-8000-000000000002'),
  0,
  'legacy lesson without an outcome remains represented by absence'
);

set local request.jwt.claims = '{"sub":"51000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is(
  (select count(*)::integer from public.lesson_student_outcomes),
  0,
  'other workspace cannot read outcomes'
);
select throws_ok($$
  insert into public.lesson_student_outcomes (workspace_id, lesson_id, student_id, next_step)
  values (current_setting('test.outcomes_workspace_a')::uuid, '54000000-0000-4000-8000-000000000001', '52000000-0000-4000-8000-000000000001', 'Forbidden insert')
$$, '42501', null, 'other workspace cannot insert outcomes');
select lives_ok($$
  update public.lesson_student_outcomes
  set progress_summary = 'Forbidden update'
  where lesson_id = '54000000-0000-4000-8000-000000000001'
$$, 'other workspace update is safely filtered');
select ok(
  not has_table_privilege('authenticated', 'public.lesson_student_outcomes', 'delete'),
  'authenticated role has no outcome delete grant'
);
select throws_ok($$
  delete from public.lesson_student_outcomes where lesson_id = '54000000-0000-4000-8000-000000000001'
$$, '42501', null, 'ordinary authenticated role cannot delete outcomes');
select ok(
  not has_table_privilege('anon', 'public.lesson_student_outcomes', 'select,insert,update,delete'),
  'anonymous role has no outcome privileges'
);

set local request.jwt.claims = '{"sub":"51000000-0000-4000-8000-000000000001","role":"authenticated"}';
select is(
  (select progress_summary from public.lesson_student_outcomes where student_id = '52000000-0000-4000-8000-000000000001'),
  'Anna updated',
  'cross-workspace update left the outcome unchanged'
);

select * from finish();
rollback;
