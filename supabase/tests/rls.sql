begin;
select plan(22);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'one@example.test', '', '{}', '{"full_name":"One"}', now(), now()),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'two@example.test', '', '{}', '{"full_name":"Two"}', now(), now()),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@example.test', '', '{}', '{"full_name":"Admin"}', now(), now());
update public.profiles set role = 'admin' where id = '10000000-0000-0000-0000-000000000003';

select set_config(
  'test.workspace_one',
  (select id::text from public.workspaces where owner_user_id = '10000000-0000-0000-0000-000000000001'),
  true
);
select set_config(
  'test.workspace_two',
  (select id::text from public.workspaces where owner_user_id = '10000000-0000-0000-0000-000000000002'),
  true
);

select is(
  (select public from storage.buckets where id = 'attachments'),
  false,
  'attachments bucket is private'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select is((select count(*)::integer from public.teacher_states), 1, 'teacher sees only own private state');
select is((select count(*)::integer from public.profiles), 1, 'teacher sees only own profile');
select is((select count(*)::integer from public.subscriptions), 1, 'teacher sees only own subscription');
select lives_ok($$update public.teacher_states set state = state where teacher_id = '10000000-0000-0000-0000-000000000002'$$, 'cross-tenant update is safely filtered');
select is((select version::integer from public.teacher_states where teacher_id = '10000000-0000-0000-0000-000000000002'), null, 'teacher cannot read another teacher state');

select lives_ok($$
  insert into public.students (
    id, workspace_id, first_name, display_name
  ) values (
    '19000000-0000-0000-0000-000000000001',
    current_setting('test.workspace_one')::uuid,
    'RLS',
    'RLS Student'
  );
  insert into public.lessons (
    id, workspace_id, tutor_id, student_id, title, starts_at, ends_at,
    timezone
  ) values (
    '19000000-0000-0000-0000-000000000002',
    current_setting('test.workspace_one')::uuid,
    '10000000-0000-0000-0000-000000000001',
    '19000000-0000-0000-0000-000000000001',
    'RLS lesson',
    '2032-01-10T10:00:00Z',
    '2032-01-10T11:00:00Z',
    'Europe/Warsaw'
  );
  insert into public.bookings (
    id, workspace_id, student_id, tutor_id, starts_at, ends_at, timezone
  ) values (
    '19000000-0000-0000-0000-000000000003',
    current_setting('test.workspace_one')::uuid,
    '19000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001',
    '2032-01-11T10:00:00Z',
    '2032-01-11T11:00:00Z',
    'Europe/Warsaw'
  );
  insert into public.notifications (
    id, workspace_id, user_id, type, title
  ) values (
    '19000000-0000-0000-0000-000000000004',
    current_setting('test.workspace_one')::uuid,
    '10000000-0000-0000-0000-000000000001',
    'security_test',
    'RLS notification'
  )
$$, 'workspace owner can create booking and notification fixtures');

select lives_ok($$
  insert into public.google_sync_jobs (
    id, workspace_id, teacher_id, lesson_id, google_event_id
  ) values (
    '19000000-0000-0000-0000-000000000005',
    current_setting('test.workspace_one')::uuid,
    '10000000-0000-0000-0000-000000000001',
    '19000000-0000-0000-0000-000000000002',
    'rls-own-job'
  )
$$, 'tutor can enqueue own Google sync job');

select lives_ok($$
  insert into public.reminder_deliveries (
    id, workspace_id, teacher_id, lesson_id, lead_minutes, scheduled_for
  ) values (
    '19000000-0000-0000-0000-000000000006',
    current_setting('test.workspace_one')::uuid,
    '10000000-0000-0000-0000-000000000001',
    '19000000-0000-0000-0000-000000000002',
    60,
    '2032-01-10T09:00:00Z'
  )
$$, 'tutor can enqueue own reminder');

select throws_ok($$
  insert into public.google_sync_jobs (
    workspace_id, teacher_id, lesson_id, google_event_id
  ) values (
    current_setting('test.workspace_one')::uuid,
    '10000000-0000-0000-0000-000000000002',
    '19000000-0000-0000-0000-000000000002',
    'rls-cross-tenant-job'
  )
$$, '42501', null, 'queue policy rejects another tenant Google identity');

select throws_ok($$
  insert into public.reminder_deliveries (
    workspace_id, teacher_id, lesson_id, lead_minutes, scheduled_for
  ) values (
    current_setting('test.workspace_one')::uuid,
    '10000000-0000-0000-0000-000000000002',
    '19000000-0000-0000-0000-000000000002',
    1440,
    '2032-01-09T10:00:00Z'
  )
$$, '42501', null, 'queue policy rejects another tenant Telegram identity');

select throws_ok($$
  update public.google_sync_jobs
  set teacher_id = '10000000-0000-0000-0000-000000000002'
  where id = '19000000-0000-0000-0000-000000000005'
$$, '42501', null, 'Google job ownership cannot be reassigned');

select throws_ok($$
  update public.reminder_deliveries
  set teacher_id = '10000000-0000-0000-0000-000000000002'
  where id = '19000000-0000-0000-0000-000000000006'
$$, '42501', null, 'reminder ownership cannot be reassigned');

select throws_ok($$
  update public.tutor_profiles
  set workspace_id = current_setting('test.workspace_two')::uuid
  where user_id = '10000000-0000-0000-0000-000000000001'
$$, '42501', null, 'tutor profile cannot move into another tenant');

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}';
select is((select count(*)::integer from public.bookings), 0, 'other workspace cannot read bookings');
select is((select count(*)::integer from public.notifications), 0, 'other workspace cannot read notifications');
select is((select count(*)::integer from public.google_sync_jobs), 0, 'other tutor cannot read Google sync jobs');
select is((select count(*)::integer from public.reminder_deliveries), 0, 'other tutor cannot read reminders');
select throws_ok(
  $$select count(*) from public.webhook_events$$,
  '42501',
  null,
  'authenticated users cannot read webhook idempotency records'
);
select throws_ok($$
  insert into public.webhook_events (provider, external_id, payload_hash)
  values ('telegram', 'browser-write', 'blocked')
$$, '42501', null, 'authenticated users cannot write webhook idempotency records');

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000003","role":"authenticated"}';
select is((
  select count(*)::integer from public.profiles
  where id in (
    '10000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000002',
    '10000000-0000-0000-0000-000000000003'
  )
), 3, 'admin can list account profiles');
select is((select count(*)::integer from public.teacher_states), 1, 'admin cannot read teachers private content (only own empty state)');

select * from finish();
rollback;
