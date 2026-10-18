begin;
select plan(17);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values
  ('ab200000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'owner-admin@example.test', '', '{}', '{}', now(), now()),
  ('ab200000-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'support-admin@example.test', '', '{}', '{}', now(), now()),
  ('ab200000-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'tutor-admin@example.test', '', '{}', '{}', now(), now());

insert into public.platform_admins (user_id, role, reason)
values
  ('ab200000-0000-4000-8000-000000000001', 'platform_owner', 'Test owner'),
  ('ab200000-0000-4000-8000-000000000002', 'support_moderator', 'Test support');

select is(
  private.platform_admin_has_permission('ab200000-0000-4000-8000-000000000001', 'admins.manage'),
  true, 'platform owner can manage administrator roles'
);
select is(
  private.platform_admin_has_permission('ab200000-0000-4000-8000-000000000002', 'support.manage'),
  true, 'support moderator can manage support tickets'
);
select is(
  private.platform_admin_has_permission('ab200000-0000-4000-8000-000000000002', 'subscriptions.manage'),
  false, 'support moderator cannot manage subscriptions'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"ab200000-0000-4000-8000-000000000002","role":"authenticated"}';
select is(public.current_user_platform_admin_role(), 'support_moderator', 'current role is resolved from the protected table');
select is(public.current_user_has_admin_permission('payments.read'), false, 'support cannot inspect payments');
select throws_ok(
  $$select public.manage_subscription_override(
    'ab200000-0000-4000-8000-000000000003', 'grant', 'support', 'pro',
    now() + interval '1 day', 'unauthorized grant',
    'ab200000-0000-4000-8000-000000000002'
  )$$,
  '42501', null, 'authenticated callers cannot execute the service procedure'
);

set local request.jwt.claims = '{"sub":"ab200000-0000-4000-8000-000000000003","role":"authenticated"}';
select lives_ok(
  $$select public.create_support_ticket(
    'Problem z kalendarzem', 'Synchronizacja nie zakończyła się poprawnie.',
    'calendar', 'normal'
  )$$,
  'user can create a rate-limited support ticket'
);
select is((select count(*)::integer from public.support_tickets), 1, 'user sees own support ticket');

set local request.jwt.claims = '{"sub":"ab200000-0000-4000-8000-000000000002","role":"authenticated"}';
select is((select count(*)::integer from public.support_tickets), 0, 'another user cannot read the ticket through RLS');

set local role service_role;
select throws_ok(
  $$select public.manage_subscription_override(
    'ab200000-0000-4000-8000-000000000003', 'grant', 'support', 'pro',
    now() + interval '1 day', 'support cannot grant',
    'ab200000-0000-4000-8000-000000000002'
  )$$,
  '42501', null, 'support moderator cannot escalate through service procedure'
);
select lives_ok(
  $$select public.manage_subscription_override(
    'ab200000-0000-4000-8000-000000000003', 'grant', 'promotional', 'pro',
    now() + interval '1 day', 'approved promotional access',
    'ab200000-0000-4000-8000-000000000001'
  )$$,
  'platform owner can grant controlled promotional access'
);
select is((select count(*)::integer from public.subscription_overrides where revoked_at is null), 1, 'active override is recorded separately');
select is((select count(*)::integer from public.platform_admin_audit_logs where action = 'subscription_override.grant'), 1, 'subscription override is audited');
select throws_ok(
  $$update public.platform_admin_audit_logs set reason = 'tampered'$$,
  '42501', null, 'service role cannot alter append-only audit rows'
);
select throws_ok(
  $$select public.manage_platform_admin_role(
    'ab200000-0000-4000-8000-000000000001', 'platform_owner', 'revoke',
    'remove final owner', 'ab200000-0000-4000-8000-000000000001'
  )$$,
  '42501', null, 'owner cannot revoke their own role'
);
select lives_ok(
  $$select public.manage_account_suspension(
    'ab200000-0000-4000-8000-000000000003', 'suspend',
    'security review', 'ab200000-0000-4000-8000-000000000001'
  )$$,
  'authorized administrator can suspend without deleting account data'
);

set local role authenticated;
set local request.jwt.claims = '{"sub":"ab200000-0000-4000-8000-000000000003","role":"authenticated"}';
select is(public.current_user_is_suspended(), true, 'suspended account is detected at the auth boundary');

select * from finish();
rollback;
