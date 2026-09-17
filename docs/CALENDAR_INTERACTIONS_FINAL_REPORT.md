# CALENDAR IMPROVEMENTS — COMPLETED

## 1. Drag & drop

- Browser-verified a single Lesson move from Monday 23:00 to Tuesday 20:00 at 1440×900. The event kept its 60-minute duration.
- Browser-verified a CalendarBlock move from Thursday 16:00–17:30 to Friday 14:00–15:30. It remained a CalendarBlock and kept its 90-minute duration.
- Optimistic cache updates snapshot every matching calendar query and roll back on mutation failure.
- Final server checks use half-open overlap rules, so adjacent intervals remain valid.
- Lesson, CalendarBlock, and recurring-unavailability collisions are enforced server-side.

## 2. Range selection

- Browser-selected 16:00–17:30 in the desktop week grid.
- **Dodaj zajęcia** opened the existing Lesson composer with date, 16:00, and 90 minutes prefilled.
- **Zablokuj czas** opened the existing CalendarBlock dialog with date, 16:00, and 17:30 prefilled.
- Pointer capture, a 6 px movement threshold, and the existing 30-minute snap preserve click-to-add behavior.

## 3. Recurring drag scopes

- Browser-created a four-occurrence weekly series and verified **Tylko te zajęcia** moved only the selected occurrence from Thursday 12:00 to Friday 10:00; the following Thursday occurrence remained at 12:00.
- Browser-verified **Te i kolejne zajęcia** moved the selected and later occurrences to Friday 11:00.
- Database coverage verifies series splitting, recurrence lineage, DST-safe wall-clock time, idempotent retries, conflict rollback, and reuse of the unique Google job.

## 4. Historical recurrence bug fix

- Completed recurring Lessons are usable only as a reference for a future-only move; their timestamps and status are not updated.
- pgTAP verifies completed Lesson history, attendance, LessonParticipants/payment status, notes, homework, PackageUsage, and the historical Google job remain unchanged.
- If no eligible future occurrence exists, the command returns `NO_FUTURE_OCCURRENCES` without creating a successor series.

## 5. Calendar colors

- Lessons and CalendarBlocks support the shared predefined palette and normalized custom `#RRGGBB` colors.
- Browser-verified a Lesson change from blue to rose; the calendar event updated to `#D98593` with a derived `#F7E4E7` surface and black foreground.
- Exact occurrence colors preserve history; recurring scopes update only eligible future Lessons and the intended series defaults.
- Invalid CSS values are rejected in Zod and by database constraints.

## 6. Google color sync

- Outbound event resources now include the nearest deterministic Google Calendar `colorId`.
- Drag/reschedule and color mutations mark only intended Lessons pending and upsert the existing `(teacher_id, lesson_id)` job.
- The worker PATCHes the deterministic event ID and only POSTs after a provider 404, preventing duplicate application jobs/events during normal retries.
- No inbound sync path was added.
- Unit and pgTAP coverage passed. A live Google account was not connected in this environment, so no provider-side end-to-end call was claimed.

## 7. Lesson Workspace tint

- Browser-verified the Workspace variables changed from blue `#6F8FEF` / tint `#EEF2FD` to rose `#D98593` / tint `#FAF0F2` after save.
- The Lesson header and plan use an opaque, strongly white-mixed tint; saturated source colors remain limited to accents.

## 8. Recurring unavailability

- The settings form now distinguishes weekly **Dostępny** and **Niedostępny** rules.
- Browser-created Saturday 10:00–20:00 recurring unavailability and verified it renders on two consecutive calendar weeks.
- A database trigger makes recurring unavailability a hard Lesson scheduling conflict, including drag/reschedule and explicit outside-hours overrides.
- The trigger evaluates only dates spanned by the candidate Lesson; it does not materialize recurring blocks.
- A pre-existing visual bug was fixed so an all-day available rule is not styled as unavailable.

## 9. Conflict integration

- Lesson ↔ Lesson, Lesson ↔ CalendarBlock, CalendarBlock ↔ CalendarBlock, and Lesson ↔ recurring-unavailability checks are covered.
- Start/end comparisons remain half-open: an event ending at 10:00 or starting at 20:00 is valid beside a 10:00–20:00 unavailable interval.
- Relational failures roll back transactionally; local-store mutations validate before writing.

## 10. Responsive/accessibility

