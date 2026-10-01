begin;
select plan(17);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('10000000-0000-0000-0000-000000000041', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'booking-d24-a@example.test', '', '{}', '{"full_name":"Anna Booking"}', now(), now()),
  ('10000000-0000-0000-0000-000000000042', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'booking-d24-b@example.test', '', '{}', '{"full_name":"Other Booking"}', now(), now());

select set_config('test.booking_workspace', (select id::text from public.workspaces where owner_user_id = '10000000-0000-0000-0000-000000000041'), true);
select set_config('test.booking_slot', (date_trunc('day', now()) + interval '2 days 10 hours')::text, true);
select set_config('test.lesson_slot', (date_trunc('day', now()) + interval '3 days 10 hours')::text, true);
select set_config('test.block_slot', (date_trunc('day', now()) + interval '4 days 10 hours')::text, true);
select set_config('test.students_before', (select count(*)::text from public.students), true);

insert into public.tutor_public_profiles (
  tutor_id, workspace_id, enabled, slug, public_name
) values
  ('10000000-0000-0000-0000-000000000041', current_setting('test.booking_workspace')::uuid, true, 'anna-booking-d24', 'Anna Booking'),
  ('10000000-0000-0000-0000-000000000042', (select id from public.workspaces where owner_user_id = '10000000-0000-0000-0000-000000000042'), true, 'other-booking-d24', 'Other Booking');

insert into public.booking_availability_settings (
  tutor_id, workspace_id, minimum_notice_hours, booking_horizon_days
) values (
  '10000000-0000-0000-0000-000000000041', current_setting('test.booking_workspace')::uuid, 0, 30
);

insert into public.booking_event_types (
  id, workspace_id, tutor_id, name, duration_minutes, price_grosz,
  currency, format, is_active, is_public
) values
  ('99400000-0000-4000-8000-000000000001', current_setting('test.booking_workspace')::uuid, '10000000-0000-0000-0000-000000000041', 'Lekcja indywidualna', 60, 9000, 'PLN', 'online', true, true),
  ('99400000-0000-4000-8000-000000000002', current_setting('test.booking_workspace')::uuid, '10000000-0000-0000-0000-000000000041', 'Ukryta', 45, 7000, 'PLN', 'online', true, false),
  ('99400000-0000-4000-8000-000000000003', (select id from public.workspaces where owner_user_id = '10000000-0000-0000-0000-000000000042'), '10000000-0000-0000-0000-000000000042', 'Cudza', 30, 5000, 'PLN', 'online', true, true);

select has_column('public', 'bookings', 'guest_name', 'bookings retain guest data');
select ok(exists (
  select 1
  from pg_catalog.pg_constraint constraint_record
  join pg_catalog.pg_class table_record on table_record.oid = constraint_record.conrelid
  join pg_catalog.pg_namespace schema_record on schema_record.oid = table_record.relnamespace
  where schema_record.nspname = 'public' and table_record.relname = 'bookings'
    and constraint_record.conname = 'bookings_tutor_active_time_excl'
    and constraint_record.contype = 'x'
), 'active booking overlap has a database constraint');
select ok(not has_function_privilege('anon', 'public.create_public_booking(text,uuid,timestamptz,text,text,text,text,text,text)', 'execute'), 'anonymous callers cannot execute the booking mutation');
select ok(has_function_privilege('service_role', 'public.create_public_booking(text,uuid,timestamptz,text,text,text,text,text,text)', 'execute'), 'trusted server role can execute the booking mutation');

set local role anon;
select throws_ok($$
  insert into public.bookings (workspace_id, tutor_id, starts_at, ends_at, timezone)
  values (current_setting('test.booking_workspace')::uuid, '10000000-0000-0000-0000-000000000041', now() + interval '10 days', now() + interval '10 days 1 hour', 'Europe/Warsaw')
$$, '42501', null, 'anonymous visitors cannot insert arbitrary booking rows');
reset role;

set local role service_role;
select lives_ok(format($sql$
  select * from public.create_public_booking(
    'anna-booking-d24', '99400000-0000-4000-8000-000000000001', %L::timestamptz,
    'Jan Gość', ' JAN@EXAMPLE.COM ', '+48 500 000 000', 'B1', 'Konwersacje', 'Dzień dobry'
  )
$sql$, current_setting('test.booking_slot')), 'a valid public booking succeeds');
reset role;

select is((select count(*)::integer from public.bookings where source = 'public_booking'), 1, 'one public booking is persisted');
select results_eq(
  $$select duration_minutes, price_grosz, currency, format, status::text, guest_email from public.bookings where source = 'public_booking'$$,
  $$values (60, 9000::bigint, 'PLN'::text, 'online'::text, 'confirmed'::text, 'jan@example.com'::text)$$,
  'event type values are snapshotted and authoritative'
);
select is((select count(*)::integer from public.students), current_setting('test.students_before')::integer, 'booking does not create a Student');
set local role service_role;
select is((
  select count(*)::integer
  from public.create_public_booking(
    'anna-booking-d24', '99400000-0000-4000-8000-000000000001',
    current_setting('test.booking_slot')::timestamptz + interval '2 hours',
    'Pola', 'pola@example.com'
  ) result_row
  cross join lateral jsonb_object_keys(to_jsonb(result_row))
), 6, 'successful response exposes only confirmation fields');
reset role;

