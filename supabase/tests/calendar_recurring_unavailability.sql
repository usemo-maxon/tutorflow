begin;
select plan(9);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('85000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'unavailability-a@example.test', '', '{}', '{"full_name":"Tutor A"}', now(), now()),
  ('85000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'unavailability-b@example.test', '', '{}', '{"full_name":"Tutor B"}', now(), now());

set local role authenticated;
set local request.jwt.claims = '{"sub":"85000000-0000-4000-8000-000000000001","role":"authenticated"}';

insert into public.students (
  id, workspace_id, first_name, display_name, status,
  default_lesson_duration_minutes, currency, default_format, archived_at
) values (
  '86000000-0000-4000-8000-000000000001',
  (select workspace_id from public.tutor_profiles where id = '85000000-0000-4000-8000-000000000001'),
  'Zosia', 'Zosia Testowa', 'active', 60, 'PLN', 'online', null
);

insert into public.availability_rules (
  workspace_id, tutor_id, kind, label, day_of_week,
  start_time, end_time, timezone, is_available
) values (
  (select workspace_id from public.tutor_profiles where id = '85000000-0000-4000-8000-000000000001'),
  '85000000-0000-4000-8000-000000000001', 'recurring',
  'Sobota niedostępna', 6, '10:00', '20:00', 'Europe/Warsaw', false
);

select is(
  (select count(*)::integer from public.availability_rules where not is_available),
  1,
  'recurring unavailable interval is stored'
);

select throws_ok($$
  select public.create_lesson_schedule_with_color('{"targetType":"student","targetId":"86000000-0000-4000-8000-000000000001","requestId":"87000000-0000-4000-8000-000000000001","mode":"single","timezone":"Europe/Warsaw","occurrences":[{"startsAt":"2040-01-07T09:00:00Z","durationMinutes":60}],"format":"online","location":"https://meet.example.test/a","title":"Blocked","plan":[],"allowOutsideAvailability":true}'::jsonb)
$$, '23P01', null, 'explicit override cannot bypass recurring unavailability');

select throws_ok($$
  select public.create_lesson_schedule_with_color('{"targetType":"student","targetId":"86000000-0000-4000-8000-000000000001","requestId":"87000000-0000-4000-8000-000000000002","mode":"single","timezone":"Europe/Warsaw","occurrences":[{"startsAt":"2040-01-14T09:00:00Z","durationMinutes":60}],"format":"online","location":"https://meet.example.test/b","title":"Blocked next week","plan":[],"allowOutsideAvailability":true}'::jsonb)
$$, '23P01', null, 'recurring unavailability repeats the next week');

select lives_ok($$
  select public.create_lesson_schedule_with_color('{"targetType":"student","targetId":"86000000-0000-4000-8000-000000000001","requestId":"87000000-0000-4000-8000-000000000003","mode":"single","timezone":"Europe/Warsaw","occurrences":[{"startsAt":"2040-01-07T08:00:00Z","durationMinutes":60}],"format":"online","location":"https://meet.example.test/c","title":"Before","plan":[],"allowOutsideAvailability":false}'::jsonb)
$$, 'interval ending at unavailable start is valid');

select lives_ok($$
  select public.create_lesson_schedule_with_color('{"targetType":"student","targetId":"86000000-0000-4000-8000-000000000001","requestId":"87000000-0000-4000-8000-000000000004","mode":"single","timezone":"Europe/Warsaw","occurrences":[{"startsAt":"2040-01-07T19:00:00Z","durationMinutes":60}],"format":"online","location":"https://meet.example.test/d","title":"After","plan":[],"allowOutsideAvailability":false}'::jsonb)
$$, 'interval starting at unavailable end is valid');

select throws_ok($$
  select public.reschedule_lesson_relational(jsonb_build_object(
    'lessonId', (select id from public.lessons where client_request_id = '87000000-0000-4000-8000-000000000003'),
    'startsAt', '2040-01-07T10:00:00Z',
    'allowOutsideAvailability', true
  ))
$$, '23P01', null, 'drag cannot bypass recurring unavailability');

select is(
  (select starts_at::text from public.lessons where client_request_id = '87000000-0000-4000-8000-000000000003'),
  '2040-01-07 08:00:00+00',
  'failed drag rolls back the lesson time'
);

set local request.jwt.claims = '{"sub":"85000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is_empty($$
  update public.availability_rules
  set label = 'Stolen'
  where tutor_id = '85000000-0000-4000-8000-000000000001'
  returning id
$$, 'another workspace cannot mutate recurring unavailability');
select is(
  (select count(*)::integer from public.availability_rules),
  0,
  'another workspace cannot read recurring unavailability'
);

select * from finish();
rollback;
