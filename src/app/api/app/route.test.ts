import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  background: undefined as (() => Promise<void>) | undefined,
  currentTeacherId: vi.fn(),
  performAction: vi.fn(),
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
  currentTeacherId: mocks.currentTeacherId,
}));

vi.mock("@/server/app-service", () => ({
  performAction: mocks.performAction,
}));

vi.mock("@/server/google-calendar-sync", () => ({
  processGoogleLessonJobs: mocks.processJobs,
}));

vi.mock("@/server/repository", () => ({
  getAppData: vi.fn(),
  isSchedulingAction: (action: { type: string }) =>
    action.type === "createLesson",
}));

import { POST } from "./route";

describe("Lesson mutation Google synchronization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.background = undefined;
    mocks.currentTeacherId.mockResolvedValue(
      "11111111-1111-4111-8111-111111111111",
    );
    mocks.performAction.mockResolvedValue({ data: {}, result: { id: "l1" } });
    mocks.processJobs.mockResolvedValue({
      recovered: 0,
      processed: 1,
      succeeded: 1,
      retried: 0,
      skipped: 0,
      failed: 0,
    });
  });

  it("processes a newly enqueued Lesson job immediately after the local save", async () => {
    const response = await POST(
      new Request("https://easy4tutor.pl/api/app", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: "createLesson",
          lesson: {
            target: {
              type: "student",
              id: "22222222-2222-4222-8222-222222222222",
            },
            mode: "single",
            occurrences: [
              {
                startsAt: "2035-01-10T10:00:00.000Z",
                durationMinutes: 60,
              },
            ],
            format: "online",
            location: "https://meet.example.test/lesson",
            priceAmount: null,
            topic: "Matematyka",
            plan: [],
          },
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.performAction).toHaveBeenCalledOnce();
    expect(mocks.after).toHaveBeenCalledOnce();
    await mocks.background?.();
    expect(mocks.processJobs).toHaveBeenCalledWith({
      teacherId: "11111111-1111-4111-8111-111111111111",
    });
  });
});
