begin;
select plan(7);

insert into auth.users (id, instance_id, aud, role, email, encrypted_password, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'one@example.test', '', '{}', '{"full_name":"One"}', now(), now()),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'two@example.test', '', '{}', '{"full_name":"Two"}', now(), now()),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'admin@example.test', '', '{}', '{"full_name":"Admin"}', now(), now());
update public.profiles set role = 'admin' where id = '10000000-0000-0000-0000-000000000003';

set local role authenticated;
set local request.jwt.claims = '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}';
select is((select count(*)::integer from public.teacher_states), 1, 'teacher sees only own private state');
select is((select count(*)::integer from public.profiles), 1, 'teacher sees only own profile');
select is((select count(*)::integer from public.subscriptions), 1, 'teacher sees only own subscription');
select lives_ok($$update public.teacher_states set state = state where teacher_id = '10000000-0000-0000-0000-000000000002'$$, 'cross-tenant update is safely filtered');
select is((select version::integer from public.teacher_states where teacher_id = '10000000-0000-0000-0000-000000000002'), null, 'teacher cannot read another teacher state');

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
