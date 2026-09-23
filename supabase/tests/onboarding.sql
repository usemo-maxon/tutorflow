begin;
select plan(3);

select has_column(
  'public',
  'profiles',
  'onboarding_completed_at',
  'profiles stores the durable onboarding completion timestamp'
);

select ok(
  (
    select column_default is null
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'profiles'
      and column_name = 'onboarding_completed_at'
  ),
  'new profiles do not receive an onboarding completion default'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  'b5000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'new-onboarding@example.test', '', '{}',
  '{"full_name":"Nowy Tutor"}', now(), now()
);

select is(
  (
    select onboarding_completed_at
    from public.profiles
    where id = 'b5000000-0000-4000-8000-000000000001'
  ),
  null::timestamptz,
  'a profile created after L0.5 starts with incomplete onboarding'
);

select * from finish();
rollback;
