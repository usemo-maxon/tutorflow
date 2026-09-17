import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("./crypto", () => ({
  decryptSecret: vi.fn(),
  encryptSecret: vi.fn(),
}));
vi.mock("./supabase", () => ({ createSupabaseAdminClient: vi.fn() }));

import { googleEvent } from "./google-calendar";

describe("Google Calendar outbound event", () => {
  const lesson = {
    id: "lesson-1",
    color: "#6F8FEF",
    startsAt: "2035-01-10T16:00:00.000Z",
    durationMinutes: 60,
    location: "https://meet.example.test/lesson",
    status: "scheduled" as const,
    topic: "Present Perfect",
  };

  beforeEach(() => vi.clearAllMocks());

  it("sends a provider colorId while preserving the easy4tutor event identity", () => {
    expect(googleEvent(lesson, ["Zosia"])).toMatchObject({
      colorId: "9",
      extendedProperties: {
        private: { tutorflowLessonId: lesson.id },
      },
    });
  });

  it("changes only the mapped color when a custom lesson color changes", () => {
    const original = googleEvent(lesson, ["Zosia"]);
    const recolored = googleEvent({ ...lesson, color: "#DC2127" }, ["Zosia"]);
    expect(recolored.colorId).toBe("11");
    expect(recolored.extendedProperties).toEqual(original.extendedProperties);
  });
});
