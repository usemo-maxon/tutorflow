begin;
select plan(26);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('10000000-0000-0000-0000-000000000051', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'booking-d25-a@example.test', '', '{}', '{"full_name":"D25 Tutor"}', now(), now()),
  ('10000000-0000-0000-0000-000000000052', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'booking-d25-b@example.test', '', '{}', '{"full_name":"D25 Other"}', now(), now());

select set_config('test.d25_workspace', (select id::text from public.workspaces where owner_user_id = '10000000-0000-0000-0000-000000000051'), true);
select set_config('test.d25_other_workspace', (select id::text from public.workspaces where owner_user_id = '10000000-0000-0000-0000-000000000052'), true);
select set_config('test.d25_slot', (date_trunc('day', now()) + interval '3 days 10 hours')::text, true);

update public.subscriptions set status = 'active', tier = 'free', read_only = false
where teacher_id = '10000000-0000-0000-0000-000000000051';

insert into public.booking_event_types (
  id, workspace_id, tutor_id, name, duration_minutes, price_grosz,
  currency, format, is_active, is_public
) values
(
  '99500000-0000-4000-8000-000000000001', current_setting('test.d25_workspace')::uuid,
  '10000000-0000-0000-0000-000000000051', 'Konwersacje', 60, 9000,
  'PLN', 'online', true, true
),
(
  '99500000-0000-4000-8000-000000000002', current_setting('test.d25_other_workspace')::uuid,
  '10000000-0000-0000-0000-000000000052', 'Cudza oferta', 60, 9000,
  'PLN', 'online', true, true
);

insert into public.bookings (
  id, workspace_id, tutor_id, event_type_id, event_type_name, duration_minutes,
  price_grosz, currency, format, starts_at, ends_at, timezone, status, source,
  guest_name, guest_email, guest_phone, guest_level, guest_goal, guest_message
) values
  ('99500000-0000-4000-8000-000000000011', current_setting('test.d25_workspace')::uuid,
   '10000000-0000-0000-0000-000000000051', '99500000-0000-4000-8000-000000000001',
   'Konwersacje', 60, 9000, 'PLN', 'online', current_setting('test.d25_slot')::timestamptz,
   current_setting('test.d25_slot')::timestamptz + interval '1 hour', 'Europe/Warsaw',
   'confirmed', 'public_booking', 'Jan Kowalski', 'jan@example.com', '+48500000000', 'B1',
   'Swobodne rozmowy', 'Historyczna wiadomość'),
  ('99500000-0000-4000-8000-000000000012', current_setting('test.d25_workspace')::uuid,
   '10000000-0000-0000-0000-000000000051', '99500000-0000-4000-8000-000000000001',
   'Konwersacje', 60, 9000, 'PLN', 'online', current_setting('test.d25_slot')::timestamptz + interval '2 hours',
   current_setting('test.d25_slot')::timestamptz + interval '3 hours', 'Europe/Warsaw',
   'confirmed', 'public_booking', 'Ewa Nowak', 'ewa@example.com', null, 'A2', 'Egzamin', null),
  ('99500000-0000-4000-8000-000000000013', current_setting('test.d25_other_workspace')::uuid,
   '10000000-0000-0000-0000-000000000052', '99500000-0000-4000-8000-000000000002', 'Cudza oferta', 60, 9000, 'PLN', 'online',
   current_setting('test.d25_slot')::timestamptz + interval '4 hours',
   current_setting('test.d25_slot')::timestamptz + interval '5 hours', 'Europe/Warsaw',
   'confirmed', 'public_booking', 'Cudzy Gość', 'other@example.com', null, null, null, null),
  ('99500000-0000-4000-8000-000000000014', current_setting('test.d25_workspace')::uuid,
   '10000000-0000-0000-0000-000000000051', '99500000-0000-4000-8000-000000000001',
   'Konwersacje', 60, 9000, 'PLN', 'online', current_setting('test.d25_slot')::timestamptz + interval '6 hours',
   current_setting('test.d25_slot')::timestamptz + interval '7 hours', 'Europe/Warsaw',
   'confirmed', 'public_booking', 'Konflikt Gość', 'conflict@example.com', null, null, null, null);

select has_column('public', 'bookings', 'converted_at', 'booking has durable converted timestamp');
select ok(has_function_privilege('authenticated', 'public.convert_public_booking(uuid,text,uuid,jsonb)', 'execute'), 'authenticated tutor can call conversion RPC');
select ok(not has_function_privilege('anon', 'public.convert_public_booking(uuid,text,uuid,jsonb)', 'execute'), 'public visitor cannot call conversion RPC');

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000051","role":"authenticated"}';

select lives_ok($$
  select public.convert_public_booking(
    '99500000-0000-4000-8000-000000000011', 'new', null,
    '{"firstName":"Jan","lastName":"Kowalski","email":"jan@example.com","phone":"+48500000000","level":"B1","goal":"Swobodne rozmowy"}'::jsonb
  )
$$, 'new Student conversion succeeds');

