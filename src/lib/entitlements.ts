import type { SubscriptionStatus, SubscriptionTier, Teacher } from "./domain";
import type { ProfileTheme } from "./public-profile";

export const HOSTED_PROFILE_VIDEO_MAX_BYTES = 75 * 1024 * 1024;
export const HOSTED_PROFILE_VIDEO_MAX_DURATION_SECONDS = 90;

export interface Entitlements {
  maxActiveStudents: number | null;
  maxPublishedLessonOffers: number | null;
  maxPublishedCertificates: number;
  externalIntroductionVideo: boolean;
  hostedIntroductionVideo: boolean;
  maxHostedVideoBytes: number | null;
  maxHostedVideoDurationSeconds: number | null;
  profileThemes: readonly ProfileTheme[];
  advancedProfilePersonalization: boolean;
  basicProfileAnalytics: boolean;
  advancedProfileAnalytics: boolean;
  advancedProfileSeo: boolean;
  googleCalendar: boolean;
  telegramReminders: boolean;
  advancedStatistics: boolean;
  automations: boolean;
  publicBooking: boolean;
  studentPortal: boolean;
  ai: boolean;
}

type EntitlementSubscription = Pick<
  Teacher["subscription"],
  "status" | "tier" | "accessGrant"
>;

export type BooleanEntitlement = {
  [K in keyof Entitlements]: Entitlements[K] extends boolean ? K : never;
}[keyof Entitlements];

export const PROFILE_PLAN_ENTITLEMENTS = {
  free: {
    maxPublishedLessonOffers: 2,
    maxPublishedCertificates: 1,
    externalIntroductionVideo: true,
    hostedIntroductionVideo: false,
    maxHostedVideoBytes: null,
    maxHostedVideoDurationSeconds: null,
    profileThemes: Object.freeze(["professional"] as const),
    advancedProfilePersonalization: false,
    basicProfileAnalytics: true,
    advancedProfileAnalytics: false,
    advancedProfileSeo: false,
  },
  premium: {
    maxPublishedLessonOffers: null,
    maxPublishedCertificates: 10,
    externalIntroductionVideo: true,
    hostedIntroductionVideo: true,
    maxHostedVideoBytes: HOSTED_PROFILE_VIDEO_MAX_BYTES,
    maxHostedVideoDurationSeconds: HOSTED_PROFILE_VIDEO_MAX_DURATION_SECONDS,
    profileThemes: ["minimal", "professional", "friendly", "modern"],
    advancedProfilePersonalization: true,
    basicProfileAnalytics: true,
    advancedProfileAnalytics: true,
    advancedProfileSeo: true,
  },
} as const;

const FREE_ENTITLEMENTS: Readonly<Entitlements> = Object.freeze({
  maxActiveStudents: 3,
  ...PROFILE_PLAN_ENTITLEMENTS.free,
  googleCalendar: false,
  telegramReminders: false,
  advancedStatistics: false,
  automations: false,
  publicBooking: true,
  studentPortal: false,
  ai: false,
});

const PRO_ENTITLEMENTS: Readonly<Entitlements> = Object.freeze({
  maxActiveStudents: null,
  ...PROFILE_PLAN_ENTITLEMENTS.premium,
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
  if (
    subscription.accessGrant === "owner_lifetime" ||
    subscription.status === "trial" ||
    subscription.tier !== "free"
  ) {
    const profileAccess =
      subscription.accessGrant === "owner_lifetime" ||
      subscription.status === "trial" ||
      subscription.status === "active";
    return {
      ...PRO_ENTITLEMENTS,
      ...(profileAccess
        ? PROFILE_PLAN_ENTITLEMENTS.premium
        : PROFILE_PLAN_ENTITLEMENTS.free),
    };
  }
  return { ...FREE_ENTITLEMENTS };
}

export function hasEntitlement(
  subscription: EntitlementSubscription,
  capability: BooleanEntitlement,
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
  accessGrant?: "owner_lifetime";
};
