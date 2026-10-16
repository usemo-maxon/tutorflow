import { describe, expect, it } from "vitest";
import type {
  LessonWorkspaceData,
  LessonWorkspaceMaterial,
} from "./lesson-workspace";
import {
  composeLessonPreparationContext,
  PREPARATION_HISTORY_LESSON_LIMIT,
} from "./preparation-context";

describe("D3.8 lesson preparation context", () => {
  it("deduplicates resources without losing student, group and lesson provenance", () => {
    const data = workspace();
    const shared = material("shared", "Speaking Questions — B1");
    data.availableMaterials.student = [
      { ...shared, source: "student", sourceLabel: "Anna" },
    ];
    data.availableMaterials.group = [
      { ...shared, source: "group", sourceLabel: "Grupa B1" },
    ];
    data.previousLessons = [previousLesson("previous", shared)];

    const result = composeLessonPreparationContext(data);

    expect(result.availableMaterials).toHaveLength(1);
    expect(result.availableMaterials[0].sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "student_assignment" }),
        expect.objectContaining({ kind: "group_assignment" }),
        expect.objectContaining({
          kind: "previous_lesson",
          lessonId: "previous",
        }),
      ]),
    );
  });

  it("keeps archived historical material accessible and explicitly archived", () => {
    const data = workspace();
    data.previousLessons = [
      previousLesson("previous", {
        ...material("archived", "Present Perfect Exercises.pdf"),
        archived: true,
        url: "/api/materials/archived/open",
      }),
    ];

    const result = composeLessonPreparationContext(data);

    expect(result.historicalMaterials[0]).toMatchObject({
      id: "archived",
      archived: true,
      available: true,
      attached: false,
    });
  });

  it("does not describe attachment as completion or mastery", () => {
    const data = workspace();
    data.materials = [material("current", "Workbook")];
    const serialized = JSON.stringify(composeLessonPreparationContext(data));
    expect(serialized).not.toMatch(/master|opanowan|ukończ|zrealizowan/i);
  });

  it("bounds history and handles an empty preparation context", () => {
    const empty = composeLessonPreparationContext(workspace());
    expect(empty).toEqual({
      historicalMaterials: [],
      availableMaterials: [],
      recentLessonCount: 0,
    });

    const data = workspace();
    data.previousLessons = Array.from(
      { length: PREPARATION_HISTORY_LESSON_LIMIT + 3 },
      (_, index) =>
        previousLesson(
          `lesson-${index}`,
          material(`material-${index}`, `Materiał ${index}`),
        ),
    );
    const bounded = composeLessonPreparationContext(data);
    expect(bounded.recentLessonCount).toBe(PREPARATION_HISTORY_LESSON_LIMIT);
    expect(bounded.historicalMaterials).toHaveLength(
      PREPARATION_HISTORY_LESSON_LIMIT,
    );
  });
});

function material(id: string, title: string): LessonWorkspaceMaterial {
  return {
    id,
    title,
    description: "",
    type: "file" as const,
    attached: false,
    archived: false,
  };
}

function previousLesson(
  id: string,
  sourceMaterial: ReturnType<typeof material>,
) {
  return {
    id,
    startsAt: "2026-10-10T10:00:00.000Z",
    topic: "Present Perfect",
    objective: "",
    planItems: [],
    materials: [{ ...sourceMaterial, available: true }],
  };
}

function workspace(): LessonWorkspaceData {
  return {
    teacher: { timezone: "Europe/Warsaw", readOnly: false },
    lesson: {
      id: "today",
      color: "#123456",
      participantLabel: "Anna",
      subject: "Angielski",
      level: "B1",
      startsAt: "2026-10-13T10:00:00.000Z",
      endsAt: "2026-10-13T11:00:00.000Z",
      durationMinutes: 60,
      format: "online",
      location: "",
      status: "scheduled",
      syncStatus: "disabled",
      topic: "",
      objectives: "",
      planItems: [],
      privateNote: "",
      summary: "",
      createdAt: "2026-10-01T10:00:00.000Z",
      updatedAt: "2026-10-01T10:00:00.000Z",
    },
    participants: [],
    materials: [],
    materialLibrary: [],
    availableMaterials: { student: [], group: [], library: [] },
  };
}