select is((select status::text from public.bookings where id = '99500000-0000-4000-8000-000000000011'), 'converted', 'booking becomes converted');
select ok((select student_id is not null and converted_lesson_id is not null and converted_at is not null from public.bookings where id = '99500000-0000-4000-8000-000000000011'), 'booking retains Student Lesson and timestamp references');
select is((select guest_message from public.bookings where id = '99500000-0000-4000-8000-000000000011'), 'Historyczna wiadomość', 'guest acquisition history remains on booking');
select is((select count(*)::integer from public.students where workspace_id = current_setting('test.d25_workspace')::uuid), 1, 'one normal Student was created');
select results_eq(
  $$select level, goal from public.students where workspace_id = current_setting('test.d25_workspace')::uuid$$,
  $$values ('B1'::text, 'Swobodne rozmowy'::text)$$,
  'only appropriate learning profile data is mapped'
);
select is((select count(*)::integer from public.lessons where client_request_id = '99500000-0000-4000-8000-000000000011'), 1, 'one normal Lesson was created');
select is((select count(*)::integer from public.lesson_participants participant join public.bookings booking on booking.converted_lesson_id = participant.lesson_id where booking.id = '99500000-0000-4000-8000-000000000011' and participant.student_id = booking.student_id), 1, 'Lesson participant matches booking Student');
select is((select count(*)::integer from public.attendances attendance join public.bookings booking on booking.converted_lesson_id = attendance.lesson_id where booking.id = '99500000-0000-4000-8000-000000000011' and attendance.student_id = booking.student_id), 1, 'normal attendance record is created');

select is((public.convert_public_booking('99500000-0000-4000-8000-000000000011', 'new', null, '{}'::jsonb)->>'alreadyConverted')::boolean, true, 'retry returns existing conversion result');
select is((select count(*)::integer from public.students where workspace_id = current_setting('test.d25_workspace')::uuid), 1, 'retry creates no duplicate Student');
select is((select count(*)::integer from public.lessons where client_request_id = '99500000-0000-4000-8000-000000000011'), 1, 'retry creates no duplicate Lesson');

select throws_ok($$
  select public.convert_public_booking('99500000-0000-4000-8000-000000000013', 'new', null, '{"firstName":"Cudzy"}'::jsonb)
$$, 'P0002', 'BOOKING_NOT_FOUND', 'cross-workspace booking is hidden');

reset role;
insert into public.students (id, workspace_id, first_name, display_name)
values
  ('19500000-0000-4000-8000-000000000001', current_setting('test.d25_workspace')::uuid, 'Drugi', 'Drugi'),
  ('19500000-0000-4000-8000-000000000002', current_setting('test.d25_workspace')::uuid, 'Trzeci', 'Trzeci'),
  ('19500000-0000-4000-8000-000000000003', current_setting('test.d25_other_workspace')::uuid, 'Cudzy', 'Cudzy');
set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000051","role":"authenticated"}';

select throws_ok($$
  select public.convert_public_booking('99500000-0000-4000-8000-000000000012', 'existing', '19500000-0000-4000-8000-000000000003', '{}'::jsonb)
$$, 'P0002', 'BOOKING_NOT_FOUND', 'cross-workspace Student cannot be linked');

select throws_ok($$
  select public.convert_public_booking('99500000-0000-4000-8000-000000000012', 'new', null, '{"firstName":"Czwarty"}'::jsonb)
$$, 'P0001', 'STUDENT_LIMIT_REACHED', 'Free active Student limit blocks conversion');
select is((select status::text from public.bookings where id = '99500000-0000-4000-8000-000000000012'), 'confirmed', 'limited booking remains confirmed');
select is((select guest_email from public.bookings where id = '99500000-0000-4000-8000-000000000012'), 'ewa@example.com', 'limited booking retains guest data');

select lives_ok($$
  select public.convert_public_booking('99500000-0000-4000-8000-000000000012', 'existing', '19500000-0000-4000-8000-000000000001', '{}'::jsonb)
$$, 'linking an existing active Student is allowed at the Free limit');
select is((select student_id from public.bookings where id = '99500000-0000-4000-8000-000000000012'), '19500000-0000-4000-8000-000000000001'::uuid, 'existing Student is explicitly linked');

insert into public.calendar_blocks (
  workspace_id, tutor_id, title, starts_at, ends_at, timezone
) values (
  current_setting('test.d25_workspace')::uuid, '10000000-0000-0000-0000-000000000051',
  'Późniejsza blokada', current_setting('test.d25_slot')::timestamptz + interval '6 hours',
  current_setting('test.d25_slot')::timestamptz + interval '7 hours', 'Europe/Warsaw'
);
select throws_ok($$
  select public.convert_public_booking('99500000-0000-4000-8000-000000000014', 'new', null, '{"firstName":"Konflikt"}'::jsonb)
$$, '23P01', 'BOOKING_CONFLICT', 'a real conflict introduced after booking blocks conversion');
select is((select status::text from public.bookings where id = '99500000-0000-4000-8000-000000000014'), 'confirmed', 'failed conversion rolls booking back to confirmed');
select is((select count(*)::integer from public.students where display_name = 'Konflikt' and workspace_id = current_setting('test.d25_workspace')::uuid), 0, 'failed conversion leaves no half-created Student');
select is((select count(*)::integer from public.lessons where client_request_id = '99500000-0000-4000-8000-000000000014'), 0, 'failed conversion leaves no half-created Lesson');

reset role;
select * from finish();
rollback;
