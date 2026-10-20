import { describe, expect, it } from "vitest";
import {
  LessonStudentOutcomeUpsertSchema,
  LessonWorkspaceActionSchema,
  movePlanItem,
  plannedMinutes,
} from "./lesson-workspace";

const lessonUpdatedAt = "2026-09-16T12:00:00.000Z";

describe("LessonWorkspaceActionSchema", () => {
  it("accepts focused plan, attendance and completion actions", () => {
    expect(
      LessonWorkspaceActionSchema.safeParse({
        type: "updatePlan",
        topic: "Present Perfect",
        objectives: "Rozróżnić dwa czasy",
        expectedUpdatedAt: lessonUpdatedAt,
        items: [
          {
            id: "10000000-0000-4000-8000-000000000001",
            position: 0,
            title: "Rozgrzewka",
            instructions: "Dwa pytania na start",
            minutes: 5,
            completed: false,
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      LessonWorkspaceActionSchema.safeParse({
        type: "setPlanItemCompleted",
        itemId: "10000000-0000-4000-8000-000000000001",
        completed: true,
      }).success,
    ).toBe(true);
    expect(
      LessonWorkspaceActionSchema.safeParse({
        type: "markAttendance",
        studentId: "10000000-0000-4000-8000-000000000002",
        status: "late",
      }).success,
    ).toBe(true);
    expect(
      LessonWorkspaceActionSchema.safeParse({
        type: "completeLesson",
        expectedUpdatedAt: lessonUpdatedAt,
        outcomes: [
          {
            studentId: "10000000-0000-4000-8000-000000000002",
            progressSummary: "Zrealizowano plan.",
            difficultyLevel: "mixed",
          },
        ],
      }).success,
    ).toBe(true);
  });

  it("accepts a structured lesson plan and rejects invalid duration", () => {
    const base = {
      type: "updatePlan" as const,
      topic: "Present Perfect",
      objectives: "Swobodna rozmowa o doświadczeniach",
      expectedUpdatedAt: lessonUpdatedAt,
    };
    expect(
      LessonWorkspaceActionSchema.safeParse({
        ...base,
        items: [
          {
            id: "10000000-0000-4000-8000-000000000001",
            position: 0,
            title: "Speaking",
            instructions: "Pytania w parach",
            minutes: 20,
            completed: true,
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      LessonWorkspaceActionSchema.safeParse({
        ...base,
        items: [
          {
            id: "10000000-0000-4000-8000-000000000001",
            position: 0,
            title: "Speaking",
            instructions: "",
            minutes: 0,
            completed: false,
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("keeps private and student-visible notes explicit", () => {
    expect(
      LessonWorkspaceActionSchema.parse({
        type: "saveNote",
        noteType: "private",
        content: "Tylko dla tutora",
      }),
    ).toMatchObject({ type: "saveNote", noteType: "private" });
    expect(
      LessonWorkspaceActionSchema.parse({
        type: "saveNote",
        noteType: "summary",
        content: "Podsumowanie dla ucznia",
      }),
    ).toMatchObject({ type: "saveNote", noteType: "summary" });
  });

  it("rejects unsupported attendance values and invalid material URLs", () => {
    expect(
      LessonWorkspaceActionSchema.safeParse({
        type: "markAttendance",
        studentId: "10000000-0000-4000-8000-000000000002",
        status: "unknown",
      }).success,
    ).toBe(false);
    expect(
      LessonWorkspaceActionSchema.safeParse({
        type: "createAndAttachMaterial",
        title: "Ćwiczenia",
        url: "javascript:alert(1)",
      }).success,
    ).toBe(false);
  });

  it("limits homework and note payload sizes at the API boundary", () => {
    expect(
      LessonWorkspaceActionSchema.safeParse({
        type: "upsertHomework",
        title: "",
        description: "Opis",
      }).success,
    ).toBe(false);
    expect(
      LessonWorkspaceActionSchema.safeParse({
        type: "saveNote",
        noteType: "private",
        content: "x".repeat(20_001),
      }).success,
    ).toBe(false);
  });

  it("accepts PostgREST timestamps when saving a lesson color", () => {
    expect(
      LessonWorkspaceActionSchema.parse({
        type: "updateColor",
        color: "#6fafd9",
        scope: "single",
        expectedUpdatedAt: "2026-09-16T12:00:00.123456+00:00",
      }),
    ).toEqual({
      type: "updateColor",
      color: "#6FAFD9",
      scope: "single",
      expectedUpdatedAt: "2026-09-16T12:00:00.123456+00:00",
    });
  });

  it("validates, trims and null-normalizes student outcome input", () => {
    expect(
      LessonStudentOutcomeUpsertSchema.parse({
        lessonId: "10000000-0000-4000-8000-000000000001",
        studentId: "10000000-0000-4000-8000-000000000002",
        progressSummary: "  Opanowała pytania.  ",
        difficultyLevel: "mixed",
        difficultyNote: "   ",
        nextStep: "  Powtórzyć did. ",
      }),
    ).toEqual({
      lessonId: "10000000-0000-4000-8000-000000000001",
      studentId: "10000000-0000-4000-8000-000000000002",
      progressSummary: "Opanowała pytania.",
      difficultyLevel: "mixed",
      difficultyNote: undefined,
      nextStep: "Powtórzyć did.",
    });
    expect(
      LessonStudentOutcomeUpsertSchema.safeParse({
        lessonId: "not-a-uuid",
        studentId: "10000000-0000-4000-8000-000000000002",
        difficultyLevel: "medium",
        progressSummary: "x".repeat(2_001),
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate students in one completion payload", () => {
    const studentId = "10000000-0000-4000-8000-000000000002";
    expect(
      LessonWorkspaceActionSchema.safeParse({
        type: "completeLesson",
        expectedUpdatedAt: lessonUpdatedAt,
        outcomes: [
          { studentId, nextStep: "A" },
          { studentId, nextStep: "B" },
        ],
      }).success,
    ).toBe(false);
  });

  it("validates a selective, idempotent previous-lesson reuse action", () => {
    expect(
      LessonWorkspaceActionSchema.parse({
        type: "applyPreviousLesson",
        sourceLessonId: "10000000-0000-4000-8000-000000000001",
        sectionIds: ["10000000-0000-4000-8000-000000000002"],
        materialIds: ["10000000-0000-4000-8000-000000000003"],
        includeObjective: false,
        importKey: "10000000-0000-4000-8000-000000000004",
      }),
    ).toMatchObject({
      type: "applyPreviousLesson",
      includeObjective: false,
    });
    expect(
      LessonWorkspaceActionSchema.safeParse({
        type: "applyPreviousLesson",
        sourceLessonId: "not-a-lesson",
        sectionIds: [],
        materialIds: [],
        importKey: "not-a-key",
      }).success,
    ).toBe(false);
  });
});

describe("lesson plan helpers", () => {
  const items = [
    {
      id: "a",
      position: 0,
      title: "Warm-up",
      instructions: "",
      minutes: 5,
      completed: false,
    },
    {
      id: "b",
      position: 1,
      title: "Homework review",
      instructions: "",
      minutes: 10,
      completed: false,
    },
    {
      id: "c",
      position: 2,
      title: "Speaking",
      instructions: "",
      minutes: 20,
      completed: false,
    },
  ];

  it("calculates planned duration without guessing missing minutes", () => {
    expect(
      plannedMinutes([
        ...items.map(({ minutes }) => ({ minutes })),
        { minutes: undefined },
      ]),
    ).toBe(35);
  });

  it("reorders items and normalizes positions", () => {
    expect(
      movePlanItem(items, "b", -1).map((item) => [item.id, item.position]),
    ).toEqual([
      ["b", 0],
      ["a", 1],
      ["c", 2],
    ]);
  });
});
