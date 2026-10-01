begin;
select plan(19);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('10000000-0000-0000-0000-000000000071', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'd27-a@example.test', '', '{}', '{"full_name":"D27 Anna"}', now(), now()),
  ('10000000-0000-0000-0000-000000000072', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'd27-b@example.test', '', '{}', '{"full_name":"D27 Ewa"}', now(), now());

select set_config('test.d27_workspace', (select id::text from public.workspaces where owner_user_id = '10000000-0000-0000-0000-000000000071'), true);
select set_config('test.d27_other_workspace', (select id::text from public.workspaces where owner_user_id = '10000000-0000-0000-0000-000000000072'), true);
select set_config('test.d27_slot', (date_trunc('day', now()) + interval '5 days 10 hours')::text, true);

insert into public.tutor_public_profiles (
  tutor_id, workspace_id, enabled, slug, public_name, city
) values
  ('10000000-0000-0000-0000-000000000071', current_setting('test.d27_workspace')::uuid, true, 'd27-anna', 'Anna Kowalska', 'Warszawa'),
  ('10000000-0000-0000-0000-000000000072', current_setting('test.d27_other_workspace')::uuid, true, 'd27-ewa', 'Ewa Nowak', 'Kraków');

insert into public.booking_availability_settings (
  tutor_id, workspace_id, minimum_notice_hours, booking_horizon_days,
  cancellation_notice_hours
) values
  ('10000000-0000-0000-0000-000000000071', current_setting('test.d27_workspace')::uuid, 0, 30, 24),
  ('10000000-0000-0000-0000-000000000072', current_setting('test.d27_other_workspace')::uuid, 0, 30, 24);

insert into public.booking_event_types (
  id, workspace_id, tutor_id, name, duration_minutes, price_grosz,
  currency, format, is_active, is_public
) values
  ('99700000-0000-4000-8000-000000000001', current_setting('test.d27_workspace')::uuid, '10000000-0000-0000-0000-000000000071', 'Lekcja indywidualna', 60, 9000, 'PLN', 'online', true, true),
  ('99700000-0000-4000-8000-000000000002', current_setting('test.d27_other_workspace')::uuid, '10000000-0000-0000-0000-000000000072', 'Cudza lekcja', 60, 9000, 'PLN', 'online', true, true);

select has_column('public', 'bookings', 'management_token_hash', 'booking stores a token hash');
select has_column('public', 'bookings', 'cancelled_at', 'booking stores cancellation history');
select has_column('public', 'booking_availability_settings', 'cancellation_notice_hours', 'tutor has a cancellation deadline setting');
select ok(not has_function_privilege('anon', 'public.get_public_booking_by_token(text)', 'execute'), 'anonymous Data API cannot read by token directly');
select ok(has_function_privilege('service_role', 'public.get_public_booking_by_token(text)', 'execute'), 'trusted server can read by token hash');
select ok(not has_function_privilege('anon', 'public.cancel_public_booking_by_token(text)', 'execute'), 'anonymous Data API cannot cancel directly');

set local role service_role;
select lives_ok(format($sql$
  select * from public.create_public_booking(
    'd27-anna', '99700000-0000-4000-8000-000000000001', %L::timestamptz,
    'Jan Gość', 'jan@example.test', null, null, null, null,
    repeat('a', 64)
  )
$sql$, current_setting('test.d27_slot')), 'booking with a hashed management token is created');

select is((
  select count(*)::integer from public.get_public_booking_by_token(repeat('a', 64))
), 1, 'valid token hash grants one-booking access');
select is((
  select tutor_public_name from public.get_public_booking_by_token(repeat('a', 64))
), 'Anna Kowalska', 'token returns only its tutor-facing booking');
select is((
  select count(*)::integer from public.get_public_booking_by_token(repeat('f', 64))
), 0, 'invalid token hash returns no booking');

select is(
  public.cancel_public_booking_by_token(repeat('a', 64))::text,
  'cancelled',
  'confirmed booking can be cancelled by its token'
);
reset role;
select results_eq(
  $$select status::text, cancelled_by from public.bookings where management_token_hash = repeat('a', 64)$$,
  $$values ('cancelled'::text, 'guest'::text)$$,
  'canonical transition preserves booking and cancellation actor'
);
select ok((select cancelled_at is not null from public.bookings where management_token_hash = repeat('a', 64)), 'cancellation timestamp is retained');
select ok(exists (
  select 1 from public.get_public_tutor_availability(
    'd27-anna', '99700000-0000-4000-8000-000000000001',
    (current_setting('test.d27_slot')::timestamptz at time zone 'Europe/Warsaw')::date,
    (current_setting('test.d27_slot')::timestamptz at time zone 'Europe/Warsaw')::date
  ) where starts_at = current_setting('test.d27_slot')::timestamptz
), 'cancelled booking immediately reopens public availability');

