# L0.8 — Calendar hardening and regression

## Audit scope

This pass hardened the existing custom calendar. It did not add a calendar
framework, change the 30-minute snap, or introduce new calendar features.

The implementation inventory covered `CalendarPage`, the shared calendar
interaction helpers, timezone formatting, the lesson composer, the local
application service, the relational repository adapter, the scheduling RPCs,
and the existing TypeScript and pgTAP suites.

## Existing capability matrix

| Surface | Create | Open/edit | Drag | Range selection |
| --- | --- | --- | --- | --- |
| Desktop Day | Header actions, day add button, empty-slot click, or mouse range | Lesson cards open the existing lesson workspace; blocks can be deleted | Editable lessons and blocks | Mouse only; lesson or block action chooser |
| Desktop Week | Header actions, day add button, empty-slot click, or mouse range | Lesson cards open the existing lesson workspace; blocks can be deleted | Editable lessons and blocks | Mouse only; lesson or block action chooser |
| Desktop Month | Global lesson/block actions; clicking a day opens Day | Day drill-down; event indicators are summaries | No | No |
| Desktop Agenda | Global actions and per-day lesson add | Lesson rows open the workspace; blocks can be deleted | No | No |
| Mobile Day/Week | Global actions and per-day lesson add in the agenda representation | Lesson rows are tappable; blocks can be deleted | No | No |
| Mobile Month | Global actions; day tap opens Day | Day drill-down | No | No |
| Mobile Agenda | Global actions and per-day lesson add | Lesson rows are tappable; blocks can be deleted | No | No |

At the mobile breakpoint the desktop time grid is hidden and Day/Week uses the
existing agenda representation. Pointer range selection explicitly accepts a
mouse pointer only; touch scrolling is not converted into a selection gesture.

## Move semantics

### Ordinary lesson

The client sends `rescheduleLesson` with the existing lesson ID,
`expectedUpdatedAt`, and a new `startsAt`. Duration is omitted, so the server
preserves duration. Participants, topic, subject, price, color, format,
location, recurrence identity, and all lesson history remain on the same
record. The simple move is optimistic and updates only `startsAt` in every
matching AppData cache.

Cancelled lessons and completed non-recurring lessons are not draggable.
Completed recurring occurrences are draggable only as historical references
for an explicit future-only move.

### Recurring single

Dropping a scheduled recurring occurrence always opens the scope dialog.
**Tylko te zajęcia** sends `scope: "single"`; only the selected materialized
occurrence moves and the recurrence identity remains intact.

### Recurring future

**Te i kolejne zajęcia** sends `scope: "future"`. The relational scheduling
command splits the recurrence lineage and recalculates eligible occurrences
from local occurrence dates. Prior occurrences and completed history do not
move. This complex operation intentionally waits for the server and then
refetches instead of applying a naive multi-occurrence optimistic shift.

### Historical recurring occurrence

A completed occurrence is immutable. It may only reference an explicit
future-scope move. The first future editable occurrence becomes the split
point; attendance, participants, payments, notes, homework, package usage, and
the completed timestamps remain attached to history. A series with no future
occurrence returns `NO_FUTURE_OCCURRENCES`.

### Calendar block

The move keeps the block ID, title, color, timezone, and exact original
duration. Only `startsAt` and the duration-derived `endsAt` change. Regression
coverage includes 30, 90, and 240 minutes.

## Snapping, clamping, and selection

- Snap remains 30 minutes and uses nearest-snap rounding: 09:07 → 09:00,
  09:16 → 09:30, 09:44 → 09:30, and 09:46 → 10:00.
- Dragging above the grid clamps to `startHour`.
- Dragging below the grid clamps to `endHour - duration`, covered for 30, 60,
  90, and 120 minutes.
- Forward and reverse range drags normalize to the same interval.
- A same-slot range is at least 30 minutes.
- Movement below 6 px remains a click; 6 px begins range selection.
- Lesson presets preserve date, start time, selected student, and duration.
- Block presets preserve the exact selected date, start, and end without a
  second rounding pass.
- Closing the range chooser or choosing either action clears range state.

## Optimistic behavior and recovery

Simple lesson moves and block moves snapshot every React Query cache beginning
with `["app", teacherId]`, optimistically update all matching caches, and
restore every saved value on any persistence failure. Network failures,
validation failures, lesson conflicts, and stale writes all pass through this
same rollback boundary. Success does not invoke rollback; normal query
invalidation refreshes authoritative data.

`scope: "future"` deliberately skips the simple optimistic path because the
client cannot safely predict a recurrence split.

The local/file-backed service now enforces the same `expectedUpdatedAt` stale
write contract as the relational RPC for lesson and block moves. A successful
local lesson move also refreshes `updatedAt`, preventing a second move based on
the old snapshot.

## Conflict behavior

