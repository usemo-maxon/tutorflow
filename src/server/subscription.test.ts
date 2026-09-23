import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createTeacher } from "./store";
import { mapSubscriptionRow } from "./subscription";

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
});
