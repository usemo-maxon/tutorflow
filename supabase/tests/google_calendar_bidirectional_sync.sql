begin;
select plan(12);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  (
    '91000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'google-one@example.test', '', '{}',
    '{"full_name":"Google One"}', now(), now()
  ),
  (
    '91000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated', 'authenticated', 'google-two@example.test', '', '{}',
    '{"full_name":"Google Two"}', now(), now()
  );

insert into public.students (
  id, workspace_id, first_name, display_name, status,
  default_lesson_duration_minutes, currency, default_format, archived_at
) values
  (
    '92000000-0000-4000-8000-000000000001',
    (select workspace_id from public.tutor_profiles where id = '91000000-0000-4000-8000-000000000001'),
    'Anna', 'Anna One', 'active', 60, 'PLN', 'online', null
  ),
  (
    '92000000-0000-4000-8000-000000000002',
    (select workspace_id from public.tutor_profiles where id = '91000000-0000-4000-8000-000000000002'),
    'Ola', 'Ola Two', 'active', 60, 'PLN', 'online', null
  );

insert into public.lessons (
  id, workspace_id, tutor_id, student_id, title, starts_at, ends_at,
  timezone, status, format, currency, billing_type, creation_mode, sync_status
) values
  (
    '93000000-0000-4000-8000-000000000001',
    (select workspace_id from public.tutor_profiles where id = '91000000-0000-4000-8000-000000000001'),
    '91000000-0000-4000-8000-000000000001',
    '92000000-0000-4000-8000-000000000001',
    'English', '2036-01-10T09:00:00Z', '2036-01-10T10:00:00Z',
    'Europe/Warsaw', 'scheduled', 'online', 'PLN', 'per_lesson', 'single', 'pending'
  ),
  (
    '93000000-0000-4000-8000-000000000002',
    (select workspace_id from public.tutor_profiles where id = '91000000-0000-4000-8000-000000000002'),
    '91000000-0000-4000-8000-000000000002',
    '92000000-0000-4000-8000-000000000002',
    'Math', '2036-01-10T11:00:00Z', '2036-01-10T12:00:00Z',
    'Europe/Warsaw', 'scheduled', 'online', 'PLN', 'per_lesson', 'single', 'pending'
  );

insert into public.integration_connections (
  teacher_id, provider, status, label, encrypted_credentials, workspace_id,
  selected_calendar_id
) values
  (
    '91000000-0000-4000-8000-000000000001', 'google', 'connected',
    'One', 'encrypted-one',
    (select workspace_id from public.tutor_profiles where id = '91000000-0000-4000-8000-000000000001'),
    'primary'
  ),
  (
    '91000000-0000-4000-8000-000000000002', 'google', 'connected',
    'Two', 'encrypted-two',
    (select workspace_id from public.tutor_profiles where id = '91000000-0000-4000-8000-000000000002'),
    'primary'
  );

insert into public.google_event_mappings (
  connection_id, workspace_id, teacher_id, lesson_id, calendar_id,
  google_event_id, status
)
select id, workspace_id, teacher_id,
  case teacher_id
    when '91000000-0000-4000-8000-000000000001' then '93000000-0000-4000-8000-000000000001'::uuid
    else '93000000-0000-4000-8000-000000000002'::uuid
  end,
  'primary', 'event-' || teacher_id::text, 'synced'
from public.integration_connections
where teacher_id in (
  '91000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000002'
);

insert into public.external_google_events (
  connection_id, workspace_id, teacher_id, calendar_id, google_event_id,
  summary, starts_at, ends_at, all_day, status, transparency
)
select id, workspace_id, teacher_id, 'primary', 'external-' || teacher_id::text,
  'Private event', '2036-01-11T09:00:00Z', '2036-01-11T10:00:00Z',
  false, 'confirmed', 'opaque'
