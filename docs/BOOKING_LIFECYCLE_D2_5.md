# D2.5 — Booking lifecycle and Student conversion

## Booking as a potential client

A public booking is acquisition history, not a Student. The authenticated tutor
area at `/app/rezerwacje` lists upcoming public bookings and exposes the guest
name, contact details, learning context, original message, event snapshot,
format, price, and booked interval.

The original guest fields remain on `bookings` after conversion. The booking
message, event snapshot, and booking timestamp are not copied into Student
Memory.

## Lifecycle

The supported management lifecycle is deliberately small:

`confirmed → converted`

`cancelled` remains a valid historical state from D2.4, without cancellation
or rescheduling UX. A converted booking is never deleted and holds
`student_id`, `converted_lesson_id`, and `converted_at`.

## Student conversion

The tutor reviews and can edit the proposed first name, last name, email,
phone, level, and goal before confirming. A new Student is an ordinary active
easy4tutor Student. The booking duration, format, timezone, and price snapshot
become Student defaults where those fields already exist. Acquisition-only
data remains on the booking.

## Existing Student linking

The detail screen can suggest active Students from the same workspace when an
exact normalized name, email, or phone matches. A match is never merged or
linked automatically. The tutor must choose **Połącz z istniejącym uczniem**.
The server validates the selected Student against the booking workspace and
rejects cross-workspace or archived records.

## Free limit behavior

Creating a new Student uses the L0.4 rule: an active Free subscription can have
at most three active Students; trials and paid tiers remain unlimited. When the
limit is reached, conversion returns `PLAN_LIMIT_REACHED`, and the booking
stays confirmed with all guest data intact. Linking an already-active Student
does not create another Student and therefore does not consume capacity.

## Lesson creation

A successful conversion creates a normal single Lesson at the booked interval
with the Student participant, attendance record, event type name as the topic,
format, price snapshot, timezone, and normal Google/reminder side effects. The
Lesson is compatible with Calendar, Lesson Workspace, finance, Student Memory,
briefing, and Google sync because no booking-specific Lesson type is used.

The booking's own confirmed reservation is not treated as a conflict. Lessons,
calendar blocks, and opaque connected Google events introduced after booking
are still rejected.

## Transaction and idempotency

`convert_public_booking` is one PostgreSQL transaction. It resolves the tutor
and workspace from `auth.uid()`, locks the tutor conversion lane and booking,
validates state and entitlement, creates or validates the Student, creates the
Lesson graph, runs normal side effects, and finally marks the booking converted.
Any error rolls back every write.

Retries return the stored Student/Lesson references with
`alreadyConverted: true`. The Lesson also uses the booking ID as its client
request ID, adding a uniqueness backstop against duplicate Lesson creation.

## Security

The API is authenticated. It accepts a booking ID plus reviewed Student fields
or an existing Student ID; it never accepts a trusted workspace or tutor ID.
RLS and the RPC both enforce the current tutor's active workspace. Anonymous
users cannot execute the conversion RPC.

## Deferred CRM features

This stage does not add leads, sales stages, analytics, approval, automated
Student creation, email/SMS, reminders, payments, cancellation, rescheduling,
or Calendar/Dzisiaj presentation of unconverted bookings.