Intervals use half-open overlap checks: `starts_at < rangeEnd` and
`ends_at > rangeStart`. An event ending exactly at the query start or beginning
exactly at the query end is excluded; an event crossing an edge is included.

- Lesson ↔ lesson, lesson ↔ block, block ↔ block, recurring unavailability,
  and opaque/busy external Google time are enforced server-side.
- Transparent Google events are visible but do not block local scheduling.
- A hard collision returns `LESSON_CONFLICT` and cannot be overridden.
- Moving outside regular availability returns `OUTSIDE_AVAILABILITY`. The
  confirmation retries the exact entry/start pair with
  `allowOutsideAvailability: true` and retains `single` or `future` scope.
- Errors are displayed through the existing safe toast infrastructure rather
  than exposing raw server errors.

The existing planning-mode `canMerge` path remains a hand-off to the lesson
composer. It does not directly mutate the conflicting lesson from the
calendar. Lesson creation continues to use the existing `requestId`
idempotency contract.

## Timezone and DST policy

All display and mutation conversion uses the teacher's IANA timezone, not the
browser machine timezone. Monday-first week dates and query boundaries are
derived from teacher-local date keys.

- `2026-03-29 02:30 Europe/Warsaw` is rejected with
  `NONEXISTENT_LOCAL_TIME`.
- `2026-10-25 02:30 Europe/Warsaw` is rejected with
  `AMBIGUOUS_LOCAL_TIME`.
- 01:30 and 03:30 on both transition dates remain valid.
- Weekly recurrence generation keeps the requested local wall-clock time
  across both spring and autumn transitions; the UTC offset changes.
- Europe/London and America/New_York conversions prove the implementation is
  not hardcoded to Warsaw.
- Week coverage includes Sunday-to-Monday, month, and year boundaries.

Day queries are start-inclusive/end-exclusive local days, including the
23-hour Warsaw spring-transition day. Week/Agenda queries cover Monday through
the following Monday. Month queries intentionally cover only the displayed
current-month cells, from the first local day through the first local day of
the next month.

## Calendar bounds and empty state

The existing bounds calculation is now a tested pure helper. Lessons,
availability, blocks, and timed Google events can extend the working window;
the result remains capped at 24:00. With no timed data the grid keeps its
07:00–22:00 fallback.

## Read-only and external Google events

Read-only subscriptions can view every calendar view. Header creation,
per-day creation, range selection, lesson/block dragging, and block deletion
are disabled at the interaction surfaces, with server-side `READ_ONLY`
enforcement remaining authoritative.

External Google events render as labelled, read-only elements. They have no
drag handler, never become a lesson/block drag entry, and cannot issue
`rescheduleLesson` or `updateCalendarBlock`. Local saves remain authoritative;
Google synchronization continues through the existing background pending-job
path and is not called from `CalendarPage`.

## Accessibility

Lesson rows/cards remain keyboard-focusable links to the lesson workspace,
which provides the non-drag rescheduling path. Add, navigation, deletion, and
range-choice actions are native buttons. External events have accessible
labels, and Radix dialogs provide titles, descriptions, focus management, and
Escape dismissal. Errors use the existing live toast/status UI. Drag remains
a desktop enhancement rather than the sole route to lesson rescheduling.

## Resize audit

Resize is not currently implemented and was not added in L0.8. No resize
handle, resize pointer state, resize mutation, or resize-specific server action
exists. All moves preserve duration.

## Mobile behavior

At 390 × 844 the intended surface is the Day agenda. Previous/next navigation,
lesson links, creation controls, external-event labelling, block deletion, and
full-screen mobile dialogs remain available. The desktop grid, mouse drag, and
mouse range selection are intentionally hidden, which keeps native scrolling
usable and avoids accidental touch-created ranges.

## Production relational path

Production scheduling still runs through `mutateSchedulingDomain` and the
existing transactional RPCs. `reschedule_lesson_relational` receives scope,
`expectedUpdatedAt`, and `allowOutsideAvailability`; the calendar-block RPC
receives `expectedUpdatedAt`. Existing pgTAP coverage protects single and
future recurrence moves, history immutability, DST-safe wall-clock behavior,
transactional conflict rollback, block duration/conflicts, Google job reuse,
and tenant isolation. No schema, migration, RLS, or SQL change was required.

## Deferred

- Cross-midnight CalendarBlock creation is intentionally unavailable because
  the current form uses one date and requires `end > start`.
- Lesson intervals are stored as absolute start plus duration, but the visual
  grid does not split one lesson into two day-column segments. Adding a
  cross-midnight segment renderer is deferred; it is not part of the existing
  creation interaction contract.
- Mobile drag/range gestures remain intentionally absent.
- The legacy full-series recurrence scope remains in the lesson workspace and
  is intentionally not offered by calendar drag.
