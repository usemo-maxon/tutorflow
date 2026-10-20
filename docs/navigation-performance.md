# Navigation performance — 2026-10-20

## Findings

The supplied Network screenshot showed small route responses taking roughly
100–300 ms, but `/api/finance` taking 29.69 seconds and the support route taking
15.04 seconds. It does not identify which part of those requests was slow.

A read-only inspection of `pg_stat_statements` on the connected `tutorflow`
Supabase project found 19 calls to `finance_summary`, averaging 12.56 ms with a
maximum of 25.51 ms. This is an aggregate snapshot, not a trace of the screenshot's
request. It does not explain the end-to-end delay. Vercel inspection returned
403, so function execution, cold starts, and network latency remain unverified.

Previously, materials and bookings kept their fetched data in component state,
discarding it on navigation. Route prefetching did not warm client API data.
Package history also waited for unrelated finance summary/payment queries.

## Changes

- Shared query definitions keep navigation warmup and page consumers on the same
  teacher-scoped cache keys, including material filters and calendar date ranges.
- Navigation warms dashboard, students, current calendar week, materials,
  bookings, statistics, and finance data one at a time after active queries finish.
  Hover, keyboard focus, and touch intent can also warm a destination.
- Automatic warmup pauses in hidden tabs and is disabled for data-saving/2G
  connections. Background failures do not prevent normal page retries.
- Inactive query data stays in memory for 20 minutes. The existing 30-second
  freshness window remains; old data renders while it refreshes. There is no
  persistent browser storage or shared server cache of private responses.
- Materials retain results and input focus while filtered results load. Bookings
  reuse the dashboard booking query and refresh every 30 seconds while mounted.
- Mutation invalidation now also covers cached finance after lesson/student
  changes and related views after booking conversion/cancellation.
- Signing out cancels and clears queries; switching teacher remounts the provider.
- Finance loads package history concurrently with independent summary/payment
  reads. Authentication and workspace filters are preserved.
- Finance GET responses include `Server-Timing` for authentication and finance
  service duration and explicitly prohibit shared HTTP caching.

## Verification

Automated regression coverage includes warm navigation without refetching,
in-flight request deduplication, teacher/filter/range isolation, mutation
invalidation, recovery from failed prefetches, concurrent package loading,
authorization failure, and package-query failure propagation.

Browser checks used an isolated local demo store. Materials used a local API
fixture because that module requires Supabase even in demo mode. The checks
covered narrow-screen menu navigation, the desktop sidebar at 1440 × 900,
payments/bookings/materials round trips, material search and retained input
focus, and browser console errors.

The second desktop round trip issued no additional finance, bookings, or
materials API requests. Route responses in that round trip took 28, 27, and
27 ms through the local test proxy. These are local server request durations,
not click-to-paint measurements or production speed claims.

Temporary evidence and test helpers are in ignored
`artifacts/performance-qa/`, including the final check log and request log.
The test browser and helper servers were stopped after verification.

## Release boundary

No deployment, database migration, infrastructure change, or production data
mutation was performed. After deployment, verify cold and warm navigation with
a real authenticated account, use the finance `Server-Timing` header to separate
auth and service latency, and inspect hosting logs for any remaining long waits.
First-time visits, expired sessions, and unavailable upstream services can still
require a network wait; these changes do not guarantee instant cold loads.
