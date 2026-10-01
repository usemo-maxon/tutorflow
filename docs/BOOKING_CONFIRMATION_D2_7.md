# D2.7 — Booking confirmation and cancellation

## Confirmation flow

The public booking command validates the selected slot and commits one `confirmed` booking atomically. It also generates a 256-bit random guest-management token. The API response contains a `/rezerwacja/<token>` URL and the browser moves to that dedicated confirmation/management page.

## Email delivery

Confirmation delivery is isolated behind the server-only `BookingEmailSender` abstraction. The current adapter calls Resend over HTTPS using `RESEND_API_KEY` and `BOOKING_EMAIL_FROM`; neither value is included in the browser bundle. The email includes only the tutor's public name, event type, local date/time and timezone, format, intentionally public offline city, management link, and ICS link.

The booking transaction finishes before delivery is attempted. Provider failure is logged with a booking ID and error class only; the booking remains valid and its management page continues to work. `confirmation_email_sent_at` records successful delivery. The provider request uses a stable `booking-confirmation/<booking-id>` idempotency key, while slot-level booking idempotency prevents a normal create retry from creating another booking or another confirmation.

## Secure token model

The raw 32-byte base64url token exists only in the guest URL and delivery payload. The database and local development store retain only its SHA-256 hash. Lookup uses the indexed hash, not a booking ID, workspace ID, or email. Public RPCs are not granted to `anon`; the server calls narrow service-role functions and returns a deliberately filtered guest DTO. Invalid, malformed, foreign, and revoked/unknown tokens all produce the same generic unavailable state.

## Cancellation lifecycle

Guest and tutor cancellation call the same canonical transition. A confirmed booking becomes `cancelled`, with `cancelled_at` and `cancelled_by`; the row and acquisition history are never deleted. Repeating cancellation is idempotent. The tutor action is authenticated and restricted to the tutor's own booking.

The guest UI requires a second explicit confirmation: “Czy na pewno chcesz anulować rezerwację?”.

## Cancellation deadline

`booking_availability_settings.cancellation_notice_hours` is a small integer setting (UI choices: 12, 24, or 48 hours; default 24). The deadline is computed from the exact booking timestamp. It is displayed/evaluated in the booking's tutor timezone, while the authoritative database comparison uses timezone-safe `timestamptz` values. The database rechecks the deadline while holding the booking row lock.

## Availability, Calendar, and Dzisiaj

There is no separate availability flag. Only an unconverted `confirmed` booking blocks public availability. After the canonical status transition to `cancelled`, the D2.3 calculation immediately exposes the slot again. D2.6 Calendar and Dzisiaj selectors already derive active reservations from the same status, so the cancelled booking disappears naturally without deleting a calendar representation. The booking remains accessible in booking history/details.

## Converted bookings

An anonymous token cannot cancel a booking whose status is `converted`. The page explains that the booking has become a normal lesson and asks the guest to contact the teacher. Lesson cancellation remains tutor-controlled.

## ICS

`/rezerwacja/<token>/kalendarz.ics` returns a standards-based `text/calendar` VCALENDAR/VEVENT file with UTC `DTSTART`/`DTEND`, the tutor timezone, public event title, tutor public name, public format/location, and an opaque easy4tutor reference. It excludes workspace IDs, guest messages, tutor private email, notes, other students, and Google Calendar data.

## Privacy and security

- Guest views contain one booking only and never enumerate bookings.
- Management token hashes are omitted from normal tutor API DTOs and logs.
- Mutations reject cross-site browser requests and re-authorize on the server.
- Token lookup and cancellation are hash-based and cross-workspace access is impossible.
- Only the public profile name/city may cross the guest boundary; private workspace, finance, notes, and integration data do not.
- The management page is `noindex`, mobile-first, and supports the confirmation, converted, deadline, cancellation-confirmation, and cancelled states at approximately 390 × 844.
