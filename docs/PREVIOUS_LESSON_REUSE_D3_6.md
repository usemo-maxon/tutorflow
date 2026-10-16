# Previous Lesson Reuse — D3.6

## Purpose

`Bazuj na poprzedniej lekcji` lets a tutor append reusable preparation from a completed lesson to an upcoming lesson. It extends the D3.5 plan builder and canonical Materials Library; it does not introduce another planning model.

## Eligible source lessons

The workspace response contains at most five completed lessons before the target lesson, newest first.

- An individual target only receives lessons with the same `student_id`.
- A group target only receives lessons with the same `group_id`.
- Cancelled, future, unrelated and cross-workspace lessons are excluded.
- The database function repeats these checks and never trusts client-supplied workspace or relationship data.

## Copy semantics

The tutor previews the source and can deselect individual sections or materials. The optional source objective is off by default.

Applying a selection atomically:

- appends new `lesson_plan_items` in source order;
- copies section title, reusable instructions and estimated duration;
- gives every copied section a new identity and resets `completed` to `false`;
- attaches selected canonical Material IDs with `on conflict do nothing`;
- appends the source objective to the current objective only when explicitly selected;
- updates the target lesson timestamp without changing the source.

The target and source rows are independent after the copy. Editing either plan later cannot mutate the other.

## Existing target plan

Reuse always means **Dodaj do istniejącego planu**. Existing sections, materials and the current objective are preserved. There is no replacement mode in D3.6. Invoking reuse again creates a visibly separate user action; a transport retry of one action uses the same import receipt and is a no-op.

## Materials

Materials remain canonical `materials` rows joined through `lesson_materials`; uploaded files are not duplicated. Existing target attachments are deduplicated. Archived materials are labelled in the preview and may be selected while they remain readable under existing workspace rules. Missing or inaccessible references are labelled unavailable, disabled, and do not block the remaining selection.

## Data explicitly excluded

The reuse function reads only `lesson_plan_items`, the tutor's `objectives` note and selected `lesson_materials`. It never reads or writes:

- attendance or lesson status;
- completion timestamps or plan completion state;
- `lesson_student_outcomes`, progress, difficulty or next steps;
- homework or homework completion;
- payments, charges, package usage or other finance rows;
- private/general notes, student summaries or feedback;
- Student Memory or Group Continuity records.

D1 briefing remains a separate contextual panel and is not importable content.

## Group lessons and privacy

Only the shared plan and shared lesson-material references of the same Group Lesson are reusable. Participant attendance, individual outcomes, homework state and personal notes are outside the function. No participant IDs are accepted in the request.

## Security and reliability

The server derives the workspace from the authenticated tutor profile. Reads continue through workspace RLS. Mutations require `private.can_mutate_workspace`, so read-only subscriptions cannot apply a reuse. The `security invoker` database function validates source and target workspace, lifecycle, participant identity and chronology again inside one transaction.

`lesson_reuse_imports` stores a `(target_lesson_id, import_key)` receipt. A retry with the same UUID returns safely before any insert; an intentional second reuse gets a new UUID. RLS is enabled on the receipt table and only active workspace members can read it or writable members can insert it.

## Mobile behavior

At widths up to 760 px, including 390 × 844, the source list and preview collapse to one column. The dialog remains scrollable, uses native checkboxes, and keeps the cancel/apply footer actions available without a multi-step wizard.
