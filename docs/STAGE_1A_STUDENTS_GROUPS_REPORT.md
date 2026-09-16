# Stage 1A — Students & Groups

## 1. Audit findings

Stage 0 had already introduced normalized `students`, `contacts`, `student_contacts`, `groups`, and `group_members` tables with workspace foreign keys and RLS. The application read normalized lesson/student data, but all mutations still passed through the `teacher_states` compatibility aggregate. The Students UI had only a basic list/profile; Groups and contact-management workflows were absent.

## 2. Students implementation

- `src/components/pages/students-page.tsx` now provides a compact CRM-style list with active/archive views, operational facts, search, filters, and sorting.
- `src/components/student-composer.tsx` provides a low-friction quick-create form and a complete edit form.
- `src/server/repository.ts` reads students from `public.students` and writes create/update/status commands directly to that table in production.
- `src/server/app-service.ts` keeps the file-backed development adapter behaviorally equivalent.

## 3. Student Profile

`src/components/pages/student-detail-page.tsx` shows identity, subject/level, next lesson, package balance, amount due, lesson defaults, notes, contacts, and active group membership. Existing lessons, progress, payments, and materials tabs remain available. Archive/restore uses an explicit confirmation dialog and preserves the profile URL/history.

## 4. Contacts / parents

`src/components/contact-composer.tsx` supports add/edit for parent, guardian, billing, and other contacts. A contact may be linked to more than one student; primary/billing flags belong to the student-contact relation. Production mutations use `create_student_contact` and `update_student_contact`, while unlinking removes only the relation.

## 5. Groups implementation

- Routes: `/app/uczniowie/grupy` and `/app/uczniowie/grupy/[groupId]`.
- `src/components/pages/groups-page.tsx` supplies searchable active/archive cards.
- `src/components/pages/group-detail-page.tsx` supplies member and schedule views plus edit/archive/restore actions.
- `src/components/group-composer.tsx` handles create/edit.

## 6. Group membership

`src/components/group-members-dialog.tsx` and `src/components/student-group-dialog.tsx` support both group-first and student-first assignment. `add_group_members` validates the group and every student in the current workspace, then performs an idempotent upsert. Removal changes membership to `suspended` and records `left_at`; it does not delete history.

## 7. Search / filters / sorting

Student search covers display name, e-mail, and phone with a 250 ms debounce. Status, subject, level, group, sort, and query are reflected in the URL. Sorting supports name, nearest lesson, and most recently added. For the MVP target (up to roughly 500 students), the already-batched workspace payload is filtered client-side for instant response; no request-per-row or N+1 path is introduced.

## 8. Archive / restore

Students and groups use status transitions with `archived_at`; rows and related history remain intact. Archived records are excluded from active selectors and active lists, and can be restored from their profile or archive view.

## 9. Relational migration from `teacher_states`

Production reads for students, contacts, groups, memberships, package balances, and relevant lesson summaries no longer load `teacher_states`. The ten Stage 1A people-workspace actions are routed through `mutatePeopleDomain` and write relational tables directly. The JSON compatibility aggregate is not dual-written for these actions.

## 10. Security / RLS

Every read and write derives the workspace from the authenticated tutor profile and is still constrained by table RLS. Mutation functions are `security invoker`, accept no caller-supplied workspace ID, use an empty `search_path`, and have explicit authenticated grants. Returned-row checks distinguish an RLS-filtered no-op from a successful mutation. Cross-workspace student, contact, and group-membership attempts are covered by pgTAP.

## 11. UX / responsive changes

The module keeps the existing Polish product language and design tokens. Desktop uses dense hybrid rows; mobile uses touch-sized card layouts, a compact module switch, two-column summaries, and bottom-navigation-safe spacing. Loading, empty, no-results, validation, conflict, read-only, and mutation-error states are present. The primary quick-add path requires only a first name; the remaining fields are optional.

## 12. Tests added

- `src/server/domain/student.test.ts`: normalization and probable-duplicate rules.
- `src/server/app-service.test.ts`: duplicate protection, shared contacts, tenant ownership, group lifecycle, idempotent membership, removal history, and read-only behavior.
- `supabase/tests/stage_1a_students_groups.sql`: relational CRUD behavior, archive/restore consistency, shared contacts, membership idempotency/history, and cross-workspace denial.

## 13. Files changed

Core Stage 1A files are `src/lib/domain.ts`, `src/lib/validation.ts`, `src/server/domain/student.ts`, `src/server/repository.ts`, `src/server/app-service.ts`, `src/server/store.ts`, the Students/Groups/contact components under `src/components`, routes under `src/app/app/uczniowie`, `src/app/globals.css`, the Stage 1A migration/test, `supabase/seed.sql`, and this report.

## 14. Commands executed

```text
npm run lint
npm run typecheck
npm test
npm run format:check
npm run build
npx supabase db reset --local
npx supabase test db
```

## 15. Build / test results

All checks pass: ESLint has no warnings/errors, TypeScript emits no errors, Vitest passes 48 tests, Prettier check passes, the Next.js production build completes, the local database resets and seeds cleanly, and pgTAP passes 39 assertions across three files.

Manual verification covered the Students list/search/filter/create/edit/archive/restore flows, duplicate warning, profile summary, contact creation, group list/create/edit/add/remove/archive/restore, membership visibility from both profiles, and screenshots at 1440×900 and 390×844. Browser console inspection found no application errors.

## 16. Known limitations

- The MVP uses a single batched workspace payload and client-side filtering instead of server pagination. This is deliberate for the defined ~500-student scale; cursor pagination should be added before substantially larger workspaces.
- Contact matching is exact on normalized e-mail/phone within one workspace. It does not perform fuzzy person matching.
- Materials remain a clear placeholder because material management is outside Stage 1A.
- The local development adapter remains file-backed by design; production paths use Supabase.

## 17. Remaining `teacher_states` dependencies

`src/server/repository.ts::mutateStore` still uses `teacher_states.version` and `update_teacher_state` for non-Stage-1A commands that have not yet received direct repositories. `src/server/admin-state.ts` still reads aggregate metadata for the admin surface. The table, trigger/bootstrap logic, compatibility sync function, and its RLS tests therefore remain in the schema until later stages migrate those commands.

## 18. Ready for Stage 1B?

Yes. Calendar work can rely on relational students/groups, stable group membership, preserved archive history, and direct tenant-scoped people mutations. Stage 1B should migrate calendar/lesson commands off the remaining compatibility mutation path instead of reintroducing aggregate writes.
