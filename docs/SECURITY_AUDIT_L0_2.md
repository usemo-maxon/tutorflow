# L0.2 Security Audit

Audit date: 2026-09-23  
Scope: current `main` application, API routes, Supabase migrations, SQL tests, storage policies, and launch-relevant query paths.

## Executive summary

The current architecture has a sound baseline: protected application data is loaded with a server-side Supabase client and `auth.getUser()`, business tables use workspace-scoped RLS, finance views are `security_invoker`, secrets remain in server-only modules, integration credentials use AES-256-GCM, and the Google, Telegram, PayU, and cron entry points authenticate their callers appropriately.

The audit found one high-severity cross-tenant integration-queue vulnerability and one medium RLS integrity gap. Both are fixed by `20260923160841_l0_2_security_hardening.sql` and protected by pgTAP assertions. The production Supabase Auth setting for leaked-password protection still requires manual action. The full migration chain reset successfully in local Supabase and all 224 pgTAP assertions passed; the application baseline and final `npm run check` results are recorded below.

Audit disposition: **PASS WITH MANUAL ACTIONS** after applying the new migration and completing the Auth dashboard action.

## Critical findings

None.

## High findings

### H-01 — Integration queue identity was not bound to the authenticated tutor

- **Area:** RLS / Google sync / Telegram reminders
- **Finding:** `google_sync_jobs` and `reminder_deliveries` accepted any `teacher_id` when the supplied `workspace_id` belonged to the caller. A browser Data API client could therefore enqueue a row in workspace A with a tutor UUID from workspace B.
- **Risk:** Service-role workers resolve integration credentials by `teacher_id`. A crafted queue row could cause attacker-controlled lesson data to be sent to another tenant's Google Calendar or Telegram chat.
- **Action:** Replaced the workspace-only queue policies with policies requiring both active workspace membership and `teacher_id = auth.uid()` for every granted operation.
- **Status:** Resolved in repository; production remains protected only after the migration is applied through the normal deployment process.

## Medium findings

### M-01 — Tutor profile could be moved to an unauthorized workspace

- **Area:** RLS / workspace integrity
- **Finding:** `tutor_profiles_update_self_or_manager` allowed a self-owned profile to pass `WITH CHECK` solely because `user_id = auth.uid()`, even when its new `workspace_id` belonged to another tenant.
- **Risk:** An authenticated user could write a self-owned row into another tenant boundary, violating the workspace isolation invariant and potentially corrupting relational identity state.
- **Action:** The policy now requires active membership in both its `USING` and `WITH CHECK` expressions in addition to the existing self-or-manager rule.
- **Status:** Resolved in repository; production remains protected only after the migration is applied.

### M-02 — Leaked-password protection is disabled in production

