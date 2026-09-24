# L0.11 — Pricing, landing and subscription UX

## Launch plans

- **Free** — the permanent no-cost plan for up to three active students.
- **Pro monthly** — the full Pro capability set, billed monthly.
- **Pro annual** — the same Pro capability set, billed annually.
- **Founder** — the full Pro capability set at a special monthly price for the
  first 50 eligible users. Founder is a commercial variant, not a separate
  capability tier.

## Prices

Public prices are defined in `src/lib/pricing.ts` and used by the landing page,
subscription settings, PayU checkout and application tests.

| Product | Gross price |
| --- | ---: |
| Free | 0 zł |
| Pro monthly | 44,99 zł / month |
| Pro annual | 399 zł / year |
| Founder | 29,99 zł / month |

The annual saving is calculated from the monthly and annual integer-grosz
constants. It is not a separate marketing constant.

## Trial

Every new account receives a 14-day Pro trial without payment details. The
canonical row remains `status = trial`, `tier = free`, and has no billing
interval; the presentation layer describes this as **Pro — okres próbny**.

The maintenance route transitions an expired unpaid trial to:

```text
status = active
tier = free
billing_interval = NULL
read_only = false
```

The transition updates only the subscription row. It does not archive students,
remove lessons, or delete integration credentials. If the account has more than
three active students, all existing data remains readable and unchanged. L0.4
entitlements continue to block creating or restoring further active students.

Paid subscription expiry is intentionally separate and retains its existing
`past_due` / read-only behavior.

## Entitlements

Authorization remains owned by `resolveEntitlements(...)` from L0.4. Pricing
configuration contains presentation copy only and must not be used as an
authorization source.

Founder resolves to the same capabilities as Pro. The product does not claim
Founder-only functionality.

## Founder

Founder availability is calculated on the server from active Founder
subscriptions and the 50-slot limit. The browser receives only a trusted
availability result. Monthly checkout uses the server-side availability result
to select either the Founder price or the regular Pro monthly price; clients
cannot request `founder` as a checkout product.

The existing database confirmation function remains authoritative for the final
Founder award and uses its advisory lock to preserve the slot limit.

## PayU

The checkout API accepts only `monthly` or `annual`. It rejects arbitrary
products and client-controlled amounts. The server determines the amount from
the centralized pricing constants. A successful browser return never activates
a subscription; the signed PayU webhook and database confirmation function
remain authoritative.

Unsuccessful or cancelled returns preserve the current subscription and show a
safe message without exposing provider errors.

## Subscription states

- `tier` describes product capability: `free`, `pro`, or `founder`.
- `status` describes lifecycle: trial, active, past due, read-only, or cancelled.
- `billingInterval` describes a paid billing product: monthly or annual.

Presentation must be derived from these canonical fields, never from the legacy
`subscriptions.plan` compatibility column.

## Existing-user compatibility

Legacy `plan` remains in the database for compatibility. Current application
reads and UI use canonical tier, status, and billing interval. Existing Founder
users retain their Founder label and are not prompted to replace it with Pro.

## Deferred

- Self-service cancellation and downgrade
- Switching an active subscription between monthly and annual billing
- VAT invoices and billing profiles
- Coupon or promotion-code infrastructure

These controls are not shown as working actions in L0.11.
