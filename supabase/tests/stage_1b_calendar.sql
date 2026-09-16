begin;
select plan(25);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('31000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'stage1b-a@example.test', '', '{}', '{"full_name":"Tutor A"}', now(), now()),
  ('31000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'stage1b-b@example.test', '', '{}', '{"full_name":"Tutor B"}', now(), now());

set local role authenticated;
set local request.jwt.claims = '{"sub":"31000000-0000-4000-8000-000000000001","role":"authenticated"}';

insert into public.students (id, workspace_id, first_name, display_name, status, default_lesson_duration_minutes, currency, default_format, archived_at)
values
  ('32000000-0000-4000-8000-000000000001', (select workspace_id from public.tutor_profiles where id = '31000000-0000-4000-8000-000000000001'), 'Zosia', 'Zosia Testowa', 'active', 60, 'PLN', 'online', null),
  ('32000000-0000-4000-8000-000000000002', (select workspace_id from public.tutor_profiles where id = '31000000-0000-4000-8000-000000000001'), 'Hania', 'Hania Testowa', 'active', 60, 'PLN', 'online', null),
  ('32000000-0000-4000-8000-000000000003', (select workspace_id from public.tutor_profiles where id = '31000000-0000-4000-8000-000000000001'), 'Ola', 'Ola Archiwalna', 'archived', 60, 'PLN', 'online', now());

insert into public.groups (id, workspace_id, name, status, default_duration_minutes, currency)
values ('33000000-0000-4000-8000-000000000001', (select workspace_id from public.tutor_profiles where id = '31000000-0000-4000-8000-000000000001'), 'English B1 Group', 'active', 60, 'PLN');
select public.add_group_members('33000000-0000-4000-8000-000000000001', array['32000000-0000-4000-8000-000000000001','32000000-0000-4000-8000-000000000002']::uuid[]);

select lives_ok($$
  select public.create_lesson_schedule('{"targetType":"student","targetId":"32000000-0000-4000-8000-000000000001","requestId":"34000000-0000-4000-8000-000000000001","mode":"single","timezone":"Europe/Warsaw","occurrences":[{"startsAt":"2030-01-08T16:00:00Z","durationMinutes":60}],"format":"online","location":"https://meet.example.test/a","priceGrosz":8000,"title":"Lesson","subject":"English","plan":[],"allowOutsideAvailability":false}'::jsonb)
$$, 'creates an individual lesson through the relational command');
select is((select count(*)::integer from public.lesson_participants lp join public.lessons l on l.id = lp.lesson_id where l.client_request_id = '34000000-0000-4000-8000-000000000001'), 1, 'individual lesson snapshots its participant');

select lives_ok($$
  select public.create_lesson_schedule('{"targetType":"student","targetId":"32000000-0000-4000-8000-000000000002","requestId":"34000000-0000-4000-8000-000000000002","mode":"single","timezone":"Europe/Warsaw","occurrences":[{"startsAt":"2030-01-08T17:00:00Z","durationMinutes":60}],"format":"online","location":"https://meet.example.test/b","priceGrosz":7500,"title":"Adjacent","plan":[],"allowOutsideAvailability":false}'::jsonb)
$$, 'adjacent half-open lesson interval is accepted');
select is((select count(*)::integer from public.lessons where client_request_id in ('34000000-0000-4000-8000-000000000001','34000000-0000-4000-8000-000000000002')), 2, 'both adjacent lessons exist');
select throws_ok($$
  select public.create_lesson_schedule('{"targetType":"student","targetId":"32000000-0000-4000-8000-000000000002","requestId":"34000000-0000-4000-8000-000000000003","mode":"single","timezone":"Europe/Warsaw","occurrences":[{"startsAt":"2030-01-08T16:30:00Z","durationMinutes":60}],"format":"online","location":"https://meet.example.test/c","priceGrosz":7500,"title":"Overlap","plan":[],"allowOutsideAvailability":false}'::jsonb)
$$, '23P01', null, 'overlapping lesson is rejected server-side');
select throws_ok($$
  select public.create_lesson_schedule('{"targetType":"student","targetId":"32000000-0000-4000-8000-000000000003","requestId":"34000000-0000-4000-8000-000000000004","mode":"single","timezone":"Europe/Warsaw","occurrences":[{"startsAt":"2030-01-09T16:00:00Z","durationMinutes":60}],"format":"online","location":"https://meet.example.test/d","priceGrosz":7000,"title":"Archived","plan":[],"allowOutsideAvailability":false}'::jsonb)
$$, 'P0002', null, 'archived student is rejected');

select lives_ok($$
  select public.upsert_calendar_block_relational('{"title":"Lekarz","startsAt":"2030-01-08T18:00:00Z","endsAt":"2030-01-08T19:00:00Z","timezone":"Europe/Warsaw"}'::jsonb)
$$, 'calendar block adjacent to a lesson is accepted');
select throws_ok($$
  select public.create_lesson_schedule('{"targetType":"student","targetId":"32000000-0000-4000-8000-000000000001","requestId":"34000000-0000-4000-8000-000000000005","mode":"single","timezone":"Europe/Warsaw","occurrences":[{"startsAt":"2030-01-08T18:30:00Z","durationMinutes":30}],"format":"online","location":"https://meet.example.test/e","priceGrosz":8000,"title":"Block overlap","plan":[],"allowOutsideAvailability":false}'::jsonb)
$$, '23P01', null, 'lesson overlapping a calendar block is rejected');

select lives_ok($$
  select public.create_lesson_schedule('{"targetType":"group","targetId":"33000000-0000-4000-8000-000000000001","requestId":"34000000-0000-4000-8000-000000000006","mode":"single","timezone":"Europe/Warsaw","occurrences":[{"startsAt":"2030-01-10T16:00:00Z","durationMinutes":60}],"format":"online","location":"https://meet.example.test/group","priceGrosz":6000,"title":"Group","plan":[],"allowOutsideAvailability":false}'::jsonb)
$$, 'creates a group lesson');
select is((select count(*)::integer from public.lesson_participants lp join public.lessons l on l.id = lp.lesson_id where l.client_request_id = '34000000-0000-4000-8000-000000000006'), 2, 'group lesson snapshots current active members');
update public.group_members set status = 'suspended', left_at = now() where group_id = '33000000-0000-4000-8000-000000000001' and student_id = '32000000-0000-4000-8000-000000000002';
select is((select count(*)::integer from public.lesson_participants lp join public.lessons l on l.id = lp.lesson_id where l.client_request_id = '34000000-0000-4000-8000-000000000006'), 2, 'later group membership change does not rewrite lesson history');

select lives_ok($$
  select public.create_lesson_schedule('{"targetType":"student","targetId":"32000000-0000-4000-8000-000000000001","requestId":"34000000-0000-4000-8000-000000000007","mode":"recurring","timezone":"Europe/Warsaw","occurrences":[{"startsAt":"2030-03-19T16:00:00Z","durationMinutes":60},{"startsAt":"2030-03-26T16:00:00Z","durationMinutes":60},{"startsAt":"2030-04-02T15:00:00Z","durationMinutes":60}],"format":"online","location":"https://meet.example.test/dst","priceGrosz":8000,"title":"DST","plan":[],"allowOutsideAvailability":false,"recurrence":{"intervalWeeks":1,"daysOfWeek":[2],"startDate":"2030-03-19","endDate":"2030-04-02","startTime":"17:00","durationMinutes":60}}'::jsonb)
$$, 'creates a normalized recurring series');
select is((select string_agg(to_char(starts_at at time zone 'Europe/Warsaw', 'HH24:MI'), ',' order by starts_at) from public.lessons where client_request_id = '34000000-0000-4000-8000-000000000007'), '17:00,17:00,17:00', 'Warsaw wall-clock time remains stable across CET to CEST');
update public.lessons set status = 'completed', completed_at = ends_at where client_request_id = '34000000-0000-4000-8000-000000000007' and starts_at = '2030-03-19T16:00:00Z';
select lives_ok($$
  select public.reschedule_lesson_relational(jsonb_build_object('lessonId', (select id from public.lessons where client_request_id = '34000000-0000-4000-8000-000000000007' and starts_at = '2030-03-26T16:00:00Z'), 'startsAt', '2030-03-26T17:00:00Z', 'durationMinutes', 60, 'scope', 'future', 'allowOutsideAvailability', false))
$$, 'this-and-future reschedule splits the recurring series');
select is((select to_char(starts_at at time zone 'Europe/Warsaw', 'HH24:MI') from public.lessons where client_request_id = '34000000-0000-4000-8000-000000000007' and status = 'completed'), '17:00', 'completed history remains unchanged after series split');
select is((select string_agg(to_char(starts_at at time zone 'Europe/Warsaw', 'HH24:MI'), ',' order by starts_at) from public.lessons where client_request_id = '34000000-0000-4000-8000-000000000007' and status <> 'completed'), '18:00,18:00', 'future occurrences move while preserving local wall-clock semantics');

select lives_ok($$
  select public.cancel_lesson_relational(jsonb_build_object('lessonId', (select id from public.lessons where client_request_id = '34000000-0000-4000-8000-000000000002'), 'scope', 'single'))
$$, 'single lesson cancellation succeeds without deletion');
select is((select status::text from public.lessons where client_request_id = '34000000-0000-4000-8000-000000000002'), 'cancelled', 'cancelled lesson remains in history');

insert into public.availability_rules (workspace_id, tutor_id, kind, label, day_of_week, start_time, end_time, timezone, is_available)
values ((select workspace_id from public.tutor_profiles where id = '31000000-0000-4000-8000-000000000001'), '31000000-0000-4000-8000-000000000001', 'recurring', 'Dostępność', 1, '14:00', '20:00', 'Europe/Warsaw', true);
select throws_ok($$
  select public.create_lesson_schedule('{"targetType":"student","targetId":"32000000-0000-4000-8000-000000000001","requestId":"34000000-0000-4000-8000-000000000008","mode":"single","timezone":"Europe/Warsaw","occurrences":[{"startsAt":"2030-01-14T09:00:00Z","durationMinutes":60}],"format":"online","location":"https://meet.example.test/outside","priceGrosz":8000,"title":"Outside","plan":[],"allowOutsideAvailability":false}'::jsonb)
$$, 'P0001', null, 'outside-availability scheduling requires an explicit override');
select lives_ok($$
  select public.create_lesson_schedule('{"targetType":"student","targetId":"32000000-0000-4000-8000-000000000001","requestId":"34000000-0000-4000-8000-000000000009","mode":"single","timezone":"Europe/Warsaw","occurrences":[{"startsAt":"2030-01-14T09:00:00Z","durationMinutes":60}],"format":"online","location":"https://meet.example.test/outside","priceGrosz":8000,"title":"Outside override","plan":[],"allowOutsideAvailability":true}'::jsonb)
$$, 'explicit outside-availability override succeeds');

set local request.jwt.claims = '{"sub":"31000000-0000-4000-8000-000000000002","role":"authenticated"}';
select is((select count(*)::integer from public.lessons), 0, 'other workspace cannot read lessons');
select throws_ok($$
  select public.reschedule_lesson_relational(jsonb_build_object('lessonId', (select id from public.lessons where client_request_id = '34000000-0000-4000-8000-000000000001'), 'startsAt', '2030-01-08T20:00:00Z'))
$$, 'P0002', null, 'other workspace cannot mutate a lesson');
select is_empty($$
  update public.calendar_blocks set title = 'Stolen' where tutor_id = '31000000-0000-4000-8000-000000000001' returning id
$$, 'other workspace cannot mutate calendar blocks');
select is_empty($$
  update public.availability_rules set label = 'Stolen' where tutor_id = '31000000-0000-4000-8000-000000000001' returning id
$$, 'other workspace cannot mutate availability');
select throws_ok($$
  insert into public.lesson_participants (workspace_id, lesson_id, student_id)
  values ((select workspace_id from public.tutor_profiles where id = '31000000-0000-4000-8000-000000000002'), '00000000-0000-4000-8000-000000000001', '32000000-0000-4000-8000-000000000001')
$$, '23503', null, 'cross-workspace participant linking is rejected');

select * from finish();
rollback;
