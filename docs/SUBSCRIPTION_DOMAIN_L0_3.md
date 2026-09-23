# Subscription domain — L0.3

## Previous model

The previous subscription model used one field for two different concepts:

```text
plan = trial | monthly | annual | founder
```

`founder` described a product tier, while `monthly` and `annual` described billing cadence. `trial` described lifecycle state. This made the field ambiguous.

## Canonical model

Application code now represents a subscription as:

```ts
{
  status: "trial" | "active" | "past_due" | "read_only" | "cancelled";
  tier: "free" | "pro" | "founder";
  billingInterval?: "monthly" | "annual";
  readOnly: boolean;
  trialEndsAt?: ISODateTime;
  renewsAt?: ISODateTime;
}
```

Tier, billing interval, and lifecycle status are independent concepts. The database columns are `subscriptions.tier`, `subscriptions.billing_interval`, and the existing `subscriptions.status`.

## Transitional compatibility

- `subscriptions.plan` remains as a legacy compatibility and billing representation.
- The current 14-day trial behavior remains unchanged. Trial users have `status = trial`, `tier = free`, and no billing interval.
- Current monthly, annual, and Founder pricing and checkout behavior remain unchanged.
- Current Founder eligibility, slot limit, and award behavior remain unchanged.
- `payu_orders.plan` remains a legacy checkout/billing-product identifier containing `monthly` or `annual`; it is not the subscription product tier.
- `trial_ends_at` remains in the database during this transition.

## Mapping

| Legacy plan | Tier    | Billing interval |
| ----------- | ------- | ---------------- |
| trial       | free    | none             |
| monthly     | pro     | monthly          |
| annual      | pro     | annual           |
| founder     | founder | monthly          |

Existing rows are backfilled deterministically with this mapping. New-user creation and PayU confirmation write both the legacy and canonical representations.

## Future work

- L0.4 — entitlement model
- L0.11 — final pricing/trial/landing/subscription UX transition

Neither is implemented by L0.3.