from public.integration_connections
where teacher_id in (
  '91000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000002'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated"}';

select is((select count(*)::integer from public.google_event_mappings), 1,
  'a teacher reads only own Google mappings');
select is((select count(*)::integer from public.external_google_events), 1,
  'a teacher reads only own external events');
select is((select summary from public.external_google_events limit 1),
  'Private event', 'the local cache retains the Google title');
select throws_ok(
  $$insert into public.external_google_events (
    connection_id, workspace_id, teacher_id, calendar_id, google_event_id,
    summary, starts_at, ends_at, all_day, status, transparency
  ) select id, workspace_id, teacher_id, 'primary', 'browser-write',
    'Forbidden', now(), now() + interval '1 hour', false, 'confirmed', 'opaque'
    from public.integration_connections limit 1$$,
  '42501', null, 'browser roles cannot mutate the provider cache'
);
select throws_ok(
  $$update public.integration_connections
    set status = 'connected'
    where teacher_id = '91000000-0000-4000-8000-000000000001'$$,
  '42501', null, 'browser roles cannot update integration credentials'
);
select throws_ok(
  $$insert into public.integration_connections (
      teacher_id, workspace_id, provider, status, encrypted_credentials
    ) values (
      '91000000-0000-4000-8000-000000000001',
      (select workspace_id from public.tutor_profiles
       where id = '91000000-0000-4000-8000-000000000001'),
      'google', 'connected', 'browser-secret'
    )$$,
  '42501', null, 'browser roles cannot insert integration credentials'
);

reset role;
select throws_ok(
  $$insert into public.external_google_events (
    connection_id, workspace_id, teacher_id, calendar_id, google_event_id,
    summary, starts_at, ends_at, all_day, status, transparency
  ) select id, workspace_id, teacher_id, 'primary',
    'external-91000000-0000-4000-8000-000000000001',
    'Duplicate', '2036-01-12T09:00:00Z', '2036-01-12T10:00:00Z',
    false, 'confirmed', 'opaque'
    from public.integration_connections
    where teacher_id = '91000000-0000-4000-8000-000000000001'$$,
  '23505', null, 'provider event identity is unique per connection/calendar'
);
select throws_ok(
  $$insert into public.external_google_events (
    connection_id, workspace_id, teacher_id, calendar_id, google_event_id,
    summary, starts_at, ends_at, start_date, end_date, all_day,
    status, transparency
  ) select id, workspace_id, teacher_id, 'primary', 'invalid-all-day',
    'Invalid', now(), now() + interval '1 hour', current_date, current_date + 1,
    true, 'confirmed', 'opaque'
    from public.integration_connections
    where teacher_id = '91000000-0000-4000-8000-000000000001'$$,
  '23514', null, 'all-day events cannot masquerade as midnight timestamps'
);
select throws_ok(
  $$insert into public.lessons (
    workspace_id, tutor_id, student_id, title, starts_at, ends_at, timezone,
    status, format, currency, billing_type, creation_mode, sync_status
  ) values (
    (select workspace_id from public.tutor_profiles where id = '91000000-0000-4000-8000-000000000001'),
    '91000000-0000-4000-8000-000000000001',
    '92000000-0000-4000-8000-000000000001',
    'Collision', '2036-01-11T09:15:00Z', '2036-01-11T09:45:00Z',
    'Europe/Warsaw', 'scheduled', 'online', 'PLN', 'per_lesson', 'single', 'disabled'
  )$$,
  '23P01', 'EXTERNAL_GOOGLE_EVENT_CONFLICT',
  'opaque Google busy time blocks overlapping Lessons'
);

update public.external_google_events
set transparency = 'transparent'
where teacher_id = '91000000-0000-4000-8000-000000000001';
select lives_ok(
  $$insert into public.lessons (
    workspace_id, tutor_id, student_id, title, starts_at, ends_at, timezone,
    status, format, currency, billing_type, creation_mode, sync_status
  ) values (
    (select workspace_id from public.tutor_profiles where id = '91000000-0000-4000-8000-000000000001'),
    '91000000-0000-4000-8000-000000000001',
    '92000000-0000-4000-8000-000000000001',
    'Allowed', '2036-01-11T09:15:00Z', '2036-01-11T09:45:00Z',
    'Europe/Warsaw', 'scheduled', 'online', 'PLN', 'per_lesson', 'single', 'disabled'
  )$$,
  'transparent Google events do not block scheduling'
);
select is(
  (select sync_state from public.integration_connections
   where teacher_id = '91000000-0000-4000-8000-000000000001'),
  'idle', 'connections have an explicit synchronization state'
);
select ok(
  (select id is not null from public.integration_connections
   where teacher_id = '91000000-0000-4000-8000-000000000001'),
  'existing connection rows have a stable identifier'
);

select * from finish();
rollback;
