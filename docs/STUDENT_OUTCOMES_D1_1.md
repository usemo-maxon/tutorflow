# Student Outcomes — D1.1

## Purpose

`lesson_student_outcomes` records the continuity that easy4tutor should remember for one student after one lesson. It is deliberately participant-scoped: a group lesson can produce a different summary, difficulty signal, and next step for every historical participant.

The data is deterministic and tutor-entered. D1.1 does not generate, infer, score, or backfill outcomes with AI.

## Data model

One row is unique for `(workspace_id, lesson_id, student_id)` and contains:

- `progress_summary`: what was completed, learned, or where the student stopped; optional, at most 2,000 characters.
- `difficulty_level`: optional structured signal: `easy`, `mixed`, or `hard`.
- `difficulty_note`: the specific difficulty the student experienced; optional, at most 2,000 characters.
- `next_step`: what should happen for this student next; optional, at most 2,000 characters.
- `created_at`: creation timestamp, preserved by later edits.
- `updated_at`: refreshed by a database trigger on every update.

The composite foreign key to `lesson_participants(lesson_id, student_id, workspace_id)` proves all three facts at once: the lesson and student share a workspace, and the student belongs to the lesson's historical participant snapshot. Outcome deletion is not part of the ordinary product path. The restrictive participant foreign key also prevents a participant with outcome history from being removed by a destructive cascade.

Application input is trimmed. Blank strings become absent values. A fully blank save does not create a new row; if a row already exists, a blank edit retains the row with nullable fields instead of hard-deleting history.

## Canonical data boundaries

- Attendance remains in `attendances`.
- Homework assignments remain in `homeworks` and the lesson workspace homework domain.
- Per-participant plan item completion, scores, and notes remain in `plan_item_results`.
- Lesson topic, timing, status, and participant target remain in `lessons`.
- Private and student-visible lesson-level notes remain in `lesson_notes`.
- `lesson_student_outcomes` contains only the human continuity summary, difficulty signal/note, and next step for one lesson participant.

Consumers can join those canonical sources later; no source is serialized or copied into the outcome row.

## Group behavior

A group lesson with Anna, Zosia, and Kuba has three historical `lesson_participants` rows and may have zero to three matching outcome rows. Each outcome is keyed to its own student. Updating Anna's outcome does not replace or mutate Zosia's or Kuba's outcome.

Group membership changes after the lesson do not rewrite the lesson's participant snapshot or its outcomes. Archiving a student also leaves outcome history intact.

## Security / RLS

RLS is enabled. Authenticated users can select, insert, and update only rows for a workspace where `private.is_workspace_member(workspace_id)` is true. The table has no anonymous grants and no ordinary authenticated `DELETE` grant or delete policy.

The trusted server write derives `workspace_id` from the authenticated tutor profile, checks the canonical subscription `read_only` flag, and verifies the lesson/student pair in `lesson_participants` before upsert. The client cannot choose a workspace or teacher identity. The existing lesson workspace route supplies authentication and same-origin mutation protection.

## Legacy lessons

The migration creates no backfill rows and invents no historical content. A completed or no-show lesson without a matching outcome continues to load normally; its participant simply has no `outcome` value. Absence means that no structured per-student outcome was recorded.

The local file-backed adapter treats the new `lessonStudentOutcomes` collection as optional when reading older store files and initializes it on first write.

## Lesson workspace integration

The workspace read loads every outcome for the lesson in one batched query and maps it onto the matching participant. It does not issue one request per student.

The typed `saveStudentOutcome` workspace action saves one participant outcome. The focused `upsertLessonStudentOutcome` server boundary validates UUIDs and text limits, derives authorization context, validates historical participation, and upserts on the unique workspace/lesson/student key.

## Future consumers

This foundation is intended for:

- D1.2 Finish Lesson 2.0
- D1.3 Student Memory API
- D1.4 Student 360
- D1.5 Next Lesson Briefing

Those features, along with embeddings, AI summaries, recommendations, or background AI work, are outside D1.1.