select is((
  select count(*)::integer
  from public.get_public_tutor_availability(
    'anna-booking-d24', '99400000-0000-4000-8000-000000000001',
    (current_setting('test.booking_slot')::timestamptz at time zone 'Europe/Warsaw')::date,
    (current_setting('test.booking_slot')::timestamptz at time zone 'Europe/Warsaw')::date
  )
  where starts_at = current_setting('test.booking_slot')::timestamptz
), 0, 'a successful booking immediately blocks public availability');

set local role service_role;
select throws_ok(format($sql$
  select * from public.create_public_booking(
    'anna-booking-d24', '99400000-0000-4000-8000-000000000001', %L::timestamptz,
    'Drugi Gość', 'drugi@example.com'
  )
$sql$, current_setting('test.booking_slot')), 'P0001', 'PUBLIC_BOOKING_SLOT_UNAVAILABLE', 'the same slot cannot be booked twice');
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000041","role":"authenticated"}';
select throws_ok(format($sql$
  insert into public.bookings (
    workspace_id, tutor_id, event_type_id, event_type_name, duration_minutes,
    price_grosz, currency, format, starts_at, ends_at, timezone, status, source,
    guest_name, guest_email
  ) values (
    %L::uuid, '10000000-0000-0000-0000-000000000041', '99400000-0000-4000-8000-000000000001',
    'Lekcja indywidualna', 60, 9000, 'PLN', 'online', %L::timestamptz + interval '30 minutes',
    %L::timestamptz + interval '90 minutes', 'Europe/Warsaw', 'confirmed', 'public_booking',
    'Wyścig', 'race@example.com'
  )
$sql$, current_setting('test.booking_workspace'), current_setting('test.booking_slot'), current_setting('test.booking_slot')), '23P01', null, 'database overlap invariant rejects a racing insert');
reset role;

set local role service_role;
select throws_ok(format($sql$
  select * from public.create_public_booking('anna-booking-d24', '99400000-0000-4000-8000-000000000002', %L::timestamptz, 'Gość', 'guest@example.com')
$sql$, current_setting('test.lesson_slot')), 'P0001', 'PUBLIC_BOOKING_OFFER_NOT_FOUND', 'unpublished event type is rejected');
select throws_ok(format($sql$
  select * from public.create_public_booking('anna-booking-d24', '99400000-0000-4000-8000-000000000003', %L::timestamptz, 'Gość', 'guest@example.com')
$sql$, current_setting('test.lesson_slot')), 'P0001', 'PUBLIC_BOOKING_OFFER_NOT_FOUND', 'cross-workspace event type is rejected');
reset role;

insert into public.students (
  id, workspace_id, first_name, display_name
) values (
  '19400000-0000-4000-8000-000000000001', current_setting('test.booking_workspace')::uuid, 'Fixture', 'Fixture Student'
);
insert into public.lessons (
  workspace_id, tutor_id, student_id, starts_at, ends_at, timezone, title
) values (
  current_setting('test.booking_workspace')::uuid, '10000000-0000-0000-0000-000000000041',
  '19400000-0000-4000-8000-000000000001', current_setting('test.lesson_slot')::timestamptz,
  current_setting('test.lesson_slot')::timestamptz + interval '1 hour', 'Europe/Warsaw', 'Konflikt'
);
set local role service_role;
select throws_ok(format($sql$
  select * from public.create_public_booking('anna-booking-d24', '99400000-0000-4000-8000-000000000001', %L::timestamptz, 'Gość', 'guest@example.com')
$sql$, current_setting('test.lesson_slot')), 'P0001', 'PUBLIC_BOOKING_SLOT_UNAVAILABLE', 'lesson conflict prevents booking');
reset role;

insert into public.calendar_blocks (
  workspace_id, tutor_id, starts_at, ends_at, timezone, title
) values (
  current_setting('test.booking_workspace')::uuid, '10000000-0000-0000-0000-000000000041',
  current_setting('test.block_slot')::timestamptz,
  current_setting('test.block_slot')::timestamptz + interval '1 hour', 'Europe/Warsaw', 'Zajęty'
);
set local role service_role;
select throws_ok(format($sql$
  select * from public.create_public_booking('anna-booking-d24', '99400000-0000-4000-8000-000000000001', %L::timestamptz, 'Gość', 'guest@example.com')
$sql$, current_setting('test.block_slot')), 'P0001', 'PUBLIC_BOOKING_SLOT_UNAVAILABLE', 'calendar block conflict prevents booking');
reset role;

select * from finish();
rollback;
