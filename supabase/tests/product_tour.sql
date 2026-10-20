begin;
select plan(7);

select has_table('public', 'product_tour_states', 'product tour state is durable');

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('b6000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tour-one@example.test', '', '{}', '{"full_name":"Tutor One"}', now(), now()),
  ('b6000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tour-two@example.test', '', '{}', '{"full_name":"Tutor Two"}', now(), now());

select is(
  (select count(*)::integer from public.product_tour_states where user_id = 'b6000000-0000-4000-8000-000000000001'),
  0,
  'new users begin without a tour row and may receive the invitation'
);

set local role authenticated;
set local request.jwt.claim.sub = 'b6000000-0000-4000-8000-000000000001';

insert into public.product_tour_states (user_id, version, status, current_step)
values ('b6000000-0000-4000-8000-000000000001', 1, 'in_progress', 2);

select is(
  (select status from public.product_tour_states where user_id = 'b6000000-0000-4000-8000-000000000001'),
  'in_progress',
  'a user can read their own progress'
);

select is(
  (select current_step from public.product_tour_states where user_id = 'b6000000-0000-4000-8000-000000000001'),
  2,
  'in-progress step is persisted for another device'
);

select throws_ok(
  $$insert into public.product_tour_states (user_id, version, status) values ('b6000000-0000-4000-8000-000000000002', 1, 'skipped')$$,
  '42501',
  null,
  'a user cannot write another user tour state'
);

select is(
  (select count(*)::integer from public.product_tour_states where user_id = 'b6000000-0000-4000-8000-000000000002'),
  0,
  'a user cannot read another user tour state'
);

update public.product_tour_states set status = 'completed', current_step = 6
where user_id = 'b6000000-0000-4000-8000-000000000001';

select is(
  (select status from public.product_tour_states where user_id = 'b6000000-0000-4000-8000-000000000001'),
  'completed',
  'a user can complete their own tour'
);

select * from finish();
rollback;

