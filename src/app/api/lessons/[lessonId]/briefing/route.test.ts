import { beforeEach, describe, expect, it, vi } from "vitest";

const currentTeacherId = vi.fn();
const getNextLessonBriefing = vi.fn();

vi.mock("@/server/auth", () => ({ currentTeacherId }));
vi.mock("@/server/next-lesson-briefing", () => ({ getNextLessonBriefing }));

const { GET } = await import("./route");

describe("GET /api/lessons/[lessonId]/briefing", () => {
  beforeEach(() => {
    currentTeacherId.mockReset();
    getNextLessonBriefing.mockReset();
  });

  it("returns 401 before resolving any lesson for an unauthenticated request", async () => {
    currentTeacherId.mockResolvedValue(null);
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ lessonId: "lesson-1" }),
    });
    expect(response.status).toBe(401);
    expect(getNextLessonBriefing).not.toHaveBeenCalled();
  });

  it("uses authenticated authority only and disables shared caching", async () => {
    currentTeacherId.mockResolvedValue("teacher-1");
    getNextLessonBriefing.mockResolvedValue({ lesson: { id: "lesson-1" }, participants: [] });
    const response = await GET(
      new Request("http://localhost?workspaceId=attacker"),
      { params: Promise.resolve({ lessonId: "lesson-1" }) },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(getNextLessonBriefing).toHaveBeenCalledWith("teacher-1", "lesson-1");
  });
});
