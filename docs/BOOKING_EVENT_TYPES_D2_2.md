# D2.2 — Booking event types

`booking_event_types` holds tutor-defined lesson offers. Each row is scoped to a tutor and workspace and stores a name, optional bounded description, duration in whole minutes, price in integer grosz (`price_grosz`), `PLN` currency, format, active/public flags, and integer display order. A price of `0` is a valid free lesson.

Tutor settings manage these records through owner-scoped API routes. Tutors can create, edit, disable, publish/unpublish, delete, and move types with up/down controls. Disabled or non-public types are retained in configuration but never shown on the public page.

The published-profile RPC is the only anonymous read path. It returns only public fields needed to render and select an offer: opaque ID, name, description, duration, price, currency, and format. It does not expose workspace IDs, tutor IDs, state flags, ordering metadata, or any private workspace data.

Public cards are ordered by `display_order`. Selecting a card is browser-only UI state and reveals the honest next-step message that term selection will come later. This stage does not create a booking, lead, student, calendar event, payment, or any availability/time-slot data.

Deletion is currently permitted only because no booking references exist in D2.2. The future booking migration must add a restrictive foreign key so an event type with historical booking references cannot be deleted.

Deferred to the public-availability stage: availability rules, dates, time slots, calendar busy checks, booking creation, double-booking protection, lead/student creation, emails, cancellation/rescheduling, and payments.
