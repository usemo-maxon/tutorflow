# D2.8 — Rescheduling and booking reminders

## Rescheduling flow

The secure `/rezerwacja/<token>` page shows **Zmień termin** only for a confirmed, unconverted booking before the tutor's deadline. The guest chooses a date and time from a token-scoped availability endpoint and confirms the move. The browser never sends a tutor, workspace, duration, end time, price, or event definition.

The availability endpoint resolves the booking from the SHA-256 token hash and calls the same `get_public_tutor_availability` path introduced in D2.3. A transaction-local exclusion removes only the current booking from the busy set while candidates are calculated. There is no second availability algorithm.

## Atomicity and availability revalidation

`reschedule_public_booking_by_token` is the authoritative mutation. It:

1. resolves the tutor from the token hash;
2. takes the existing tutor-scoped advisory lock;
3. locks the booking row;
4. checks confirmed/unconverted state and the deadline;
5. derives the end time from the snapshotted event duration;
6. reruns `private.public_booking_slot_is_available`; and
7. updates the existing booking row.

All steps run in one PostgreSQL transaction. Any validation or exclusion-constraint failure rolls the transaction back, so the old slot remains occupied. The existing GiST exclusion constraint remains the final double-booking backstop. Only one concurrent move to an overlapping slot can commit.

## Deadline

`booking_availability_settings.reschedule_notice_hours` is a simple tutor setting. The UI offers 12, 24, or 48 hours and defaults to 24. The exact timestamp is evaluated again under the booking row lock. Cancellation keeps its independent existing deadline.

Cancelled bookings cannot be moved. Converted bookings return the guest-safe instruction to contact the tutor; the linked normal Lesson is never changed.

## Updated email and ICS

After the database transaction commits, the server sends an email titled **Termin rezerwacji został zmieniony** with the tutor, event type, current time, timezone, secure management link, and the stable ICS URL. Delivery failure is logged without provider detail and never rolls back the booking.

The ICS route reads the booking on every request with `private, no-store`, so `DTSTART` and `DTEND` always represent the current row. Its opaque UID remains stable because it is derived from the management-token hash. `SEQUENCE` increments with every successful reschedule so calendar clients can recognize an update.

## Reminder timing and scheduling architecture

Tutors can enable or disable one initial reminder: **Dzień przed (e-mail)**. The guest email is the only recipient. SMS, WhatsApp, and guest accounts are not involved.

The Vercel Hobby deployment runs `/api/cron/booking-reminders` once daily at `07:00 UTC`. Each run materializes reminders whose nominal `starts_at - 24 hours` time has passed, then claims and delivers them in bounded batches. Because the deployment does not support a reliable high-frequency job, this is deliberately a day-before reminder rather than a claim of exact 24-hour precision. Depending on the lesson time and cron run, delivery can occur later than exactly 24 hours before the lesson. The email states the full current date/time instead of falsely saying “tomorrow”.

The requested 2-hour reminder is deferred: a once-daily scheduler cannot guarantee it, and D2.8 does not add an external queue/provider merely to simulate precision.

## Idempotency and retry state

`booking_reminder_deliveries` has a unique identity of `(booking_id, booking_starts_at, lead_minutes)`. Repeated cron invocations therefore cannot create a second delivery for the same booking version and offset. Claiming changes `pending`/`failed` to `processing` conditionally, so concurrent workers have only one winner. Provider requests also use the stable delivery ID as the Resend idempotency key.

Failures store a bounded error class and `next_attempt_at`; they do not alter the booking, Student, or Lesson. Abandoned processing claims are eligible for recovery after 15 minutes.

## Rescheduling, cancellation, and conversion

Reminder rows snapshot `booking_starts_at`. Before each run, rows are marked `skipped` when the booking is cancelled, converted, moved, or reminders are disabled. A moved booking receives a new versioned delivery identity when its new reminder becomes due. Historical succeeded/skipped rows remain for delivery history.

Only confirmed bookings with no `student_id` or `converted_lesson_id` are eligible. Once conversion creates the normal Lesson, the public-booking reminder pipeline stops so the Lesson reminder architecture remains the sole owner.

## Security

The raw management token remains the guest authority. The database stores its SHA-256 lookup hash and, for scheduled reminder delivery, an AES-256-GCM encrypted copy produced by the existing server-only encryption boundary. Authenticated tutor column grants exclude both token representations. Reminder tables and RPCs are service-role only with RLS enabled.

Token lookup is one-booking-only. The server/database resolve workspace, tutor, event type, duration, and end time. Cross-workspace event IDs, malformed tokens, arbitrary end times, unavailable slots, and direct anonymous RPC execution are rejected.

## Mobile

The guest page keeps a single-column card layout at approximately `390 × 844`. Date buttons scroll horizontally, time choices use a compact grid, and confirmation/cancellation/rescheduling actions become full-width where needed.

## Deferred

Payments, refunds, SMS/WhatsApp reminders, recurring public bookings, waitlists, approval mode, guest accounts, student portal, advanced notification workflows, and exact 2-hour reminders remain out of scope.
