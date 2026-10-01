# Public availability (D2.3)

## Boundary

`GET /api/public/tutors/[slug]/availability` is an anonymous, read-only endpoint. It accepts a published tutor slug, a public event-type ID, and a bounded date range (at most 14 days). The server resolves the tutor, active public event type, duration, timezone, and booking settings itself. It never trusts a client-supplied tutor, workspace, price, or duration.

Its response contains only the tutor timezone and day/slot UTC timestamps. It never includes lessons, blocks, Google event details, identities, calendar names, or unavailability reasons.

## Sources and algorithm

Slots use a fixed 15-minute start grid. For every candidate local wall-clock time, the server verifies that the full event duration:

- fits the tutor's weekly availability or an available exception;
- does not intersect an unavailable exception or legacy unavailable rule;
- does not overlap a non-cancelled easy4tutor lesson;
- does not overlap a `CalendarBlock`;
- does not overlap a blocking, locally synchronized Google event when the Google connection is connected; and
- falls after the configured minimum notice and before the booking horizon.

The Supabase implementation performs these checks in one security-definer RPC using bounded database queries. The local development fallback uses the same pure TypeScript algorithm over canonical app data. There is no per-slot network request and no second booking calendar.

## Timezone and DST

Rules are evaluated in the tutor profile timezone, while returned slot timestamps remain UTC. The public UI formats them explicitly in that timezone. It generates dates as local calendar dates rather than adding 24 hours to an instant, and skips spring-forward wall-clock times that do not exist. This keeps weekly availability and exceptions stable through DST transitions.

## Settings

**Ustawienia → Strona publiczna** has two centralized settings:

- minimum notice, default **12 hours**;
- booking horizon, default **30 days**.

The database validates 0–720 hours and 1–365 days. The public endpoint additionally caps each individual request to 14 days.

## Google Calendar

Availability reads the existing `external_google_events` sync representation. It does not call Google Calendar on public requests and does not add Google access to plans without an existing connected integration. Opaque, non-cancelled synchronized events remove slots; transparent and unavailable integrations do not break canonical easy4tutor availability.

## Future booking transaction

D2.3 is informational only: selecting a slot creates no booking, lead, student, payment, or reservation. A future booking command must re-run the same authoritative availability validation immediately before inserting a booking, inside its transaction, because a displayed free slot is never a lock.
