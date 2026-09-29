# Student 360 — D1.4

## Purpose

Student 360 is the tutor's single operational view of a student. It answers what happened recently, what is difficult, what should happen next, whether homework exists, and when the next lesson takes place without creating a new source of truth.

The experience replaces the overview at `/app/uczniowie/[studentId]`. Existing lesson, progress, payments, and materials tabs remain available for deeper navigation.

## Data sources

- Student profile and contacts come from the existing application data query.
- Continuity, the bounded recent lesson timeline, attendance, homework, and the upcoming lesson come from `GET /api/students/[studentId]/memory` through the canonical `useStudentMemory` hook and `student-memory` query key.
- Balance, open charges, recent payments, and active packages come from the existing student-scoped finance request (`/api/finance?studentId=...`).
- Current group membership comes from the existing profile/application data.

Student 360 is a composition layer. It does not persist a dashboard snapshot, memory card state, aggregated profile JSON, or any other presentation model.

## Information hierarchy

The default overview is ordered around preparation for the next lesson:

1. compact student header, status, subject, level, goal, and quick actions;
2. prominent next lesson or scheduling action;
3. `Na teraz`: next step, latest lesson, current difficulty, and homework;
4. bounded recent lesson timeline;
5. attendance, finance/package context, and groups;
6. lower-priority profile details and contacts.

On mobile the continuity cards reorder so `Następny krok` appears before `Ostatnio`, followed by difficulty and homework. All grids collapse to a single column without horizontal page overflow.

## Continuity section

`Na teraz` uses only deterministic fields returned by Student Memory:

- `latestLesson` supplies the latest completed lesson date, topic, and optional progress summary;
- `currentDifficulty` supplies the explicit easy/mixed/hard value and optional note;
- `currentNextStep` supplies the current next action and subtle source-lesson date;
- `homework` supplies the canonical assignment, optional due date, and lesson link.

No averages, inferred difficulty, overall narrative, recommendations, scores, or AI content are created. Long outcome text is visually clamped and can be expanded with `Pokaż więcej`; the API value is never truncated.

## Recent lessons

The timeline renders only `memory.recentLessons`, already bounded to five completed lessons by D1.3. Each entry can show date, topic, attendance, progress summary, difficulty, difficulty note, and next step, and links to `/app/lekcje/[lessonId]`.

Legacy lessons remain visible. A lesson without a per-student outcome shows `Brak podsumowania ucznia.` rather than hiding the lesson or inventing content.

## Finance

The overview uses the existing student-scoped finance query, never the workspace-wide finance overview. It shows the factual outstanding balance and up to two relevant active packages, then links to the existing payments tab for details. A finance failure is isolated to its card and does not affect continuity or history.

## Archived students

Archived profiles retain Student Memory, lesson history, attendance, finance, groups, details, and contacts. Scheduling and group-assignment actions are omitted for archived students. Restore continues to use the existing entitlement-aware status mutation and never silently reactivates a student.

Read-only users can read every Student 360 section. Edit, scheduling, archive/restore, contact, group, package, and payment mutation controls remain unavailable or disabled according to the existing read-only policy.

## Empty and legacy states

- A new student gets one useful first-lesson explanation and, when permitted, a `Zaplanuj pierwszą lekcję` action instead of a wall of empty cards.
- Missing next step, difficulty, or homework uses explicit, neutral copy and never renders `null` or `undefined`.
- Missing Student Memory produces a local retry panel while the profile, details, contacts, navigation, and other tabs remain usable.
- An invalid or inaccessible student uses the existing not-found experience; dependent memory and finance queries stay disabled until the profile is confirmed.

## Performance

Student Memory remains bounded by D1.3: five recent completed lessons, ten attendance lessons, and one nearest upcoming lesson. Student 360 does not issue a second history query and does not poll memory. Existing React Query invalidation refreshes memory after app mutations, lesson outcome edits, and lesson completion.

Finance uses the existing `studentId`-scoped request. No migration, aggregation table, cache table, or stored Student 360 snapshot is introduced.

## Privacy

The UI renders only the requested student's outcome nested in the Student Memory response. Student 360 never directly queries another participant's outcome, attendance, or private lesson notes. Historical group participation is resolved by the D1.3 service; current group membership is used only for the profile's group section.

## Deferred

- Next Lesson Briefing
- Dzisiaj Action Center redesign
- AI summaries, suggestions, plans, or recommendations
- full lesson-history explorer
- advanced learning analytics or learning/engagement scores

