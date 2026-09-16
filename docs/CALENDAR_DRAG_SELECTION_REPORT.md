# Calendar drag & selection report

## 1. Calendar library capabilities used

The product uses its own React calendar grid rather than a third-party calendar package. The implementation therefore uses browser-native capabilities already compatible with the grid:

- HTML Drag and Drop for desktop lesson and CalendarBlock moves;
- Pointer Events with pointer capture for empty-range selection;
- a 6 px movement threshold to distinguish a range drag from a click;
- the existing 30-minute calendar snap;
- the existing Day/Week grid, mobile Agenda rendering, Radix dialogs, and TanStack Query cache.

## 2. Drag implementation

Non-recurring, editable Lessons and CalendarBlocks are draggable in Day/Week views. A target preview shows the resulting start/end time and retains the entry's visual type. Native drag ghosts remain readable and draggable entries use grab/grabbing cursors.

Drop handling builds an existing `rescheduleLesson` or `updateCalendarBlock` action. The React component never writes to Supabase. The client snapshots all matching calendar query caches, applies an optimistic move, calls the server mutation, then restores every snapshot on failure. Successful mutations keep the optimistic result while the existing query invalidation refreshes authoritative data.

The move action includes `expectedUpdatedAt` when available. Lesson duration is omitted from the reschedule action so the domain preserves its existing value. CalendarBlock end time is recalculated from the original duration.

## 3. Conflict behavior

All final decisions remain server-side:

- Lessons are checked against Lessons and CalendarBlocks;
- CalendarBlocks are checked against Lessons and other CalendarBlocks;
- recurring and one-off availability rules and availability exceptions remain enforced by the existing lesson scheduling policy;
- relational production mutations run through the existing transactional Postgres RPCs and advisory lock;
- local-domain mutations keep the same overlap predicate.

Intervals remain half-open (`start < otherEnd && end > otherStart`), so adjacent entries are accepted. A failed move is rolled back both transactionally on the server and visually in the client cache.

Moving a Lesson outside regular availability opens an explicit warning. Choosing **Przenieś mimo to** retries the same server mutation with `allowOutsideAvailability: true`; no hard collision can be overridden.

## 4. Range selection

Mouse drag on an empty desktop Day/Week column paints a snapped range preview. On release, a compact Polish action chooser appears at the pointer:

- **Dodaj zajęcia**
- **Zablokuj czas**
- **Anuluj**

Selection does not start from an event or interactive control. Pointer capture keeps the gesture stable when the pointer leaves the initial slot. A movement below 6 px keeps the existing single-click behavior instead of opening the chooser.

## 5. Lesson/Block composer reuse

**Dodaj zajęcia** calls the existing global Lesson composer with `date`, `time`, and `durationMinutes`. The selected duration is preserved when the tutor subsequently chooses a Student or Group.

**Zablokuj czas** opens the existing CalendarBlock dialog with the selected `date`, `start`, and `end`. It still creates only a CalendarBlock and does not create participants, payments, attendance, or lesson records.

## 6. Mobile behavior

At the existing mobile breakpoint the desktop grid remains hidden and the established Day agenda UI remains primary. Mouse range selection is not mounted into that UI. Native touch dragging is not forced; existing add-lesson and block-time buttons remain available.

Verified at:

- 1440×900: Week grid visible, range chooser and both prefill paths work;
- 390×844: Day agenda visible, grid hidden, no horizontal overflow, no range chooser.

## 7. Tests

Automated coverage includes:

- single Lesson optimistic move;
- CalendarBlock optimistic move;
- duration preservation for both types;
- optimistic rollback after mutation failure;
- range normalization and exact selected duration;
- Lesson composer preset mapping;
- CalendarBlock form preset mapping;
- server conflict rejection with persisted-state rollback;
- adjacent Lesson/CalendarBlock acceptance;
- relational CalendarBlock move without creating Lessons;
- pgTAP coverage for Lesson and CalendarBlock move duration, adjacency, conflict rejection, and transactional rollback.

Verification completed:

- Prettier on changed TypeScript/TSX/CSS files;
- ESLint;
- TypeScript;
- Vitest: 14 files / 78 tests;
- production Next.js build;
- Supabase pgTAP: 5 files / 100 tests;
- live browser checks with no framework overlay or console errors.

## 8. Known limitations

- Recurring Lesson entries are intentionally not draggable in this task.
- Resizing is not implemented; every drag preserves duration.
- Selection and drop targets use the calendar's existing 30-minute snap.
- Touch drag/range selection is intentionally disabled in favor of the existing mobile actions.
- Completed and cancelled Lessons remain non-draggable because existing domain policy makes them immutable from the calendar.

## 9. Ready for recurring drag behavior?

Yes, at the infrastructure level. The drag payload, optimistic cache transaction, server action, conflict handling, availability override, and rollback path can be reused. Task 2 still needs a recurrence-scope chooser (`single`, `future`, or `series`), recurrence-specific confirmation copy, and UI tests covering series split behavior before recurring entries should be enabled for drag.
