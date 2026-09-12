import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { CreateLessonInput, Student } from "../lib/domain";

let storage: typeof import("./store");
let perform: typeof import("./app-service").performAction;
let directory: string;
let teacherId: string;
let studentId: string;
const student: Omit<Student, "id" | "createdAt"> = {
  name: "Uczeń testowy",
  contact: "",
  level: "B1",
  goal: "",
  notes: "",
  status: "active",
  defaultDurationMinutes: 60,
  defaultFormat: "online",
  defaultLocation: "https://example.test/lesson",
  defaultPrice: { amount: 12345, currency: "PLN" },
};
const create = (
  day: string,
  mode: CreateLessonInput["mode"] = "single",
): CreateLessonInput => ({
  participantIds: [studentId],
  mode,
  occurrences: [{ startsAt: `${day}T09:00:00.000Z`, durationMinutes: 60 }],
  format: "online",
  location: "https://example.test/lesson",
  priceAmount: 12345,
  topic: "Temat kontrolny",
  plan: ["Rozmowa", "Podsumowanie"],
});

beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "tutorflow-ui-tests-"));
  process.env.TUTORFLOW_DATA_DIR = directory;
  storage = await import("./store");
  perform = (await import("./app-service")).performAction;
  teacherId = (
    await storage.createTeacher({
      name: "Test UX",
      email: "ux@example.test",
      password: "test-only-password",
    })
  ).id;
  studentId = (await perform(teacherId, { type: "createStudent", student }))
    .result!.id!;
});
afterAll(async () => {
  delete process.env.TUTORFLOW_DATA_DIR;
  if (
    directory &&
    path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep) &&
    path.basename(directory).startsWith("tutorflow-ui-tests-")
  )
    await rm(directory, { recursive: true });
});

describe("refined user journeys preserve the existing domain rules", () => {
  it("edits a student without changing their history or identity", async () => {
    const response = await perform(teacherId, {
      type: "updateStudent",
      studentId,
      patch: { name: "Długie imię ucznia — test", defaultPrice: null },
    });
    expect(response.data.students[0]).toMatchObject({
      id: studentId,
      name: "Długie imię ucznia — test",
      defaultPrice: null,
    });
  });
  it("creates multiple dates atomically and reports conflicts without partial writes", async () => {
    const lesson = create("2030-09-09", "multiple");
    lesson.occurrences.push({
      startsAt: "2030-09-10T09:00:00.000Z",
      durationMinutes: 45,
    });
    const result = await perform(teacherId, { type: "createLesson", lesson });
    expect(result.result!.ids).toHaveLength(2);
    const before = result.data.lessons.length;
    lesson.occurrences.unshift({
      startsAt: "2030-09-08T09:00:00.000Z",
      durationMinutes: 60,
    });
    await expect(
      perform(teacherId, { type: "createLesson", lesson }),
    ).rejects.toThrow();
    expect((await storage.getAppData(teacherId)).lessons).toHaveLength(before);
  });
  it("saves group results and payments separately", async () => {
    const second = (
      await perform(teacherId, {
        type: "createStudent",
        student: { ...student, name: "Drugi uczeń" },
      })
    ).result!.id!;
    const created = await perform(teacherId, {
      type: "createLesson",
      lesson: create("2030-10-01"),
    });
    const id = created.result!.id!;
    const grouped = await perform(teacherId, {
      type: "mergeLesson",
      conflictingLessonId: id,
      participantIds: [second],
    });
    const lesson = grouped.data.lessons.find((l) => l.id === id)!;
    const saved = await perform(teacherId, {
      type: "saveLesson",
      lessonId: id,
      topic: lesson.topic,
      planItems: lesson.planItems,
      homework: "Ćwiczenie",
      generalNotes: "",
      participants: lesson.participants.map((p, index) => ({
        ...p,
        attendanceStatus: "present",
        paymentStatus: index === 0 ? "paid" : "unpaid",
        results: lesson.planItems.map((item) => ({
          planItemId: item.id,
          completed: true,
          score: index === 0 ? 9 : 6,
          note: "Wynik",
        })),
      })),
      complete: true,
    });
    const actual = saved.data.lessons.find((l) => l.id === id)!;
    expect(actual.status).toBe("completed");
    expect(actual.participants.map((p) => p.paymentStatus)).toEqual([
      "paid",
      "unpaid",
    ]);
    expect(actual.participants.map((p) => p.results[0].score)).toEqual([9, 6]);
  });
  it("keeps recurring scope explicit", async () => {
    const lesson = create("2031-01-01", "recurring");
    lesson.occurrences.push({
      startsAt: "2031-01-08T09:00:00.000Z",
      durationMinutes: 60,
    });
    lesson.recurrence = {
      frequency: "weekly",
      count: 2,
      timezone: "Europe/Warsaw",
    };
    const created = await perform(teacherId, { type: "createLesson", lesson });
    const [first, second] = created.result!.ids!;
    const response = await perform(teacherId, {
      type: "cancelLesson",
      lessonId: first,
      scope: "single",
    });
    expect(response.data.lessons.find((l) => l.id === first)?.status).toBe(
      "cancelled",
    );
    expect(response.data.lessons.find((l) => l.id === second)?.status).toBe(
      "scheduled",
    );
  });
  it("blocks archived students and preserves history", async () => {
    const before = (await storage.getAppData(teacherId)).lessons.length;
    await perform(teacherId, {
      type: "setStudentStatus",
      studentId,
      status: "archived",
    });
    await expect(
      perform(teacherId, {
        type: "createLesson",
        lesson: create("2031-02-01"),
      }),
    ).rejects.toThrow();
    expect((await storage.getAppData(teacherId)).lessons).toHaveLength(before);
    await perform(teacherId, {
      type: "setStudentStatus",
      studentId,
      status: "active",
    });
  });
  it("rejects invalid saves while preserving the previous lesson", async () => {
    const lesson = (await storage.getAppData(teacherId)).lessons[0];
    await expect(
      perform(teacherId, {
        type: "saveLesson",
        lessonId: lesson.id,
        topic: "Changed",
        planItems: lesson.planItems,
        homework: "",
        generalNotes: "",
        participants: [
          {
            ...lesson.participants[0],
            results: [
              {
                planItemId: lesson.planItems[0].id,
                completed: true,
                score: 11,
              },
            ],
          },
        ],
        complete: true,
      }),
    ).rejects.toThrow();
    expect(
      (await storage.getAppData(teacherId)).lessons.find(
        (l) => l.id === lesson.id,
      )?.topic,
    ).toBe(lesson.topic);
  });
  it("does not allow another teacher to address tenant-owned IDs", async () => {
    const other = await storage.createTeacher({
      name: "Inny nauczyciel",
      email: "other@example.test",
      password: "test-only-password",
    });
    await expect(
      perform(other.id, {
        type: "updateStudent",
        studentId,
        patch: { name: "Przejęty" },
      }),
    ).rejects.toThrow();
    expect(
      (await storage.getAppData(teacherId)).students.find(
        (item) => item.id === studentId,
      )?.name,
    ).not.toBe("Przejęty");
  });
  it("blocks writes for read-only subscriptions and leaves reads available", async () => {
    await storage.mutateStore((store) => {
      store.teachers.find((t) => t.id === teacherId)!.subscription.readOnly =
        true;
    });
    await expect(
      perform(teacherId, {
        type: "updateStudent",
        studentId,
        patch: { name: "No" },
      }),
    ).rejects.toThrow();
    expect((await storage.getAppData(teacherId)).students.length).toBe(2);
  });
});
