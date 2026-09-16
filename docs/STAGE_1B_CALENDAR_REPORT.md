# Stage 1B — Calendar & Recurring Lessons

## 1. Audit findings

The repository already contained a capable Polish calendar UI with day/week/month/agenda views, a time-positioned week grid, current-time marker, drag-to-reschedule, lesson composer, lesson workspace, Google outbound jobs, reminder deliveries, and a sound Stage 0 relational schema. The main problem was the command path: production lesson and availability writes still entered the versioned `teacher_states` aggregate. Calendar reads also fetched the entire lesson history, the composer only selected students, recurrence was materialized from a limited frontend display rule, calendar blocks and availability exceptions had no daily UI, and recurrence edits offered only one/future scopes.

## 2. Calendar implementation

`src/components/pages/calendar-page.tsx` keeps the existing `/app/kalendarz` route and design system. It now requests an overlap-filtered visible range, remembers the selected view, defaults small screens to a focused day, renders relational Lessons and CalendarBlocks separately, uses availability to determine useful hours, shows group names/member counts, and retains the existing current-time, loading, empty, status, keyboard-focus, and Polish locale behavior.

## 3. Routes and components

- `/app/kalendarz`: day/week/month/agenda calendar workspace.
- `src/components/lesson-composer.tsx`: quick individual, group, multiple, and recurring creation.
- `/app/lekcje/[lessonId]` via `src/components/pages/lesson-page.tsx`: existing lesson workspace plus manual reschedule/cancel and recurrence scope controls.
- `/app/ustawienia/dostepnosc` via `src/components/pages/availability-settings.tsx`: weekly intervals and date exceptions.

No fake route or replacement lesson workspace was added.

## 4. Lesson read/write flow

Visible-range reads are `Calendar UI → useAppData(range) → GET /api/app?start&end → repository → lessons/calendar_blocks overlap query`. Normal writes are `UI → POST /api/app → centralized Zod schema → application service → scheduling repository → RLS-scoped PostgreSQL/RPC`. React components do not write Supabase tables directly.

## 5. Recurrence architecture

The Stage 0 model is retained. `recurring_lesson_series` stores interval, ISO weekdays, local start time, duration, IANA timezone, optional end date, status, `parent_series_id`, and `effective_from`. Each materialized occurrence remains a normal Lesson with `recurring_series_id` and `recurrence_original_starts_at`. The composer supports weekly/every-N-weeks, multiple weekdays, count, and optional end date.

## 6. Occurrence override behavior

“Tylko ta lekcja” updates the selected materialized Lesson while retaining the series ID and immutable `recurrence_original_starts_at`. That original occurrence key is the existing Stage 0 override mechanism; no duplicate exception table was introduced.

## 7. This-and-future series split behavior

`reschedule_lesson_relational` closes the old series before the selected local occurrence date, creates a successor linked through `parent_series_id`, reparents eligible future occurrences, and moves them transactionally. The old series is cancelled only when the split starts at its first occurrence. Completed and cancelled history is excluded from movement.

## 8. Historical integrity rules

Completed lessons cannot be rescheduled or cancelled through calendar commands. Entire-series edits affect eligible future materialized occurrences, not completed history. Stale writes may supply `expectedUpdatedAt` and fail with a user-readable refresh message. Cancellation changes lifecycle state instead of deleting the Lesson.

## 9. Group participant history semantics

Creating a group Lesson snapshots every currently active relational GroupMember into `lesson_participants` and creates matching Attendance rows. Later membership suspension, removal, or addition does not rewrite historical lesson participants or attendance.

## 10. CalendarBlocks

CalendarBlocks have their own form, table, rendering, range query, and transactional create/update command. They contain no Student, Group, Payment, or Attendance. The server rejects block-vs-Lesson and block-vs-block overlap with half-open interval semantics.

## 11. Availability

Weekly rules support multiple relational rows per weekday. Stage 1B adds `is_available` so new rules express regular working windows while legacy unavailable rules remain readable. Date exceptions support an unavailable day or an available-only interval. Manual scheduling outside availability returns a soft warning and succeeds only after an explicit “Utwórz mimo to” override.

## 12. Conflict detection

Conflict checks run inside the database transaction under a per-tutor advisory transaction lock. Active Lessons and CalendarBlocks use `start < otherEnd AND end > otherStart`; therefore 17:00–18:00 and 18:00–19:00 are valid. The existing integration does not expose reliable inbound Google busy intervals, so external Google events are not included and no false bidirectional behavior is claimed.

## 13. Timezone and DST strategy

