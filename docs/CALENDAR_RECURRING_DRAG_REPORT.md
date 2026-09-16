# Calendar recurring drag report

## 1. Drag recurrence UX

Recurring Lessons are draggable in the desktop Day and Week calendar. Dropping an editable recurring occurrence does not persist immediately. It opens a Polish two-option dialog:

- **Tylko te zajęcia**
- **Te i kolejne zajęcia**

The user can cancel or confirm with **Przenieś**. The broader whole-series scope remains available only in the existing lesson edit form. CalendarBlocks and non-recurring Lessons retain their existing immediate drag behavior.

Completed recurring occurrences are also draggable as references. Their drop opens a separate explanation that the completed Lesson cannot move and offers **Przenieś przyszłe zajęcia** or **Anuluj**.

## 2. Only-this behavior

The `single` scope updates only the selected materialized Lesson. Its `recurring_series_id` and immutable `recurrence_original_starts_at` remain unchanged, so the row acts as the existing occurrence override. No sibling occurrence or recurrence rule is changed.

## 3. This-and-future behavior

The `future` scope uses the relational recurrence split command. The old series closes immediately before the split occurrence, a successor series is created through `parent_series_id`, and eligible materialized future Lessons are reparented to it.

The successor stores the dragged local weekday, local start time, duration, IANA timezone, shifted end date, and effective date. Materialized occurrences are recalculated from their original local occurrence dates rather than by adding one UTC offset, so the chosen wall-clock time remains stable across DST changes.

## 4. Historical completed occurrence fix

A completed recurring Lesson remains immutable. When it is used as a drag reference, the command locates the first future editable occurrence in the series lineage and uses that occurrence as the split point. The difference between the historical occurrence's original local date and the dragged local target becomes the weekday shift for the future schedule.

If no future editable occurrence exists, the command returns `NO_FUTURE_OCCURRENCES`, shown as: **W tej serii nie ma przyszłych zajęć do przeniesienia.** No successor series is created.

## 5. Series split rules

- Only non-completed, non-cancelled occurrences at or after the split key move.
- Descendant successor series are included when a historical ancestor is used as the reference.
- Superseded descendants are cancelled after their Lessons are reparented.
- The source series ends the day before the split or is cancelled when the split begins at its first occurrence.
- Repeating an already-applied move is a no-op, preventing duplicate successor series and duplicate sync jobs.
- Every candidate interval is validated before any series or Lesson update; PostgreSQL transaction rollback prevents partial moves.
- Nonexistent or ambiguous DST wall times are rejected instead of silently selecting an instant.

## 6. History protection

The future move updates only eligible future Lesson rows. It does not update completed Lesson timestamps or touch historical LessonParticipants, attendance, payment state, notes, homework, plan results, or package usages. The database tests verify attendance, participant payment history, notes, homework, and package consumption remain attached and unchanged.

## 7. Google sync

Moved future Lessons reuse `private.enqueue_lesson_side_effects`. Existing per-Lesson Google jobs are upserted through the unique `(teacher_id, lesson_id)` key and reset to pending; no duplicate provider jobs are created. Completed historical Lessons and their successful Google jobs are not updated by a future-only move. Sync remains outbound-only.

## 8. Tests

Coverage added for:

- recurring drag action scopes (`single` and `future`);
- only-this occurrence override behavior;
- scheduled this-and-future series split;
- completed historical reference with an unchanged completed Lesson;
- local weekday/time preservation across Warsaw DST;
- attendance, participant payment, notes, homework, and package-usage history;
- no-future rejection without a successor series;
- Google job reuse and historical job protection;
- idempotent historical retry;
- conflict rejection with full transactional rollback;
- local-domain fallback behavior for historical references.

Verification completed:

- Prettier on changed TypeScript and TSX files;
- ESLint;
- TypeScript;
- Vitest: 14 files / 80 tests;
- Supabase pgTAP: 6 files / 128 assertions.

## 9. Known limitations

- Drag remains a desktop Day/Week interaction; mobile keeps the existing agenda actions.
- Recurrence creation is still materialized to a bounded set of occurrences. The successor rule is correct for a future expander, but no background infinite-series expander is introduced here.
- The integration is outbound-only and does not use external Google busy time for conflict detection.
- The legacy full-series edit scope remains in the lesson workspace and is intentionally not offered by drag and drop.
