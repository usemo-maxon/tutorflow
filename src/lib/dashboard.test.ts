import { describe, expect, it } from "vitest";
import { dashboardBriefingPreview } from "./dashboard";
import type { NextLessonBriefing } from "./next-lesson-briefing";

function briefing(
  participants: NextLessonBriefing["participants"],
): NextLessonBriefing {
  return {
    lesson: { id: "lesson", startsAt: "2026-09-29T12:00:00.000Z" },
    participants,
    generatedAt: "2026-09-29T10:00:00.000Z",
  };
}

describe("dashboardBriefingPreview", () => {
  it("treats a student without history as a first lesson, not a warning", () => {
    expect(
      dashboardBriefingPreview(
        briefing([{ student: { id: "a", name: "Zosia" } }]),
        "Uczeń",
      ),
    ).toEqual({ kind: "first_lesson", studentName: "Zosia" });
  });

  it("maps the compact D1.5 fields for a 1:1 lesson", () => {
    expect(
      dashboardBriefingPreview(
        briefing([
          {
            student: { id: "a", name: "Zosia" },
            lastLesson: {
              lessonId: "previous",
              startsAt: "2026-09-20T12:00:00.000Z",
              progressSummary: "Pytania w Present Perfect.",
            },
            difficulty: {
              level: "mixed",
              note: "since / for",
              sourceLessonId: "previous",
            },
            nextStep: {
              text: "krótkie dialogi",
              sourceLessonId: "previous",
            },
          },
        ]),
        "Uczeń",
      ),
    ).toMatchObject({
      kind: "one_to_one",
      lastProgress: "Pytania w Present Perfect.",
      difficulty: "since / for",
      nextStep: "krótkie dialogi",
    });
  });

  it("returns only aggregate group readiness and does not leak participant text", () => {
    const preview = dashboardBriefingPreview(
      briefing([
        {
          student: { id: "a", name: "Anna" },
          nextStep: {
            text: "ANNA_PRIVATE_CONTEXT",
            sourceLessonId: "previous-a",
          },
        },
        { student: { id: "b", name: "Piotr" } },
      ]),
      "Grupa B1",
    );
    expect(preview).toEqual({
      kind: "group",
      participantCount: 2,
      contextCount: 1,
    });
    expect(JSON.stringify(preview)).not.toContain("ANNA_PRIVATE_CONTEXT");
  });
});