insert into public.bookings (
  id, workspace_id, tutor_id, event_type_id, event_type_name, duration_minutes,
  price_grosz, currency, format, starts_at, ends_at, timezone, status, source,
  guest_name, guest_email, management_token_hash
) values
  ('99700000-0000-4000-8000-000000000011', current_setting('test.d27_workspace')::uuid, '10000000-0000-0000-0000-000000000071', '99700000-0000-4000-8000-000000000001', 'Lekcja indywidualna', 60, 9000, 'PLN', 'online', now() + interval '12 hours', now() + interval '13 hours', 'Europe/Warsaw', 'confirmed', 'public_booking', 'Za późno', 'late@example.test', repeat('b', 64)),
  ('99700000-0000-4000-8000-000000000012', current_setting('test.d27_workspace')::uuid, '10000000-0000-0000-0000-000000000071', '99700000-0000-4000-8000-000000000001', 'Lekcja indywidualna', 60, 9000, 'PLN', 'online', now() + interval '8 days', now() + interval '8 days 1 hour', 'Europe/Warsaw', 'confirmed', 'public_booking', 'Tutor cancel', 'tutor@example.test', repeat('c', 64)),
  ('99700000-0000-4000-8000-000000000013', current_setting('test.d27_other_workspace')::uuid, '10000000-0000-0000-0000-000000000072', '99700000-0000-4000-8000-000000000002', 'Cudza lekcja', 60, 9000, 'PLN', 'online', now() + interval '9 days', now() + interval '9 days 1 hour', 'Europe/Warsaw', 'confirmed', 'public_booking', 'Cudzy gość', 'other@example.test', repeat('d', 64));

set local role service_role;
select throws_ok(
  $$select public.cancel_public_booking_by_token(repeat('b', 64))$$,
  'P0001', 'BOOKING_CANCELLATION_DEADLINE',
  'guest cancellation deadline is enforced by exact timestamps'
);
reset role;

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000071","role":"authenticated"}';
select is(
  public.cancel_public_booking_as_tutor('99700000-0000-4000-8000-000000000012')::text,
  'cancelled',
  'tutor cancellation uses the canonical transition'
);
select throws_ok(
  $$select public.cancel_public_booking_as_tutor('99700000-0000-4000-8000-000000000013')$$,
  'P0002', 'BOOKING_UNAVAILABLE',
  'tutor cannot cancel another workspace booking'
);
reset role;

insert into public.students (
  id, workspace_id, first_name, display_name
) values (
  '19700000-0000-4000-8000-000000000001', current_setting('test.d27_workspace')::uuid,
  'Converted', 'Converted Student'
);
insert into public.lessons (
  id, workspace_id, tutor_id, student_id, starts_at, ends_at, timezone, title
) values (
  '29700000-0000-4000-8000-000000000001', current_setting('test.d27_workspace')::uuid,
  '10000000-0000-0000-0000-000000000071', '19700000-0000-4000-8000-000000000001',
  now() + interval '10 days', now() + interval '10 days 1 hour', 'Europe/Warsaw', 'Converted lesson'
);
insert into public.bookings (
  id, workspace_id, tutor_id, student_id, converted_lesson_id, converted_at,
  event_type_id, event_type_name, duration_minutes, price_grosz, currency,
  format, starts_at, ends_at, timezone, status, source, guest_name, guest_email,
  management_token_hash
) values (
  '99700000-0000-4000-8000-000000000014', current_setting('test.d27_workspace')::uuid,
  '10000000-0000-0000-0000-000000000071', '19700000-0000-4000-8000-000000000001',
  '29700000-0000-4000-8000-000000000001', now(),
  '99700000-0000-4000-8000-000000000001', 'Lekcja indywidualna', 60, 9000,
  'PLN', 'online', now() + interval '10 days', now() + interval '10 days 1 hour',
  'Europe/Warsaw', 'converted', 'public_booking', 'Converted', 'converted@example.test', repeat('e', 64)
);
set local role service_role;
select throws_ok(
  $$select public.cancel_public_booking_by_token(repeat('e', 64))$$,
  'P0001', 'BOOKING_CONVERTED',
  'converted booking cannot be anonymously cancelled'
);
reset role;

select is((select count(*)::integer from public.bookings where id = '99700000-0000-4000-8000-000000000014' and status = 'converted'), 1, 'converted booking and lesson remain unchanged');

select * from finish();
rollback;
