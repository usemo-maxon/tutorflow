begin;
select plan(13);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '81000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'calendar-colors@example.test', '', '{}',
  '{"full_name":"Color Tutor"}', now(), now()
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"81000000-0000-4000-8000-000000000001","role":"authenticated"}';

insert into public.students (
  id, workspace_id, first_name, display_name, status,
  default_lesson_duration_minutes, currency, default_format, archived_at
) values (
  '82000000-0000-4000-8000-000000000001',
  (select workspace_id from public.tutor_profiles where id = '81000000-0000-4000-8000-000000000001'),
  'Zosia', 'Zosia Color', 'active', 60, 'PLN', 'online', null
);

select lives_ok($$
  select public.create_lesson_schedule_with_color('{
    "targetType":"student",
    "targetId":"82000000-0000-4000-8000-000000000001",
    "requestId":"83000000-0000-4000-8000-000000000001",
    "mode":"recurring",
    "timezone":"Europe/Warsaw",
    "color":"#7C9CF5",
    "occurrences":[
      {"startsAt":"2035-05-01T08:00:00Z","durationMinutes":60},
      {"startsAt":"2035-05-08T08:00:00Z","durationMinutes":60},
      {"startsAt":"2035-05-15T08:00:00Z","durationMinutes":60}
    ],
    "format":"online","location":"https://meet.example.test/colors",
    "title":"Colors","plan":[],"allowOutsideAvailability":false,
    "recurrence":{"intervalWeeks":1,"daysOfWeek":[2],"startDate":"2035-05-01","endDate":"2035-05-15","startTime":"10:00","durationMinutes":60}
  }'::jsonb)
$$, 'creates a colored recurring lesson');

select is(
  (select color from public.recurring_lesson_series where client_request_id = '83000000-0000-4000-8000-000000000001'),
  '#7C9CF5', 'the recurring series owns the chosen default color'
);
select is(
  (select count(*)::integer from public.lessons where client_request_id = '83000000-0000-4000-8000-000000000001' and color = '#7C9CF5'),
  3, 'materialized occurrences inherit the series color'
);
select throws_ok($$
  select public.create_lesson_schedule_with_color(jsonb_build_object('color', 'red'))
$$, '22023', null, 'arbitrary CSS colors are rejected');

select lives_ok($$
  select public.update_lesson_color_relational(jsonb_build_object(
    'lessonId', (select id from public.lessons where client_request_id = '83000000-0000-4000-8000-000000000001' order by starts_at limit 1),
    'color', '#63B3A6', 'scope', 'single'
  ))
$$, 'a single occurrence can override its color');
select is(
  (select color from public.lessons where client_request_id = '83000000-0000-4000-8000-000000000001' order by starts_at limit 1),
  '#63B3A6', 'the single occurrence stores its override'
);
select is(
  (select color from public.lessons where client_request_id = '83000000-0000-4000-8000-000000000001' order by starts_at offset 1 limit 1),
  '#7C9CF5', 'a single override leaves later occurrences unchanged'
);

update public.lessons set status = 'completed', completed_at = ends_at
where id = (select id from public.lessons where client_request_id = '83000000-0000-4000-8000-000000000001' order by starts_at limit 1);
select lives_ok($$
  select public.update_lesson_color_relational(jsonb_build_object(
    'lessonId', (select id from public.lessons where client_request_id = '83000000-0000-4000-8000-000000000001' order by starts_at offset 1 limit 1),
    'color', '#D98593', 'scope', 'future'
  ))
$$, 'future-scope color update succeeds');
select is(
  (select color from public.lessons where client_request_id = '83000000-0000-4000-8000-000000000001' order by starts_at limit 1),
  '#63B3A6', 'future color changes preserve historical occurrence color'
);
select is(
  (select count(*)::integer from public.lessons where client_request_id = '83000000-0000-4000-8000-000000000001' and color = '#D98593'),
  2, 'future color scope updates the selected and later occurrences'
);

select lives_ok($$
  select public.upsert_calendar_block_with_color('{
    "title":"Prywatne","startsAt":"2035-05-20T08:00:00Z",
    "endsAt":"2035-05-20T09:00:00Z","timezone":"Europe/Warsaw","color":"#9A78A8"
  }'::jsonb)
$$, 'a CalendarBlock can store its own custom color');
select is(
  (select color from public.calendar_blocks where title = 'Prywatne'),
  '#9A78A8', 'the CalendarBlock keeps the exact easy4tutor color'
);
select throws_ok($$
  update public.calendar_blocks set color = '#abc123' where title = 'Prywatne'
$$, '23514', null, 'database constraints reject non-normalized hex colors');

select * from finish();
rollback;
