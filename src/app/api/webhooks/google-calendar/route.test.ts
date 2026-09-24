import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  background: undefined as (() => Promise<void>) | undefined,
  acceptWebhook: vi.fn(),
  syncConnection: vi.fn(),
  processJobs: vi.fn(),
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
  GOOGLE_WEBHOOK_REPAIR_BATCH_LIMIT: 10,
  processGoogleLessonJobs: mocks.processJobs,
  syncGoogleConnection: mocks.syncConnection,
}));

import { POST } from "./route";

describe("Google Calendar webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.background = undefined;
    mocks.acceptWebhook.mockResolvedValue({
      kind: "accepted",
      connectionId: "connection-1",
      teacherId: "teacher-1",
    });
    mocks.syncConnection.mockResolvedValue({ changed: 1, full: false });
    mocks.processJobs.mockResolvedValue({ processed: 1, succeeded: 1 });
  });

  function request(resourceState = "exists") {
    return new Request("https://easy4tutor.pl/api/webhooks/google-calendar", {
      method: "POST",
      headers: { "x-goog-resource-state": resourceState },
    });
  }

  it("acknowledges the webhook and immediately schedules reconciliation", async () => {
    const response = await POST(request());

    expect(response.status).toBe(204);
    expect(mocks.after).toHaveBeenCalledOnce();
    await mocks.background?.();
    expect(mocks.syncConnection).toHaveBeenCalledWith("connection-1");
    expect(mocks.processJobs).toHaveBeenCalledWith({
      teacherId: "teacher-1",
      limit: 10,
    });
  });

  it("does not start reconciliation for an invalid channel", async () => {
    mocks.acceptWebhook.mockResolvedValue({ kind: "invalid" });
    const response = await POST(request());

    expect(response.status).toBe(404);
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("acknowledges a valid downgraded Free channel without syncing", async () => {
    mocks.acceptWebhook.mockResolvedValue({ kind: "skipped_not_entitled" });
    const response = await POST(request());
    expect(response.status).toBe(204);
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("returns a retryable response for temporary verification failure", async () => {
    mocks.acceptWebhook.mockRejectedValue(new Error("database unavailable"));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it.each(["sync", "exists"])(
    "accepts the documented %s Events resource state",
    async (resourceState) => {
      expect((await POST(request(resourceState))).status).toBe(204);
      expect(mocks.after).toHaveBeenCalledOnce();
    },
  );

  it("rejects an arbitrary resource state before channel lookup", async () => {
    expect((await POST(request("updated"))).status).toBe(404);
    expect(mocks.acceptWebhook).not.toHaveBeenCalled();
  });
});
