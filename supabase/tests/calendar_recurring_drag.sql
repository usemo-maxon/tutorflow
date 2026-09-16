begin;
select plan(28);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '71000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'recurring-drag@example.test',
  '',
  '{}',
  '{"full_name":"Recurring Drag Tutor"}',
  now(),
  now()
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated"}';

insert into public.students (
  id, workspace_id, first_name, display_name, status,
  default_lesson_duration_minutes, currency, default_format, archived_at
) values (
  '72000000-0000-4000-8000-000000000001',
  (select workspace_id from public.tutor_profiles where id = '71000000-0000-4000-8000-000000000001'),
  'Zosia',
  'Zosia Recurring',
  'active',
  60,
  'PLN',
  'online',
  null
);

set local role postgres;
insert into public.integration_connections (
  teacher_id, workspace_id, provider, status, label
) values (
  '71000000-0000-4000-8000-000000000001',
  (select workspace_id from public.tutor_profiles where id = '71000000-0000-4000-8000-000000000001'),
  'google',
  'connected',
  'Test calendar'
);
set local role authenticated;

select lives_ok($$
  select public.create_lesson_schedule('{
    "targetType":"student",
    "targetId":"72000000-0000-4000-8000-000000000001",
    "requestId":"73000000-0000-4000-8000-000000000001",
    "mode":"recurring",
    "timezone":"Europe/Warsaw",
    "occurrences":[
      {"startsAt":"2031-05-06T08:00:00Z","durationMinutes":60},
      {"startsAt":"2031-05-13T08:00:00Z","durationMinutes":60},
      {"startsAt":"2031-05-20T08:00:00Z","durationMinutes":60}
    ],
    "format":"online",
    "location":"https://meet.example.test/scope",
    "title":"Scope",
    "plan":[],
    "allowOutsideAvailability":false,
    "recurrence":{"intervalWeeks":1,"daysOfWeek":[2],"startDate":"2031-05-06","endDate":"2031-05-20","startTime":"10:00","durationMinutes":60}
  }'::jsonb)
$$, 'creates a recurring series for drag scope tests');

select lives_ok($$
  select public.reschedule_lesson_relational(jsonb_build_object(
    'lessonId', (select id from public.lessons where client_request_id = '73000000-0000-4000-8000-000000000001' and recurrence_original_starts_at = '2031-05-06T08:00:00Z'),
    'startsAt', '2031-05-07T10:00:00Z',
    'scope', 'single'
  ))
$$, 'only-this recurring drag succeeds');
select is(
  (select starts_at::text from public.lessons where client_request_id = '73000000-0000-4000-8000-000000000001' and recurrence_original_starts_at = '2031-05-06T08:00:00Z'),
  '2031-05-07 10:00:00+00',
  'only-this changes the selected occurrence'
);
select is(
  (select starts_at::text from public.lessons where client_request_id = '73000000-0000-4000-8000-000000000001' and recurrence_original_starts_at = '2031-05-13T08:00:00Z'),
  '2031-05-13 08:00:00+00',
  'only-this leaves the next occurrence unchanged'
);
select is(
  (select count(distinct recurring_series_id)::integer from public.lessons where client_request_id = '73000000-0000-4000-8000-000000000001'),
  1,
  'only-this preserves the recurring series'
);

select lives_ok($$
  select public.reschedule_lesson_relational(jsonb_build_object(
    'lessonId', (select id from public.lessons where client_request_id = '73000000-0000-4000-8000-000000000001' and recurrence_original_starts_at = '2031-05-13T08:00:00Z'),
    'startsAt', '2031-05-15T09:00:00Z',
    'scope', 'future'
  ))
$$, 'this-and-future recurring drag succeeds');
select is(
  (select string_agg(to_char(starts_at at time zone 'Europe/Warsaw', 'ID HH24:MI'), ',' order by recurrence_original_starts_at) from public.lessons where client_request_id = '73000000-0000-4000-8000-000000000001' and recurrence_original_starts_at >= '2031-05-13T08:00:00Z'),
  '4 11:00,4 11:00',
  'this-and-future applies the new local weekday and time'
);
select is(
  (select count(distinct recurring_series_id)::integer from public.lessons where client_request_id = '73000000-0000-4000-8000-000000000001'),
  2,
  'this-and-future splits the series'
);

select lives_ok($$
  select public.create_lesson_schedule('{
    "targetType":"student",
    "targetId":"72000000-0000-4000-8000-000000000001",
    "requestId":"73000000-0000-4000-8000-000000000002",
    "mode":"recurring",
    "timezone":"Europe/Warsaw",
    "occurrences":[
      {"startsAt":"2025-01-07T16:00:00Z","durationMinutes":60},
      {"startsAt":"2030-03-26T16:00:00Z","durationMinutes":60},
      {"startsAt":"2030-04-02T15:00:00Z","durationMinutes":60}
    ],
    "format":"online",
    "location":"https://meet.example.test/history",
    "priceGrosz":8000,
    "title":"History",
    "plan":[],
    "allowOutsideAvailability":false,
    "recurrence":{"intervalWeeks":1,"daysOfWeek":[2],"startDate":"2025-01-07","endDate":"2030-04-02","startTime":"17:00","durationMinutes":60}
  }'::jsonb)
$$, 'creates a recurring series with completed history and DST-spanning future lessons');

