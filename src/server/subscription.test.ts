import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createTeacher } from "./store";
import { mapSubscriptionRow, resolveExpiredTrial } from "./subscription";

describe("subscription mapping", () => {
  it("maps a Supabase row to the canonical Teacher subscription", () => {
    expect(
      mapSubscriptionRow({
        status: "active",
        tier: "pro",
        billing_interval: "annual",
        read_only: false,
        trial_ends_at: "2026-10-07T12:00:00.000Z",
        renews_at: "2027-09-23T12:00:00.000Z",
      }),
    ).toEqual({
      status: "active",
      tier: "pro",
      billingInterval: "annual",
      readOnly: false,
      trialEndsAt: "2026-10-07T12:00:00.000Z",
      renewsAt: "2027-09-23T12:00:00.000Z",
      accessGrant: undefined,
    });
  });

  it("omits nullable billing and date fields for a free trial", () => {
    expect(
      mapSubscriptionRow({
        status: "trial",
        tier: "free",
        billing_interval: null,
        read_only: false,
        trial_ends_at: null,
        renews_at: null,
      }),
    ).toEqual({
      status: "trial",
      tier: "free",
      billingInterval: undefined,
      readOnly: false,
      trialEndsAt: undefined,
      renewsAt: undefined,
      accessGrant: undefined,
    });
  });

  it("uses the same canonical model in the local adapter", async () => {
    const teacher = await createTeacher({
      name: "Local Subscription Test",
      email: `local-subscription-l03-${randomUUID()}@example.test`,
      password: "subscription-test-password",
    });

    expect(teacher.subscription).toMatchObject({
      status: "trial",
      tier: "free",
      readOnly: false,
      trialEndsAt: expect.any(String),
    });
    expect(teacher.subscription.billingInterval).toBeUndefined();
    expect(teacher.subscription).not.toHaveProperty("plan");
  });

  it("falls an expired trial back to active Free without read-only mode", () => {
    expect(
      resolveExpiredTrial(
        {
          status: "trial",
          tier: "free",
          readOnly: false,
          trialEndsAt: "2026-09-20T12:00:00.000Z",
        },
        new Date("2026-09-24T12:00:00.000Z"),
      ),
    ).toEqual({ status: "active", tier: "free", readOnly: false });
  });

  it("does not alter paid subscription expiration semantics", () => {
    const subscription = {
      status: "active" as const,
      tier: "pro" as const,
      billingInterval: "monthly" as const,
      readOnly: false,
      renewsAt: "2026-09-20T12:00:00.000Z",
    };
    expect(
      resolveExpiredTrial(subscription, new Date("2026-09-24T12:00:00.000Z")),
    ).toBe(subscription);
  });

  it("keeps lifetime access writable after trial expiration", () => {
    const subscription = {
      status: "trial" as const,
      tier: "free" as const,
      readOnly: true,
      trialEndsAt: "2026-09-20T12:00:00.000Z",
      accessGrant: "owner_lifetime" as const,
    };
    expect(
      resolveExpiredTrial(subscription, new Date("2026-09-24T12:00:00.000Z")),
    ).toEqual({ ...subscription, readOnly: false });
  });

  it("maps lifetime access without fabricating a paid plan", () => {
    expect(
      mapSubscriptionRow(
        {
          status: "past_due",
          tier: "free",
          billing_interval: null,
          read_only: true,
          trial_ends_at: null,
          renews_at: null,
        },
        true,
      ),
    ).toMatchObject({
      status: "past_due",
      tier: "free",
      readOnly: false,
      accessGrant: "owner_lifetime",
    });
  });
});
