import { describe, expect, it } from "vitest";
import type { AppData, Lesson } from "./domain";
import {
  lessonHasExistingPreparation,
  sharedTemplateLessonLabel,
  upcomingTemplateLessons,
} from "./shared-templates";

function lesson(overrides: Partial<Lesson> = {}): Lesson {
  return {
    id: "lesson-1",
    color: "#334155",
    participantIds: [],
    startsAt: "2030-01-10T10:00:00.000Z",
    durationMinutes: 60,
    format: "online",
    location: "",
    price: null,
    mode: "single",
    status: "scheduled",
    syncStatus: "disabled",
    topic: "",
    planItems: [],
    homework: "",
    generalNotes: "",
    participants: [],
    createdAt: "2029-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("shared template lesson workflow", () => {
  it("offers only future, editable scheduled lessons in chronological order", () => {
    const lessons = upcomingTemplateLessons(
      [
        lesson({ id: "later", startsAt: "2030-01-12T10:00:00.000Z" }),
        lesson({ id: "past", startsAt: "2029-12-31T10:00:00.000Z" }),
        lesson({ id: "done", status: "completed" }),
        lesson({ id: "next", startsAt: "2030-01-11T10:00:00.000Z" }),
      ],
      new Date("2030-01-01T00:00:00.000Z"),
    );
    expect(lessons.map((item) => item.id)).toEqual(["next", "later"]);
  });

  it("detects content that must be preserved before applying a template", () => {
    expect(lessonHasExistingPreparation(lesson())).toBe(false);
    expect(
      lessonHasExistingPreparation(
        lesson({
          planObjectives: "Existing objective",
          planItems: [
            {
              id: "plan-1",
              position: 0,
              text: "Existing plan",
              title: "Existing plan",
              instructions: "Keep this",
              completed: false,
            },
          ],
        }),
      ),
    ).toBe(true);
  });

  it("uses the real group or student name in the lesson selector", () => {
    const data = {
      students: [{ id: "student-1", name: "Anna Kowalska" }],
      groups: [{ id: "group-1", name: "Grupa B1" }],
    } as Pick<AppData, "students" | "groups">;
    expect(
      sharedTemplateLessonLabel(
        lesson({ groupId: "group-1", participantIds: ["student-1"] }),
        data,
      ),
    ).toBe("Grupa B1");
    expect(
      sharedTemplateLessonLabel(
        lesson({ participantIds: ["student-1"] }),
        data,
      ),
    ).toBe("Anna Kowalska");
  });
});
