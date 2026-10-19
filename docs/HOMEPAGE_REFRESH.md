# Homepage refresh — audit and design contract

Audited 2026-10-19 before copy changes. Repository evidence is implementation evidence, not proof of production deployment. Production website could not be fetched by the web tool.

| Capability | Evidence | Status and benefit used in copy |
| --- | --- | --- |
| Calendar, groups, recurring lessons, availability | calendar pages, calendar APIs, stage reports | Implemented; one teaching schedule |
| Google multi-calendar import, external timed/all-day events | server/google-calendar.ts, google-calendar-sync.ts, GOOGLE_CALENDAR_RESUMABLE_SYNC.md | Pro; asynchronous sync, no instant-sync promise; all-day events separate |
| Public profile, services, booking and management | guest-booking-page.tsx, public tutor booking routes | Implemented; publicBooking true in Free and Pro; shareable booking link |
| Profile publication caps | entitlements.ts, PUBLIC_PROFILE_COMPLETION_PROGRESS.md | Locally implemented Free 2 offers, premium unlimited with technical bound; omitted numerical promises until release verified |
| Profile themes, external video, certificates | profile settings, media API, ADVANCED_PUBLIC_PROFILES.md, completion report | Local implementation and migration-dependent release; excluded from launched feature promises |
| Hosted video | media API and completion report | Incomplete server duration verification, quota/finalization and infrastructure readiness; excluded |
| Advanced profile analytics/SEO | completion report and entitlement registry | Incomplete; excluded even though flags exist |
| Plans, notes, attendance, homework, outcomes | lesson-workspace.ts, student-memory.ts, D1/D3 reports | Implemented; preparation and continuity |
| Private templates and shared approved library | lesson-templates.ts, shared-templates.ts, T1.1 report | Implemented; reuse preparation, no claim of private attachments sharing |
| Student 360, contacts, groups, history | student-detail-page.tsx, STUDENT_360_D1_4.md | Implemented; factual tutor-recorded context, no inferred progress score |
| Charges, manual payments, balances, packages | finance.ts, STAGE_4_PAYMENTS_PACKAGES_REPORT.md | Implemented; recording received payments, not payment collection |
| Free / Pro / trial | pricing.ts, entitlements.ts, PRICING_SUBSCRIPTION_L0_11.md | Free 3 active students; Pro unlimited, Google; 14 days without card, then Free retaining records |
| AI, student portal, generic automations | entitlement flags only / no verified complete flow | Excluded |

Design: keep brand blue #2563eb, ink #14233b, paper #f6f8fc, mint #dff5eb, muted #526074. Manrope for headings/body; existing Literata only for the hero's teaching phrase. Calendar is the signature: a readable working week connected to a preparation note and booking confirmation. Desktop: editorial copy beside a grounded calendar; mobile: three-day calendar and stacked context, not scaled screenshots. Reuse local fonts, icons and server rendering. CSS entrance and existing IntersectionObserver only; no looping motion or new dependencies.

Structure: hero → four capability shortcuts → calendar → booking → lesson preparation → student context → payments → five-step workflow → Free/Pro → FAQ → final CTA → legal/support footer.

No database, payment, entitlement or infrastructure mutations. Deployment is outside scope.

## Final verification

- `npm run check`: PASS after final application changes; ESLint without warnings, TypeScript, 98 test files / 531 tests, optimized Next.js production build.
- `git diff --check`: PASS.
- In-app Chromium visual review: desktop hero, booking/lesson sections; mobile hero/calendar, booking confirmation, FAQ, pricing; tablet hero/navigation.
- Final DOM bounds at 320, 390, 768, 1024 and 1440 CSS pixels: no visible main-content elements outside horizontal viewport bounds. 390 viewport height was 844.
- Native mobile menu opens; booking demonstration opens/closes without submitting data; native FAQ expands.
- Every registration CTA resolves to `/rejestracja`. Actual registration and login pages opened successfully. All in-page anchors resolve. Authenticated `/app/dzisiaj` branch preserved and source-reviewed, not exercised with a real signed-in production session.
- Browser error/warning logs: empty during review, including navigation; no observed hydration errors.
- Browser metadata: one H1; correct title, description, canonical and Open Graph title.
- Server HTML includes headings, FAQ and native details without `data-reveal-pending`: content is initially visible without client JavaScript. Reduced-motion CSS disables animations/transitions; existing LandingReveal respects preference changes. Reduced-motion OS emulation and a complete JS-disabled browser session were not run.
- No animation dependencies, external fonts, stock media, videos or WebGL added. Existing local fonts/icons and server-rendered content retained. No measured production Core Web Vitals claim.
- Footer legal routes and cookie settings retained; product support added as `support@easy4tutor.pl`.

## Remaining release limitations

Marketing changes pass local verification and do not introduce infrastructure requirements. Existing product migration/deployment status was not verified against production. The advanced profile completion report retains its separate rollout prerequisites. No production database, Storage, billing, credentials or deployments were changed. This change does not certify the unfinished profile media, analytics, SEO or entitlement roadmap. New profile personalization, video and certificates are intentionally absent from the public offer until their release is verified. AI, student portal, automatic student payment collection and generic automation promises are also excluded.