- **Area:** Supabase Auth
- **Finding:** The production advisor reports leaked-password protection disabled. Current Supabase documentation says the feature rejects passwords found through the HaveIBeenPwned Pwned Passwords API and is available on Pro and above.
- **Risk:** Users can select known-compromised passwords, increasing credential-stuffing risk.
- **Action:** Enable the setting manually under the project's Auth password/security settings if the project is Pro or above. If the project is on Free, record the plan limitation and schedule enablement with the upgrade. Supabase documents that strengthened password rules may surface `WeakPasswordError` during password sign-in for affected existing users, so support copy should be checked before rollout.
- **Status:** Open manual production action. Source: [Supabase password security](https://supabase.com/docs/guides/auth/password-security).

## Low findings

### L-01 — Same-origin defense is inconsistent across JSON mutation routes

- **Area:** CSRF / route handlers
- **Finding:** `/api/app`, lesson workspace mutations, and Google manual sync reject `Sec-Fetch-Site: cross-site`; `/api/finance`, `/api/payu/checkout`, and `/api/auth/[action]` do not apply the same explicit check.
- **Risk:** Current Supabase cookies, `SameSite=Lax`, and JSON request bodies substantially limit conventional cross-site form attacks, but the defense is inconsistent and depends on browser cookie/CORS behavior.
- **Action:** Centralize a strict Origin/Fetch Metadata guard for cookie-authenticated JSON mutations in a future hardening task, with explicit exclusions for provider webhooks.
- **Status:** Deferred; no demonstrated cross-site exploit in the reviewed deployment model.

### L-02 — Repository-local Auth minimum differs from application validation

- **Area:** Password policy
- **Finding:** application registration requires eight characters, while `supabase/config.toml` has `minimum_password_length = 6`. Direct calls to the public Auth API do not pass through the application's Zod validation.
- **Risk:** Local/self-hosted environments, and production if configured equivalently, can accept weaker passwords than the UI claims.
- **Action:** Set the Supabase Auth minimum password length to at least eight in production and align local configuration in a separate Auth-policy change after compatibility review.
- **Status:** Manual verification required; not changed in this audit to avoid silently changing Auth behavior.

## Accepted / intentional findings

### `webhook_events` has RLS enabled with no client policy

`webhook_events` is used only by service-role Telegram and PayU webhook handlers as an idempotency ledger. No browser or authenticated Data API flow reads or writes it. RLS with no `anon` or `authenticated` policy is therefore intentional. The pgTAP suite now asserts that authenticated users cannot select from or insert into the table. The advisor warning is accepted and must not be silenced with a permissive policy.

### Integration credentials are not client-readable

`integration_connections` exposes only a narrow column set to authenticated clients. `encrypted_credentials`, provider identifiers, sync/watch tokens, and watch secrets are excluded by column grants. Mutations are service-role only. This is intentional.

### Storage objects are user-path scoped

The attachment bucket is private and object policies require the first path component to equal `auth.uid()`. This is stricter than workspace-wide object sharing. No active application upload or signed-URL path exists in the reviewed source, so there is no signed-URL lifetime to audit yet.

## Manual production actions

1. **MANUAL PRODUCTION ACTION — Enable Supabase Auth leaked-password protection.** In the production Supabase Dashboard, open Auth password/security settings and enable leaked-password protection. It is documented as available on Pro and above. Do not mark complete until verified in the production project.
2. **MANUAL PRODUCTION ACTION — Verify the production password minimum is at least 8.** The repository-local Supabase setting is currently 6 even though the app requires 8.
3. **MANUAL PRODUCTION ACTION — Apply `20260923160841_l0_2_security_hardening.sql` through the normal reviewed deployment pipeline.** Do not run it ad hoc from this audit task.
4. Verify the production Auth redirect allow-list contains only the canonical `/auth/callback` and `/api/auth/callback` URLs plus explicitly trusted preview URLs.

## RLS coverage

| Resource | Tenant key | Client access | RLS status | Test coverage | Notes |
| --- | --- | --- | --- | --- | --- |
| `profiles` | `id = auth.uid()` | own read/update; admin read | enabled | `rls.sql` | role cannot be self-promoted by the update policy |
| `subscriptions` | `teacher_id` | own read | enabled | `rls.sql` | writes are service-side |
| `teacher_states` | `teacher_id` | own CRUD | enabled | `rls.sql` | legacy compatibility state |
| `workspaces` | `id` | member read; manager update columns | enabled | `stage_0_foundation.sql` | ownership column is not client-updatable |
| `workspace_members` | `workspace_id` | member read; manager mutation | enabled | `stage_0_foundation.sql` | active membership helper bypasses recursive RLS safely |
| `tutor_profiles` | `workspace_id` | member read; self/manager update | enabled | `rls.sql` | cross-tenant move fixed in L0.2 |
| `students` | `workspace_id` | member read/insert/update | enabled | `stage_0_foundation.sql`, `stage_1a_students_groups.sql` | composite tenant foreign keys used downstream |
| `contacts`, `student_contacts` | `workspace_id` | member CRUD as granted | enabled | `stage_1a_students_groups.sql` | RPCs check workspace through RLS and composite FKs |
| `groups`, `group_members` | `workspace_id` | member CRUD as granted | enabled | `stage_1a_students_groups.sql` | cross-workspace membership rejected |
| `recurring_lesson_series` | `workspace_id` | member read/insert/update | enabled | calendar SQL suites | tenant-coupled tutor/student/group FKs |
| `lessons` | `workspace_id` | member read/insert/update | enabled | `stage_0_foundation.sql`, calendar suites | tenant-coupled participant and tutor FKs |
| `lesson_participants` | `workspace_id` | member CRUD as granted | enabled | `stage_0_foundation.sql`, `stage_3_lesson_workspace.sql` | composite lesson/student FKs |
| `attendances` | `workspace_id` | member CRUD as granted | enabled | `stage_3_lesson_workspace.sql` | participant FK includes workspace |
| `lesson_plan_items`, `plan_item_results` | `workspace_id` | member CRUD as granted | enabled | Stage 0/3 SQL suites | all references include workspace |
| `lesson_notes` | `workspace_id` | member read/insert/update | enabled | `stage_3_lesson_workspace.sql` | private means product visibility, not a separate tutor ACL |
| `homeworks` | `workspace_id` | member CRUD as granted | enabled | `stage_3_lesson_workspace.sql` | student/group references include workspace |
| `materials`, `lesson_materials` | `workspace_id` | member CRUD as granted | enabled | `stage_3_lesson_workspace.sql` | relationship FKs include workspace |
| `payments`, `payment_allocations` | `workspace_id` | member read/insert/update as granted | enabled | Stage 0/4 SQL suites | deletion revoked; transactional RPCs validate workspace |
| `charges` | `workspace_id` | member read/insert/update | enabled | `stage_4_payments_packages.sql` | balance view uses invoker security |
| `packages`, `package_usages` | `workspace_id` | member read/insert/update | enabled | Stage 0/3/4 SQL suites | immutable ledger deletes revoked |
| `bookings` | `workspace_id` | member read/insert/update | enabled | `rls.sql` | added cross-workspace read regression |
| `notifications` | `workspace_id` | member read/insert/update | enabled | `rls.sql` | workspace-private, not user-private within a shared workspace |
| `availability_rules`, `availability_exceptions`, `calendar_blocks` | `workspace_id` | member CRUD as granted | enabled | calendar SQL suites | tutor FK includes workspace |
| `integration_connections` | `workspace_id` | narrow member read only | enabled | `google_calendar_bidirectional_sync.sql` | credentials and watch state excluded by column grants |
| `oauth_states`, `telegram_link_codes`, `payu_orders` | `teacher_id` | owner-scoped operations | enabled | OAuth/API tests and policy review | short-lived state/code records |
| `google_sync_jobs` | `workspace_id` + `teacher_id` | owner read/insert/update | enabled | `rls.sql` | tutor identity binding added in L0.2 |
| `reminder_deliveries` | `workspace_id` + `teacher_id` | owner CRUD | enabled | `rls.sql` | tutor identity binding added in L0.2 |
| `google_event_mappings`, `external_google_events` | `workspace_id` | member read only | enabled | `google_calendar_bidirectional_sync.sql` | provider cache writes are service-role only |
| `attachments` metadata | `workspace_id` | member CRUD | enabled | policy review | lesson/student FKs include workspace |
| `storage.objects` in `attachments` | first path segment = `auth.uid()` | owner-path CRUD | enabled | bucket assertion + policy review | private bucket, 10 MiB, allow-listed MIME types |
| `webhook_events` | server-only | none for browser roles | enabled, no client policy | `rls.sql` | accepted intentional advisor finding |

Every general business-table UPDATE policy includes both `USING` and `WITH CHECK`. Composite foreign keys prevent cross-workspace student, group, lesson, package, charge, and payment references.

## Privileged functions

All reviewed `SECURITY DEFINER` functions set `search_path = ''` and schema-qualify referenced objects.

| Function | Reason for privilege | Caller validation / grant conclusion |
| --- | --- | --- |
| `private.is_admin()` | read role while profile RLS is active | derives caller from `auth.uid()`; executable only by authenticated role |
| `private.is_workspace_member(uuid)` | avoid recursive `workspace_members` RLS | derives caller from `auth.uid()` and active membership; returns boolean only |
| `private.can_manage_workspace(uuid)` | manager check without recursive RLS | derives caller from `auth.uid()` and active owner/admin membership |
| `private.has_google_calendar_connection(uuid, uuid)` | inspect server-only credential table | requires `auth.uid() = p_tutor_id` and active workspace membership; returns boolean only |
| `private.handle_new_user()` | Auth trigger must create protected profile/workspace rows | trigger-only; `PUBLIC` execution revoked; user metadata affects display text only, not authorization |
| `private.sync_profile_defaults()` | profile trigger updates protected workspace defaults | trigger-only; `PUBLIC` execution revoked; update originates from an RLS-protected profile row |
| `public.confirm_payu_order(text, text)` | signed webhook activates subscription atomically | execution revoked from `PUBLIC`, `anon`, and `authenticated`; granted only to `service_role` |

Other public RPCs are `SECURITY INVOKER`, set an empty search path, validate workspace membership, and remain subject to RLS. No function was converted to definer security during this task.

## External integration security

- **Google OAuth:** caller identity comes from `auth.getUser()`. OAuth state is 256-bit random, stored as SHA-256, scoped to the authenticated teacher/provider, expiry checked, and consumed by delete before token exchange. Credential persistence revalidates tutor profile and active membership with the admin client. Tokens are encrypted before storage and safe logging tests reject code/token leakage.
- **Google webhook:** validates channel ID, resource ID, and a timing-safe comparison of the SHA-256 channel-token hash. It treats the notification as a reconciliation signal and does not trust an event payload or return teacher data.
- **Telegram:** requires an exact timing-safe `X-Telegram-Bot-Api-Secret-Token`, uses single-use expiring hashed link codes, stores only AES-GCM encrypted chat IDs, and records update IDs in `webhook_events`. Unique idempotency storage prevents durable replay, although concurrent duplicate deliveries can still produce a duplicate acknowledgement before the unique insert wins; this is a reliability item, not an account-linking bypass.
- **PayU:** computes the documented signature over the exact raw body before JSON parsing. The browser continue URL does not activate access. Subscription activation occurs only in the service-role-only `confirm_payu_order` RPC, which locks and handles already-completed orders idempotently.
- **Cron:** all three routes require an exact timing-safe `Authorization: Bearer CRON_SECRET`. Unauthorized and failure responses are generic. Success responses contain aggregate counters only.

## Secrets / client bundle review

- `src/server/env.ts`, `src/server/supabase.ts`, `src/server/crypto.ts`, and integration modules are guarded by `server-only` where secrets are handled.
- No client component imports `@/server/*` or a server secret module.
- Browser configuration exposes only the Supabase URL and publishable/legacy anon key. The browser validator rejects `sb_secret_` keys.
- `SUPABASE_SECRET_KEY` / `SUPABASE_SERVICE_ROLE_KEY`, encryption key, Google client secret, Telegram bot/webhook secrets, PayU secrets, and `CRON_SECRET` have no `NEXT_PUBLIC_` aliases and were not found in tracked files.
- `.env.local` is ignored; `.env.example` contains placeholders only.
- OAuth access/refresh tokens are not logged. Google errors are reduced to safe categories; generic API errors return a correlation ID instead of raw server details.

## Storage review

- Bucket `attachments` is explicitly `public = false`.
- Maximum object size is 10 MiB; MIME types are limited to PDF, Word DOCX, plain text, JPEG, and PNG.
- Storage SELECT/INSERT/UPDATE/DELETE policies require a path rooted at the authenticated user's UUID; UPDATE has both `USING` and `WITH CHECK`.
- Metadata rows are workspace-scoped and have composite lesson/student foreign keys.
- No broad public-read policy exists.
- No active signed-URL generation or upload API exists in the current application, so URL lifetime and endpoint-side MIME sniffing are deferred until attachments are productized.

## Performance advisor triage

No index was added during L0.2.

The current CLI's local database advisor reported no security or performance issues after a clean reset. This does not invalidate the separately reported production foreign-key warnings, because advisor output and table statistics can differ between local and hosted environments.

### Launch-relevant

The reviewed launch paths already have purpose-built indexes: calendar ranges (`lessons_range_idx`, `lessons_calendar_idx`, `calendar_blocks_range_idx`), student/group history, recurring series, dashboard workspace/status lookups, package usage, charges and payments, Google mapping/provider lookups, Google due jobs, reminder due jobs, and integration watch/sync maintenance.

### Likely low priority

Many advisor warnings concern foreign keys whose primary launch access path is through a parent unique key, small relationship table, cascade enforcement, or a workspace-leading composite index. Examples include secondary-direction lookups on lesson materials, plan results, and contact relationships. Creating one index per warning would increase write cost without demonstrated benefit.

### Requires measurement

Measure production row counts and query plans before adding indexes for reverse foreign-key traversals, shared-workspace membership administration, attachment cleanup at scale, and notification history outside the unread partial index. Google/reminder worker indexes should also be checked with `EXPLAIN (ANALYZE, BUFFERS)` once production-like queue volume exists. These belong in a separate performance task.

## Deferred work

- Centralize same-origin validation for all cookie-authenticated JSON mutations.
- Decide whether notifications need per-recipient privacy inside a shared workspace; current RLS provides workspace privacy only.
- Add attachment upload/download APIs with short-lived signed URLs, endpoint-side file validation, and end-to-end storage isolation tests when the feature becomes active.
- Measure advisor index candidates using production-like cardinality and query plans.
- Consider making Telegram/PayU idempotency claims atomic (`INSERT ... ON CONFLICT` before side effects) to eliminate duplicate concurrent processing windows.

## Verification

### Before changes

- `npm run lint`: passed.
- `npm run typecheck`: passed.
- Vitest: 27 files passed, 139 tests passed.
- Next.js build: passed (Next.js 16.3.4).
- `npm run check`: passed.

### After changes

- `npm run lint`: passed.
- `npm run typecheck`: passed.
- Vitest: 27 files passed, 139 tests passed.
- Next.js production build: passed (37 routes generated/compiled).
- `npm run check`: passed.

### Supabase SQL tests

The current Supabase CLI was run through `npx` against the local Docker stack:

- `npx supabase start`: passed.
- `npx supabase db reset`: passed; all migrations, including L0.2, applied from scratch.
- `npx supabase test db`: passed; 10 files, 224 assertions.
- `npx supabase db advisors --local --type all --level warn --fail-on none`: passed; no local issues reported.
