# Platform Owner lifetime access provisioning

This is a production runbook, not an automatic seed. Do not execute it until
the exact founder Supabase Auth UUID and trusted platform-administrator UUID
have been reviewed and explicitly approved.

## Preconditions

1. Apply the `owner_lifetime_access` migration through the normal reviewed
   deployment process.
2. Obtain the founder UUID from Supabase Auth and independently verify the
   account email and `email_confirmed_at` value.
3. Obtain the UUID of an existing trusted administrator in
   `public.platform_admins`.
4. Record the approval reference in the audit reason.

## Read-only verification

Replace both placeholders with the exact approved UUIDs, then run only these
queries first:

```sql
select id, email, email_confirmed_at
from auth.users
where id = '<FOUNDER_AUTH_USER_UUID>'::uuid;

select user_id, granted_at, granted_by
from public.platform_admins
where user_id = '<TRUSTED_ADMIN_AUTH_USER_UUID>'::uuid;

select user_id, grant_type, granted_at, revoked_at
from public.internal_access_grants
where user_id = '<FOUNDER_AUTH_USER_UUID>'::uuid;
```

Stop if the founder query does not return exactly the verified account, if the
email is unconfirmed, or if the trusted administrator query does not return
exactly one row.

## Explicitly approved grant

After approval of the exact query values, execute one transaction:

```sql
begin;

select public.manage_owner_lifetime_access(
  '<FOUNDER_AUTH_USER_UUID>'::uuid,
  'grant',
  'Approved founder lifetime access — <APPROVAL_REFERENCE>',
  '<TRUSTED_ADMIN_AUTH_USER_UUID>'::uuid
);

select user_id, grant_type, granted_at, granted_by, revoked_at
from public.internal_access_grants
where user_id = '<FOUNDER_AUTH_USER_UUID>'::uuid;

select user_id, granted_at, granted_by
from public.platform_admins
where user_id = '<FOUNDER_AUTH_USER_UUID>'::uuid;

select action, actor_user_id, reason, occurred_at
from public.internal_access_grant_audit
where user_id = '<FOUNDER_AUTH_USER_UUID>'::uuid
order by occurred_at desc;

commit;
```

The procedure keeps the existing subscription and payment history. It adds the
internal lifetime grant, clears an operational read-only lock, and provisions
the existing platform-administrator authorization without creating a paid
order or public pricing tier.

## Explicit revocation

Revocation also requires approval and a trusted administrator UUID:

```sql
begin;

select public.manage_owner_lifetime_access(
  '<FOUNDER_AUTH_USER_UUID>'::uuid,
  'revoke',
  'Approved founder lifetime revocation — <APPROVAL_REFERENCE>',
  '<TRUSTED_ADMIN_AUTH_USER_UUID>'::uuid
);

commit;
```

If the provisioning procedure originally added the founder to
`platform_admins`, revocation removes that managed administrator row. A
platform-administrator role that predated the lifetime grant remains separate
and is not removed automatically.
