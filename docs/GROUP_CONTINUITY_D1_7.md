# Group Continuity — D1.7

## Purpose

Group Continuity upgrades the existing group profile with a preparation view that combines shared group lesson history with separate, current student context. It does not persist a group-memory record and it does not create a group-level learning judgment.

## Canonical sources

- group identity and lifecycle: `groups`
- current membership: active `group_members` without `left_at`
- historical group identity: `lessons.group_id`
- historical participants: `lesson_participants`
- individual context: `lesson_student_outcomes`, composed with D1.3 Student Memory rules
- attendance counts: `attendances`
- shared homework: lesson-level `homeworks`
- lesson objective: canonical `lesson_notes` row with `note_type = objectives`

No new source-of-truth, cache, aggregate table, or migration is introduced.

## Shared vs individual data

Shared facts are limited to the group lesson date, topic, objective, shared homework, group lesson history, and next scheduled group lesson.

Difficulty, difficulty note, next step, progress summary, and attendance remain attached to a specific student or participant. They may never be averaged, merged, copied to every member, or rewritten as a conclusion about the group. In particular, the system must never derive a group difficulty, mastery score, comparative performance claim, or “the group learned…” statement from individual outcomes.

## Current membership vs historical participation

The preparation list uses current active membership only. A suspended membership with `left_at` is not current.

Historical lesson counts use the immutable lesson participant snapshot. A former member therefore remains included in the participant, attendance, and outcome-coverage counts of lessons they attended, while disappearing from the current-member preparation list. A current member who joined after the latest group lesson and has no participant record in the bounded history is presented neutrally as having no previous history in the group.

## Recent history

`GROUP_CONTINUITY_RECENT_LESSON_LIMIT` is `5`. The timeline selects only completed lessons whose canonical `group_id` equals the requested group. Individual lessons involving the same students cannot enter the group timeline.

Each row exposes shared lesson facts plus factual counts:

- attendance: unique participants with canonical `present` or `late` attendance / unique lesson participants
- outcome coverage: unique participants with a meaningful outcome / unique lesson participants

Fully blank outcome rows do not count.

## Continuity coverage

A current member has recent context when their bounded D1.3 Student Memory history contains at least one meaningful outcome with any of:

- non-blank `progressSummary`
- explicit `difficultyLevel`
- non-blank `difficultyNote`
- non-blank `nextStep`

Coverage is rendered as `withRecentContext z members`, never as a score or percentage. Global Student Memory may come from an individual or another group lesson; the UI labels that source neutrally and never claims it came from the current group.

## Attention semantics

Attention is a deterministic factual list, not a ranking. The order is:

1. latest explicit `hard` difficulty
2. latest explicit `mixed` difficulty with a note
3. missing recent context
4. stable Polish display-name order, then student ID

The list is bounded to five entries. Missing-context items are surfaced only when the group has at least one member with recent context, so a legacy group with no outcomes does not become a wall of alerts. An `easy` outcome is not an attention item. `hard` and `mixed` are explicit historical labels, not evidence that a student is behind. Missing context means only that recent meaningful outcome data is unavailable; it is not a learning difficulty. A deterministically new member is not turned into a missing-context warning.

## Privacy

The endpoint derives workspace authority from the authenticated tutor. A missing or foreign group returns the same non-leaking 404 behavior. Client-provided teacher or workspace identifiers are not accepted as authority.

Outcome rows are matched by both lesson and student ID. Each member is composed only from that student's Student Memory. Shared lesson information is composed separately, preventing one student's note or next step from appearing in another student's row.

## Performance

The browser performs one continuity request per group; it never calls the Student Memory HTTP endpoint per member.

The server validates the group, loads current memberships, the five recent completed group lessons, the nearest future non-cancelled lesson, and lesson details in batches. Current Student Memory candidates are loaded in one bounded group-aware query and composed through the canonical `buildStudentMemory` function. The candidate bound is proportional to current membership and the D1.3 history limit; complete workspace history is not loaded.

Normal React Query invalidation refreshes continuity after lesson workspace changes and app-level membership or scheduling mutations. There is no polling.

## Empty / legacy behavior

- empty group: no fake continuity sections; member-management CTA remains available when mutations are allowed
- members without completed lessons: next lesson can still appear; previous context remains neutral
- legacy completed lessons: timeline remains visible and blank outcomes contribute `0` to coverage
- continuity API failure: a local retry state replaces only continuity content; core group controls and details remain usable
- archived/read-only: continuity remains readable while existing mutation controls remain unavailable

## Future possibilities

Explicitly deferred:

- AI group summary
- group-level learning recommendations
- comparative mastery
- student ranking
- curriculum progression
- per-student homework completion
- advanced group analytics
