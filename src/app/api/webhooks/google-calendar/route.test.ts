import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  background: undefined as (() => Promise<void>) | undefined,
  acceptWebhook: vi.fn(),
  syncConnection: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: (callback: () => Promise<void>) => {
      mocks.after(callback);
      mocks.background = callback;
    },
  };
});

vi.mock("@/server/google-calendar-sync", () => ({
  acceptGoogleWebhook: mocks.acceptWebhook,
  syncGoogleConnection: mocks.syncConnection,
}));

import { POST } from "./route";

describe("Google Calendar webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.background = undefined;
    mocks.acceptWebhook.mockResolvedValue("connection-1");
    mocks.syncConnection.mockResolvedValue({ changed: 1, full: false });
  });

  it("acknowledges the webhook and immediately schedules reconciliation", async () => {
    const request = new Request(
      "https://easy4tutor.pl/api/webhooks/google-calendar",
      { method: "POST" },
    );
    const response = await POST(request);

    expect(response.status).toBe(204);
    expect(mocks.after).toHaveBeenCalledOnce();
    await mocks.background?.();
    expect(mocks.syncConnection).toHaveBeenCalledWith("connection-1");
  });

  it("does not start reconciliation for an invalid channel", async () => {
    mocks.acceptWebhook.mockResolvedValue(null);
    const response = await POST(
      new Request("https://easy4tutor.pl/api/webhooks/google-calendar", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(404);
    expect(mocks.after).not.toHaveBeenCalled();
  });
});
