# Stage 3 — Lesson Workspace

## 1. Audit findings

The established lesson route is `/app/lekcje/[lessonId]`, and both Today and Calendar already link to it. Before Stage 3 the route loaded the entire compatibility `AppData` payload, found the lesson client-side, and submitted a single broad `saveLesson` command containing topic, plan, notes, homework, attendance, payment, and optional completion.

The production persistence path was already relational, but the lesson page did not have a bounded workspace read model. Existing normalized foundations were retained: `lessons`, `lesson_participants`, `attendances`, `lesson_plan_items`, `plan_item_results`, `lesson_notes`, `homeworks`, `materials`, `lesson_materials`, `packages`, and `package_usages`. Group lesson participants are historical snapshots. The existing package completion procedure was idempotent, and a safe package reversal operation exists in the domain but is intentionally not exposed here.

The main problems were the full-workspace read, one giant mutation, weak lifecycle presentation, limited group attendance efficiency, and insufficient separation between private notes and future student-visible content.

## 2. Lesson Workspace architecture

Stage 3 uses a dedicated vertical slice:

```text
Lesson Workspace UI
→ React Query workspace hooks
→ /api/lessons/[lessonId]/workspace
→ lesson workspace service/repository module
→ normalized PostgreSQL tables and lifecycle RPCs
```

The page no longer loads the full app snapshot. Focused actions independently update the plan, notes, summary, homework, materials, attendance, and lifecycle.

## 3. Routes

The stable existing route remains `/app/lekcje/[lessonId]`. No competing lesson route was created. The corresponding API route is `/api/lessons/[lessonId]/workspace` with `GET` and focused `POST` actions. Next.js 16 asynchronous route params are used.

## 4. Read model

`LessonWorkspaceData` contains a scoped lesson view, participant snapshots, attendance, plan, private note, student summary, homework, attached and available materials, authoritative package context, and only the nearest previous/next lesson.

The production query flow is bounded to one lesson. Participant IDs are read once; student and attendance rows are batched with `in(...)`. It does not fetch full lesson or student history and does not issue one query per participant.

## 5. Lesson plan

The plan supports topic, objectives, and a lightweight multiline agenda. Existing normalized plan items remain the agenda source. Objectives use the existing typed `lesson_notes` architecture (`note_type = objectives`) to avoid a new curriculum subsystem.

The plan has an explicit save action, clear save/error feedback, a stale-write token, and a keyboard `Ctrl/Cmd + Enter` save shortcut.

## 6. Notes / visibility

Private tutor notes use `lesson_notes` with `visibility = private` and `note_type = general`. The separate student summary uses `visibility = student_visible` and `note_type = student_summary`. Both are tutor-managed; no Student Portal delivery was added.

The UI and API name both fields explicitly so private content cannot be mistaken for a future student-facing field. Saves are focused, explicit, and stale-write protected.

## 7. Homework

The workspace can add, update, and remove one lesson homework record with title, description, and optional due date. It uses the relational `homeworks` table.

Individual homework is associated to the lesson's snapshotted student. Group homework remains one group/lesson record, avoiding duplicate records for each member.

## 8. Materials

Tutors can attach a reusable existing material, quick-create an external URL material and attach it, open it safely, or detach it from the lesson. `materials` remain reusable and `lesson_materials` owns the relation. No full Material Library was built.

The server verifies that both the material and lesson belong to the authenticated workspace; arbitrary cross-workspace material IDs are rejected by scope checks and RLS.

## 9. Individual attendance

Each individual lesson exposes explicit Present, Absent, and Late controls. No attendance value is inferred from the clock. Updates target the existing relational attendance row for a legitimate `lesson_participants` snapshot member.

## 10. Group attendance

Every snapshotted participant has an independent accessible segmented control. `Mark all present` performs one explicit batched upsert, after which individual corrections remain possible until completion. Current group membership is never used to reconstruct historical attendance.

## 11. Completion workflow

Completion is available only after the lesson starts and every snapshotted participant has resolved attendance. Notes and homework remain optional.

The client invokes a lifecycle action; it never sets lesson status itself. `complete_lesson_workspace` locks the lesson, validates tenant membership and attendance, rejects cancelled/no-show state, and returns the existing completed state on retries. The RPC sets `completed_at` and delegates package-covered completion to the established package domain function in the same transaction.

Reminder cleanup and Google sync job refresh remain secondary idempotent hooks. A hook failure is logged without falsely reporting that the already committed lesson/package transaction failed.

## 12. Package consumption

When an active relevant package covers the lesson, completion calls the existing `complete_lesson_with_package` operation. The unique package usage constraint and idempotency key prevent double consumption. The workspace refreshes package usage/balance and can show the consumed package in historical completed state.

