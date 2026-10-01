# D2.4 — Public booking transaction

## Public booking flow

The published tutor page now continues from D2.3 slot selection into a short
guest form. A visitor selects a public event type and an offered start time,
provides a required name and email plus optional phone, level, goal, and
message, and submits without creating an easy4tutor account.

The browser sends only the public tutor slug, event-type ID, requested
`startsAt`, and guest fields to:

```text
POST /api/public/tutors/:slug/bookings
```

The response contains only the booking ID, event-type name, interval,
timezone, and normalized guest email needed by the confirmation screen.

## Booking model

D2.4 extends the existing tenant-scoped `bookings` table. A public booking has
no `student_id`; it references the selected event type and stores the guest
contact/context separately. It also snapshots the event type's name, duration,
price in integer grosz, currency, and format. Historical bookings therefore do
not change when a tutor edits an event type later.

Public bookings are created immediately with `confirmed` status. The only
public-booking lifecycle state used by this stage besides `confirmed` is
`cancelled`.

## Server authority

The Next.js route validates input limits, normalizes email, checks a hidden
honeypot, and invokes the booking service on the Node.js server. In production,
the service uses the server-only Supabase secret/service-role client to call
`create_public_booking`.

The database function resolves the published tutor, active public event type,
workspace, tutor, timezone, duration, price, currency, and format. It computes
`ends_at` from the event-type duration. No workspace, tutor, end time, price,
currency, format, or availability decision supplied by the browser is trusted.

## Availability revalidation

The migration introduces the shared private predicate
`private.public_booking_slot_is_available`. Both the public D2.3 availability
RPC and the D2.4 mutation use it. Immediately before insert it checks:

- minimum notice and booking horizon;
- 15-minute slot alignment and full event duration;
- recurring availability and date exceptions;
- non-cancelled lesson overlap;
- calendar block overlap;
- connected, opaque Google busy events, including all-day events;
- existing active booking overlap.

The local development adapter follows the same rules through
`calculatePublicAvailability`, including its in-memory bookings as busy time.

## Concurrency and double-booking protection

The trusted mutation takes a transaction-scoped advisory lock keyed by tutor,
then revalidates and inserts in the same database transaction. In addition,
PostgreSQL has a GiST exclusion constraint on the tutor and half-open booking
time range for `pending`/`confirmed` rows. This constraint is the final
database-level invariant: two concurrent overlapping active bookings cannot
both commit. Adjacent intervals remain valid, and cancelled bookings release
their interval.

## Guest versus Student

A booking guest is not a Student. The mutation explicitly stores
`student_id = null` and never inserts into `students`. Public bookings therefore
do not consume the active-student entitlement. Conversion is deferred to a
later lifecycle stage.

## Security and privacy

- RLS remains enabled on `bookings`.
- `anon` has no direct insert/update/delete access to bookings.
- The mutation RPC is revoked from `PUBLIC`, `anon`, and `authenticated`, and
  granted only to `service_role`.
- The server secret is imported only in server code and is never exposed to the
  browser.
- The event type must belong to the published tutor's workspace, preventing
  cross-workspace identifier substitution.
- The confirmation DTO excludes workspace IDs, tutor IDs, other bookings,
  other guests, students, calendar data, and Google event data.
- The request body and every guest field have explicit size limits. A simple
  honeypot rejects basic form bots. The repository has no general public-route
  rate limiter yet, so D2.4 does not introduce a standalone distributed one.

Authenticated tutors retain their existing RLS-scoped access to `bookings`.
The server booking domain also exposes `getOwnPublicBookings` for later tutor UI
integration; Calendar and Dzisiaj are intentionally unchanged.

## Success and failure UX

Before submission, the page shows tutor, lesson type, duration, authoritative
displayed price, date, and interval. Successful booking replaces the form with
a compact confirmation card. It says the lesson is reserved and identifies the
submitted normalized email without claiming an email was sent.

Conflict responses use HTTP 409 and the safe message:

```text
Ten termin jest już niedostępny. Wybierz inny termin.
```

The selected slot is cleared and availability is refreshed, while entered
guest fields remain. Invalid input, unpublished or invalid event types, and
unexpected server failures return bounded Polish messages without raw database
errors.

## Deferred lifecycle functionality

D2.4 deliberately does not implement confirmation email, ICS attachments,
cancellation links, rescheduling, lead workflows, Student conversion, lesson
creation, Calendar/Dzisiaj UI integration, payments, approval mode, SMS, or
reminders.