- 1440×900: Day, Week, and Month views rendered without horizontal overflow or a framework error overlay.
- 390×844: mobile Day agenda rendered, the desktop grid was hidden, and no horizontal overflow occurred.
- Both final desktop and mobile browser passes had no console warnings/errors.
- Status remains available through text/badges, line-through, borders, patterns, and labels rather than color alone.
- Palette controls expose accessible names, pressed state, focus styling, and a visible selection check.
- Very light `#FFFFFF`, very dark `#050505`, and saturated `#FF00FF` custom colors have automated WCAG AA contrast checks on the derived calendar surface.
- Foreground selection now compares black and white contrast ratios instead of using a fixed luminance threshold.

## 11. Tests

- Calendar interaction unit tests cover duration preservation, optimistic moves/rollback, range normalization, and recurrence scopes.
- Color tests cover normalization, invalid CSS, predefined/custom colors, tinting, readable foregrounds, Google mapping, and provider identity preservation.
- Application-service tests cover recurring unavailability across consecutive weeks, hard override rejection, and adjacent intervals.
- pgTAP covers tenant isolation, history protection, recurrence splits, Google job reuse, calendar colors, and recurring unavailability.
- Supabase security/performance advisors reported no warnings or errors.

## 12. Files changed

Application and UI:

- `src/components/pages/calendar-page.tsx`
- `src/components/pages/availability-settings.tsx`
- `src/components/pages/lesson-page.tsx`
- `src/components/lesson-composer.tsx`
- `src/components/calendar-color-picker.tsx`
- `src/app/globals.css`

Domain, validation, and interactions:

- `src/lib/domain.ts`
- `src/lib/validation.ts`
- `src/lib/validation.test.ts`
- `src/lib/calendar-interactions.ts`
- `src/lib/calendar-interactions.test.ts`
- `src/lib/calendar-colors.ts`
- `src/lib/calendar-colors.test.ts`
- `src/lib/lesson-workspace.ts`
- `src/lib/progress.test.ts`

Server and Google sync:

- `src/server/app-service.ts`
- `src/server/app-service.test.ts`
- `src/server/repository.ts`
- `src/server/store.ts`
- `src/server/lesson-workspace.ts`
- `src/server/google-calendar.ts`
- `src/server/google-calendar.test.ts`
- `src/server/google-calendar-colors.ts`
- `src/server/google-calendar-colors.test.ts`
- `src/app/api/cron/google-sync/route.ts`

Database and reports:

- `supabase/migrations/20260917093140_calendar_recurring_unavailability.sql`
- `supabase/migrations/20260917160000_calendar_colors.sql`
- `supabase/tests/calendar_recurring_unavailability.sql`
- `supabase/tests/calendar_colors.sql`
- `docs/CALENDAR_COLORS_REPORT.md`
- `docs/CALENDAR_INTERACTIONS_FINAL_REPORT.md`

The recurring-drag implementation and its pgTAP suite were already present in `supabase/migrations/20260917120000_calendar_recurring_drag.sql` and `supabase/tests/calendar_recurring_drag.sql` and were reverified unchanged.

## 13. Commands executed

Final successful verification commands:

```bash
npm run format
npm run lint
npm run typecheck
npm test
npm run build
npx supabase db reset --local --yes
npx supabase test db --local
npx supabase db advisors --local --type all --level warn --fail-on none
git diff --check
```

Supporting inspection commands included `npx supabase --version`, the Supabase CLI `--help` commands, targeted Vitest/typecheck runs, source searches, and browser checks through the local Next.js dev server.

One first pgTAP run failed only because the new test file declared 8 tests while executing 9. The plan was corrected to 9 and the complete suite was rerun successfully. An offline-only `npx` probe also failed because the Supabase CLI package was not already cached; the approved normal CLI invocation succeeded.

## 14. Build/test results

| Check | Result |
| --- | --- |
| `npm run format` | PASS |
| `npm run lint` | PASS |
| `npm run typecheck` | PASS |
| `npm test` | PASS — 17 files / 93 tests |
| `npm run build` | PASS — Next.js 16.3.4 production build, 34 pages generated |
| `supabase db reset` | PASS — all migrations and seed applied |
| `supabase test db` | PASS — 8 files / 150 tests |
| Supabase advisors | PASS — no issues found |
| `git diff --check` | PASS |
| Desktop browser 1440×900 | PASS |
| Mobile browser 390×844 | PASS |
| Final browser console | PASS — no warnings/errors |

## 15. Known limitations

- Browser drag/range selection remains desktop-only; mobile intentionally uses the agenda and existing add actions.
- Recurrence occurrences are still materialized to a bounded set at creation time; no infinite background expander was introduced.
- Google’s fixed event palette approximates arbitrary custom hex colors.
- Google verification in this environment is automated/local only because no live Google Calendar connection was available.
- The app intentionally remains outbound-only for Google Calendar.
