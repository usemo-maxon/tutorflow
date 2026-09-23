import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiFailure } from "@/server/errors";

const mocks = vi.hoisted(() => ({
  currentTeacherId: vi.fn(),
  completeOnboarding: vi.fn(),
}));

vi.mock("@/server/auth", () => ({
  currentTeacherId: mocks.currentTeacherId,
}));

vi.mock("@/server/onboarding", () => ({
  completeOnboarding: mocks.completeOnboarding,
}));

import { POST } from "./route";

describe("POST /api/onboarding/complete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentTeacherId.mockResolvedValue("server-teacher");
    mocks.completeOnboarding.mockResolvedValue({
      completedAt: "2026-09-23T20:00:00.000Z",
      alreadyCompleted: false,
    });
  });

  it("requires authentication", async () => {
    mocks.currentTeacherId.mockResolvedValue(null);
    const response = await POST(
      new Request("https://easy4tutor.pl/api/onboarding/complete", {
        method: "POST",
      }),
    );
    expect(response.status).toBe(401);
  });

  it("returns ONBOARDING_INCOMPLETE with safe missing details", async () => {
    mocks.completeOnboarding.mockRejectedValue(
      new ApiFailure(409, {
        code: "ONBOARDING_INCOMPLETE",
        message: "Dokończ wymagane kroki konfiguracji.",
        details: { missing: ["student", "lesson"] },
      }),
    );
    const response = await POST(
      new Request("https://easy4tutor.pl/api/onboarding/complete", {
        method: "POST",
      }),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "ONBOARDING_INCOMPLETE",
      details: { missing: ["student", "lesson"] },
    });
  });

  it("completes from the authenticated identity and ignores request identity", async () => {
    const response = await POST(
      new Request("https://easy4tutor.pl/api/onboarding/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ teacherId: "attacker-selected" }),
      }),
    );
    expect(response.status).toBe(200);
    expect(mocks.completeOnboarding).toHaveBeenCalledWith("server-teacher");
  });

  it("returns an idempotent success", async () => {
    mocks.completeOnboarding.mockResolvedValue({
      completedAt: "2026-09-23T20:00:00.000Z",
      alreadyCompleted: true,
    });
    const response = await POST(
      new Request("https://easy4tutor.pl/api/onboarding/complete", {
        method: "POST",
      }),
    );
    expect(await response.json()).toEqual({
      completedAt: "2026-09-23T20:00:00.000Z",
      alreadyCompleted: true,
    });
  });

  it("rejects cross-site mutation requests", async () => {
    const response = await POST(
      new Request("https://easy4tutor.pl/api/onboarding/complete", {
        method: "POST",
        headers: { "sec-fetch-site": "cross-site" },
      }),
    );
    expect(response.status).toBe(403);
    expect(mocks.completeOnboarding).not.toHaveBeenCalled();
  });
});
