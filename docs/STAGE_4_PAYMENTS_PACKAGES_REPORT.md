# Stage 4 — Payments & Packages

## 1. Audit findings

The existing relational model separated Payments, PaymentAllocations, Packages and PackageUsage, and Stage 3 already consumed PackageUsage transactionally during Lesson completion. It did not, however, contain a durable receivable with a due date. Student balances were inferred from completed Lessons and `lesson_participants.payment_status`, while allocations pointed directly at a Lesson or Package. That model could not reliably answer why an amount was owed, distinguish unpaid from overdue, or preserve a stable receivable independently of current Lesson state.

The old financial UI changed participant payment flags instead of recording actual money received. `teacher_states` still supports unrelated compatibility paths, but the Stage 4 financial reads and writes no longer depend on it.

## 2. Final financial domain model

The source of truth is now:

```text
Lesson or Package purchase -> Charge
Payment -> PaymentAllocation -> Charge
Charge amount - valid allocations = outstanding amount
Package entitlement - PackageUsage ledger = remaining lessons
```

Lessons, Charges, Payments, PaymentAllocations, Packages and PackageUsage retain separate responsibilities. All money uses integer minor units and an explicit currency.

## 3. Why a Charge entity was required

A minimal `charges` table was added because the previous schema had no stable representation of an amount owed or its due date. A Charge records the student, source Lesson or Package, type, description, amount, currency, status, due date and settlement timestamps. It is the durable explanation for an outstanding balance; it is not a Payment.

## 4. Per-lesson billing behavior

Completing a `per_lesson` or `per_student` Lesson creates one Charge per participant inside the existing completion transaction. The Charge uses the Lesson's snapshotted `price_minor` and currency, so later changes to a Student's default price cannot rewrite history. The source Lesson and Student form an idempotent uniqueness boundary.

Scheduled, cancelled and no-show Lessons do not create an automatic receivable. Completing a Package or trial Lesson does not create a per-lesson Charge.

## 5. Payment model

A Payment represents actual money received. Manual Payments record amount, currency, paid date, method, paid status and an optional note. Existing provider and provider-transaction fields remain available for a future provider integration. Settled financial records are append-oriented: normal UI does not delete or arbitrarily rewrite them.

## 6. Allocation model

Every new PaymentAllocation targets one Charge. One Payment may allocate to multiple Charges, and a Charge may be paid by multiple Payments. The transaction validates workspace, Student and currency consistency and locks both Payment and Charge rows before checking remaining amounts.

The default UI suggestion allocates oldest due open items first, with a stable created-time/id tie-breaker. The tutor sees and can adjust the proposed items before saving.

## 7. Partial and unallocated payments

Allocations may be smaller than either the Payment or Charge. A partly allocated Charge remains open with its exact outstanding amount. Money above the selected/open amounts remains on the Payment as an explicit unallocated balance; it is never discarded or silently applied to a future Lesson.

## 8. Package lifecycle

Creating a Package creates the entitlement and a Package Charge atomically, but does not claim that money was received. The package supports active, exhausted, expired and cancelled history using the existing lifecycle. The UI presents entitlement, used/remaining lessons, price, purchase date, optional expiry and payment state.

## 9. PackageUsage

PackageUsage remains the durable consumption ledger and the authoritative basis for remaining entitlement. Stage 4 reuses the Stage 3 completion operation rather than duplicating consumption in UI code. Repeated completion cannot create another usage. No unsafe usage-reversal workflow was added.

When several eligible Packages exist, completion selects the earliest non-null expiry, then purchase time, creation time and id. Expired and cancelled Packages are excluded. This makes selection deterministic and favors entitlement that expires first.

## 10. Due-date and overdue rules

The workspace has a simple `payment_due_days` setting, defaulting to seven days. Lesson Charges are due that many days after completion; Package Charges use the same rule from purchase creation. Each Charge stores its resolved `due_at` value so later preference changes cannot rewrite history.

A Charge is overdue only when it has a positive outstanding balance and `due_at < now()`. An open Charge with no due date is unpaid, not overdue. A fully allocated Charge is settled and disappears from overdue results.

## 11. Student balance definition

Student balance is the sum of outstanding Charge balances, not Lesson prices minus Payments. Overdue is the subset whose due date has passed. Unallocated Payments do not incorrectly reduce a Student's balance. Currency conversion is not invented: totals are scoped to the requested/workspace currency and cross-currency allocation is rejected.

## 12. Student Profile integration

The Payments tab now presents balance, overdue amount, open items, active and historical Packages, recent Payments and unallocated amounts. It provides focused actions for recording a Payment and creating a Package. Empty, loading and error states follow the existing application patterns.

## 13. Lesson Workspace integration

The Lesson Workspace read model includes compact financial context. Per-lesson work shows the snapshotted price and Charge state; Package work shows the selected Package and remaining entitlement. This information remains secondary to attendance, notes and completion work.

## 14. Today Dashboard integration

