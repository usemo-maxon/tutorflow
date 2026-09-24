# Google Calendar production hardening — L0.9

## Architecture

The integration keeps the existing local-first architecture:

- local lesson mutation → durable `google_sync_jobs` queue → bounded processing from Next.js `after()`;
- Google Events webhook → verified notification → incremental inbound sync → small bounded repair batch;
- manual sync → explicit asynchronous recovery with a bounded outbound batch;
- daily Vercel cron → recovery, stale-lock handling, backup reconciliation, and watch maintenance.

Google Calendar never coordinates the local lesson transaction. A provider outage can leave a lesson pending or failed, but cannot prevent the lesson from being saved.

## Verified provider behavior (24 September 2026)

The implementation was checked against the current official documentation:

- [Google Calendar push notifications](https://developers.google.com/workspace/calendar/api/guides/push): webhook deliveries contain `X-Goog-*` headers and no event body; Events channels use `sync` when the channel starts and `exists` for changes. Successful responses include 200/201/202/204. Google documents exponential-backoff retries for 500, 502, 503, and 504 responses. Channel IDs must be unique, the returned expiration is authoritative, renewal is not automatic, replacement channels may overlap, and `channels.stop` requires the channel ID and resource ID.
- [Google Calendar incremental synchronization](https://developers.google.com/workspace/calendar/api/guides/sync): `nextSyncToken` is authoritative only on the final page. Incremental pagination retains the original sync token and adds `pageToken`. HTTP 410 means the old token is invalid and requires one new full synchronization.
- [Vercel Cron usage and pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing): Hobby cron jobs may run at most once per day and have hourly scheduling precision.
- [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs): cron expressions use UTC.
- [Vercel cron management](https://vercel.com/docs/cron-jobs/manage-cron-jobs): `CRON_SECRET` is delivered through the Authorization header, cron duration follows Function duration, failed cron invocations are not retried by Vercel, and delivery must be treated as best-effort and potentially duplicated.
- Installed Next.js 16.3.4 documentation confirms `after()` work remains subject to the route's configured `maxDuration`; it is not a durable queue by itself. Persisted queue state is therefore retained as the recovery source of truth.

The Supabase changelog was checked as required by the repository workflow. L0.9 introduces no schema or RLS change and needs no migration.

## OAuth and reconnect

OAuth state remains hashed, teacher-owned, time-limited, and one-use. The callback rechecks the current Google Calendar entitlement after consuming state and before exchanging/persisting credentials, covering plan changes during the authorization round trip.

Reconnect keeps the existing refresh token when Google omits a new one. A successful reconnect preserves mappings and external cache, resets only that teacher's failed/processing Google jobs to pending with attempts cleared, clears stale locks, makes them immediately eligible, and moves their failed (but not disabled) lessons back to pending.

`invalid_grant` and equivalent authorization loss move the connection to `reconnect_required` with the safe message: `Google Calendar wymaga ponownego połączenia.` They are not retried forever.

## Sync-token recovery

Full and incremental list operations consume all pages. Only the final page's `nextSyncToken` is persisted. HTTP 410 clears the old token and performs one full synchronization. External-event cleanup based on `last_seen_sync_id` runs only after the complete provider listing and all event reconciliation have succeeded. Local lessons are never wiped.

## Provider deletion behavior

A cancelled Google event linked to an active easy4tutor lesson does not delete or cancel the local lesson. The mapping records provider deletion, a deterministic replacement ID is queued, and the webhook background task processes a small repair batch immediately. A locally cancelled lesson is retired and is not recreated.

## Outbound retries

Normal processing remains bounded to 20 jobs per invocation; webhook repair is bounded to 10. Initialization and manual sync may enqueue any missing durable work but never expand one invocation to the entire queue. 429, 5xx, and network failures use bounded exponential retry. Jobs stop being selected after eight attempts until reconnect or explicit recovery resets them. Processing locks older than 15 minutes are recoverable; fresh locks are not. Deterministic event IDs and HTTP 409 lookup preserve idempotency. HTTP 412 still triggers inbound reconciliation before another write is considered.

## Watch lifecycle

Watch registration requires an HTTPS callback, a unique UUID channel ID, and a high-entropy token. Only the token hash is stored. The actual expiration returned by Google is persisted.

Maintenance renews a missing, invalid, or expiring watch 48 hours before expiration, giving a daily Hobby cron more than one opportunity. It creates and persists the replacement first, then best-effort stops the old channel. Failure to stop the old channel is non-fatal. Failure to create a replacement leaves the old persisted watch and credentials untouched for the next manual or daily recovery attempt.

## Vercel Hobby behavior

`vercel.json` remains `0 3 * * *` (03:00 UTC, with Hobby's documented within-the-hour precision). The daily job is a backstop, not the normal synchronization engine. Normal inbound work arrives by webhook; normal outbound work starts from application mutations and the durable queue; manual sync is explicit recovery. Every provider-writing path has an explicit batch limit and remains within the 60-second route budget.

## Entitlement downgrade

After Pro → active Free:

- valid old webhooks are verified and acknowledged without inbound synchronization;
- pending outbound jobs are left persisted but are not processed;
- watches are not renewed and may expire naturally;
- the connection, encrypted credentials, mappings, watch metadata, and external cache remain preserved for a later upgrade or retrial.

## User-visible states

The Google card uses persisted server state, not only click-local state:

- connected/idle: `Połączono` plus the last successful synchronization time;
- no successful sync: `Oczekuje na pierwszą synchronizację`;
- pending: `Synchronizacja oczekuje`;
- syncing: `Synchronizacja trwa`;
- error: `Błąd synchronizacji` plus a product-safe message;
- reconnect required: `Wymaga ponownego połączenia` with `Połącz ponownie`.

The manual button is disabled while persisted state is pending or syncing. Internal strings such as `invalid_grant`, HTTP statuses, sync-token state, watch metadata, and job attempts are not exposed.

## Safe logs

Structured logs include operation names, connection/teacher identifiers where already used, outcomes, and aggregate counts. They must never include OAuth codes, access or refresh tokens, the OAuth client secret, encryption key, channel token, Supabase secret/service-role key, or cron secret.

## Production configuration checklist

Verify presence in the Vercel Production environment without copying values into tickets or logs:

- `GOOGLE_CALENDAR_CLIENT_ID`
- `GOOGLE_CALENDAR_CLIENT_SECRET`
- `GOOGLE_CALENDAR_REDIRECT_URI` set to the canonical production callback route
- `GOOGLE_CALENDAR_WEBHOOK_URL` set to the public HTTPS canonical production `/api/webhooks/google-calendar` route, with no query token
- `INTEGRATION_ENCRYPTION_KEY`
- `CRON_SECRET` (strong random value; the route expects `Authorization: Bearer ...`)
- `NEXT_PUBLIC_SUPABASE_URL` or `SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` / supported publishable-key equivalent
- `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY` (server-only)

The audited local `.env.local` contains the Supabase URL, publishable key, and server secret names. Google Calendar credentials, webhook/callback URLs, the integration encryption key, and `CRON_SECRET` were not present locally. This does not establish their Production dashboard state; they require a presence-only dashboard audit before launch. Do not use localhost or a preview deployment for the production webhook URL.
