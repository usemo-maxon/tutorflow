# Stage 2 — Today Dashboard

## 1. Audit findings

The authenticated home route already redirected `/app` to `/app/dzisiaj`, and the existing Today page rendered a next-lesson card, a client-derived daily list, unfinished lessons, and quiet metrics. Its data source was the general `GET /api/app` workspace payload. Both `AppShell` and `TodayPage` requested that payload, so opening the dashboard loaded full lesson history, plan items, attendance, notes, contacts, availability, imports, groups, packages, and other module data before deriving “today” in the browser.

The existing statistics page also calculates metrics from the general payload. Normal Student, Group, Lesson, recurrence, CalendarBlock, and Availability reads already came from normalized tables. Remaining `teacher_states` use was limited to compatibility mutation/metadata paths, not normal dashboard reads.

Main UX issues were:

- “next lesson” competed visually with the whole daily schedule;
- upcoming lessons after today and reusable quick actions were missing;
- attention logic was scattered in JSX and treated every unpaid participant as a dashboard metric, although the current Payment model has no due-date definition;
- monthly metrics were not defined as operational, timezone-safe dashboard values;
- loading the dashboard was equivalent to loading most of the application domain;
- mobile inherited the desktop information model instead of using the requested Today → Attention → Upcoming → Actions → Summary order.

## 2. Dashboard architecture

The dashboard now uses:

```text
TodayPage
→ useDashboardData
→ GET /api/dashboard
→ getTodayDashboard (application service)
→ queryTodayDashboardSource (repository)
→ normalized PostgreSQL tables protected by RLS
→ buildDashboardData (stable read model + attention rules)
```

`DashboardData` contains only the greeting/timezone, local-day bounds, today lessons, attention items, upcoming lessons, monthly summary, student count, and optional partial-error markers. Raw database rows are not exposed to the component.

## 3. Data sources

- tutor identity/timezone: `profiles` and `tutor_profiles`;
- read-only subscription state: `subscriptions`;
- students and lifecycle: `students`;
- lesson schedule/status/meeting link/sync state: `lessons`;
- individual and group participants: `lesson_participants`;
- group identity: `groups`;
- low package balance: active `packages` plus the RLS-aware `package_balances` view.

Payment overdue alerts are intentionally not included: `payments` has lifecycle status but no authoritative due date. Revenue is not displayed. Scheduled prices are never treated as revenue.

## 4. Today query and timezone logic

The repository first obtains the authenticated tutor's IANA timezone. It derives local midnight, next local midnight, and local month boundaries, then converts each boundary to UTC before querying `timestamptz` values. UTC calendar dates are never used as business-day boundaries.

Tests cover Warsaw CET, Warsaw CEST, the 23-hour spring DST transition, and local month bounds. Lessons are ordered chronologically. Cancelled lessons are excluded from the active daily schedule; completed lessons remain visible with reduced emphasis.

## 5. Attention rules

Attention is built in `src/server/dashboard.ts`, not in JSX. Rules are deterministic:

1. lesson sync failures/deletions requiring integration action;
2. past lessons with `needs_completion`, aggregated into one item;
3. active package balances with 1–2 lessons remaining, deduplicated per student and limited to three calm items.

Every item has natural Polish copy and a useful destination. Payment and reminder alerts were not added because current data does not support a reliable tutor action without inventing business semantics.

## 6. Upcoming logic

Upcoming lessons start at the next local-day boundary, use a 14-day bounded query, exclude cancelled lessons, order by start time, and return at most seven. The UI shows the next five and links to the Calendar for the full schedule.

## 7. Monthly summary definitions

- **Lekcje:** all non-cancelled lessons starting in the current local month;
- **Czas nauczania:** duration of `completed` lessons only;
- **Aktywni uczniowie:** existing `students.status = active` definition.

Revenue and scheduled-value totals are omitted. The summary is deliberately quieter than the daily schedule.

## 8. Quick actions

- Add lesson opens the existing global `LessonComposer` directly from Today;
- Add student opens the existing `StudentComposer`;
- Add group navigates to the existing Groups route and opens `GroupComposer` via `?action=new`;
- Block time navigates to Calendar and opens the existing CalendarBlock dialog via `?action=block`.

