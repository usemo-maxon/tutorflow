begin;
select plan(9);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'booking-one@example.test', '', '{}', '{"full_name":"Booking one"}', now(), now()),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'booking-two@example.test', '', '{}', '{"full_name":"Booking two"}', now(), now());

select set_config('test.workspace_one', (select id::text from public.workspaces where owner_user_id = '10000000-0000-0000-0000-000000000001'), true);
select set_config('test.workspace_two', (select id::text from public.workspaces where owner_user_id = '10000000-0000-0000-0000-000000000002'), true);

insert into public.tutor_public_profiles (
  tutor_id, workspace_id, enabled, slug, public_name
) values (
  '10000000-0000-0000-0000-000000000001', current_setting('test.workspace_one')::uuid,
  true, 'd2-2-public-test', 'Tutor testowy'
);

insert into public.booking_event_types (
  id, workspace_id, tutor_id, name, duration_minutes, price_grosz, currency, format, is_active, is_public, display_order
) values
  ('99300000-0000-4000-8000-000000000001', current_setting('test.workspace_one')::uuid, '10000000-0000-0000-0000-000000000001', 'Pierwsze spotkanie', 30, 0, 'PLN', 'online', true, true, 0),
  ('99300000-0000-4000-8000-000000000002', current_setting('test.workspace_one')::uuid, '10000000-0000-0000-0000-000000000001', 'Ukryta lekcja', 60, 9000, 'PLN', 'offline', false, true, 1),
  ('99300000-0000-4000-8000-000000000003', current_setting('test.workspace_one')::uuid, '10000000-0000-0000-0000-000000000001', 'Konwersacje', 50, 8000, 'PLN', 'online', true, true, 2);

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select is((select count(*)::integer from public.booking_event_types), 3, 'owner can manage own event types');
select lives_ok($$ update public.booking_event_types set name = 'Wstęp' where id = '99300000-0000-4000-8000-000000000001' $$, 'owner can edit an event type');
select lives_ok($$ update public.booking_event_types set is_active = false where id = '99300000-0000-4000-8000-000000000003' $$, 'owner can disable an event type');
select lives_ok($$ update public.booking_event_types set display_order = 9 where id = '99300000-0000-4000-8000-000000000001' $$, 'owner can change display order');

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000002","role":"authenticated"}';
select is((select count(*)::integer from public.booking_event_types), 0, 'other workspace cannot read event types');
select lives_ok($$ update public.booking_event_types set name = 'Przejęte' where id = '99300000-0000-4000-8000-000000000001' $$, 'cross-workspace mutation cannot target a row');

set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select is((select name from public.booking_event_types where id = '99300000-0000-4000-8000-000000000001'), 'Wstęp', 'cross-workspace mutation leaves the event type unchanged');

select is((select jsonb_array_length(event_types) from public.get_published_tutor_profile('d2-2-public-test') limit 1), 1, 'public DTO hides disabled event types');
select ok(not (select (event_types -> 0) ? 'isActive' from public.get_published_tutor_profile('d2-2-public-test') limit 1), 'public DTO excludes private state');

select * from finish();
rollback;
