# Student Memory — D1.3

## Purpose

Student Memory is the deterministic, read-only learning-continuity view for one student. It is assembled on request from canonical records and is never stored, edited, AI-generated, or maintained as a second source of truth.

The authenticated endpoint is:

```text
GET /api/students/[studentId]/memory
```

Responses use `Cache-Control: private, no-store`.

## Sources

- `students`: memory-relevant profile fields only (`id`, display name, subject, level, goal, status)
- `lesson_participants`: historical and future participation identity
- `lessons`: lifecycle, UTC start time, topic, and subject
- `attendances`: the requested student's canonical attendance row
- `lesson_student_outcomes`: the requested student's progress, difficulty, and next step
- `homeworks`: the homework attached to a selected completed lesson

The local/dev adapter derives the same contract from the equivalent file-backed student, lesson participant, attendance, outcome, and homework fields.

## Not included

- private or general lesson notes
- student-facing lesson summaries
- contacts, email, phone, or billing contacts
- balances, packages, payments, or any finance data
- materials or plan-item results
- outcomes or attendance belonging to another participant
- AI summaries, embeddings, mastery scores, predictions, or persistence/cache tables

## Selection rules

### Recent history

The five newest lessons with lifecycle status `completed` and a historical `lesson_participants` row for the student are returned newest-first. The lesson start time, then lesson ID, provides deterministic ordering. Cancelled, future, and `no_show` lessons are not learning-progress entries.

### Latest lesson

`latestLesson` is the first lesson in that ordered completed history. It is based on `startsAt`, never update time.

### Current next step

The resolver scans the bounded completed history newest-to-oldest and selects the first non-empty per-student outcome `nextStep`. The response includes the source lesson ID and start time. It does not fall back to homework or topic.

### Current difficulty

The resolver scans newest-to-oldest for the first explicit per-student `difficultyLevel`. It returns that value, its optional note, and source lesson ID. It does not average or infer difficulty.

### Attendance

Attendance uses a separate bounded window of the ten newest participant lessons whose lifecycle is `completed` or `no_show`. This keeps no-shows visible without presenting them as teaching progress.

- canonical `present` and `late` attendance count as present for the compact summary;
- canonical `absent` counts as absent;
- lesson lifecycle `no_show` counts once as no-show and is not also counted absent;
- missing/`unknown` and cancelled attendance is not inferred and does not increase `recentTotal`.

### Homework

At most one top-level homework is returned: homework from the newest lesson in the bounded completed history that has homework. Its canonical status is retained when available, together with source lesson ID and start time. Recent lesson entries may contain the same small homework metadata.

### Upcoming lesson

The nearest future non-cancelled lesson with a `lesson_participants` row for the student is returned. This naturally includes individual, group, and multi-participant lessons.

## Legacy behavior

Completed lessons that predate D1.1 remain in history. If no `lesson_student_outcomes` row exists, the lesson is returned without an `outcome`. Missing attendance is omitted and never treated as present. Missing next step, difficulty, or homework remains absent.

## Archived students

Authorized tutors can read memory for active and archived students. Historical participation remains authoritative even after a student leaves a group or the student is archived.

## Security and privacy

Authentication is resolved from the server session. The client supplies only the student ID; it cannot choose a workspace or tutor authority. The server resolves the tutor's workspace and looks up the student inside it, returning the same not-found behavior for inaccessible records.

Production queries filter outcomes and attendance by both workspace and requested student. The pure resolver filters by student ID again before constructing the response. Shared lesson topic/time/homework can be returned, while another participant's outcome or attendance cannot. Private notes are never queried.

## Performance

Production performs a small bounded query plan:

1. authenticate and resolve the tutor workspace;
2. validate the student within that workspace;
3. fetch bounded participant rows for completed history (5), attendance history (10), and the nearest upcoming lesson in parallel;
4. fetch outcomes, attendance, and homework for the selected lesson IDs in parallel;
5. build the response in the pure resolver.

There are no per-lesson queries and no unbounded student-history load.

## Future consumers

- D1.4 Student 360
- D1.5 Next Lesson Briefing
- D1.6 Dzisiaj Action Center

Those consumers are not implemented in D1.3.
