begin;
select plan(23);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('10000000-0000-0000-0000-000000000081', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'd28-a@example.test', '', '{}', '{"full_name":"D28 Anna"}', now(), now()),
  ('10000000-0000-0000-0000-000000000082', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'd28-b@example.test', '', '{}', '{"full_name":"D28 Ewa"}', now(), now());

select set_config('test.d28_workspace', (select id::text from public.workspaces where owner_user_id = '10000000-0000-0000-0000-000000000081'), true);
select set_config('test.d28_other_workspace', (select id::text from public.workspaces where owner_user_id = '10000000-0000-0000-0000-000000000082'), true);
select set_config('test.d28_old', (date_trunc('day', now()) + interval '5 days 10 hours')::text, true);
select set_config('test.d28_new', (date_trunc('day', now()) + interval '6 days 10 hours')::text, true);
select set_config('test.d28_other', (date_trunc('day', now()) + interval '7 days 9 hours')::text, true);

insert into public.tutor_public_profiles (
  tutor_id, workspace_id, enabled, slug, public_name
) values
  ('10000000-0000-0000-0000-000000000081', current_setting('test.d28_workspace')::uuid, true, 'd28-anna', 'Anna D28'),
  ('10000000-0000-0000-0000-000000000082', current_setting('test.d28_other_workspace')::uuid, true, 'd28-ewa', 'Ewa D28');

insert into public.booking_availability_settings (
  tutor_id, workspace_id, minimum_notice_hours, booking_horizon_days,
  cancellation_notice_hours, reschedule_notice_hours,
  reminder_24_hours_enabled
) values
  ('10000000-0000-0000-0000-000000000081', current_setting('test.d28_workspace')::uuid, 0, 30, 24, 24, true),
  ('10000000-0000-0000-0000-000000000082', current_setting('test.d28_other_workspace')::uuid, 0, 30, 24, 24, true);

insert into public.booking_event_types (
  id, workspace_id, tutor_id, name, duration_minutes, price_grosz,
  currency, format, is_active, is_public
) values
  ('99800000-0000-4000-8000-000000000001', current_setting('test.d28_workspace')::uuid, '10000000-0000-0000-0000-000000000081', 'Lekcja D28', 60, 9000, 'PLN', 'online', true, true),
  ('99800000-0000-4000-8000-000000000002', current_setting('test.d28_other_workspace')::uuid, '10000000-0000-0000-0000-000000000082', 'Cudza D28', 60, 9000, 'PLN', 'online', true, true);

select has_column('public', 'bookings', 'rescheduled_at', 'booking stores reschedule lifecycle data');
select has_column('public', 'booking_availability_settings', 'reschedule_notice_hours', 'tutor has a reschedule deadline');
select has_table('public', 'booking_reminder_deliveries', 'booking reminder deliveries are persisted');
select ok(not has_function_privilege('anon', 'public.reschedule_public_booking_by_token(text,timestamp with time zone)', 'execute'), 'anonymous Data API cannot call reschedule RPC directly');
select ok(has_function_privilege('service_role', 'public.reschedule_public_booking_by_token(text,timestamp with time zone)', 'execute'), 'trusted server may call reschedule RPC');
select ok(not has_column_privilege('authenticated', 'public.bookings', 'management_token_ciphertext', 'select'), 'encrypted management token remains server-only');

set local role service_role;
select lives_ok(format($sql$
  select * from public.create_public_booking(
    'd28-anna', '99800000-0000-4000-8000-000000000001', %L::timestamptz,
    'Jan D28', 'jan-d28@example.test', null, null, null, null,
    repeat('a', 64), 'ciphertext-for-d28-booking-token'
  )
$sql$, current_setting('test.d28_old')), 'initial booking is created');

select lives_ok(format($sql$
  select * from public.reschedule_public_booking_by_token(
    repeat('a', 64), %L::timestamptz
  )
$sql$, current_setting('test.d28_new')), 'confirmed booking reschedules successfully');
reset role;

