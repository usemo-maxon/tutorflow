import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ currentTeacher: vi.fn() }));

vi.mock("@/server/auth", () => ({ currentTeacher: mocks.currentTeacher }));

import { GET, POST } from "./route";

describe("PayU checkout lifetime access boundary", () => {
  beforeEach(() => {
    mocks.currentTeacher.mockResolvedValue({
      id: "owner-lifetime",
      name: "Owner",
      email: "owner@example.test",
      timezone: "Europe/Warsaw",
      subscription: {
        status: "past_due",
        tier: "free",
        readOnly: false,
        accessGrant: "owner_lifetime",
      },
    });
  });

  it("does not advertise a paid Founder checkout to the lifetime owner", async () => {
    await expect(GET().then((response) => response.json())).resolves.toEqual({
      founderAvailable: false,
      lifetimeAccess: true,
    });
  });

  it("rejects payment creation before contacting PayU", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const response = await POST(
      new Request("https://example.test/api/payu/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan: "annual" }),
      }),
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: "LIFETIME_ACCESS",
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
