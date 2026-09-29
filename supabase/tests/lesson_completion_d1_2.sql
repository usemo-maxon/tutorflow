begin;
select plan(23);

select has_function(
  'public',
  'complete_lesson_workspace_v2',
  array['uuid', 'uuid', 'text', 'timestamp with time zone', 'jsonb'],
  'versioned completion RPC exists'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('61000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'completion-a@example.test', '', '{}', '{"full_name":"Completion A"}', now(), now()),
  ('61000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'completion-b@example.test', '', '{}', '{"full_name":"Completion B"}', now(), now());

select set_config('test.completion_workspace', (select workspace_id::text from public.tutor_profiles where id = '61000000-0000-4000-8000-000000000001'), true);

set local role authenticated;
set local request.jwt.claims = '{"sub":"61000000-0000-4000-8000-000000000001","role":"authenticated"}';

insert into public.students (
  id, workspace_id, first_name, display_name, status,
  default_lesson_duration_minutes, currency, default_format
)
values
  ('62000000-0000-4000-8000-000000000001', current_setting('test.completion_workspace')::uuid, 'Anna', 'Anna', 'active', 60, 'PLN', 'online'),
  ('62000000-0000-4000-8000-000000000002', current_setting('test.completion_workspace')::uuid, 'Zosia', 'Zosia', 'active', 60, 'PLN', 'online'),
  ('62000000-0000-4000-8000-000000000003', current_setting('test.completion_workspace')::uuid, 'Kuba', 'Kuba', 'active', 60, 'PLN', 'online'),
  ('62000000-0000-4000-8000-000000000004', current_setting('test.completion_workspace')::uuid, 'Ola', 'Ola', 'active', 60, 'PLN', 'online');

insert into public.groups (id, workspace_id, name, status, default_duration_minutes, currency)
values ('63000000-0000-4000-8000-000000000001', current_setting('test.completion_workspace')::uuid, 'Group B1', 'active', 60, 'PLN');

insert into public.lessons (
  id, workspace_id, tutor_id, student_id, group_id, title, starts_at, ends_at,
  timezone, status, format, price_grosz, currency, billing_type
)
values
  ('64000000-0000-4000-8000-000000000001', current_setting('test.completion_workspace')::uuid, '61000000-0000-4000-8000-000000000001', null, '63000000-0000-4000-8000-000000000001', 'Group success', now() - interval '5 hours', now() - interval '4 hours', 'Europe/Warsaw', 'scheduled', 'online', 1000, 'PLN', 'per_student'),
  ('64000000-0000-4000-8000-000000000002', current_setting('test.completion_workspace')::uuid, '61000000-0000-4000-8000-000000000001', null, '63000000-0000-4000-8000-000000000001', 'Attendance failure', now() - interval '4 hours', now() - interval '3 hours', 'Europe/Warsaw', 'scheduled', 'online', 1000, 'PLN', 'per_student'),
  ('64000000-0000-4000-8000-000000000003', current_setting('test.completion_workspace')::uuid, '61000000-0000-4000-8000-000000000001', '62000000-0000-4000-8000-000000000001', null, 'Invalid participant', now() - interval '3 hours', now() - interval '2 hours', 'Europe/Warsaw', 'scheduled', 'online', 1000, 'PLN', 'per_lesson'),
  ('64000000-0000-4000-8000-000000000004', current_setting('test.completion_workspace')::uuid, '61000000-0000-4000-8000-000000000001', '62000000-0000-4000-8000-000000000001', null, 'Duplicate participant', now() - interval '2 hours', now() - interval '1 hour', 'Europe/Warsaw', 'scheduled', 'online', 1000, 'PLN', 'per_lesson'),
  ('64000000-0000-4000-8000-000000000005', current_setting('test.completion_workspace')::uuid, '61000000-0000-4000-8000-000000000001', '62000000-0000-4000-8000-000000000004', null, 'Package failure', now() - interval '2 hours', now() - interval '1 hour', 'Europe/Warsaw', 'scheduled', 'online', 0, 'PLN', 'package');

insert into public.lesson_participants (workspace_id, lesson_id, student_id)
select current_setting('test.completion_workspace')::uuid, lesson_id, student_id
from (values
  ('64000000-0000-4000-8000-000000000001'::uuid, '62000000-0000-4000-8000-000000000001'::uuid),
  ('64000000-0000-4000-8000-000000000001'::uuid, '62000000-0000-4000-8000-000000000002'::uuid),
  ('64000000-0000-4000-8000-000000000001'::uuid, '62000000-0000-4000-8000-000000000003'::uuid),
  ('64000000-0000-4000-8000-000000000002'::uuid, '62000000-0000-4000-8000-000000000001'::uuid),
  ('64000000-0000-4000-8000-000000000002'::uuid, '62000000-0000-4000-8000-000000000002'::uuid),
  ('64000000-0000-4000-8000-000000000003'::uuid, '62000000-0000-4000-8000-000000000001'::uuid),
  ('64000000-0000-4000-8000-000000000004'::uuid, '62000000-0000-4000-8000-000000000001'::uuid),
  ('64000000-0000-4000-8000-000000000005'::uuid, '62000000-0000-4000-8000-000000000004'::uuid)
) fixture(lesson_id, student_id);

insert into public.attendances (workspace_id, lesson_id, student_id, status, marked_at)
select workspace_id, lesson_id, student_id, 'present'::public.attendance_status, now()
from public.lesson_participants
where lesson_id <> '64000000-0000-4000-8000-000000000002'
   or student_id = '62000000-0000-4000-8000-000000000001';
insert into public.attendances (workspace_id, lesson_id, student_id, status)
values (current_setting('test.completion_workspace')::uuid, '64000000-0000-4000-8000-000000000002', '62000000-0000-4000-8000-000000000002', 'unknown');

select lives_ok($$
  select public.complete_lesson_workspace_v2(
    current_setting('test.completion_workspace')::uuid,
    '64000000-0000-4000-8000-000000000001',
    'd1.2:group:complete',
    (select updated_at from public.lessons where id = '64000000-0000-4000-8000-000000000001'),
    '[{"studentId":"62000000-0000-4000-8000-000000000001","progressSummary":"Anna progress","difficultyLevel":"easy"},{"studentId":"62000000-0000-4000-8000-000000000002","difficultyNote":"Needs did","difficultyLevel":"hard"},{"studentId":"62000000-0000-4000-8000-000000000003","nextStep":"Dialogi","difficultyLevel":"mixed"}]'::jsonb
  )
$$, 'group completion with three outcomes succeeds');
select is((select status::text from public.lessons where id = '64000000-0000-4000-8000-000000000001'), 'completed', 'group lesson is completed');
select is((select count(*)::integer from public.lesson_student_outcomes where lesson_id = '64000000-0000-4000-8000-000000000001'), 3, 'group stores three independent outcome rows');
select is((select count(distinct coalesce(progress_summary, difficulty_note, next_step))::integer from public.lesson_student_outcomes where lesson_id = '64000000-0000-4000-8000-000000000001'), 3, 'group outcome content is not copied across students');
select is((select count(*)::integer from public.charges where lesson_id = '64000000-0000-4000-8000-000000000001'), 3, 'group finance creates one charge per participant');

select lives_ok($$
  select public.complete_lesson_workspace_v2(
    current_setting('test.completion_workspace')::uuid,
    '64000000-0000-4000-8000-000000000001', 'd1.2:group:complete', now(),
    '[{"studentId":"62000000-0000-4000-8000-000000000001","progressSummary":"Anna progress"}]'::jsonb
  )
$$, 'completion retry returns safely');
select is((select count(*)::integer from public.lesson_student_outcomes where lesson_id = '64000000-0000-4000-8000-000000000001'), 3, 'retry does not duplicate outcomes');
select is((select count(*)::integer from public.charges where lesson_id = '64000000-0000-4000-8000-000000000001'), 3, 'retry does not duplicate finance');

select throws_ok($$
  select public.complete_lesson_workspace_v2(
    current_setting('test.completion_workspace')::uuid,
    '64000000-0000-4000-8000-000000000002', 'd1.2:attendance',
    (select updated_at from public.lessons where id = '64000000-0000-4000-8000-000000000002'),
    '[{"studentId":"62000000-0000-4000-8000-000000000001","nextStep":"Repeat"}]'::jsonb
  )
$$, '23514', null, 'unresolved attendance rejects completion');
select is((select status::text from public.lessons where id = '64000000-0000-4000-8000-000000000002'), 'scheduled', 'attendance failure leaves lesson unchanged');
select is((select count(*)::integer from public.lesson_student_outcomes where lesson_id = '64000000-0000-4000-8000-000000000002'), 0, 'attendance failure commits no outcomes');
select is((select count(*)::integer from public.charges where lesson_id = '64000000-0000-4000-8000-000000000002'), 0, 'attendance failure commits no finance');

select throws_ok($$
  select public.complete_lesson_workspace_v2(
    current_setting('test.completion_workspace')::uuid,
    '64000000-0000-4000-8000-000000000003', 'd1.2:invalid',
    (select updated_at from public.lessons where id = '64000000-0000-4000-8000-000000000003'),
    '[{"studentId":"62000000-0000-4000-8000-000000000004","nextStep":"Invalid"}]'::jsonb
  )
$$, '23503', null, 'non-participant outcome is rejected');
select is((select count(*)::integer from public.lesson_student_outcomes where lesson_id = '64000000-0000-4000-8000-000000000003'), 0, 'invalid participant commits no outcome');
select is((select status::text from public.lessons where id = '64000000-0000-4000-8000-000000000003'), 'scheduled', 'invalid participant leaves lesson incomplete');

select throws_ok($$
  select public.complete_lesson_workspace_v2(
    current_setting('test.completion_workspace')::uuid,
    '64000000-0000-4000-8000-000000000004', 'd1.2:duplicate',
    (select updated_at from public.lessons where id = '64000000-0000-4000-8000-000000000004'),
    '[{"studentId":"62000000-0000-4000-8000-000000000001","nextStep":"A"},{"studentId":"62000000-0000-4000-8000-000000000001","nextStep":"B"}]'::jsonb
  )
$$, '22023', null, 'duplicate participant payload is rejected');
select is((select count(*)::integer from public.lesson_student_outcomes where lesson_id = '64000000-0000-4000-8000-000000000004'), 0, 'duplicate payload commits no outcome');

select throws_ok($$
  select public.complete_lesson_workspace_v2(
    current_setting('test.completion_workspace')::uuid,
    '64000000-0000-4000-8000-000000000005', 'd1.2:package',
    (select updated_at from public.lessons where id = '64000000-0000-4000-8000-000000000005'),
    '[{"studentId":"62000000-0000-4000-8000-000000000004","nextStep":"After package"}]'::jsonb
  )
$$, '23514', null, 'package exhaustion rejects the transaction');
select is((select count(*)::integer from public.lesson_student_outcomes where lesson_id = '64000000-0000-4000-8000-000000000005'), 0, 'package failure rolls outcomes back');
select is((select status::text from public.lessons where id = '64000000-0000-4000-8000-000000000005'), 'scheduled', 'package failure leaves lesson incomplete');
select is((select count(*)::integer from public.package_usages where lesson_id = '64000000-0000-4000-8000-000000000005'), 0, 'package failure creates no usage');

set local request.jwt.claims = '{"sub":"61000000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok($$
  select public.complete_lesson_workspace_v2(
    current_setting('test.completion_workspace')::uuid,
    '64000000-0000-4000-8000-000000000003', 'd1.2:cross-workspace', now(), '[]'::jsonb
  )
$$, '42501', null, 'another workspace cannot invoke completion');

select * from finish();
rollback;
