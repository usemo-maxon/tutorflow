# Calendar colors report

## 1. Color ownership/model

The pre-change audit found no color field on `Lesson`, `RecurringLessonSeries`, `CalendarBlock`, `Student`, `Group`, or Google sync metadata.

The relational model now has one calendar-color concept, stored as normalized uppercase `#RRGGBB`:

- `lessons.color` is the exact color of an occurrence. It also makes historical color preservation explicit.
- `recurring_lesson_series.color` is the default for its recurring series. New series descendants inherit their parent series color through a database trigger.
- `calendar_blocks.color` is owned by each block.
- `students` and `groups` remain unchanged; neither is made a color owner.
- Google sync metadata remains unchanged; provider-specific color IDs are derived only when building the outbound event.

Existing rows are backfilled with `#6F8FEF` for lessons/series and `#7F8A9A` for blocks. Database constraints and server schemas reject arbitrary CSS and non-normalized values.

## 2. Palette

The shared palette lives in `src/lib/calendar-colors.ts` and is not duplicated in UI components:

| Name | Hex |
| --- | --- |
| Blue | `#6F8FEF` |
| Sky | `#6FAFD9` |
| Teal | `#63B3A6` |
| Sage | `#8FAF8F` |
| Mint | `#8FC9B5` |
| Amber | `#D8A85D` |
| Peach | `#E3A17E` |
| Rose | `#D98593` |
| Lavender | `#9B8FD6` |
| Plum | `#9A78A8` |
| Slate | `#7F8A9A` |
| Sand | `#B6A58D` |

The default lesson color is Blue. The default block color is Slate.

## 3. Custom color

`CalendarColorPicker` presents the palette plus a `Własny` control backed by the browser’s standard `input[type=color]` spectrum. Custom values are normalized to uppercase and stored exactly in easy4tutor. Selection uses both a check/ring and an accessible pressed state/label, so selection is not communicated by hue alone.

Color is not a required user decision: every creation flow starts with a sensible default.

## 4. Calendar rendering

Week/day events, CalendarBlocks, agenda rows, and compact month items use the same source color. Rendering uses:

- a low-saturation derived surface;
- a stronger left accent/border in the exact color;
- readable foreground selection;
- existing status text/badges and separate warning, sync-error, completion, and cancellation treatments.

Cancelled events retain a line-through and hatch/outline. Completed and needs-completion states retain non-color-only outlines, opacity, and text labels.

## 5. Lesson Workspace tint

The Lesson header and Lesson Plan area derive an opaque, very light tint through `getCalendarTint()`. Dark or bright custom colors are mixed toward white before being used on large surfaces. The saturated source color is limited to accents, and editor fields keep their normal readable surfaces and foreground colors.

This creates the visual link `Calendar event → Lesson → Lesson Plan` without painting the full workspace.

## 6. Recurrence behavior

The Lesson Workspace exposes these scopes when the lesson belongs to a series:

- `Tylko te zajęcia` updates only the selected occurrence and leaves the series default unchanged.
- `Te i kolejne zajęcia` updates the selected and later non-completed occurrences and the series default.
- `Wszystkie przyszłe w serii` updates future non-completed occurrences in the current series branch and descendants, plus their series defaults.

Completed/cancelled and already historical occurrence rows are not recolored by future/series operations. Because occurrences store their exact color, changing the series default does not retroactively change history. The existing Google job unique key is reused for every affected occurrence.

## 7. Google mapping/sync

The current integration writes Google Calendar event resources and does not manage Google’s newer user-defined event labels. Outbound events therefore use the Calendar API’s writable `colorId` field. The exact easy4tutor hex remains the source of truth.

`src/server/google-calendar-colors.ts` owns the fixed Google event palette and deterministic nearest-color calculation in linear RGB space. No Google IDs leak into the UI or domain model.

Creation enqueues the existing job with the chosen color already stored. A color edit marks affected sync-enabled lessons pending and upserts the same `(teacher_id, lesson_id)` job, so the worker patches existing Google events and does not create duplicates. Recurring future changes enqueue only the affected occurrence IDs.

Reference: [Google Calendar Events resource](https://developers.google.com/workspace/calendar/api/v3/reference/events) and [Colors endpoint](https://developers.google.com/workspace/calendar/api/v3/reference/colors/get).

## 8. Accessibility

- Palette controls have accessible names, `aria-pressed`, keyboard focus, and check/ring selection.
- Event status, cancellation, completion, conflicts, and Google sync errors retain text, icons, borders, or patterns independent of color.
- `getReadableForeground()` chooses a light or dark foreground for arbitrary custom colors.
- `getCalendarTint()` prevents arbitrary saturated custom values from becoming large page backgrounds.

## 9. Tests

Coverage includes:

- valid normalization and invalid CSS rejection;
- default color and safe pastel tint;
- readable foreground selection;
- exact custom color persistence;
- single occurrence and future recurrence scopes;
- historical occurrence preservation;
- CalendarBlock color;
- deterministic Google mapping;
- outbound event recoloring without changing easy4tutor event identity;
- database constraints, series inheritance, and scoped updates in `supabase/tests/calendar_colors.sql`.

Project verification commands: `npm run typecheck`, `npm test`, `npm run lint`, `npm run format:check`, and `npm run build`.

## 10. Known limitations

- Google’s fixed event colors cannot represent every custom hex exactly; the approximation is outbound-only. Inbound color synchronization is intentionally unchanged.
- The integration does not create or manage Google event labels. Adopting labels later would require label lifecycle, permissions, and per-calendar reconciliation rather than a local color-model change.
- The current scheduling architecture materializes recurring occurrences up front. The series trigger protects color inheritance for new split/descendant series, while scoped updates explicitly recolor already materialized future occurrences.
- Database pgTAP coverage is included, but it requires the project’s local Supabase test environment to execute.
