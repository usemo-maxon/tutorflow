import { describe, expect, it } from "vitest";
import {
  ANNUAL_SAVING_GROSZ,
  checkoutPrice,
  FOUNDER_MONTHLY_PRICE_GROSZ,
  FOUNDER_SLOT_LIMIT,
  FREE_PRICE_GROSZ,
  PRO_ANNUAL_PRICE_GROSZ,
  PRO_MONTHLY_PRICE_GROSZ,
  remainingTrialDays,
  subscriptionPresentation,
  TRIAL_DAYS,
} from "./pricing";

describe("launch pricing", () => {
  it("keeps every public amount in one source of truth", () => {
    expect(FREE_PRICE_GROSZ).toBe(0);
    expect(PRO_MONTHLY_PRICE_GROSZ).toBe(4_499);
    expect(PRO_ANNUAL_PRICE_GROSZ).toBe(39_900);
    expect(FOUNDER_MONTHLY_PRICE_GROSZ).toBe(2_999);
    expect(TRIAL_DAYS).toBe(14);
    expect(FOUNDER_SLOT_LIMIT).toBe(50);
    expect(ANNUAL_SAVING_GROSZ).toBe(14_088);
  });

  it("uses server-selected checkout prices", () => {
    expect(checkoutPrice("monthly", false)).toBe(4_499);
    expect(checkoutPrice("annual", false)).toBe(39_900);
    expect(checkoutPrice("monthly", true)).toBe(2_999);
    expect(checkoutPrice("annual", true)).toBe(39_900);
  });
});

describe("subscription presentation", () => {
  it.each([
    [
      { status: "trial", tier: "free" },
      { plan: "Pro", variant: "trial" },
    ],
    [
      { status: "active", tier: "free" },
      { plan: "Free", variant: "free", priceGrosz: 0 },
    ],
    [
      { status: "active", tier: "pro", billingInterval: "monthly" },
      { plan: "Pro", variant: "pro-monthly", priceGrosz: 4_499 },
    ],
    [
      { status: "active", tier: "pro", billingInterval: "annual" },
      { plan: "Pro", variant: "pro-annual", priceGrosz: 39_900 },
    ],
    [
      { status: "active", tier: "founder", billingInterval: "monthly" },
      { plan: "Founder", variant: "founder", priceGrosz: 2_999 },
    ],
  ] as const)("maps canonical subscription %#", (subscription, expected) => {
    expect(subscriptionPresentation(subscription)).toMatchObject(expected);
  });

  it("calculates and clamps remaining trial days from timestamps", () => {
    const now = new Date("2026-09-24T12:00:00.000Z");
    expect(remainingTrialDays("2026-10-03T11:00:00.000Z", now)).toBe(9);
    expect(remainingTrialDays("2026-09-20T12:00:00.000Z", now)).toBe(0);
  });
});