update public.lessons
set status = 'completed', completed_at = ends_at
where client_request_id = '73000000-0000-4000-8000-000000000002'
  and recurrence_original_starts_at = '2025-01-07T16:00:00Z';
update public.attendances
set status = 'present', marked_at = '2025-01-07T17:00:00Z', notes = 'Obecna'
where lesson_id = (
  select id from public.lessons
  where client_request_id = '73000000-0000-4000-8000-000000000002'
    and status = 'completed'
);
update public.lesson_participants
set payment_status = 'paid'
where lesson_id = (
  select id from public.lessons
  where client_request_id = '73000000-0000-4000-8000-000000000002'
    and status = 'completed'
);
insert into public.packages (
  id, workspace_id, student_id, name, total_lessons, price_grosz, currency
) values (
  '74000000-0000-4000-8000-000000000001',
  (select workspace_id from public.tutor_profiles where id = '71000000-0000-4000-8000-000000000001'),
  '72000000-0000-4000-8000-000000000001',
  'Pakiet',
  10,
  70000,
  'PLN'
);
insert into public.package_usages (
  workspace_id, package_id, lesson_id, kind, units, idempotency_key
) values (
  (select workspace_id from public.tutor_profiles where id = '71000000-0000-4000-8000-000000000001'),
  '74000000-0000-4000-8000-000000000001',
  (select id from public.lessons where client_request_id = '73000000-0000-4000-8000-000000000002' and status = 'completed'),
  'consumption',
  1,
  'historical-recurring-drag-usage'
);
insert into public.lesson_notes (
  workspace_id, lesson_id, author_user_id, content, note_type
) values (
  (select workspace_id from public.tutor_profiles where id = '71000000-0000-4000-8000-000000000001'),
  (select id from public.lessons where client_request_id = '73000000-0000-4000-8000-000000000002' and status = 'completed'),
  '71000000-0000-4000-8000-000000000001',
  'Historyczna notatka',
  'general'
);
insert into public.homeworks (
  workspace_id, lesson_id, student_id, title, description
) values (
  (select workspace_id from public.tutor_profiles where id = '71000000-0000-4000-8000-000000000001'),
  (select id from public.lessons where client_request_id = '73000000-0000-4000-8000-000000000002' and status = 'completed'),
  '72000000-0000-4000-8000-000000000001',
  'Historyczna praca',
  'Bez zmian'
);
update public.google_sync_jobs
set status = 'succeeded', updated_at = '2025-01-10T10:00:00Z'
where lesson_id in (
  select id from public.lessons where client_request_id = '73000000-0000-4000-8000-000000000002'
);

select lives_ok($$
  select public.reschedule_lesson_relational(jsonb_build_object(
    'lessonId', (select id from public.lessons where client_request_id = '73000000-0000-4000-8000-000000000002' and status = 'completed'),
    'startsAt', '2025-01-08T17:00:00Z',
    'scope', 'future'
  ))
$$, 'a completed occurrence can reference a future-only move');
select is(
  (select starts_at::text from public.lessons where client_request_id = '73000000-0000-4000-8000-000000000002' and status = 'completed'),
  '2025-01-07 16:00:00+00',
  'the completed historical occurrence remains unchanged'
);
select is(
  (select string_agg(to_char(starts_at at time zone 'Europe/Warsaw', 'YYYY-MM-DD ID HH24:MI'), ',' order by recurrence_original_starts_at) from public.lessons where client_request_id = '73000000-0000-4000-8000-000000000002' and status <> 'completed'),
  '2030-03-27 3 18:00,2030-04-03 3 18:00',
  'future lessons keep the new wall-clock weekday and time across DST'
);
select is(
  (select days_of_week::text from public.recurring_lesson_series where id = (select recurring_series_id from public.lessons where client_request_id = '73000000-0000-4000-8000-000000000002' and status <> 'completed' limit 1)),
  '{3}',
  'the successor recurrence rule uses Wednesday'
);
select is(
  (select status::text || ':' || coalesce(notes, '') from public.attendances where lesson_id = (select id from public.lessons where client_request_id = '73000000-0000-4000-8000-000000000002' and status = 'completed')),
  'present:Obecna',
  'completed attendance remains unchanged'
);
select is(
  (select payment_status::text from public.lesson_participants where lesson_id = (select id from public.lessons where client_request_id = '73000000-0000-4000-8000-000000000002' and status = 'completed')),
  'paid',
  'completed participant payment history remains unchanged'
);
select is(
  (select count(*)::integer from public.package_usages where idempotency_key = 'historical-recurring-drag-usage'),
  1,
  'completed package usage remains unchanged'
);
select is(
  (select count(*)::integer from public.lesson_notes n join public.homeworks h on h.lesson_id = n.lesson_id where n.content = 'Historyczna notatka' and h.title = 'Historyczna praca'),
  1,
  'completed notes and homework remain attached to history'
);
select is(
  (select status::text || ':' || updated_at::text from public.google_sync_jobs where lesson_id = (select id from public.lessons where client_request_id = '73000000-0000-4000-8000-000000000002' and status = 'completed')),
  'succeeded:2025-01-10 10:00:00+00',
  'the historical Google sync job is not touched'
);
select is(
  (select count(*)::integer from public.google_sync_jobs where lesson_id in (select id from public.lessons where client_request_id = '73000000-0000-4000-8000-000000000002' and status <> 'completed') and status = 'pending'),
  2,
  'future Google sync jobs are updated without duplicates'
);

