import type {
  BillingInterval,
  SubscriptionStatus,
  SubscriptionTier,
  Teacher,
} from "@/lib/domain";

export interface SubscriptionRow {
  status: string;
  tier: string;
  billing_interval: string | null;
  read_only: boolean;
  trial_ends_at: string | null;
  renews_at: string | null;
}

export function mapSubscriptionRow(
  row: SubscriptionRow,
): Teacher["subscription"] {
  return {
    status: row.status as SubscriptionStatus,
    tier: row.tier as SubscriptionTier,
    billingInterval:
      (row.billing_interval as BillingInterval | null) ?? undefined,
    readOnly: row.read_only,
    trialEndsAt: row.trial_ends_at ?? undefined,
    renewsAt: row.renews_at ?? undefined,
  };
}

export function resolveExpiredTrial(
  subscription: Teacher["subscription"],
  now = new Date(),
): Teacher["subscription"] {
  if (
    subscription.status !== "trial" ||
    !subscription.trialEndsAt ||
    Date.parse(subscription.trialEndsAt) > now.getTime()
  ) {
    return subscription;
  }

  return {
    status: "active",
    tier: "free",
    readOnly: false,
  };
}
