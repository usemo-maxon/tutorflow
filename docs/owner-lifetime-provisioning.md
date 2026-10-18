# Platform Owner: secure role and Lifetime provisioning

This is a production runbook, not a seed. No UUID, role, or Lifetime grant is
created automatically. Do not run a write statement until the exact Supabase
Auth UUIDs and approval reference have been reviewed and explicitly approved.

Administrator authorization and `owner_lifetime` are independent. A platform
owner may have either, both, or neither. Granting or revoking one never changes
the other.

## Preconditions

1. Deploy all reviewed migrations through
   `20261018150945_platform_administration.sql`.
2. Locate the intended account in Supabase Auth by the human-confirmed e-mail,
   copy its UUID, and independently confirm `email_confirmed_at`.
3. Record the approver, change reference, exact target UUID, intended role, and
   reason outside the database.
4. Use a short-lived privileged SQL session. Never put a service key in the
   browser, client bundle, chat transcript, or analytics.

## Read-only verification

```sql
select id, email, email_confirmed_at, created_at
from auth.users
where id = '<TARGET_AUTH_USER_UUID>'::uuid;

select user_id, role, status, granted_at, revoked_at
from public.platform_admins
where user_id = '<TARGET_AUTH_USER_UUID>'::uuid;

select user_id, grant_type, granted_at, revoked_at
from public.internal_access_grants
where user_id = '<TARGET_AUTH_USER_UUID>'::uuid;
```

Stop unless the Auth query returns exactly one verified account.

## One-time first owner role bootstrap

Use this only when no active `platform_owner` exists. It needs separate,
explicit production approval because no existing owner can authorize the first
owner.

```sql
begin;

select id, email, email_confirmed_at
from auth.users
where id = '<OWNER_AUTH_USER_UUID>'::uuid
for update;

insert into public.platform_admins (
  user_id, role, status, granted_by, reason
) values (
  '<OWNER_AUTH_USER_UUID>'::uuid,
  'platform_owner',
  'active',
  '<OWNER_AUTH_USER_UUID>'::uuid,
  'Initial platform owner bootstrap — <APPROVAL_REFERENCE>'
);

select user_id, role, status, reason
from public.platform_admins
where user_id = '<OWNER_AUTH_USER_UUID>'::uuid;

commit;
```

If an active owner already exists, use the audited role workflow under
`/app/admin/settings` or `manage_platform_admin_role(...)` instead.

## Lifetime grant

The actor must already be an active `platform_owner`. The target may be the same
verified UUID, but the grant remains a separate record.

```sql
begin;

select public.manage_owner_lifetime_access(
  '<TARGET_AUTH_USER_UUID>'::uuid,
  'grant',
  'Approved owner Lifetime access — <APPROVAL_REFERENCE>',
  '<PLATFORM_OWNER_AUTH_USER_UUID>'::uuid
);

select user_id, grant_type, granted_at, granted_by, revoked_at
from public.internal_access_grants
where user_id = '<TARGET_AUTH_USER_UUID>'::uuid;

select actor_user_id, action, target_id, reason, occurred_at
from public.platform_admin_audit_logs
where target_id = '<TARGET_AUTH_USER_UUID>'
order by occurred_at desc;

commit;
```

The procedure preserves PayU and subscription history, clears the operational
read-only lock, and adds no payment or public pricing tier.

## Lifetime revocation

```sql
select public.manage_owner_lifetime_access(
  '<TARGET_AUTH_USER_UUID>'::uuid,
  'revoke',
  'Approved Lifetime revocation — <APPROVAL_REFERENCE>',
  '<PLATFORM_OWNER_AUTH_USER_UUID>'::uuid
);
```

Revocation restores normal billing-derived access and does not remove any
administrator role.
