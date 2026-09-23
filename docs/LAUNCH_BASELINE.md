# Launch regression baseline

This baseline protects the current easy4tutor behavior before further product or domain work. It does not redefine product rules.

## Protected automatically

- Authentication redirects and callback safety.
- Student validation, duplicate detection, contacts, groups, and tenant isolation.
- Lesson creation, recurrence, timezone/DST behavior, scheduling conflicts, calendar blocks, and recurrence mutation scopes.
- Lesson workspace action validation, notes, homework, attendance, lifecycle transitions, and relational workspace persistence.
- Dashboard ranges, ordering, attention items, and financial summaries.
- Finance allocation rules, package-ledger idempotency, payment/package RPC behavior, and workspace isolation.
- Google Calendar OAuth persistence, synchronization conflict handling, webhook processing, colors, and route authorization.
- Scheduler authorization, PayU signature validation, credential encryption, and RLS/database invariants.

Coverage comes from the Vitest suite under `src/**/*.test.ts` and the pgTAP suites under `supabase/tests/*.sql`.

## Canonical launch flow

The Vitest launch baseline exercises the file-backed adapter through existing service APIs:

`student → recurring lesson → lesson workspace → attendance → completion → single finance receivable on retry → future occurrence`

It verifies that completed history remains intact and that completing the first lesson does not modify the next scheduled occurrence. The local adapter does not provide writable package operations; detailed package consumption and retry idempotency remain covered by the domain and Supabase SQL suites.

## Local gate

```bash
npm run check
```

This runs lint, TypeScript typechecking, Vitest, and the production build in fail-fast order.

## Database tests

With Docker and the Supabase CLI available:

```bash
npx supabase start
npx supabase db reset
npx supabase test db
```

These tests use a local Supabase stack and are not part of the standard CI gate yet.

## Not yet covered

- Real browser end-to-end tests.
- Visual regression tests.
- End-to-end tests against production Google, PayU, or Telegram providers.
- Load, stress, and long-running reliability tests.
- Supabase pgTAP execution in GitHub CI.
