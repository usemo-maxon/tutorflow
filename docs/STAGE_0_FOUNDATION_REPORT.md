# Stage 0 foundation report

## 1. Before

The application already had a sound Next.js server boundary, Supabase Auth, encrypted integration credentials, private Storage, durable Google/reminder queues, webhook idempotency, a file-backed development adapter and tested teacher-level filtering. In production, however, students, lessons, participant results and availability lived inside a single `teacher_states.state` JSONB document keyed by teacher.

## 2. Problems found

- No first-class Workspace or team membership model.
- Lesson, Student and Attendance had no relational integrity or query indexes.
- Groups were represented only as multiple student IDs on a lesson.
- Recurrence was only `seriesId` plus frontend-generated occurrences.
- Payment status was a participant field; there was no Payment/allocation model.
- Packages, contacts, homework entities, reusable materials, bookings and availability exceptions were absent.
- Production cron jobs read lesson/student content from the JSON aggregate.
- Request validation existed in components and handwritten service checks, but not at the API boundary.
- The JSON optimistic-concurrency transaction was safe as one aggregate but could not support indexed calendar queries, relational RLS or future team access.

## 3. Decisions

- `Workspace` is the tenant; active membership is the RLS predicate.
- Existing accounts are backfilled as solo workspaces. `TutorProfile.id` reuses the current auth user ID for compatibility.
- Normalized relational tables are authoritative for reads and integrations.
- `teacher_states` remains temporarily as a versioned compatibility command snapshot; its RPC synchronizes relational rows transactionally.
- A Lesson targets `student XOR group`; busy time is a separate CalendarBlock.
- LessonParticipant is always created, including individual lessons. Attendance is a separate per-student row.
- Group membership and lesson participation are separate: the former is current roster, the latter is historical occurrence snapshot.
- Recurring occurrences are real Lessons; series successor links support future-scope edits without rewriting history.
- Payments allocate to lessons/packages; packages use a consumption/reversal ledger.
- Confirmed bookings convert to Lessons instead of becoming a competing calendar source.
- Money uses integer grosz and explicit currency; timestamps use UTC/timestamptz plus IANA timezone.

## 4. Schema changes

Added workspace/membership/tutor models and normalized Students, Contacts, Groups, Lessons, Participants, Attendance, recurring series, plan/results, notes, homework, materials, payments, allocations, packages/usages, availability/exceptions, calendar blocks, bookings, notifications and student-stat imports. Existing integration, Google job, reminder and attachment tables gained workspace scope. RLS, explicit grants, composite foreign keys, lifecycle/XOR checks and query-oriented indexes were added.

## 5. Migration notes

Migration `20260915173036_stage_0_domain_foundation.sql` is additive. It:

1. Creates a workspace, owner membership and tutor profile for every existing profile.
2. Parses each legacy JSON state into normalized students, lessons, ad-hoc groups, participants, attendance, plan results, homework, notes, availability and imports.
3. Replaces `update_teacher_state` so compatibility writes and relational synchronization commit or roll back together.
4. Replaces the signup trigger so new accounts receive tenant rows immediately.
5. Retains legacy tables and fields; no existing business history is dropped.

Operational queue/attachment foreign keys are `NOT VALID` so unknown historic orphans cannot block deployment. PostgreSQL still enforces them for all new rows. Validate them after a production orphan audit.

## 6. Compatibility

- Existing routes, React components and `AppData` shape remain intact.
- The local file store still supports demos/tests.
- Supabase repository reads normalized tables and maps them to the current UI contract.
- Existing API mutations still use the versioned aggregate workflow, now transactionally synchronizing relational data.
- Google sync, Telegram reminders and maintenance now read/update normalized lessons directly.
- Current Google/Telegram/PayU connection semantics and encrypted credential storage remain unchanged.

## 7. Remaining technical debt

- Replace the compatibility snapshot mutation bridge with focused relational repository commands once Stage 1 changes the UI contracts.
- Build Group CRUD and reusable-group selection UI in its product stage.
- Add generated Supabase database types after linking the production project; Stage 0 uses narrow explicit row interfaces because no remote schema is linked.
- Validate `NOT VALID` historic queue/attachment constraints after a production data audit.
- Add audit-log retention/anonymization jobs after legal retention rules are finalized.
- Add physical-device E2E, screen-reader and live provider sandbox tests; Stage 0 covers unit/integration/pgTAP boundaries.

## 8. Ready for Stage 1?

- [x] Workspace tenant and team-ready membership model
- [x] Database-enforced tenant isolation with RLS tests
- [x] Normalized Student and Group models
- [x] Lesson as relational source of truth
- [x] Student/group XOR and time-range constraints
- [x] Per-student attendance
- [x] Recurring series and occurrence identity
- [x] Payment/allocation and package ledger foundation
- [x] Availability exceptions, booking, reminder, integration and notification foundations
- [x] Integer money and DST-aware recurrence tests
- [x] Deterministic development seed
- [x] Migration reset, seed, pgTAP, lint, typecheck, unit tests and build verified
- [ ] Remove the compatibility JSON command snapshot (planned incremental cleanup, not required for Stage 1 product work)