select is((select starts_at from public.bookings where management_token_hash = repeat('a', 64)), current_setting('test.d28_new')::timestamptz, 'booking moved to the new start');
select is((select reschedule_count from public.bookings where management_token_hash = repeat('a', 64)), 1, 'reschedule version increments once');
select ok(exists (
  select 1 from public.get_public_tutor_availability(
    'd28-anna', '99800000-0000-4000-8000-000000000001',
    (current_setting('test.d28_old')::timestamptz at time zone 'Europe/Warsaw')::date,
    (current_setting('test.d28_old')::timestamptz at time zone 'Europe/Warsaw')::date
  ) where starts_at = current_setting('test.d28_old')::timestamptz
), 'old slot is released');
select is((
  select count(*)::integer from public.get_public_tutor_availability(
    'd28-anna', '99800000-0000-4000-8000-000000000001',
    (current_setting('test.d28_new')::timestamptz at time zone 'Europe/Warsaw')::date,
    (current_setting('test.d28_new')::timestamptz at time zone 'Europe/Warsaw')::date
  ) where starts_at = current_setting('test.d28_new')::timestamptz
), 0, 'new slot is blocked');

insert into public.bookings (
  id, workspace_id, tutor_id, event_type_id, event_type_name, duration_minutes,
  price_grosz, currency, format, starts_at, ends_at, timezone, status, source,
  guest_name, guest_email, management_token_hash, management_token_ciphertext
) values
  ('99800000-0000-4000-8000-000000000011', current_setting('test.d28_workspace')::uuid, '10000000-0000-0000-0000-000000000081', '99800000-0000-4000-8000-000000000001', 'Lekcja D28', 60, 9000, 'PLN', 'online', current_setting('test.d28_other')::timestamptz, current_setting('test.d28_other')::timestamptz + interval '1 hour', 'Europe/Warsaw', 'confirmed', 'public_booking', 'Drugi D28', 'second-d28@example.test', repeat('b', 64), 'ciphertext-for-d28-second-token'),
  ('99800000-0000-4000-8000-000000000012', current_setting('test.d28_workspace')::uuid, '10000000-0000-0000-0000-000000000081', '99800000-0000-4000-8000-000000000001', 'Lekcja D28', 60, 9000, 'PLN', 'online', now() + interval '12 hours', now() + interval '13 hours', 'Europe/Warsaw', 'confirmed', 'public_booking', 'Deadline D28', 'deadline-d28@example.test', repeat('c', 64), 'ciphertext-for-d28-deadline-token'),
  ('99800000-0000-4000-8000-000000000013', current_setting('test.d28_workspace')::uuid, '10000000-0000-0000-0000-000000000081', '99800000-0000-4000-8000-000000000001', 'Lekcja D28', 60, 9000, 'PLN', 'online', now() + interval '8 days', now() + interval '8 days 1 hour', 'Europe/Warsaw', 'cancelled', 'public_booking', 'Cancelled D28', 'cancelled-d28@example.test', repeat('d', 64), 'ciphertext-for-d28-cancelled-token');

set local role service_role;
select throws_ok(format($sql$
  select * from public.reschedule_public_booking_by_token(
    repeat('b', 64), %L::timestamptz
  )
$sql$, current_setting('test.d28_new')), 'P0001', 'BOOKING_SLOT_UNAVAILABLE', 'occupied target is rejected');
reset role;
select is((select starts_at from public.bookings where management_token_hash = repeat('b', 64)), current_setting('test.d28_other')::timestamptz, 'failed move leaves old booking unchanged');

set local role service_role;
select throws_ok(
  $$select * from public.reschedule_public_booking_by_token(repeat('c', 64), now() + interval '9 days')$$,
  'P0001', 'BOOKING_RESCHEDULE_DEADLINE', 'reschedule deadline is enforced'
);
select throws_ok(
  $$select * from public.reschedule_public_booking_by_token(repeat('d', 64), now() + interval '9 days')$$,
  'P0001', 'BOOKING_CANCELLED', 'cancelled booking cannot reschedule'
);
select throws_ok(
  $$select * from public.reschedule_public_booking_by_token(repeat('f', 64), now() + interval '9 days')$$,
  'P0002', 'BOOKING_UNAVAILABLE', 'unknown or foreign token cannot access a booking'
);
reset role;

