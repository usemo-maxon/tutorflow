import { describe, expect, it } from "vitest";
import { resolveEntitlements } from "./entitlements";

const fullAccess = {
  maxActiveStudents: null,
  maxPublishedLessonOffers: null,
  maxPublishedCertificates: 10,
  externalIntroductionVideo: true,
  hostedIntroductionVideo: true,
  maxHostedVideoBytes: 75 * 1024 * 1024,
  maxHostedVideoDurationSeconds: 90,
  profileThemes: ["minimal", "professional", "friendly", "modern"],
  advancedProfilePersonalization: true,
  basicProfileAnalytics: true,
  advancedProfileAnalytics: true,
  advancedProfileSeo: true,
  googleCalendar: true,
  telegramReminders: true,
  advancedStatistics: true,
  automations: true,
  publicBooking: true,
  studentPortal: true,
  ai: true,
};

describe("resolveEntitlements", () => {
  it("applies the complete Free matrix", () => {
    expect(resolveEntitlements({ status: "active", tier: "free" })).toEqual({
      maxActiveStudents: 3,
      maxPublishedLessonOffers: 2,
      maxPublishedCertificates: 1,
      externalIntroductionVideo: true,
      hostedIntroductionVideo: false,
      maxHostedVideoBytes: null,
      maxHostedVideoDurationSeconds: null,
      profileThemes: ["professional"],
      advancedProfilePersonalization: false,
      basicProfileAnalytics: true,
      advancedProfileAnalytics: false,
      advancedProfileSeo: false,
      googleCalendar: false,
      telegramReminders: false,
      advancedStatistics: false,
      automations: false,
      publicBooking: true,
      studentPortal: false,
      ai: false,
    });
  });

  it.each([
    ["active Pro", { status: "active" as const, tier: "pro" as const }],
    ["active Founder", { status: "active" as const, tier: "founder" as const }],
    ["Free trial", { status: "trial" as const, tier: "free" as const }],
  ])("grants full access to %s", (_label, subscription) => {
    expect(resolveEntitlements(subscription)).toEqual(fullAccess);
  });

  it("does not inspect billing cadence", () => {
    const monthlySubscription = {
      status: "active",
      tier: "pro",
      billingInterval: "monthly",
    } as const;
    const annualSubscription = {
      status: "active",
      tier: "pro",
      billingInterval: "annual",
    } as const;
    const monthly = resolveEntitlements(monthlySubscription);
    const annual = resolveEntitlements(annualSubscription);
    expect(monthly).toEqual(annual);
  });

  it("grants every current entitlement and unlimited students to the lifetime owner", () => {
    expect(
      resolveEntitlements({
        status: "past_due",
        tier: "free",
        accessGrant: "owner_lifetime",
      }),
    ).toEqual(fullAccess);
  });
});
