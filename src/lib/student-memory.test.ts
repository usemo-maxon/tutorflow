import { describe, expect, it } from "vitest";
import {
  buildStudentMemory,
  STUDENT_MEMORY_RECENT_LESSON_LIMIT,
  type BuildStudentMemoryInput,
  type StudentMemoryLessonSource,
} from "./student-memory";

const generatedAt = "2042-04-01T12:00:00.000Z";

function lesson(
  id: string,
  startsAt: string,
  overrides: Partial<StudentMemoryLessonSource> = {},
): StudentMemoryLessonSource {
  return {
    id,
    startsAt,
    status: "completed",
    topic: `Temat ${id}`,
    attendances: [{ studentId: "anna", status: "present" }],
    ...overrides,
  };
}

function input(
  overrides: Partial<BuildStudentMemoryInput> = {},
): BuildStudentMemoryInput {
  return {
    student: {
      id: "anna",
      name: "Anna Nowak",
      subject: "Angielski",
      level: "B1",
      goal: "Swobodna rozmowa",
      status: "active",
    },
    historicalLessons: [],
    attendanceLessons: [],
    generatedAt,
    ...overrides,
  };
}

describe("buildStudentMemory", () => {
  it("returns valid empty memory", () => {
    const memory = buildStudentMemory(input());
    expect(memory).toMatchObject({
      recentLessons: [],
      attendance: {
        recentPresent: 0,
        recentAbsent: 0,
        recentNoShow: 0,
        recentTotal: 0,
      },
      metadata: { generatedAt, completedLessonsConsidered: 0 },
    });
    expect(memory.latestLesson).toBeUndefined();
    expect(memory.currentNextStep).toBeUndefined();
    expect(memory.currentDifficulty).toBeUndefined();
    expect(memory.homework).toBeUndefined();
  });

  it("sorts completed history newest first and enforces the limit", () => {
    const lessons = Array.from({ length: 8 }, (_, index) =>
      lesson(
        `lesson-${index}`,
        `2042-03-${String(index + 1).padStart(2, "0")}T10:00:00.000Z`,
      ),
    );
    const memory = buildStudentMemory(
      input({ historicalLessons: lessons, attendanceLessons: lessons }),
    );
    expect(memory.recentLessons).toHaveLength(
      STUDENT_MEMORY_RECENT_LESSON_LIMIT,
    );
    expect(memory.latestLesson?.lessonId).toBe("lesson-7");
    expect(memory.metadata.completedLessonsConsidered).toBe(5);
  });

  it("uses the newest non-empty next step and explicit difficulty with provenance", () => {
    const lessons = [
      lesson("newest", "2042-03-30T10:00:00.000Z", {
        outcomes: [{ studentId: "anna", nextStep: "  " }],
      }),
      lesson("middle", "2042-03-20T10:00:00.000Z", {
        outcomes: [
          {
            studentId: "anna",
            nextStep: "Powtórzyć Past Simple",
            difficultyLevel: "hard",
            difficultyNote: "Pytania sprawiały trudność",
          },
        ],
      }),
      lesson("oldest", "2042-03-10T10:00:00.000Z", {
        outcomes: [
          {
            studentId: "anna",
            nextStep: "Starszy krok",
            difficultyLevel: "easy",
          },
        ],
      }),
    ];
    const memory = buildStudentMemory(input({ historicalLessons: lessons }));
    expect(memory.currentNextStep).toEqual({
      text: "Powtórzyć Past Simple",
      sourceLessonId: "middle",
      sourceLessonStartsAt: "2042-03-20T10:00:00.000Z",
    });
    expect(memory.currentDifficulty).toEqual({
      level: "hard",
      note: "Pytania sprawiały trudność",
      sourceLessonId: "middle",
    });
  });

  it("isolates group outcomes to the requested participant", () => {
    const shared = lesson("group", "2042-03-25T10:00:00.000Z", {
      outcomes: [
        {
          studentId: "anna",
          difficultyLevel: "easy",
          nextStep: "Conditionals",
        },
        {
          studentId: "zosia",
          difficultyLevel: "hard",
          difficultyNote: "OTHER_STUDENT_PRIVATE_OUTCOME",
          nextStep: "Past Simple",
        },
      ],
    });
    const serialized = JSON.stringify(
      buildStudentMemory(input({ historicalLessons: [shared] })),
    );
    expect(serialized).toContain("Conditionals");
    expect(serialized).not.toContain("OTHER_STUDENT_PRIVATE_OUTCOME");
    expect(serialized).not.toContain("Past Simple");
  });

  it("keeps legacy lessons without outcomes and never synthesizes one", () => {
    const memory = buildStudentMemory(
      input({
        historicalLessons: [
          lesson("legacy", "2042-03-20T10:00:00.000Z", { outcomes: [] }),
        ],
      }),
    );
    expect(memory.latestLesson?.lessonId).toBe("legacy");
    expect(memory.latestLesson?.outcome).toBeUndefined();
  });

  it("excludes cancelled and no-show lessons from progress but counts bounded attendance", () => {
    const completed = lesson("completed", "2042-03-30T10:00:00.000Z");
    const noShow = lesson("no-show", "2042-03-29T10:00:00.000Z", {
      status: "no_show",
      attendances: [{ studentId: "anna", status: "absent" }],
    });
    const cancelled = lesson("cancelled", "2042-03-31T10:00:00.000Z", {
      status: "cancelled",
    });
    const absent = lesson("absent", "2042-03-28T10:00:00.000Z", {
      attendances: [{ studentId: "anna", status: "absent" }],
    });
    const late = lesson("late", "2042-03-27T10:00:00.000Z", {
      attendances: [{ studentId: "anna", status: "late" }],
    });
    const memory = buildStudentMemory(
      input({
        historicalLessons: [completed, noShow, cancelled],
        attendanceLessons: [completed, noShow, cancelled, absent, late],
      }),
    );
    expect(memory.recentLessons.map((item) => item.lessonId)).toEqual([
      "completed",
    ]);
    expect(memory.attendance).toEqual({
      recentPresent: 2,
      recentAbsent: 1,
      recentNoShow: 1,
      recentTotal: 4,
    });
  });

  it("uses the latest completed lesson containing homework", () => {
    const memory = buildStudentMemory(
      input({
        historicalLessons: [
          lesson("new", "2042-03-30T10:00:00.000Z"),
          lesson("with-homework", "2042-03-20T10:00:00.000Z", {
            homework: {
              title: "Ćwiczenia 1–4",
              dueAt: "2042-03-27T22:59:00.000Z",
              status: "assigned",
            },
          }),
        ],
      }),
    );
    expect(memory.homework).toMatchObject({
      title: "Ćwiczenia 1–4",
      sourceLessonId: "with-homework",
      sourceLessonStartsAt: "2042-03-20T10:00:00.000Z",
    });
  });
});
