# L0.6 — Global create menu

## Purpose

easy4tutor has one global `+ Dodaj` entry point in the authenticated AppShell. It launches existing creation workflows from every application route without duplicating forms, mutations, or entitlement rules.

## Actions

| Action | Existing workflow |
| --- | --- |
| Lesson | `LessonComposer` |
| Student | `StudentComposer` |
| Group | `GroupsPage` → `GroupComposer` |
| Block time | `CalendarPage` block form |
| Payment | `PaymentsPage` → `RecordPaymentDialog` |
| Package | `PaymentsPage` → `CreatePackageDialog` |

The shared typed action model contains exactly these six actions and groups them as Teaching, Organization, and Finance. Desktop and mobile render the same `GlobalCreateMenu` component and action definitions.

## Routing strategy

The menu is a launcher only. Truly global composers open through `AppUiContext`; page-local workflows remain owned by their pages and open through allow-listed URL actions. This keeps group, calendar, and finance state and mutations next to the data they already use, and prevents AppShell from loading the full application dataset.

## AppUiContext

`AppUiContext` remains responsible for the existing global `LessonComposer` and `StudentComposer`, plus toast and composer focus restoration. Group, payment, package, and calendar block state are not added to the context.

The global lesson and student actions use the default composer context. They do not infer onboarding behavior from the current pathname.

## URL actions

Supported values after L0.6 are:

| Route | Allowed `action` values |
| --- | --- |
| `/app/kalendarz` | `lesson`, `block` |
| `/app/uczniowie/grupy` | `new` |
| `/app/platnosci` | `payment`, `package` |

Each page handles only its explicit allow-list. Consumed actions are removed with `router.replace`, so refresh, close, and browser history do not repeatedly reopen a workflow. Unknown values do nothing.

Payments without any students show a safe explanatory state and an action to open the existing `StudentComposer`; neither finance dialog opens with an unusable student selector.

## Read-only behavior

When `teacher.subscription.readOnly` is true, both global create triggers are disabled and expose an accessible explanation. The existing read-only banner and server-side mutation protection remain unchanged.

## Onboarding compatibility

The global menu remains available on `/app/start`. Its lesson and student actions use normal/default behavior. Only the onboarding page's own calls opt into the typed onboarding composer context introduced in L0.5.

## Deferred

L0.7 Command Search, including `Cmd+K`/`Ctrl+K`, global search, and a command palette, is intentionally not part of L0.6.
