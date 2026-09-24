begin;
select plan(19);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('11000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'stage0-a@example.test', '', '{}', '{"full_name":"Tutor A"}', now(), now()),
  ('11000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'stage0-b@example.test', '', '{}', '{"full_name":"Tutor B"}', now(), now());

set local role authenticated;
set local request.jwt.claims = '{"sub":"11000000-0000-4000-8000-000000000001","role":"authenticated"}';

select lives_ok($$
  insert into public.students (
    id, workspace_id, first_name, display_name, status,
    default_lesson_duration_minutes, currency, default_format
  ) values (
    '12000000-0000-4000-8000-000000000001',
    (select id from public.workspaces where owner_user_id = '11000000-0000-4000-8000-000000000001'),
    'Zosia', 'Zosia Testowa', 'active', 60, 'PLN', 'online'
  )
$$, 'workspace member can create a student');
select is((select count(*)::integer from public.students), 1, 'member sees own workspace student');

select throws_ok($$
  insert into public.lessons (
    workspace_id, tutor_id, title, starts_at, ends_at, timezone, status,
    format, currency, billing_type, creation_mode
  ) values (
    (select id from public.workspaces where owner_user_id = '11000000-0000-4000-8000-000000000001'),
    '11000000-0000-4000-8000-000000000001', 'Invalid',
    '2030-01-01T09:00:00Z', '2030-01-01T10:00:00Z', 'Europe/Warsaw',
    'scheduled', 'online', 'PLN', 'per_lesson', 'single'
  )
$$, '23514', null, 'lesson without student or group is rejected');

insert into public.groups (id, workspace_id, name, status, default_duration_minutes, currency)
values (
  '13000000-0000-4000-8000-000000000001',
  (select id from public.workspaces where owner_user_id = '11000000-0000-4000-8000-000000000001'),
  'Test group', 'active', 60, 'PLN'
);
select throws_ok($$
  insert into public.lessons (
    workspace_id, tutor_id, student_id, group_id, title, starts_at, ends_at,
    timezone, status, format, currency, billing_type, creation_mode
  ) values (
    (select id from public.workspaces where owner_user_id = '11000000-0000-4000-8000-000000000001'),
    '11000000-0000-4000-8000-000000000001',
    '12000000-0000-4000-8000-000000000001',
    '13000000-0000-4000-8000-000000000001', 'Invalid',
    '2030-01-01T09:00:00Z', '2030-01-01T10:00:00Z', 'Europe/Warsaw',
    'scheduled', 'online', 'PLN', 'per_lesson', 'single'
  )
$$, '23514', null, 'lesson with both student and group is rejected');

insert into public.students (
  id, workspace_id, first_name, display_name, status,
  default_lesson_duration_minutes, currency, default_format
) values (
  '12000000-0000-4000-8000-000000000002',
  (select id from public.workspaces where owner_user_id = '11000000-0000-4000-8000-000000000001'),
  'Hania', 'Hania Testowa', 'active', 60, 'PLN', 'online'
);
insert into public.group_members (workspace_id, group_id, student_id, status)
select (select id from public.workspaces where owner_user_id = '11000000-0000-4000-8000-000000000001'),
  '13000000-0000-4000-8000-000000000001', id, 'active'
from public.students;
select is((select count(*)::integer from public.group_members), 2, 'students can join and leave through relational group members');

insert into public.lessons (
  id, workspace_id, tutor_id, group_id, title, starts_at, ends_at, timezone,
  status, format, currency, billing_type, creation_mode
) values (
  '14000000-0000-4000-8000-000000000001',
  (select id from public.workspaces where owner_user_id = '11000000-0000-4000-8000-000000000001'),
  '11000000-0000-4000-8000-000000000001',
  '13000000-0000-4000-8000-000000000001', 'Group lesson',
  '2030-01-01T09:00:00Z', '2030-01-01T10:00:00Z', 'Europe/Warsaw',
  'scheduled', 'online', 'PLN', 'per_student', 'single'
);
insert into public.lesson_participants (workspace_id, lesson_id, student_id)
select (select id from public.workspaces where owner_user_id = '11000000-0000-4000-8000-000000000001'),
  '14000000-0000-4000-8000-000000000001', id from public.students;
insert into public.attendances (workspace_id, lesson_id, student_id, status)
select workspace_id, lesson_id, student_id,
  case when student_id = '12000000-0000-4000-8000-000000000001' then 'present'::public.attendance_status else 'absent'::public.attendance_status end
from public.lesson_participants where lesson_id = '14000000-0000-4000-8000-000000000001';
select is((select count(*)::integer from public.attendances), 2, 'group attendance is stored per student');
select is((select count(distinct status)::integer from public.attendances), 2, 'group students can have different attendance states');

insert into public.packages (id, workspace_id, student_id, name, total_lessons, price_grosz, currency, status)
values (
  '15000000-0000-4000-8000-000000000001',
  (select id from public.workspaces where owner_user_id = '11000000-0000-4000-8000-000000000001'),
  '12000000-0000-4000-8000-000000000001', 'One lesson', 1, 8000, 'PLN', 'active'
);
insert into public.lessons (
  id, workspace_id, tutor_id, student_id, title, starts_at, ends_at, timezone,
  status, format, currency, billing_type, creation_mode
) values (
  '14000000-0000-4000-8000-000000000002',
  (select id from public.workspaces where owner_user_id = '11000000-0000-4000-8000-000000000001'),
  '11000000-0000-4000-8000-000000000001',
  '12000000-0000-4000-8000-000000000001', 'Individual package lesson',
  '2030-01-02T09:00:00Z', '2030-01-02T10:00:00Z', 'Europe/Warsaw',
  'scheduled', 'online', 'PLN', 'package', 'single'
);
insert into public.lesson_participants (workspace_id, lesson_id, student_id)
values (
  (select id from public.workspaces where owner_user_id = '11000000-0000-4000-8000-000000000001'),
  '14000000-0000-4000-8000-000000000002',
  '12000000-0000-4000-8000-000000000001'
);
insert into public.payments (workspace_id, student_id, amount_grosz, currency, status, paid_at)
values (
  (select id from public.workspaces where owner_user_id = '11000000-0000-4000-8000-000000000001'),
  '12000000-0000-4000-8000-000000000001', 8000, 'PLN', 'paid', now()
);
select is((select count(*)::integer from public.payments), 1, 'member sees own workspace payment');
select is(public.complete_lesson_with_package(
  (select id from public.workspaces where owner_user_id = '11000000-0000-4000-8000-000000000001'),
  '14000000-0000-4000-8000-000000000002', '12000000-0000-4000-8000-000000000001',
  '15000000-0000-4000-8000-000000000001', 'complete-group-zosia'
), 0, 'lesson completion consumes one package unit');
select is(public.complete_lesson_with_package(
  (select id from public.workspaces where owner_user_id = '11000000-0000-4000-8000-000000000001'),
  '14000000-0000-4000-8000-000000000002', '12000000-0000-4000-8000-000000000001',
  '15000000-0000-4000-8000-000000000001', 'complete-group-retry'
), 0, 'repeated completion is idempotent');
select is((select count(*)::integer from public.package_usages where kind = 'consumption'), 1, 'retry creates no second consumption');
select is(public.reverse_lesson_package_usage(
  (select id from public.workspaces where owner_user_id = '11000000-0000-4000-8000-000000000001'),
  '14000000-0000-4000-8000-000000000002',
  '15000000-0000-4000-8000-000000000001', 'reverse-group-zosia'
), 1, 'undoing completion restores the package unit');
select is((select remaining_lessons from public.package_balances where package_id = '15000000-0000-4000-8000-000000000001'), 1, 'balance view derives remaining lessons from ledger');

set local request.jwt.claims = '{"sub":"11000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is((select count(*)::integer from public.students), 0, 'other workspace cannot read students');
select is((select count(*)::integer from public.lessons), 0, 'other workspace cannot read lessons');
select is((select count(*)::integer from public.packages), 0, 'other workspace cannot read dashboard package warnings');
select is((select count(*)::integer from public.package_balances), 0, 'other workspace cannot read dashboard package balances');
select is((select count(*)::integer from public.payments), 0, 'other workspace cannot read payment information');
select is_empty($$
  update public.students set display_name = 'Stolen'
  where id = '12000000-0000-4000-8000-000000000001'
  returning id
$$, 'cross-workspace mutation changes no row');

select * from finish();
rollback;
