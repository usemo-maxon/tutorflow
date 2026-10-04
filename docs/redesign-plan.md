# easy4tutor — redesign, 3 October 2026

## Product direction
The tutor should immediately understand their next lesson, today's commitments,
and the actions that need attention. The public page demonstrates the same daily
workflow. Keep Polish product copy and existing backend contracts.

Updated after the supplied blue logo: ink #102e52, blue #0868ce,
light blue #eaf3ff, canvas #f3f6fb, white #ffffff, muted #526780.
Preserve the original logo pixels and display its existing symbol and wordmark
using CSS frames. Manrope for controls and data; locally hosted
Literata for selected editorial headings. Use a 4/8px spacing rhythm,
12px controls, 20px panels, and restrained shadows. The signature is the lesson
timeline, connecting the public product preview to the teacher's actual day.

## Implementation and acceptance
1. Foundation: shared tokens and accessible focus, motion tokens from the
   motion-design skill (Material 3), reduced-motion fallbacks. Typecheck.
2. Landing: editorial hero, a sample daily agenda and next-lesson preview,
   workflow explanation, existing pricing, FAQ, functional sign-up links.
   Check public render, links, mobile width and reduced motion.
3. Workspace: navigation hierarchy, workspace context, daily overview from
   actual dashboard data, clear next lesson and consistent action panels.
   Check dashboard, global create, search and read-only behavior tests.
4. Calendar: date jump with teacher timezone, readable toolbar and event
   hierarchy, explicit guidance for creating/moving/editing, retained day,
   week, month and agenda views. Check date conversion, calendar mutations,
   conflict/recurrence behavior and booking contracts.
5. Secondary pages: shared tokens and common panels/controls, preserving
   students, groups, lessons, bookings, finance, statistics and settings flows.
6. Final verification: lint, typecheck, all regression tests, production build,
   browser smoke checks at desktop and mobile sizes. Do not claim production
   integrations verified when only mocked/local tests were available.

## Existing work to preserve
Uncommitted new-bookings components and helpers, changes to today-page,
public-profile-settings and booking-schedule tests predate this redesign.

## Baseline
67 test files, 388 tests passed before implementation.

## Completed verification (4 October 2026)
- Shared foundation: TypeScript passed; accessible motion fallback included.
- Landing/workspace: 38 focused dashboard, search, creation and entitlement
  tests passed. Public page, workflow anchor, mobile menu and student form
  open/cancel checked in the browser.
- Calendar: 52 focused calendar, date/time, lesson and booking tests passed.
  On an isolated local demo store, moved a lesson from 21:28 to 21:45; verified
  persisted data and the 21:45 event after restart. Inspected day/week/month/
  agenda views, direct date selection, mobile event dialog, Escape and restored
  focus. Creating a lesson from the header now uses the selected calendar date.
- Responsive: checked 390px mobile and 1024px tablet plus default desktop.
  Fixed a pre-existing/new CSS cascade collision in the mobile dashboard.
  Verified no horizontal overflow on the checked pages.
- Secondary pages: students, groups, bookings, payments, statistics and profile
  settings rendered successfully against demo data.
- Final ESLint, TypeScript and all 67 suites / 388 tests passed. Production build
  completed successfully, including 49 generated static pages. Production `/`
  returned HTTP 200.
- Database: the sandboxed health request returned 503 because outbound network
  access raised EACCES. Repeating the same read-only Supabase HEAD query outside
  the sandbox succeeded (HTTP 206, database reachable). No production records
  were changed; live Google/Telegram/PayU end-to-end operations were not run.

The source logo is retained verbatim in `public/brand/easy4tutor-blue-original.png`.
The shared logo component uses Next Image delivery and CSS frames. The supplied
artwork also replaces the app icon and Apple icon.
