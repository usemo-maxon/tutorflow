import { describe, expect, it } from "vitest";
import { LessonWorkspaceActionSchema } from "./lesson-workspace";

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
            text: "Rozgrzewka",
          },
        ],
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
      LessonWorkspaceActionSchema.safeParse({ type: "completeLesson" }).success,
    ).toBe(true);
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
});
