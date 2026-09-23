import type { SubscriptionStatus, SubscriptionTier, Teacher } from "./domain";

export interface Entitlements {
  maxActiveStudents: number | null;
  googleCalendar: boolean;
  telegramReminders: boolean;
  advancedStatistics: boolean;
  automations: boolean;
  publicBooking: boolean;
  studentPortal: boolean;
  ai: boolean;
}

type EntitlementSubscription = Pick<Teacher["subscription"], "status" | "tier">;

const FREE_ENTITLEMENTS: Readonly<Entitlements> = Object.freeze({
  maxActiveStudents: 3,
  googleCalendar: false,
  telegramReminders: false,
  advancedStatistics: false,
  automations: false,
  publicBooking: false,
  studentPortal: false,
  ai: false,
});

const PRO_ENTITLEMENTS: Readonly<Entitlements> = Object.freeze({
  maxActiveStudents: null,
  googleCalendar: true,
  telegramReminders: true,
  advancedStatistics: true,
  automations: true,
  publicBooking: true,
  studentPortal: true,
  ai: true,
});

export function resolveEntitlements(
  subscription: EntitlementSubscription,
): Entitlements {
  if (subscription.status === "trial" || subscription.tier !== "free") {
    return { ...PRO_ENTITLEMENTS };
  }
  return { ...FREE_ENTITLEMENTS };
}

export function hasEntitlement(
  subscription: EntitlementSubscription,
  capability: Exclude<keyof Entitlements, "maxActiveStudents">,
): boolean {
  return resolveEntitlements(subscription)[capability];
}

export function activeStudentLimit(
  subscription: EntitlementSubscription,
): number | null {
  return resolveEntitlements(subscription).maxActiveStudents;
}

export type EntitlementSubscriptionRow = {
  status: SubscriptionStatus;
  tier: SubscriptionTier;
};
