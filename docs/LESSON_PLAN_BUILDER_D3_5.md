# D3.5 — Lesson Plan Builder

## Preparation workflow

Lesson preparation lives inside the existing Lesson Workspace at
`/app/lekcje/[lessonId]`. For scheduled lessons the tutor sees the D1 briefing,
then defines `Cel na dziś`, builds an ordered plan, and chooses the materials
that will be used in this lesson. The same plan remains visible and editable
while the lesson is in progress.

An empty lesson offers two starting points: copy a lesson template or begin with
an empty plan. Plan items contain a title, optional instructions, optional
minutes, position, and a lightweight completed state. Up/down controls are the
accessible reorder mechanism on every viewport; drag-and-drop is not required.
The workspace follows its established explicit-save pattern and warns about
unsaved navigation.

## Student Memory boundary

The preparation surface reuses the D1 next-lesson briefing for `Ostatnio`,
`Problem`, `Praca domowa`, `Następny krok`, and `Cel na dziś`. It does not copy
or reimplement Student Memory rules.

`Następny krok` is historical continuity from an explicit previous-lesson
outcome. `Cel na dziś` is a private note attached to the current Lesson. Saving
the objective, creating or checking a plan item, and attaching a material do not
create or update `lesson_student_outcomes`. D1.2 completion remains the only
flow that records attendance, actual outcomes, difficulty, next step, and
homework.

## Template integration

`Użyj szablonu` reuses the D3.3 template domain. Applying a template copies its
objective, ordered sections, instructions, estimated minutes, teacher notes,
and canonical material references into the Lesson. Existing objectives and
notes are appended with a visible boundary; existing plan items and materials
are preserved. The Lesson has no live dependency on the template after the
copy, so later template edits do not mutate prepared lessons.

## Material sources

Preparation distinguishes `Dostępne materiały` from
`Materiały używane w tej lekcji`.

- Student materials come from D3.4 `student_material_assignments` for the
  lesson participant snapshot.
- Group materials come from D3.4 `group_material_assignments` for the Lesson's
  group.
- Library materials use the D3.1/D3.2 searchable material picker.
- Template materials are copied by the D3.3 application operation.

Every source references the canonical `materials` row. Only an explicit tutor
choice creates `lesson_materials`; attaching a resource to a Lesson never
changes Student or Group assignments. Archived materials already referenced by
a Lesson or persistent assignment stay visible, preserving history.

## Lesson-specific plan semantics

`lesson_plan_items` is the authoritative ordered plan for one Lesson. D3.5 adds
structured title, instructions, estimated minutes, and completed state while
retaining the legacy content column for backward compatibility. Plan
replacement is atomic, validates an optimistic-concurrency timestamp, and
normalizes position in one database operation.

The interface sums only explicitly entered minutes and shows
`Plan: X min / Lekcja: Y min`. An overrun produces a gentle warning and never
blocks saving or tries to optimize the plan automatically.

## Group behavior

A group Lesson owns exactly one shared objective, ordered plan, completion
state, and Lesson material list. Participant-specific continuity remains in the
D1 briefing and D1.2 outcomes. D3.5 does not create participant-specific plan
copies.

## Security

All reads resolve the authenticated tutor's workspace on the server. Lesson,
template, material, Student assignment, and Group assignment queries include
that workspace boundary. Composite foreign keys prevent a Lesson from linking
to a Material in another workspace.

`replace_lesson_plan` and `apply_lesson_template` run as security invoker
functions. They infer workspace authority from the target Lesson and enforce
`private.can_mutate_workspace`; client-provided workspace IDs are not accepted.
Existing RLS continues to allow workspace members to view preparation, while
read-only subscriptions are blocked by both the server mutation context and
database mutation policies.

## Performance

Lesson, plan, notes, attachments, and the canonical material library are loaded
through the existing Lesson Workspace query layer. Student and Group assignment
IDs are fetched in bounded batch queries, never one request per participant,
plan item, or material. Template data is fetched only when the picker opens.

## Deferred functionality

D3.5 intentionally excludes AI generation and suggestions, automatic plans
from Student Memory, material recommendations, automatic timing optimization,
plan scoring, curriculum building, collaborative editing, student-facing
plans, previous-lesson reuse, and lesson-plan analytics.
