import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppData } from "@/lib/domain";

const mocks = vi.hoisted(() => ({
  getAppData: vi.fn(),
}));

vi.mock("@/server/repository", () => ({
  getAppData: mocks.getAppData,
  localAllowed: vi.fn(() => false),
  mutateStore: vi.fn(),
}));

import { getOnboardingProgress } from "./onboarding";

function appData(
  options: {
    name?: string;
    timezone?: string;
    student?: "none" | "active" | "archived";
    lesson?: "none" | "scheduled" | "cancelled";
    google?: "connected" | "not_connected";
  } = {},
): AppData {
  const studentStatus = options.student ?? "none";
  const lessonStatus = options.lesson ?? "none";
  return {
    teacher: {
      id: "teacher-1",
      name: options.name ?? "Anna Nowak",
      email: "anna@example.test",
      timezone: options.timezone ?? "Europe/Warsaw",
      subscription: { status: "trial", tier: "free", readOnly: false },
    },
    students:
      studentStatus === "none"
        ? []
        : [
            {
              id: "student-1",
              status: studentStatus,
            } as AppData["students"][number],
          ],
    lessons:
      lessonStatus === "none"
        ? []
        : [
            {
              id: "lesson-1",
              status: lessonStatus,
            } as AppData["lessons"][number],
          ],
    integrations: {
      google: { status: options.google ?? "not_connected" },
      telegram: { status: "not_connected" },
      payu: { status: "not_connected" },
    },
    contacts: [],
    groups: [],
    studentStatImports: [],
    availability: [],
    availabilityExceptions: [],
    calendarBlocks: [],
    externalGoogleEvents: [],
    financials: {} as AppData["financials"],
  };
}

describe("onboarding progress service", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    ["no student and no lesson", appData(), false],
    ["student without lesson", appData({ student: "active" }), false],
    [
      "student and scheduled lesson",
      appData({ student: "active", lesson: "scheduled" }),
      true,
    ],
    [
      "cancelled-only lesson",
      appData({ student: "active", lesson: "cancelled" }),
      false,
    ],
    [
      "Google disconnected",
      appData({
        student: "active",
        lesson: "scheduled",
        google: "not_connected",
      }),
      true,
    ],
    [
      "Google connected",
      appData({ student: "active", lesson: "scheduled", google: "connected" }),
      true,
    ],
  ])("derives %s", async (_label, source, completable) => {
    mocks.getAppData.mockResolvedValue(source);
    const progress = await getOnboardingProgress("teacher-1");
    expect(
      progress.profileReady && progress.firstStudent && progress.firstLesson,
    ).toBe(completable);
  });

  it("does not count an archived student", async () => {
    mocks.getAppData.mockResolvedValue(
      appData({ student: "archived", lesson: "scheduled" }),
    );
    expect((await getOnboardingProgress("teacher-1")).firstStudent).toBe(false);
  });

  it("uses the profile validation rules", async () => {
    mocks.getAppData.mockResolvedValue(appData({ name: " ", timezone: "" }));
    expect((await getOnboardingProgress("teacher-1")).profileReady).toBe(false);
  });
});
