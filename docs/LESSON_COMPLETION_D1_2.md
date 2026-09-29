# Lesson Completion D1.2

## Purpose

`Zakończ lekcję` is a short continuity ritual. It records what happened for each historical lesson participant so the tutor can resume the learning thread later. The target remains a 20–30 second 1:1 flow; continuity fields are encouraged, not required.

## UX

For a 1:1 lesson, the responsive Radix dialog shows attendance, progress, difficulty, difficulty note, next step, and the existing lesson-level homework. For a group, a compact keyboard-accessible participant strip switches one outcome panel at a time and exposes text plus icon status for ready, optional-empty, and missing-attendance states. Arrow Left/Right switches participant tabs.

At 390 × 844 the dialog becomes a full-screen modal. Its body scrolls independently and the action footer remains reachable. Textareas start at small or medium heights and do not create horizontal overflow.

## Required vs optional fields

Canonical attendance must be resolved for every participant. `progressSummary`, `difficultyLevel`, `difficultyNote`, and `nextStep` remain optional. A non-blocking hint encourages a short note when all four fields are empty.

## Outcome semantics

- `progressSummary`: private continuity record of actual lesson progress.
- `difficultyLevel`: `easy`, `mixed`, or `hard`, displayed as `Łatwo`, `Różnie`, or `Trudno`.
- `difficultyNote`: optional concrete difficulty.
- `nextStep`: optional action for the next meeting.

The student-visible summary and private general lesson note remain separate sources. Neither is copied into an outcome.

## Attendance

Attendance remains in `attendances` and keeps the existing `present`, `absent`, and `late` choices. The dialog saves attendance through the existing workspace mutation. Its final action is disabled while any participant is unresolved, and the RPC repeats the authoritative attendance check.

## Homework

Homework stays lesson-level/group-level in `homeworks`. The dialog edits it through the existing `upsertHomework`/`deleteHomework` path before final completion. Homework persistence is therefore a separate canonical mutation; it is not stored in `lesson_student_outcomes`. If final completion later fails, the entered outcome state stays in the open dialog while the already-saved homework remains canonical.

## Transaction boundary

`complete_lesson_workspace_v2` accepts a validated JSONB outcome array. It locks and validates the lesson, rejects stale state, validates duplicate and foreign participants, checks attendance, and upserts meaningful outcomes. It then calls the hardened L0.10 `complete_lesson_workspace` function inside the same PostgreSQL transaction. Package consumption, charge creation, lesson completion, and outcomes therefore commit or roll back together. The original three-argument RPC remains available for deployed callers.

Google synchronization and reminder cleanup still happen after the local database transaction commits.

## Finance compatibility

The v2 function delegates to the existing L0.10 completion RPC, keeping package selection, exhaustion, per-lesson/per-student constraints, charge idempotency, and price snapshots unchanged. A package or finance exception rolls back outcome upserts.

## Post-completion editing

Completed workspaces show a concise outcome card per participant. `Edytuj podsumowanie` reuses the same fields and writes through the trusted D1.1 outcome upsert. It never calls a completion RPC, consumes a package, or creates a charge.

## Legacy lessons

Completed historical lessons without an outcome load normally and display `Brak podsumowania ucznia.` Read-only accounts can view these cards but cannot open edit or completion controls.

## Deferred

- Student Memory API
- Student 360
- Next Lesson Briefing
- AI suggestions or summaries
- Group bulk outcome tools and group memory aggregation