insert into public.students (id, workspace_id, first_name, display_name)
values ('19800000-0000-4000-8000-000000000001', current_setting('test.d28_workspace')::uuid, 'Converted', 'Converted D28');
insert into public.lessons (
  id, workspace_id, tutor_id, student_id, starts_at, ends_at, timezone, title
) values (
  '29800000-0000-4000-8000-000000000001', current_setting('test.d28_workspace')::uuid,
  '10000000-0000-0000-0000-000000000081', '19800000-0000-4000-8000-000000000001',
  now() + interval '10 days', now() + interval '10 days 1 hour', 'Europe/Warsaw', 'Converted D28'
);
insert into public.bookings (
  id, workspace_id, tutor_id, student_id, converted_lesson_id, converted_at,
  event_type_id, event_type_name, duration_minutes, price_grosz, currency,
  format, starts_at, ends_at, timezone, status, source, guest_name, guest_email,
  management_token_hash, management_token_ciphertext
) values (
  '99800000-0000-4000-8000-000000000014', current_setting('test.d28_workspace')::uuid,
  '10000000-0000-0000-0000-000000000081', '19800000-0000-4000-8000-000000000001',
  '29800000-0000-4000-8000-000000000001', now(), '99800000-0000-4000-8000-000000000001',
  'Lekcja D28', 60, 9000, 'PLN', 'online', now() + interval '10 days',
  now() + interval '10 days 1 hour', 'Europe/Warsaw', 'converted', 'public_booking',
  'Converted D28', 'converted-d28@example.test', repeat('e', 64), 'ciphertext-for-d28-converted-token'
);
set local role service_role;
select throws_ok(
  $$select * from public.reschedule_public_booking_by_token(repeat('e', 64), now() + interval '11 days')$$,
  'P0001', 'BOOKING_CONVERTED', 'converted booking cannot self-reschedule'
);
reset role;

insert into public.bookings (
  id, workspace_id, tutor_id, event_type_id, event_type_name, duration_minutes,
  price_grosz, currency, format, starts_at, ends_at, timezone, status, source,
  guest_name, guest_email, management_token_hash, management_token_ciphertext
) values (
  '99800000-0000-4000-8000-000000000015', current_setting('test.d28_workspace')::uuid,
  '10000000-0000-0000-0000-000000000081', '99800000-0000-4000-8000-000000000001',
  'Reminder D28', 60, 9000, 'PLN', 'online', now() + interval '23 hours',
  now() + interval '24 hours', 'Europe/Warsaw', 'confirmed', 'public_booking',
  'Reminder D28', 'reminder-d28@example.test', repeat('1', 64), 'ciphertext-for-d28-reminder-token'
);
set local role service_role;
select public.prepare_booking_reminders();
select public.prepare_booking_reminders();
reset role;
select is((select count(*)::integer from public.booking_reminder_deliveries where booking_id = '99800000-0000-4000-8000-000000000015'), 1, 'repeated scheduler preparation is send-once idempotent');

update public.bookings set starts_at = starts_at - interval '2 hours', ends_at = ends_at - interval '2 hours', rescheduled_at = now(), reschedule_count = 1 where id = '99800000-0000-4000-8000-000000000015';
set local role service_role;
select public.prepare_booking_reminders();
reset role;
select is((select status from public.booking_reminder_deliveries where booking_id = '99800000-0000-4000-8000-000000000015' order by created_at limit 1), 'skipped', 'reschedule invalidates the stale reminder');
select is((select count(*)::integer from public.booking_reminder_deliveries where booking_id = '99800000-0000-4000-8000-000000000015' and booking_starts_at = (select starts_at from public.bookings where id = '99800000-0000-4000-8000-000000000015')), 1, 'rescheduled time receives its own reminder identity');

update public.bookings set status = 'cancelled', cancelled_at = now(), cancelled_by = 'tutor' where id = '99800000-0000-4000-8000-000000000015';
set local role service_role;
select public.prepare_booking_reminders();
reset role;
select is((select count(*)::integer from public.booking_reminder_deliveries where booking_id = '99800000-0000-4000-8000-000000000015' and status in ('pending', 'failed', 'processing')), 0, 'cancelled booking has no future reminder');
select is((select count(*)::integer from public.booking_reminder_deliveries where booking_id = '99800000-0000-4000-8000-000000000014'), 0, 'converted booking never receives a public-booking reminder');

select * from finish();
rollback;
