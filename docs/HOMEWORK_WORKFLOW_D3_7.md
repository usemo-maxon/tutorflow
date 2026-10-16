# Homework Workflow — D3.7

## Canonical model

`public.homeworks` remains the single lesson-level homework record introduced in Stage 0. Its `lesson_id` uniqueness guarantees that the lesson editor and the D1.2 completion dialog update the same assignment instead of creating parallel records.

D3.7 adds two normalized relationships:

- `homework_assignments` snapshots the intended students and stores each student's `assigned`, `completed`, `reviewed`, or `not_completed` state plus optional tutor feedback;
- `homework_materials` references canonical `materials` rows. It never copies a file and does not alter persistent student/group material assignments.

`Po terminie` is calculated from `due_at`, the current time, and the recipient's still-`assigned` state. It is not stored.

## Assignment lifecycle

The lesson workspace uses `upsert_lesson_homework`, a transaction-scoped, security-invoker function. It validates the lesson participant snapshot and material workspace before it upserts the one canonical homework row, recipient rows, and material joins. Repeating the request is safe. Existing recipient status and feedback survive ordinary edits.

The D1.2 `Zakończ lekcję` dialog calls the same lesson workspace action only when homework content changed. Completing or later editing a lesson therefore does not duplicate homework and does not rerun attendance, finance, packages, or outcome writes.

Deleting homework cascades only its recipient and material joins. It does not delete materials, lessons, students, groups, outcomes, payments, or package usage.

## Group behavior

A group lesson has one shared `homeworks` row and one `homework_assignments` row per selected lesson participant. Status and feedback updates address `(homework_id, student_id)`, so one student's state cannot update another's.

Recipients are validated against `lesson_participants`, not live `group_members`. The lesson snapshot therefore preserves former members and prevents a newly added group member from inheriting historical homework.

## Completion and review semantics

- `assigned` — Zadane
- `completed` — Wykonane, but not yet checked
- `reviewed` — Sprawdzone by the tutor
- `not_completed` — Niewykonane

No transition creates a grade, lesson outcome, difficulty, or next step. Feedback remains on the specific student assignment.

## Student 360

Student Memory is still the source used by Student 360. Its response now includes canonical homework history with source lesson, deadline, material references, status, feedback, and derived overdue state. The UI provides `Do zrobienia`, `Po terminie`, and `Zakończone` filters and compact per-item status/feedback controls. Historical items remain reachable without adding another top-level profile tab.

## D1 integration

Next Lesson Briefing reads the same Student Memory homework collection. A completed but unreviewed assignment is explicitly shown as `Praca domowa do sprawdzenia`; completed work is never presented as reviewed. The link returns to the source lesson.

The Dzisiaj Action Center reads recent canonical recipient assignments. It creates one aggregate review action for completed work and at most one recent overdue action per student. The 30-day window and stable identifiers prevent old assignments and duplicate notifications from accumulating indefinitely.

## Materials

Homework can reference existing link, file/PDF, or text materials by canonical Material ID. The join uses `ON DELETE RESTRICT`, so archived materials remain historically resolvable. Assigning a material to homework does not create or change `student_material_assignments`, `group_material_assignments`, or `lesson_materials`.

## Security boundaries

- all new rows carry `workspace_id` and have composite workspace foreign keys;
- RLS allows reads to active workspace members and mutations only through `private.can_mutate_workspace`, which enforces subscription read-only mode;
- assignment inserts/identity changes are checked against the source lesson participant snapshot by a trigger;
- material IDs must resolve in the same workspace;
- server routes verify the authenticated tutor, reject cross-site writes, validate payloads, and scope every update by workspace, homework, and student;
- due dates remain `timestamptz`; date-only inputs are converted from the tutor timezone at the UI boundary.

## Deliberately unchanged

Homework status and feedback do not mutate attendance, lesson completion, finance, packages, Student Outcomes, difficulty, next steps, group membership, or persistent material assignment. Student accounts, submissions/uploads, public links, notifications, AI grading/generation, progress inference, gamification, and parent access remain deferred.
