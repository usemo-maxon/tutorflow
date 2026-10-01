# D2.1 — Public Tutor Page

## Purpose

Each tutor can publish a small, shareable landing page at `/{slug}`. It is an introduction to the tutor, not a booking system.

## Fields and privacy boundary

The editable public fields are: enabled state, slug, photo, name, headline, about text, subjects, levels, lesson formats, city, price text and HTTPS contact links. Email, telephone, workspace identifiers, account/subscription data, students, lessons, availability, calendar, finance, integrations and notes are never part of the public view model.

The public route reads only `get_published_tutor_profile`, a narrow SQL function returning explicit columns. The source table has no anonymous select policy.

## Slugs and publishing

Slugs are normalized to lowercase ASCII with hyphens, have 3–60 characters, are case-insensitively unique and reject system routes. Turning off publishing retains the configuration but returns not-found to public visitors. A slug change intentionally has no redirect in D2.1.

## Photo handling

Photos are limited to JPG, PNG, or WebP under 3 MB. Upload is authenticated through the app route and uses the user-scoped Storage policies; no service key is sent to a browser. The resulting image is public only because it is explicitly chosen for the public profile.

## Booking status

`Umów lekcję` scrolls to the honest “Rezerwacja już wkrótce” notice. No booking form, availability, student/lead creation, messaging, payment, cancellation, or analytics exists in D2.1.
