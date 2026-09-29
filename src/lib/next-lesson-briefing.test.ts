import { describe, expect, it } from "vitest";
import type { LessonWorkspaceData } from "./lesson-workspace";
import { composeNextLessonBriefing } from "./next-lesson-briefing";
import type { StudentMemory } from "./student-memory";

const generatedAt = "2026-09-29T10:00:00.000Z";

describe("next lesson briefing composition", () => {
  it("maps normal memory while keeping historical next step separate from today's objective", () => {
    const result = composeNextLessonBriefing(
      workspace("Speaking — hotel check-in"),
      [memory()],
      generatedAt,
    );
    expect(result.participants[0]).toMatchObject({
      lastLesson: {
        lessonId: "latest-lesson",
        progressSummary: "ANNA_ONLY_CONTEXT",
      },
      difficulty: { level: "mixed", note: "Myli since i for." },
      homework: { title: "Ćwiczenia 4–6" },
      nextStep: {
        text: "Starszy, nadal aktualny krok",
        sourceLessonId: "older-lesson",
      },
      todayGoal: "Speaking — hotel check-in",
    });
  });

  it("renders a truthful first-lesson contract without fabricated memory", () => {
    const empty = memory({
      latestLesson: undefined,
      recentLessons: [],
      currentDifficulty: undefined,
      currentNextStep: undefined,
      homework: undefined,
    });
    const participant = composeNextLessonBriefing(
      workspace(""),
      [empty],
      generatedAt,
    ).participants[0];
    expect(participant.student.goal).toBe("Rozmowa w pracy");
    expect(participant.lastLesson).toBeUndefined();
    expect(participant.nextStep).toBeUndefined();
    expect(participant.todayGoal).toBe("Hotel vocabulary");
  });

  it("keeps a legacy lesson visible without inventing an outcome", () => {
    const legacy = memory({
      latestLesson: {
        lessonId: "legacy",
        startsAt: "2026-08-20T14:00:00.000Z",
        topic: "Past Simple",
      },
      currentDifficulty: undefined,
      currentNextStep: undefined,
    });
    const participant = composeNextLessonBriefing(
      workspace("Cel"),
      [legacy],
      generatedAt,
    ).participants[0];
    expect(participant.lastLesson).toEqual({
      lessonId: "legacy",
      startsAt: "2026-08-20T14:00:00.000Z",
      topic: "Past Simple",
      progressSummary: undefined,
    });
    expect(participant.difficulty).toBeUndefined();
  });

  it("preserves lesson participant order and isolates group memories", () => {
    const group = workspace("Cel grupy", ["anna", "zosia"]);
    const zosia = memory({
      student: { ...memory().student, id: "zosia", name: "Zosia" },
      latestLesson: {
        lessonId: "zosia-history",
        startsAt: "2026-09-25T10:00:00.000Z",
        outcome: { progressSummary: "ZOSIA_ONLY_CONTEXT" },
      },
    });
    const result = composeNextLessonBriefing(
      group,
      [zosia, memory()],
      generatedAt,
    );
    expect(result.participants.map((item) => item.student.id)).toEqual([
      "anna",
      "zosia",
    ]);
    expect(JSON.stringify(result.participants[0])).toContain("ANNA_ONLY_CONTEXT");
    expect(JSON.stringify(result.participants[0])).not.toContain("ZOSIA_ONLY_CONTEXT");
    expect(JSON.stringify(result.participants[1])).toContain("ZOSIA_ONLY_CONTEXT");
  });
});

function workspace(
  objectives: string,
  studentIds = ["anna"],
): LessonWorkspaceData {
  return {
    teacher: { timezone: "Europe/Warsaw", readOnly: false },
    lesson: {
      id: "target",
      color: "#456789",
      participantLabel: "Lekcja",
      subject: "Angielski",
      level: "B1",
      startsAt: "2026-10-01T10:00:00.000Z",
      endsAt: "2026-10-01T11:00:00.000Z",
      durationMinutes: 60,
      format: "online",
      location: "",
      status: "scheduled",
      syncStatus: "disabled",
      topic: "Hotel vocabulary",
      objectives,
      planItems: [],
      privateNote: "",
      summary: "",
      createdAt: generatedAt,
      updatedAt: generatedAt,
    },
    participants: studentIds.map((id) => ({
      id: `participant-${id}`,
      studentId: id,
      name: id === "anna" ? "Anna" : "Zosia",
      subject: "Angielski",
      level: "B1",
      status: "active",
      attendanceStatus: "unknown",
    })),
    materials: [],
    materialLibrary: [],
  };
}

function memory(overrides: Partial<StudentMemory> = {}): StudentMemory {
  return {
    student: {
      id: "anna",
      name: "Anna",
      level: "B1",
      goal: "Rozmowa w pracy",
      status: "active",
    },
    latestLesson: {
      lessonId: "latest-lesson",
      startsAt: "2026-09-24T10:00:00.000Z",
      topic: "Present Perfect",
      outcome: { progressSummary: "ANNA_ONLY_CONTEXT" },
    },
    recentLessons: [],
    currentDifficulty: {
      level: "mixed",
      note: "Myli since i for.",
      sourceLessonId: "latest-lesson",
    },
    currentNextStep: {
      text: "Starszy, nadal aktualny krok",
      sourceLessonId: "older-lesson",
      sourceLessonStartsAt: "2026-09-10T10:00:00.000Z",
    },
    homework: {
      title: "Ćwiczenia 4–6",
      sourceLessonId: "latest-lesson",
      sourceLessonStartsAt: "2026-09-24T10:00:00.000Z",
    },
    attendance: {
      recentPresent: 1,
      recentAbsent: 0,
      recentNoShow: 0,
      recentTotal: 1,
    },
    metadata: { generatedAt, completedLessonsConsidered: 1 },
    ...overrides,
  };
}
