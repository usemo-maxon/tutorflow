begin;
select plan(22);

select is(
  private.subscription_tier_from_legacy_plan('trial'),
  'free'::text,
  'legacy trial maps to the free tier'
);
select is(
  private.billing_interval_from_legacy_plan('trial'),
  null::text,
  'legacy trial maps to no billing interval'
);
select is(
  private.subscription_tier_from_legacy_plan('monthly') || '/' ||
    private.billing_interval_from_legacy_plan('monthly'),
  'pro/monthly'::text,
  'legacy monthly maps to pro monthly'
);
select is(
  private.subscription_tier_from_legacy_plan('annual') || '/' ||
    private.billing_interval_from_legacy_plan('annual'),
  'pro/annual'::text,
  'legacy annual maps to pro annual'
);
select is(
  private.subscription_tier_from_legacy_plan('founder') || '/' ||
    private.billing_interval_from_legacy_plan('founder'),
  'founder/monthly'::text,
  'legacy founder maps to founder monthly'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('a3000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'l03-founder@example.test', '', '{}', '{"full_name":"Founder"}', now(), now()),
  ('a3000000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'l03-annual@example.test', '', '{}', '{"full_name":"Annual"}', now(), now()),
  ('a3000000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'l03-monthly@example.test', '', '{}', '{"full_name":"Monthly"}', now(), now());

select is(
  (select status from public.subscriptions where teacher_id = 'a3000000-0000-4000-8000-000000000001'),
  'trial'::text,
  'new users retain trial status'
);
select is(
  (select tier from public.subscriptions where teacher_id = 'a3000000-0000-4000-8000-000000000001'),
  'free'::text,
  'new users receive the free tier'
);
select is(
  (select billing_interval from public.subscriptions where teacher_id = 'a3000000-0000-4000-8000-000000000001'),
  null::text,
  'new users have no billing interval'
);

insert into public.payu_orders (
  teacher_id, ext_order_id, plan, amount_grosz, status
) values (
  'a3000000-0000-4000-8000-000000000001',
  'l03-founder-order',
  'monthly',
  3900,
  'pending'
);
select lives_ok(
  $$select public.confirm_payu_order('l03-founder-order', 'l03-founder-payu')$$,
  'monthly completion can award Founder'
);
select is(
  (select plan from public.subscriptions where teacher_id = 'a3000000-0000-4000-8000-000000000001'),
  'founder'::text,
  'Founder award retains the legacy founder plan'
);
select is(
  (select tier from public.subscriptions where teacher_id = 'a3000000-0000-4000-8000-000000000001'),
  'founder'::text,
  'Founder award writes the founder tier'
);
select is(
  (select billing_interval from public.subscriptions where teacher_id = 'a3000000-0000-4000-8000-000000000001'),
  'monthly'::text,
  'Founder award writes the monthly billing interval'
);

insert into public.payu_orders (
  teacher_id, ext_order_id, plan, amount_grosz, status
) values (
  'a3000000-0000-4000-8000-000000000002',
  'l03-annual-order',
  'annual',
  39000,
  'pending'
);
select lives_ok(
  $$select public.confirm_payu_order('l03-annual-order', 'l03-annual-payu')$$,
  'annual completion succeeds'
);
select is(
  (select plan from public.subscriptions where teacher_id = 'a3000000-0000-4000-8000-000000000002'),
  'annual'::text,
  'annual completion retains the legacy annual plan'
);
select is(
  (select tier from public.subscriptions where teacher_id = 'a3000000-0000-4000-8000-000000000002'),
  'pro'::text,
  'annual completion writes the pro tier'
);
select is(
  (select billing_interval from public.subscriptions where teacher_id = 'a3000000-0000-4000-8000-000000000002'),
  'annual'::text,
  'annual completion writes the annual billing interval'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
select
  md5('l03-founder-fill-' || value::text)::uuid,
  '00000000-0000-0000-0000-000000000000'::uuid,
  'authenticated',
  'authenticated',
  'l03-founder-fill-' || value::text || '@example.test',
  '',
  '{}'::jsonb,
  jsonb_build_object('full_name', 'Founder fill ' || value::text),
  now(),
  now()
from generate_series(1, 49) as series(value);

update public.subscriptions
set status = 'active',
    plan = 'founder',
    tier = 'founder',
    billing_interval = 'monthly',
    read_only = false
where teacher_id in (
  select md5('l03-founder-fill-' || value::text)::uuid
  from generate_series(1, 49) as series(value)
);

insert into public.payu_orders (
  teacher_id, ext_order_id, plan, amount_grosz, status
) values (
  'a3000000-0000-4000-8000-000000000003',
  'l03-monthly-order',
  'monthly',
  3900,
  'pending'
);
select lives_ok(
  $$select public.confirm_payu_order('l03-monthly-order', 'l03-monthly-payu')$$,
  'monthly completion succeeds when Founder is full'
);
select is(
  (select plan from public.subscriptions where teacher_id = 'a3000000-0000-4000-8000-000000000003'),
  'monthly'::text,
  'monthly completion retains the legacy monthly plan when Founder is full'
);
select is(
  (select tier from public.subscriptions where teacher_id = 'a3000000-0000-4000-8000-000000000003'),
  'pro'::text,
  'monthly completion writes the pro tier when Founder is full'
);
select is(
  (select billing_interval from public.subscriptions where teacher_id = 'a3000000-0000-4000-8000-000000000003'),
  'monthly'::text,
  'monthly completion writes the monthly billing interval'
);

select throws_ok(
  $$update public.subscriptions set tier = 'enterprise' where teacher_id = 'a3000000-0000-4000-8000-000000000003'$$,
  '23514',
  null,
  'unsupported subscription tiers are rejected'
);
select throws_ok(
  $$update public.subscriptions set billing_interval = 'weekly' where teacher_id = 'a3000000-0000-4000-8000-000000000003'$$,
  '23514',
  null,
  'unsupported billing intervals are rejected'
);

select * from finish();
rollback;