create temporary table retry_snapshot as
select count(*)::integer as series_count
from public.recurring_lesson_series
where workspace_id = (select workspace_id from public.tutor_profiles where id = '71000000-0000-4000-8000-000000000001');
select lives_ok($$
  select public.reschedule_lesson_relational(jsonb_build_object(
    'lessonId', (select id from public.lessons where client_request_id = '73000000-0000-4000-8000-000000000002' and status = 'completed'),
    'startsAt', '2025-01-08T17:00:00Z',
    'scope', 'future'
  ))
$$, 'retrying the historical future move is idempotent');
select is(
  (select count(*)::integer from public.recurring_lesson_series where workspace_id = (select workspace_id from public.tutor_profiles where id = '71000000-0000-4000-8000-000000000001')),
  (select series_count from retry_snapshot),
  'an idempotent retry does not create another successor series'
);
select is(
  (select count(*)::integer from public.google_sync_jobs where lesson_id in (select id from public.lessons where client_request_id = '73000000-0000-4000-8000-000000000002')),
  3,
  'an idempotent retry does not duplicate Google jobs'
);

select lives_ok($$
  select public.create_lesson_schedule('{
    "targetType":"student","targetId":"72000000-0000-4000-8000-000000000001",
    "requestId":"73000000-0000-4000-8000-000000000003","mode":"recurring","timezone":"Europe/Warsaw",
    "occurrences":[{"startsAt":"2025-02-04T16:00:00Z","durationMinutes":60}],
    "format":"online","location":"https://meet.example.test/ended","title":"Ended","plan":[],"allowOutsideAvailability":false,
    "recurrence":{"intervalWeeks":1,"daysOfWeek":[2],"startDate":"2025-02-04","endDate":"2025-02-04","startTime":"17:00","durationMinutes":60}
  }'::jsonb)
$$, 'creates an ended recurring series');
update public.lessons set status = 'completed', completed_at = ends_at
where client_request_id = '73000000-0000-4000-8000-000000000003';
select throws_ok($$
  select public.reschedule_lesson_relational(jsonb_build_object(
    'lessonId', (select id from public.lessons where client_request_id = '73000000-0000-4000-8000-000000000003'),
    'startsAt', '2025-02-05T17:00:00Z',
    'scope', 'future'
  ))
$$, 'P0001', null, 'a completed series with no future occurrences is rejected');

select lives_ok($$
  select public.create_lesson_schedule('{
    "targetType":"student","targetId":"72000000-0000-4000-8000-000000000001",
    "requestId":"73000000-0000-4000-8000-000000000004","mode":"recurring","timezone":"Europe/Warsaw",
    "occurrences":[{"startsAt":"2032-06-01T08:00:00Z","durationMinutes":60},{"startsAt":"2032-06-08T08:00:00Z","durationMinutes":60}],
    "format":"online","location":"https://meet.example.test/rollback","title":"Rollback","plan":[],"allowOutsideAvailability":false,
    "recurrence":{"intervalWeeks":1,"daysOfWeek":[2],"startDate":"2032-06-01","endDate":"2032-06-08","startTime":"10:00","durationMinutes":60}
  }'::jsonb)
$$, 'creates a recurring series for conflict rollback');
select lives_ok($$
  select public.create_lesson_schedule('{
    "targetType":"student","targetId":"72000000-0000-4000-8000-000000000001",
    "requestId":"73000000-0000-4000-8000-000000000005","mode":"single","timezone":"Europe/Warsaw",
    "occurrences":[{"startsAt":"2032-06-02T09:00:00Z","durationMinutes":60}],
    "format":"online","location":"https://meet.example.test/blocker","title":"Blocker","plan":[],"allowOutsideAvailability":false
  }'::jsonb)
$$, 'creates a conflicting lesson');
select throws_ok($$
  select public.reschedule_lesson_relational(jsonb_build_object(
    'lessonId', (select id from public.lessons where client_request_id = '73000000-0000-4000-8000-000000000004' order by starts_at limit 1),
    'startsAt', '2032-06-02T09:00:00Z',
    'scope', 'future'
  ))
$$, '23P01', null, 'a future-series conflict rejects the whole move');
select is(
  (select string_agg(starts_at::text, ',' order by starts_at) from public.lessons where client_request_id = '73000000-0000-4000-8000-000000000004'),
  '2032-06-01 08:00:00+00,2032-06-08 08:00:00+00',
  'a conflict rolls every future occurrence back'
);

select * from finish();
rollback;
