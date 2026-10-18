begin;
select plan(32);

select has_table('public', 'internal_access_grants', 'internal grants table exists');
select has_table('public', 'internal_access_grant_audit', 'grant audit table exists');
select has_function(
  'public', 'current_user_has_owner_lifetime_access', array[]::text[],
  'current user lifetime lookup exists'
);
select matches(
  pg_get_functiondef(
    'public.convert_public_booking(uuid,text,uuid,jsonb)'::regprocedure
  ),
  'not private[.]has_owner_lifetime_access[(]v_user_id[)]',
  'database booking conversion exempts only the lifetime owner from the student cap'
);
select has_function(
  'public', 'manage_owner_lifetime_access',
  array['uuid', 'text', 'text', 'uuid'],
  'trusted lifetime access management procedure exists'
);
select has_function(
  'private', 'has_owner_lifetime_access', array['uuid'],
  'private lifetime access predicate exists'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('aa100000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-lifetime@example.test', '', '{}', '{"full_name":"Lifetime Owner"}', now(), now()),
  ('aa100000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'platform-moderator@example.test', '', '{}', '{"full_name":"Platform Moderator"}', now(), now()),
  ('aa100000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'ordinary-tutor@example.test', '', '{}', '{"full_name":"Ordinary Tutor"}', now(), now());

insert into public.platform_admins (user_id, role, reason)
values ('aa100000-0000-4000-8000-000000000002', 'platform_owner', 'Test owner');

set local role authenticated;
set local request.jwt.claims = '{"sub":"aa100000-0000-4000-8000-000000000002","role":"authenticated"}';
select is(
  public.current_user_is_platform_admin(), true,
  'existing platform moderator retains moderation authorization'
);
select is(
  public.current_user_has_owner_lifetime_access(), false,
  'platform moderator does not automatically receive lifetime access'
);

set local request.jwt.claims = '{"sub":"aa100000-0000-4000-8000-000000000001","role":"authenticated"}';
select is(
  public.current_user_has_owner_lifetime_access(), false,
  'founder has no access before explicit provisioning'
);
select throws_ok(
  $$select count(*) from public.internal_access_grants$$,
  '42501', null,
  'authenticated users cannot read internal access grants'
);
select throws_ok(
  $$select public.manage_owner_lifetime_access(
    'aa100000-0000-4000-8000-000000000001', 'grant', 'self grant',
    'aa100000-0000-4000-8000-000000000001'
  )$$,
  '42501', null,
  'authenticated users cannot execute the grant procedure'
);
select throws_ok(
  $$insert into public.internal_access_grants (
    user_id, grant_type, granted_by, reason
  ) values (
    'aa100000-0000-4000-8000-000000000001', 'owner_lifetime',
    'aa100000-0000-4000-8000-000000000001', 'self grant'
  )$$,
  '42501', null,
  'authenticated users cannot insert their own grant'
);

set local role service_role;
select lives_ok(
  $$select public.manage_owner_lifetime_access(
    'aa100000-0000-4000-8000-000000000001', 'grant',
    'Approved founder lifetime bootstrap',
    'aa100000-0000-4000-8000-000000000002'
  )$$,
  'trusted service procedure grants lifetime access'
);
select throws_ok(
  $$update public.internal_access_grants
    set reason = 'direct service mutation'
    where user_id = 'aa100000-0000-4000-8000-000000000001'$$,
  '42501', null,
  'service role cannot bypass the audited management procedure'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"aa100000-0000-4000-8000-000000000001","role":"authenticated"}';
select is(
  public.current_user_has_owner_lifetime_access(), true,
  'provisioned founder receives lifetime access'
);
select is(
  public.current_user_is_platform_admin(), false,
  'lifetime access does not implicitly grant platform administration'
);

reset role;
update public.subscriptions
set read_only = true
where teacher_id = 'aa100000-0000-4000-8000-000000000001';
select is(
  (select read_only from public.subscriptions
    where teacher_id = 'aa100000-0000-4000-8000-000000000001'),
  false,
  'billing updates cannot make a lifetime owner read-only'
);

update public.subscriptions
set status = 'active', tier = 'free', plan = 'trial',
    trial_ends_at = now() - interval '1 day', read_only = true
where teacher_id = 'aa100000-0000-4000-8000-000000000001';
select is(
  private.has_owner_lifetime_access('aa100000-0000-4000-8000-000000000001'),
  true,
  'lifetime access survives trial expiration state changes'
);
select is(
  (select read_only from public.subscriptions
    where teacher_id = 'aa100000-0000-4000-8000-000000000001'),
  false,
  'expired trial state cannot make a lifetime owner read-only'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"aa100000-0000-4000-8000-000000000001","role":"authenticated"}';
select is(
  (select count(*)::integer from public.teacher_states), 1,
  'platform owner remains isolated to their own private workspace state'
);

set local request.jwt.claims = '{"sub":"aa100000-0000-4000-8000-000000000002","role":"authenticated"}';
select is(
  public.current_user_has_owner_lifetime_access(), false,
  'ordinary platform moderators remain non-lifetime accounts'
);

reset role;
insert into public.payu_orders (
  teacher_id, ext_order_id, plan, amount_grosz, status
) values (
  'aa100000-0000-4000-8000-000000000001',
  'owner-lifetime-existing-order', 'annual', 39900, 'pending'
);
select lives_ok(
  $$select public.confirm_payu_order(
    'owner-lifetime-existing-order', 'owner-lifetime-payu'
  )$$,
  'PayU callback can preserve real order history for a lifetime owner'
);
select is(
  (select tier from public.subscriptions
    where teacher_id = 'aa100000-0000-4000-8000-000000000001'),
  'free'::text,
  'PayU callback does not rewrite a lifetime owner subscription tier'
);
select is(
  (select status from public.payu_orders
    where ext_order_id = 'owner-lifetime-existing-order'),
  'completed'::text,
  'genuine pre-existing PayU order history is retained'
);
select is(
  (select count(*)::integer from public.internal_access_grant_audit
    where user_id = 'aa100000-0000-4000-8000-000000000001'
      and action = 'grant'),
  1,
  'grant action is audited'
);

update public.subscriptions
set status = 'past_due', read_only = true
where teacher_id = 'aa100000-0000-4000-8000-000000000001';

set local role service_role;
select lives_ok(
  $$select public.manage_owner_lifetime_access(
    'aa100000-0000-4000-8000-000000000001', 'revoke',
    'Explicit access revocation test',
    'aa100000-0000-4000-8000-000000000002'
  )$$,
  'trusted service procedure supports explicit revocation'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"aa100000-0000-4000-8000-000000000001","role":"authenticated"}';
select is(
  public.current_user_has_owner_lifetime_access(), false,
  'revoked founder no longer has lifetime access'
);
select is(
  public.current_user_is_platform_admin(), false,
  'revocation does not alter the independent administrator role'
);

reset role;
select is(
  (select read_only from public.subscriptions
    where teacher_id = 'aa100000-0000-4000-8000-000000000001'),
  true,
  'revocation restores the normal billing-derived read-only state'
);
select is(
  (select count(*)::integer from public.internal_access_grant_audit
    where user_id = 'aa100000-0000-4000-8000-000000000001'),
  2,
  'grant and revocation actions are both audited'
);
select is(
  (select revoked_by from public.internal_access_grants
    where user_id = 'aa100000-0000-4000-8000-000000000001'),
  'aa100000-0000-4000-8000-000000000002'::uuid,
  'revocation records the trusted administrator identity'
);
select is(
  private.has_owner_lifetime_access('aa100000-0000-4000-8000-000000000003'),
  false,
  'ordinary tutors never receive the owner grant'
);

select * from finish();
rollback;
