import { describe, expect, it } from "vitest";
import type { StudentMemory } from "./student-memory";
import {
  buildGroupContinuity,
  GROUP_CONTINUITY_RECENT_LESSON_LIMIT,
  type GroupContinuityLessonSource,
} from "./group-continuity";

const NOW = "2026-09-29T10:00:00.000Z";

describe("buildGroupContinuity", () => {
  it("keeps shared lesson facts separate from independent student context", () => {
    const result = buildGroupContinuity({
      group: group(),
      currentMembers: [member("anna", "Anna"), member("zosia", "Zosia")],
      nextLesson: {
        id: "next",
        startsAt: "2026-10-01T16:00:00.000Z",
        topic: "Meetings",
      },
      recentLessons: [
        lesson(
          "group-lesson",
          ["anna", "zosia"],
          [
            {
              studentId: "anna",
              difficultyLevel: "easy",
              progressSummary: "ANNA_PRIVATE_CONTEXT",
            },
            {
              studentId: "zosia",
              difficultyLevel: "hard",
              difficultyNote: "ZOSIA_PRIVATE_CONTEXT",
            },
          ],
        ),
      ],
      memberMemories: [
        memory("anna", "Anna", "easy", "ANNA_PRIVATE_CONTEXT"),
        memory("zosia", "Zosia", "hard", "ZOSIA_PRIVATE_CONTEXT"),
      ],
      generatedAt: NOW,
    });

    expect(result.lastLesson?.topic).toBe("Shared lesson topic");
    expect(result).not.toHaveProperty("groupDifficulty");
    expect(result.members[0].difficulty?.note).toBe("ANNA_PRIVATE_CONTEXT");
    expect(result.members[1].difficulty?.note).toBe("ZOSIA_PRIVATE_CONTEXT");
    expect(JSON.stringify(result.members[0])).not.toContain(
      "ZOSIA_PRIVATE_CONTEXT",
    );
    expect(JSON.stringify(result.members[1])).not.toContain(
      "ANNA_PRIVATE_CONTEXT",
    );
  });

  it("bounds history and counts only participant outcomes with meaningful content", () => {
    const lessons = Array.from({ length: 10 }, (_, index) =>
      lesson(
        `lesson-${index}`,
        ["anna", "zosia", "kuba", "ola", "jan"],
        index === 9
          ? [
              { studentId: "anna", progressSummary: "Gotowe" },
              { studentId: "zosia", difficultyLevel: "mixed" },
              { studentId: "kuba", nextStep: "Powtórka" },
              { studentId: "ola", progressSummary: "   " },
              { studentId: "outsider", progressSummary: "Nie licz" },
            ]
          : [],
        `2026-09-${String(index + 10).padStart(2, "0")}T10:00:00.000Z`,
      ),
    );
    const result = buildGroupContinuity({
      group: group(),
      currentMembers: [],
      recentLessons: lessons,
      memberMemories: [],
      generatedAt: NOW,
    });

    expect(result.recentLessons).toHaveLength(
      GROUP_CONTINUITY_RECENT_LESSON_LIMIT,
    );
    expect(result.recentLessons[0].id).toBe("lesson-9");
    expect(result.recentLessons[0].outcomeCoverage).toEqual({
      withOutcome: 3,
      participants: 5,
    });
  });

  it("excludes a former member, keeps historical counts, and marks a new member neutrally", () => {
    const result = buildGroupContinuity({
      group: group(),
      currentMembers: [
        member("zosia", "Zosia", "2026-01-01T00:00:00.000Z"),
        member("kuba", "Kuba", "2026-09-25T00:00:00.000Z"),
      ],
      recentLessons: [
        lesson("old", ["anna", "zosia"], [], "2026-09-20T10:00:00.000Z"),
      ],
      memberMemories: [
        emptyMemory("zosia", "Zosia"),
        emptyMemory("kuba", "Kuba"),
      ],
      generatedAt: NOW,
    });

    expect(result.members.map((item) => item.student.id)).toEqual([
      "kuba",
      "zosia",
    ]);
    expect(result.lastLesson?.participantCount).toBe(2);
    expect(
      result.members.find((item) => item.student.id === "kuba")?.isNewToGroup,
    ).toBe(true);
    expect(result.attention).toEqual([]);
  });

  it("uses stable factual attention ordering without ranking easy students", () => {
    const result = buildGroupContinuity({
      group: group(),
      currentMembers: [
        member("easy", "Celina"),
        member("missing", "Beata"),
        member("mixed", "Anna"),
        member("hard", "Dorota"),
      ],
      recentLessons: [
        lesson("group-lesson", ["easy", "missing", "mixed", "hard"]),
      ],
      memberMemories: [
        memory("easy", "Celina", "easy"),
        emptyMemory("missing", "Beata"),
        memory("mixed", "Anna", "mixed", "Explicit note"),
        memory("hard", "Dorota", "hard"),
      ],
      generatedAt: NOW,
    });

    expect(result.attention).toEqual([
      { studentId: "hard", kind: "hard" },
      { studentId: "mixed", kind: "mixed" },
      { studentId: "missing", kind: "missing_context" },
    ]);
    expect(result.coverage).toEqual({ members: 4, withRecentContext: 3 });
  });

  it("labels global Student Memory sources without claiming they came from the group", () => {
    const result = buildGroupContinuity({
      group: group(),
      currentMembers: [member("anna", "Anna")],
      recentLessons: [lesson("group-lesson", ["anna"])],
      memberMemories: [
        memory("anna", "Anna", "hard", "From individual", "individual-lesson"),
      ],
      generatedAt: NOW,
    });

    expect(result.members[0].difficulty?.source).toBe("other_lesson");
    expect(result.members[0].nextStep?.source).toBe("other_lesson");
  });
});