No forms were duplicated for the dashboard.

## 9. Responsive UX

Desktop uses a schedule-first main column with a narrow operational rail. The signature element is the restrained current/next lesson pulse attached to the time rail. Mobile uses a single natural order: greeting/date, Today, Attention, Upcoming, Quick actions, Monthly summary. It does not preserve the desktop columns.

Manual browser verification at 1440×900 and 390×844 confirmed readable hierarchy, touch-sized actions, correct stacking, no horizontal overflow, and no browser warnings/errors.

## 10. Security and RLS

The API accepts no workspace ID. It authenticates the user, reads their `tutor_profiles.workspace_id`, and scopes every table query to that server-derived workspace. Underlying tables and `package_balances` remain protected by RLS; the latter is a `security_invoker` view. The read model exposes only package balance counts and no provider transaction metadata.

pgTAP now explicitly verifies cross-workspace denial for dashboard package balances and Payment information in addition to existing Lesson, Student, Group, participant, and Calendar isolation coverage.

## 11. Performance and query decisions

The Today endpoint uses bounded, parallel reads:

- one local-day range;
- seven future lessons within 14 days;
- up to 50 recent unfinished/sync-failed lessons within 30 days;
- current local month only;
- students/packages capped at the product's solo-tutor scale;
- one batched participant query and one batched group query for displayed lesson IDs.

There is no request-per-card path and no full-history read. `AppShell` no longer fetches the full workspace payload on every route. `LessonComposer` mounts and requests its broader data only when opened. Mutations invalidate both workspace and dashboard query keys.

## 12. `teacher_states` migration

Before Stage 2, the dashboard did not read `teacher_states` directly, but it depended on the broad `AppData` compatibility surface and client-side statistics derived from it. `AppShell` also caused an unconditional full workspace read.

After Stage 2, daily lessons, attention, upcoming lessons, and the monthly summary are read exclusively from normalized relational tables through `/api/dashboard`. No Today Dashboard query or calculation uses `teacher_states`.

Remaining consumers:

- `src/server/repository.ts::mutateStore` for compatibility actions that have not received direct repositories;
- the statistics import and selected profile/settings compatibility commands routed through that mutation path;
- `src/server/admin-state.ts` aggregate metadata reads;
- schema bootstrap/synchronization compatibility code and its legacy RLS tests.

These unrelated consumers remain for their owning stages.

## 13. Tests

`src/server/dashboard.test.ts` covers:

- CET and CEST boundaries;
- the spring DST transition day;
- local month bounds;
- chronological ordering;
- cancelled-lesson exclusion;
- group lesson identity and participant count;
- aggregated unfinished attention;
- package warning deduplication and resolution;
- monthly lesson count, cancelled exclusion, active Student definition, and completed-only teaching time.

The existing full Vitest suite and pgTAP suite remain green. The browser pass verified the rendered dashboard, mobile layout, Add Lesson composer, and Block Time reuse.

## 14. Known limitations

- Upcoming uses a 14-day search window to reliably return up to seven items; Calendar remains the complete schedule.
- Package attention reflects the authoritative ledger balance but does not provide purchase/payment management, which belongs to a later stage.
- There is no overdue Payment alert because no reliable due-date rule exists yet.
- No reminder failure is surfaced because current reminder delivery state does not yet expose a stable tutor-facing recovery route.
- The local database reset command could not be rerun in this environment because Windows held Next's native SWC binary during dependency setup and the sandbox rejected the destructive reset operation. The non-destructive local pgTAP run passed all 68 assertions.

## 15. Remaining technical debt

- Move statistics import and remaining profile/settings compatibility actions to direct relational repositories.
- Add a dedicated review queue when Lesson Workspace supports batch completion; until then, aggregated unfinished attention opens the oldest lesson.
- Add browser-level automated empty-account fixtures when the project adopts an E2E framework; no new framework was introduced for this stage.
- Consider cursor pagination if a future product tier exceeds the current solo-tutor scale.

## 16. Ready for Stage 3?

Yes. Dashboard lesson actions already target stable Lesson URLs and can be relabeled to Start/Open workspace without changing the dashboard read model or layout. Stage 3 can build the Lesson Workspace on top of normalized Lesson, participant, attendance, plan, and package foundations.