The frontend does not calculate or mutate package balance. Completion does not create a payment.

## 13. No-show / cancelled behavior

`mark_lesson_no_show` locks the lesson, verifies tenancy, rejects invalid terminal states, marks all snapshotted participants absent, and sets the lesson to `no_show`. It does not consume a package unit.

Cancelled lessons are historical, read-only teaching workspaces. They cannot be completed and retain their stored lesson context. Cancellation continues to use the existing relational cancellation operation and stale-write protection.

## 14. Historical / completed state

Completed lessons show a clear historical banner and frozen attendance/completion state. Notes, student summary, and homework remain editable under the current product rules. Plan, attendance, and lifecycle controls are locked. Cancelled and no-show lessons are similarly distinguished with status text rather than color alone.

## 15. Today / Calendar integration

Today and Calendar retain their stable links to `/app/lekcje/[lessonId]`; Calendar does not duplicate workspace editing. Workspace navigation provides browser-compatible links back to Today and Calendar and to the relevant Student or Group.

## 16. Security / RLS

The server derives the current teacher/workspace from authentication and never trusts a frontend workspace ID. Every read and mutation is workspace-scoped, with RLS as the final authority. Attendance student IDs must be in the lesson participant snapshot. Material IDs must belong to the same workspace. The lifecycle RPCs are executable only by `authenticated` and perform explicit membership checks.

pgTAP covers cross-tenant note reads and completion. Existing RLS policies cover notes, homework, attendance, materials, lesson materials, and lessons.

## 17. Responsive UX

At desktop width the teaching thread and compact context rail form a calm two-column layout. At 980px and below they stack. At 390×844, the header, editors, materials, per-student attendance controls, and completion action form one natural vertical flow with no horizontal overflow or tiny controls.

Manual browser review covered 1440×900 and 390×844, individual and group workspaces, completed and cancelled states, semantic labels, navigation, and console output.

## 18. Performance / query decisions

The dedicated endpoint replaces the previous full `AppData` lesson-detail load. Reads are scoped to one lesson and batch participants/students/attendance. Previous and next lesson queries are separately ordered and limited to one row. Material options are the only workspace-wide list and are limited to reusable active material metadata.

React Query caches per lesson and focused mutations refresh only the affected workspace plus small integration queries where needed.

## 19. `teacher_states` migration

Lesson Workspace reads and writes no longer depend on `teacher_states` in production. Notes, homework, materials, attendance, plan, and completion all use normalized relations or existing relational RPCs.

The local file adapter remains a development/demo persistence fallback behind the same focused workspace contract; it is not a production compatibility-state dependency.

Remaining `teacher_states` consumers are outside Stage 3: compatibility state bootstrap/admin metadata and older profile/settings/statistics paths identified in the Stage 0 architecture report.

## 20. Tests

Added Vitest contract tests for the focused action schema, private/student-visible separation, attendance/material validation, and bounded payloads.

Added Stage 3 pgTAP coverage for attendance-gated completion, completed timestamps, exactly-once package use, idempotent retry, balance refresh, cancelled rejection, no-show behavior, per-participant group completion, homework create/update/remove, reusable material attach/detach, private-note visibility, and cross-tenant completion/read rejection.

Verification results:

- `npm ci`: passed after releasing a stopped Next.js worker that held the Windows SWC binary.
- `supabase db reset`: passed; every migration and seed applied.
- `supabase test db`: passed, 5 files / 94 tests.
- Final format, lint, typecheck, Vitest, and production build results are recorded in the delivery response.

## 21. Known limitations

- There is no completion undo button. Although the foundation has a reversal operation, Stage 3 conservatively leaves historical package-affecting reversal out of the normal workspace UI.
- Student summaries are structured and visibility-safe but are not delivered to students yet.
- Quick material creation supports external URLs; a new upload pipeline was intentionally not added.
- Notes use explicit save rather than background autosave. Unsaved navigation warnings and clear failure/retry states protect edits.

## 22. Remaining technical debt

- Consolidate the older compatibility commands that still serve non-workspace screens when those product stages are rebuilt.
- Add full browser automation when the project adopts an E2E framework; Stage 3 deliberately did not add one solely for this feature.
- Move secondary completion hooks into an explicit durable outbox/event model if integration volume grows.
- Define a product-level audited reopen policy before exposing completion reversal.

## 23. Ready for Stage 4?

Yes. The complete core teaching loop is now represented by bounded relational reads, focused writes, tenant-safe attendance, and transactional idempotent completion. Stage 4 can build on structured plan, notes, summary, homework, materials, attendance, and package history without depending on a workspace JSON document.
