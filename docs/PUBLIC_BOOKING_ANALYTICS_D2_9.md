# D2.9 — Public booking polish and analytics

## Funnel and storage

The public booking page records only five aggregate events: `profile_view`, `event_type_selected`, `slot_selected`, `booking_started`, and `booking_completed`. They are daily counters per tutor/workspace, event, and normalized source in `public_booking_funnel_metrics`; there is no visitor or session identifier.

Successful bookings retain only safe attribution: normalized `acquisition_source` plus bounded (80 character) `utm_source`, `utm_medium`, and `utm_campaign`. The booking record remains the canonical source for completed-booking counts and source breakdowns.

## Privacy and security

Analytics contains no guest name, email, phone, message, calendar content, IP address, fingerprint, cross-site tracking, cookie, or session replay data. The public endpoint only accepts allow-listed event/source values and is intentionally best effort. Tutor analytics RPCs derive ownership from `auth.uid()` and no analytics table or RPC is available to public visitors.

## UI and ranges

**Ustawienia → Strona publiczna** provides 7, 30, and 90-day funnel counts, profile-to-booking conversion, completed-booking traffic sources, an empty state, and copyable public/social attribution links. Day boundaries use the tutor's configured timezone. Booking detail shows the friendly acquisition source when present.

## Attribution

`utm_source`, `utm_medium`, and `utm_campaign` are accepted from first-party public-page links. Recognized sources are Instagram, TikTok, Facebook, LinkedIn, and Google; absent attribution is Direct and unknown values are Other. Values are normalized and bounded before storage.

## Deferred

Google Analytics, advertising pixels/audiences, TikTok or Meta integrations, session replay, heatmaps, A/B testing, campaign tooling, revenue attribution, and marketing automation remain out of scope.
