import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  background: undefined as (() => Promise<void>) | undefined,
  currentTeacher: vi.fn(),
  requestSync: vi.fn(),
  syncConnection: vi.fn(),
  enqueueMissing: vi.fn(),
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

vi.mock("@/server/auth", () => ({
  currentTeacher: mocks.currentTeacher,
}));

vi.mock("@/server/google-calendar-sync", () => ({
  requestGoogleSyncForTeacher: mocks.requestSync,
  syncGoogleConnection: mocks.syncConnection,
  enqueueMissingGoogleLessonsForConnection: mocks.enqueueMissing,
  processGoogleLessonJobs: mocks.processJobs,
}));

import { POST } from "./route";

describe("manual Google Calendar synchronization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.background = undefined;
    mocks.currentTeacher.mockResolvedValue({
      id: "teacher-1",
      subscription: { status: "trial", tier: "free" },
    });
    mocks.requestSync.mockResolvedValue("connection-1");
    mocks.syncConnection.mockResolvedValue({ changed: 2, full: false });
    mocks.enqueueMissing.mockResolvedValue(3);
    mocks.processJobs.mockResolvedValue({ processed: 3, succeeded: 3 });
  });

  it("imports Google changes, backfills old lessons, and flushes outbound jobs", async () => {
    const response = await POST(
      new Request("https://easy4tutor.pl/api/integrations/google/sync", {
        method: "POST",
      }),
    );

    expect(response.status).toBe(202);
    expect(mocks.after).toHaveBeenCalledOnce();
    await mocks.background?.();
    expect(mocks.syncConnection).toHaveBeenCalledWith("connection-1");
    expect(mocks.enqueueMissing).toHaveBeenCalledWith("connection-1");
    expect(mocks.processJobs).toHaveBeenCalledWith({
      teacherId: "teacher-1",
      limit: 20,
    });
    expect(mocks.syncConnection.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.enqueueMissing.mock.invocationCallOrder[0],
    );
    expect(mocks.enqueueMissing.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.processJobs.mock.invocationCallOrder[0],
    );
  });

  it("rejects an unauthenticated request", async () => {
    mocks.currentTeacher.mockResolvedValue(null);
    const response = await POST(
      new Request("https://easy4tutor.pl/api/integrations/google/sync", {
        method: "POST",
      }),
    );
    expect(response.status).toBe(401);
    expect(mocks.requestSync).not.toHaveBeenCalled();
  });

  it("rejects an active Free account before requesting synchronization", async () => {
    mocks.currentTeacher.mockResolvedValue({
      id: "teacher-1",
      subscription: { status: "active", tier: "free" },
    });
    const response = await POST(
      new Request("https://easy4tutor.pl/api/integrations/google/sync", {
        method: "POST",
      }),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "PLAN_REQUIRED" });
    expect(mocks.requestSync).not.toHaveBeenCalled();
  });
});