function group() {
  return {
    id: "group",
    name: "Business English B1",
    subject: "Angielski",
    level: "B1",
    status: "active" as const,
  };
}

function member(
  id: string,
  name: string,
  joinedAt = "2026-01-01T00:00:00.000Z",
) {
  return { student: { id, name, level: "B1" }, joinedAt };
}

function lesson(
  id: string,
  participantIds: string[],
  outcomes: GroupContinuityLessonSource["outcomes"] = [],
  startsAt = "2026-09-24T10:00:00.000Z",
): GroupContinuityLessonSource {
  return {
    id,
    startsAt,
    topic: "Shared lesson topic",
    objective: "Shared objective",
    participantIds,
    attendances: participantIds.map((studentId) => ({
      studentId,
      status: "present" as const,
    })),
    outcomes,
    homework: { title: "Ćwiczenia 4–6" },
  };
}

function memory(
  id: string,
  name: string,
  difficulty: "easy" | "mixed" | "hard",
  note?: string,
  sourceLessonId = "group-lesson",
): StudentMemory {
  const outcome = {
    difficultyLevel: difficulty,
    difficultyNote: note,
    nextStep: `Next for ${id}`,
  };
  return {
    student: { id, name, status: "active" },
    latestLesson: {
      lessonId: sourceLessonId,
      startsAt: "2026-09-24T10:00:00.000Z",
      outcome,
    },
    recentLessons: [
      {
        lessonId: sourceLessonId,
        startsAt: "2026-09-24T10:00:00.000Z",
        outcome,
      },
    ],
    currentDifficulty: {
      level: difficulty,
      note,
      sourceLessonId,
    },
    currentNextStep: {
      text: `Next for ${id}`,
      sourceLessonId,
      sourceLessonStartsAt: "2026-09-24T10:00:00.000Z",
    },
    attendance: {
      recentPresent: 1,
      recentAbsent: 0,
      recentNoShow: 0,
      recentTotal: 1,
    },
    metadata: { generatedAt: NOW, completedLessonsConsidered: 1 },
  };
}

function emptyMemory(id: string, name: string): StudentMemory {
  return {
    student: { id, name, status: "active" },
    recentLessons: [],
    attendance: {
      recentPresent: 0,
      recentAbsent: 0,
      recentNoShow: 0,
      recentTotal: 0,
    },
    metadata: { generatedAt: NOW, completedLessonsConsidered: 0 },
  };
}