The database stores `timestamptz`/UTC and every Lesson/series/block retains an IANA timezone. Recurrence generation converts each local wall-clock occurrence separately, keeping 17:00 Warsaw stable across both CET→CEST and CEST→CET. `localInputToUtc` round-trips through `date-fns-tz` and rejects nonexistent or ambiguous local times rather than silently choosing an instant.

## 14. Google Calendar sync behavior and direction

Synchronization remains outbound: relational Lesson create/edit/reschedule/cancel sets sync state and upserts the durable Google job. OAuth, encrypted credentials, provider IDs, retry processing, and loop concerns remain in the integration layer. A narrow private helper returns only whether Google is connected; authenticated users still cannot read the credential table. Full inbound event synchronization and external busy import are not implemented.

## 15. Reminder compatibility

Create/reschedule refreshes pending reminder deliveries from the Lesson instant. Cancellation removes pending/failed reminders. Existing reminder workers still consume normalized Lesson state; scheduling a Lesson does not create a Payment or consume a Package.

## 16. `teacher_states` migration before/after

Before Stage 1B, Lesson create/edit/reschedule/cancel, recurring materialization, availability changes, and related calendar commands entered `mutateStore`, checked `teacher_states.version`, called `update_teacher_state`, and relied on compatibility synchronization. After Stage 1B, every normal lesson, recurrence, availability, exception, CalendarBlock, payment-status, sync-retry, and lesson-workspace mutation is routed through `mutateSchedulingDomain` and normalized tables. There is no scheduling dual-write.

Remaining consumers are statistics import and selected profile/settings compatibility commands in `src/server/app-service.ts`, aggregate version machinery in `src/server/repository.ts::mutateStore`, and aggregate metadata reads in `src/server/admin-state.ts`. The table/bootstrap/sync function and legacy RLS tests remain until those later stages migrate.

## 17. Security and RLS

RPCs derive user/workspace from `auth.uid()`, use an empty `search_path`, preserve table RLS as SECURITY INVOKER, and expose explicit authenticated grants. The only SECURITY DEFINER addition is a narrow boolean Google-connection check; it validates the caller/workspace and exposes no credentials. Composite workspace foreign keys reject cross-tenant participant links. pgTAP covers cross-workspace Lesson reads/mutations, block/availability mutations, and participant linking.

## 18. Tests

- Vitest covers centralized validation, lifecycle rules, recurrence weekdays/interval/end date, both Warsaw DST transitions, invalid/ambiguous local times, package boundaries, local scheduling conflicts, archive behavior, and existing integration paths.
- `supabase/tests/stage_1b_calendar.sql` adds 25 assertions for individual/group creation, participant snapshots, adjacency, overlap, archived targets, CalendarBlocks, recurrence, DST, future split, immutable completed history, cancellation, availability override, and tenant isolation.
- The full prior pgTAP suite remains part of `npx supabase test db`.

Final verification: Prettier, ESLint, TypeScript, 51 Vitest tests, the Next.js production build, deterministic `supabase db reset`, and all 64 pgTAP assertions pass. Manual browser verification at 1440×900 and 390×844 covered desktop week, mobile day, quick create, combined Student/Group selection, recurrence controls, availability/exceptions, and console errors. The manual pass found and fixed an all-weekdays checkbox coercion bug; the repeated frontend gate stayed green.

## 19. Known limitations

- Google integration is outbound-only and does not supply external busy periods.
- Recurrences are materialized at creation; there is no background infinite-series expander. The quick form caps a save at 52 occurrences.
- CalendarBlock UI supports create/display/delete; the repository/domain also supports stale-write-safe updates, but an inline visual edit affordance is deferred.
- Drag-and-drop remains limited to non-recurring Lessons; recurring movement uses the explicit scope dialog in the Lesson page.

## 20. Remaining technical debt

Related child rows for a range-filtered lesson response are still fetched in workspace batches before in-memory association. This avoids N+1 and is appropriate for the current tutor scale, but a future repository pass can filter every child query by visible lesson IDs. The legacy statistics/profile compatibility actions should receive direct repositories in their owning stage, after which `teacher_states` and its sync function can be retired.

## 21. Ready for Stage 2?

Yes. The Calendar can act as the daily scheduling source of truth: normalized Lesson/group/series/block/availability state, transactional overlap checks, stable history, correct local-time recurrence, outbound sync/reminder hooks, and responsive day/week/month interaction are in place. Stage 2 can consume relational “today” and “upcoming” queries without reviving the JSON aggregate.
