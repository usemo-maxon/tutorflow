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
  ownerLifetime = false,
  overrideTier?: "pro" | "founder",
): Teacher["subscription"] {
  return {
    status: (overrideTier ? "active" : row.status) as SubscriptionStatus,
    tier: (overrideTier ?? row.tier) as SubscriptionTier,
    billingInterval:
      (row.billing_interval as BillingInterval | null) ?? undefined,
    readOnly: ownerLifetime || overrideTier ? false : row.read_only,
    trialEndsAt: row.trial_ends_at ?? undefined,
    renewsAt: row.renews_at ?? undefined,
    accessGrant: ownerLifetime ? "owner_lifetime" : undefined,
  };
}

export function resolveExpiredTrial(
  subscription: Teacher["subscription"],
  now = new Date(),
): Teacher["subscription"] {
  if (subscription.accessGrant === "owner_lifetime") {
    return { ...subscription, readOnly: false };
  }
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
