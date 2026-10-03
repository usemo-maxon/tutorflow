begin;
select plan(6);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '10000000-0000-0000-0000-000000000091', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'd29@example.test', '', '{}', '{"full_name":"D29 Anna"}', now(), now()
);

select set_config('test.d29_workspace', (select id::text from public.workspaces where owner_user_id = '10000000-0000-0000-0000-000000000091'), true);
select set_config('test.d29_slot', (date_trunc('day', now()) + interval '5 days 10 hours')::text, true);

insert into public.tutor_public_profiles (tutor_id, workspace_id, enabled, slug, public_name, city)
values ('10000000-0000-0000-0000-000000000091', current_setting('test.d29_workspace')::uuid, true, 'd29-anna', 'Anna Kowalska', 'Warszawa');
insert into public.booking_availability_settings (tutor_id, workspace_id, minimum_notice_hours, booking_horizon_days, cancellation_notice_hours)
values ('10000000-0000-0000-0000-000000000091', current_setting('test.d29_workspace')::uuid, 0, 30, 24);
insert into public.booking_event_types (id, workspace_id, tutor_id, name, duration_minutes, price_grosz, currency, format, is_active, is_public)
values ('99900000-0000-4000-8000-000000000001', current_setting('test.d29_workspace')::uuid, '10000000-0000-0000-0000-000000000091', 'Lekcja indywidualna', 60, 9000, 'PLN', 'online', true, true);

select has_column('public', 'bookings', 'acquisition_source', 'booking acquisition source is stored');
select ok(not has_function_privilege('anon', 'public.create_public_booking(text,uuid,timestamptz,text,text,text,text,text,text,text,text,text,text,text,text)', 'execute'), 'anonymous callers cannot execute the analytics booking mutation');
select ok(has_function_privilege('service_role', 'public.create_public_booking(text,uuid,timestamptz,text,text,text,text,text,text,text,text,text,text,text,text)', 'execute'), 'trusted server can execute the analytics booking mutation');

set local role service_role;
select lives_ok(format($sql$
  select * from public.create_public_booking(
    'd29-anna', '99900000-0000-4000-8000-000000000001', %L::timestamptz,
    'Jan Gość', 'jan@example.test', null, null, null, null, repeat('a', 64), repeat('x', 20),
    'Instagram', 'Summer', 'Social', 'Launch'
  )
$sql$, current_setting('test.d29_slot')), 'analytics booking wrapper returns the delegated booking result');
reset role;

select results_eq(
  $$select acquisition_source, utm_source, utm_medium, utm_campaign from public.bookings where management_token_hash = repeat('a', 64)$$,
  $$values ('instagram'::text, 'summer'::text, 'social'::text, 'launch'::text)$$,
  'analytics attributes are normalized and persisted'
);
select is((select count(*)::integer from public.bookings where management_token_hash = repeat('a', 64)), 1, 'analytics wrapper creates exactly one booking');

select * from finish();
rollback;
