# L0.5 — First-run onboarding

## Goal

First-run onboarding takes a new tutor to the first useful easy4tutor workflow: a ready profile, an active student, and a scheduled lesson. It is a checklist inside the existing authenticated AppShell, not a separate application or product tour.

## Persistence

The only persisted onboarding-specific value is `profiles.onboarding_completed_at`. It is nullable and has no database default. Completion is written once after server-side validation.

The local/file-backed `Teacher` uses the same canonical `onboardingCompletedAt` field. New local accounts leave it undefined, while the demo account is created with a completion timestamp.

## Derived progress

No step booleans are stored. Progress is derived on every AppData refresh:

- Profile: the teacher name passes the profile minimum and the timezone is valid.
- Student: at least one student has `status = active`; archived students do not count.
- Lesson: at least one lesson exists with a status other than `cancelled`. A future scheduled lesson counts.
- Google Calendar: the Google integration status is `connected`. This step is optional and its action is shown only when `resolveEntitlements(subscription).googleCalendar` permits it.

## Existing-user migration

Migration `20260923195913_l0_5_first_run_onboarding.sql` adds the nullable column and immediately timestamps every profile already present in that migration transaction. The existing new-user trigger does not set the field, so users created after the migration receive `NULL`. Existing accounts therefore continue directly into the product.

## Registration flow

- New email/password registration with an immediate session goes to `/app/start`.
- Email confirmation returns through the existing safe callback with `/app/start` as the requested destination.
- Google OAuth started in register mode requests `/app/start`.
- Normal login keeps its validated `returnTo`, falling back to `/app/dzisiaj`.
- A completed account that reaches `/app/start` is redirected at the server page boundary to `/app/dzisiaj`.

## Completion rules

Profile, active student, and non-cancelled lesson are required. Google Calendar is optional.

`POST /api/onboarding/complete` derives the authenticated teacher ID server-side, applies the existing same-origin mutation protection, reloads real domain data, and rejects incomplete setup with HTTP 409 `ONBOARDING_INCOMPLETE` plus a safe `missing` list. The write is idempotent: an existing timestamp is returned without replacement.

## Skip behavior

`Zrobię to później` navigates to `/app/dzisiaj` without writing completion. An incomplete account sees a compact dashboard reminder linking back to `/app/start`.

## Reused components

The checklist opens the existing `StudentComposer` and `LessonComposer` with an explicit typed onboarding context. Their creation and entitlement logic is unchanged. The context only suppresses the normal detail-page redirect, so refreshed AppData immediately updates the checklist. Profile and Google actions link to the existing profile and integration settings.

## Deferred

- L0.6 Global `+ Dodaj`
- L0.7 Command Search
- L0.11 final pricing/trial UX
