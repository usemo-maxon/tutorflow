# Finance lifecycle hardening — L0.10

## Finance model

The existing relational ledger remains authoritative:

```text
lesson completion or package purchase
→ charge or package usage
→ payment
→ allocation
→ settlement
```

Money is stored and calculated only as safe integer minor units (grosz). Charges and package usages are historical records; payments allocate to durable charges and excess payment remains unallocated.

## Billing-type semantics

| Billing type | Supported target | Completion result |
| --- | --- | --- |
| `per_lesson` | One snapshotted student | One lesson charge for that student using the lesson price snapshot. A multi-participant value is rejected because the model has no single group payer. |
| `per_student` | One or more snapshotted participants | One charge per historical lesson participant, each using the lesson price snapshot. Group lessons created by the current scheduler are normalized to this type. |
| `package` | Exactly one student | One unit from that student's earliest eligible package. Group/shared packages are unsupported and rejected. |
| `trial` | One student or group | Completion creates no charge and consumes no package. |

The scheduling UI exposes one `Cena` value. For a group it is a per-participant price. Participant snapshots, not later group membership, determine charge recipients. Resolved `present` and `absent` attendance can complete under the existing policy; `unknown` cannot. A `no_show` transition creates neither a charge nor package usage.

## Package lifecycle

- `active`: selectable when `expires_at` is null or at/after the current instant and remaining units are positive.
- `expired`: derived for display once `expires_at < now()` and never selectable for new consumption.
- `exhausted`: persisted when consumption reaches the final unit; the derived balance is clamped at zero.
- `cancelled`: never selectable.

Selection is deterministic: earliest `expires_at`, then `purchased_at`, `created_at`, and `id`. The package row is locked before balance validation and usage insertion, so concurrent completions cannot consume the same final unit. No eligible package rejects the entire completion as `PACKAGE_EXHAUSTED`; the lesson remains incomplete and no ledger row is written.

A zero-price package creates usable units without a zero-value charge. Normal creation requires an active student, a positive lesson count, a nonnegative price, and `expires_at >= purchased_at` when expiry is present. Consumption and reversal rows remain append-only. `reverse_lesson_package_usage` is the existing correction action: it appends one reversal, reactivates the package, and moves a completed lesson back to `needs_completion`.

## Charge lifecycle

Charges move through `open`, `partial`, `settled`, and `cancelled`. Lesson completion and its charges run in one database transaction. Package completion, usage insertion, package status update, and lesson completion also run in one transaction. Cancelled lessons cannot complete and create no new receivable. Completed lesson calendar mutation remains blocked by the existing lifecycle guards, preserving price and ledger history.

## Payment lifecycle

Payments are recorded as received funds and may allocate partially, fully, or across several charges belonging to the same student and currency. Row locks on the payment and every target charge serialize concurrent allocation, preventing over-settlement. A payment larger than selected balances keeps an auditable unallocated remainder; it is not converted, discarded, or assigned to another student.

The same idempotency key with the same normalized payload returns the original payment/package. Reusing a key with a different student, amount, currency, dates, note, method, allocations, package name, price, or unit count raises `IDEMPOTENCY_CONFLICT` and rolls back. Advisory transaction locks serialize concurrent first use of a key.

## Archived students

Student archival does not delete financial history. Archived students with open or visible financial history remain payment candidates and are marked `Archiwalny`. Recording a payment for historical debt remains allowed. New package creation requires an active student in both the UI and database RPC.

## Pagination and summaries

Payment pages contain 20 rows and fetch 21 to determine `hasMore`. Ordering is stable by `paid_at DESC`, `created_at DESC`, and `payment_id DESC`; the next offset advances by 20 only when the extra row exists.

The open-charge and package lists remain bounded UI projections. `outstanding`, `overdue`, and `receivedThisMonth` are calculated by `finance_summary(...)` inside PostgreSQL across all matching rows, optionally scoped to a student, and only in the workspace currency. List caps therefore cannot change money totals.

## Multi-currency

There is no FX conversion. Allocations require exact currency equality. Workspace summary cards include only the workspace currency; individual foreign-currency charges and payments retain and display their own currency rather than being added to a false combined total.

## Security

Finance reads and writes derive workspace authority from the authenticated teacher on the server. POST uses the same cross-site request rejection as other mutation APIs. Read-only subscriptions reject payment and package writes. RPCs are `SECURITY INVOKER`, explicitly check workspace membership, and retain Stage 4 RLS and cross-workspace isolation.

## Local/demo limitation

Local/demo finance reads remain a limited preview. Finance writes intentionally return `FINANCE_REQUIRES_DATABASE`; no second file-backed ledger is maintained.

## Deferred

The following remain deliberately outside L0.10: refunds, payment deletion/editing, charge editing, credit notes, accounting exports, shared/group packages, and a single-payer group-level `per_lesson` receivable.