The dashboard queries normalized overdue Charge balances and eligible low Packages. Overdue items are aggregated into one actionable warning linked to the financial overview. Package warnings use the existing low-balance threshold, exclude expired/cancelled/exhausted history and are deduplicated by Student.

## 15. Workspace financial page

`/app/platnosci` now contains calm, bounded views for open/overdue Charges, recent Payments and Packages. It includes Student search, minimal status filters, load-more Payment pagination, allocation visibility and dialogs for the two common mutations.

## 16. Transaction, idempotency and concurrency rules

`record_student_payment` creates the Payment and all requested allocations in one PostgreSQL transaction. `create_student_package` creates the Package and its Charge in one transaction. Both accept an idempotency key and return the existing result on a repeated request.

Allocation validation runs in the database and locks Payment and Charge rows before calculating their remaining values. It rejects over-allocation, over-settlement, non-paid sources, cross-Student, cross-workspace and cross-currency writes. Lesson completion creates Charges and PackageUsage inside its existing locked, idempotent transaction.

## 17. Security and RLS

Charges use workspace RLS aligned with the existing membership model. Existing Payment, allocation, Package and PackageUsage policies remain authoritative. Financial RPCs derive and validate workspace membership server-side. Direct delete access is revoked for the financial ledgers, and direct PaymentAllocation updates are revoked to preserve history.

pgTAP covers tenant isolation and cross-workspace mutation rejection for the new financial paths.

## 18. Performance and query design

Financial reads are batched relational queries rather than per-Student loops. The workspace page loads at most 100 open Charges, 100 Packages, 300 PackageUsage rows and 21 Payments for a 20-item page plus cursor detection. Student views use the same bounded model filtered at the database. Package usages are grouped in memory after one bounded query. No full Payment history is loaded initially.

Indexes support workspace/Student/status/due lookups, allocation-by-Charge totals and idempotency keys.

## 19. `teacher_states` migration

Before Stage 4, Student balance and payment presentation could depend on Lesson participant flags and legacy state-backed compatibility data. After Stage 4, Student Payments, Package UI, Lesson financial context, dashboard financial attention and the workspace overview read normalized Charges, Payments, PaymentAllocations, Packages and PackageUsage.

`teacher_states` remains only for pre-existing compatibility areas such as bootstrap/admin/profile/settings/statistics and legacy mutations. Those unrelated paths were deliberately not removed in this stage.

## 20. Tests

Added unit coverage for deterministic auto-allocation, partial allocation, overpayment preservation and string-safe money parsing. Dashboard coverage verifies aggregated overdue attention without mixing currencies.

The 47-assertion Stage 4 pgTAP suite covers Charge creation and idempotency, price snapshots, Package non-double-billing, cancelled Lessons, partial/multiple/unallocated Payments, over-allocation, over-settlement, currency mismatch, idempotent mutations, Package creation/expiry/selection/usage, balances, due/overdue behavior and tenant isolation.

Verification completed with Prettier, ESLint, TypeScript, 98 Vitest tests, the Next.js production build, a clean Supabase reset and 197 pgTAP assertions across nine files. Supabase database lint exited successfully and reported one pre-existing warning in `public.create_lesson_schedule` about a `text` to `uuid[]` assignment cast. A non-mutating `npm ci --dry-run --ignore-scripts` validated the lockfile; a destructive full reinstall was not run while the active Next development process was using `node_modules`. Manual UI inspection covered 1440×900 and 390×844; the narrow viewport had no horizontal overflow and the browser console was clean.

## 21. Known limitations

- No refund, completion-reversal or PackageUsage-reversal workflow is exposed.
- Charge due dates are stored per item, but Stage 4 exposes the seven-day workspace rule rather than a due-date editor.
- Currency conversion and consolidated cross-currency totals are intentionally absent.
- The local demo adapter is read-only for Stage 4 mutations; production financial writes require Supabase.
- The legacy participant `payment_status` field remains for backward compatibility but is not the Stage 4 source of truth.
- No PayU, invoices, KSeF, taxes, reminders, Student Portal or advanced revenue analytics were added.

## 22. Remaining technical debt

- Retire legacy participant payment mutations after all compatibility consumers move to Charges and Payments.
- Migrate remaining legacy statistics reads from `teacher_states` during the later analytics stage.
- Add explicit corrective/refund operations before allowing changes to allocated Payments.
- Add a safe audited Lesson-completion reversal if product policy eventually requires it.
- Consider cursor pagination for Charges and Packages if a workspace grows beyond the current bounded operational view.
- Decide whether tutors need per-Charge due-date overrides in a later workflow.

## 23. Ready for Stage 5?

Yes. Stage 4 establishes a relational, tenant-safe and transaction-safe financial foundation: owed amounts, actual receipts, allocations, Package entitlement and Package usage can now be explained independently and audited together. Stage 5 can build on these read models without using Lesson status or legacy state as an accounting shortcut.
