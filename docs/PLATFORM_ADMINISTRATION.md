# Easy4Tutor platform administration

## Delivered architecture

The admin area is mounted below `/app/admin` and uses one server-side
authorization gateway. It authenticates the Supabase user, resolves the role
from protected `platform_admins` data, checks a named permission, and only then
creates a server-only privileged client for narrowly scoped reads or RPCs.

Roles:

- `platform_owner`: all modules, role management, runtime settings and Lifetime provisioning.
- `platform_admin`: users, controlled subscription overrides, payments, support, monitoring and audit; no role or Lifetime management.
- `support_moderator`: minimized account metadata and support tickets only.

The role matrix exists in PostgreSQL and TypeScript. PostgreSQL remains the
authority for every mutation.

## Routes

- `/app/admin`: KPIs, MRR/ARR, plan distribution and recent activity.
- `/app/admin/users`: server-paginated account list and filters.
- `/app/admin/users/[id]`: minimized account data, usage totals, billing/audit history, suspension and overrides.
- `/app/admin/subscriptions`: current billing state.
- `/app/admin/payments`: read-only PayU transactions.
- `/app/admin/support` and `/app/admin/support/[id]`: ticket operations.
- `/app/admin/system`: sanitized operational events.
- `/app/admin/audit`: append-only administrative audit.
- `/app/admin/settings`: safe runtime settings and administrator roles.
- `/app/pomoc`: authenticated customer ticket creation and own-ticket history.

## Metric definitions

- MRR: monthly price of each active paid Pro/Founder subscription; annual plans contribute annual price divided by 12.
- ARR: MRR multiplied by 12.
- Active paid: active, non-Free subscriptions excluding active Lifetime grants.
- Registration windows: profile `created_at` in UTC day / rolling 7 / rolling 30 days.
- Successful payment: PayU order with `completed` status.
- Failed payment: PayU order with `failed` or `cancelled` status.

Active-user and trial-conversion KPIs remain explicitly unavailable until a
reliable, privacy-reviewed activity/subscription event history exists.

## Security properties

- Role data is never read from user-editable metadata.
- Privileged RPCs are service-only, use empty search paths, verify the actor,
  validate inputs, and append audit entries in the same transaction.
- Browser forms are validated server-side and require a same-origin request.
- Users can read only their own tickets. Creation is rate-limited in PostgreSQL
  to 5 tickets/hour and 20 messages/hour.
- Suspension retains data and is enforced in the application auth boundary.
- Payment rows are read-only. No refund capability is exposed.
- Audit tables deny service-role UPDATE/DELETE.
- Lifetime and administrator roles are independent.
- Self-revocation and removal of the final owner are rejected.
- No private teaching content, OAuth tokens, secrets or raw webhook bodies are queried.

## Deployment order

1. Back up production and record a restore point.
2. Apply migrations in timestamp order. The new migration is
   `supabase/migrations/20261018150945_platform_administration.sql`.
3. Run `supabase migration list`, pgTAP and database advisors.
4. Deploy application code only after the migration succeeds.
5. Follow `docs/owner-lifetime-provisioning.md` only after explicit approval.
6. No new secrets are required. Outbound support e-mail is intentionally not simulated.

## Smoke tests

1. Ordinary user receives 404 for every `/app/admin` route.
2. Support moderator sees Users/Support only and cannot access payment or subscription actions.
3. Platform admin can suspend/restore a non-owner account with a reason.
4. Suspension leaves profile, workspace and teaching data intact.
5. Subscription override is separate from PayU history and expires.
6. PayU callback cannot overwrite Lifetime access.
7. A user creates a ticket; another user cannot read it.
8. Admin responses and internal notes are audited; internal notes are hidden from users.
9. Failed Google maintenance or PayU confirmation creates a sanitized system event.
10. Audit rows cannot be updated or deleted through application credentials.
11. Desktop and 390 px navigation remain keyboard usable.

## Rollback

Prefer a forward fix. The migration is additive except for extending
`platform_admins` and replacing helper functions. If the app must be rolled
back, redeploy the previous app first and retain the new tables because dropping
audit/support data is destructive. Restore earlier function definitions only in
a reviewed emergency migration. Restore the database backup if the transaction
itself fails; never manually delete audit rows.

## Known configuration and product limits

- Outbound support email is not configured. The internal workflow is complete.
- Refunds remain read-only; no verified PayU refund workflow exists.
- Active-user, cancellation-rate and trial-conversion charts require a future event schema.
- System events cover Google scheduled sync, maintenance and verified PayU confirmation failures; existing per-calendar errors are not backfilled.
- Production migrations, role changes, Lifetime grants, environment changes and deployment require explicit approval and were not executed.

