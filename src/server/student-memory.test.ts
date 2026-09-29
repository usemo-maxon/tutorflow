import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { LessonRecord, StudentRecord } from "./store";
import { ApiFailure } from "./errors";

let directory: string;
let teacherId: string;
let otherTeacherId: string;
let getStudentMemory: typeof import("./student-memory").getStudentMemory;
let store: typeof import("./store");

const annaId = "00000000-0000-4000-8000-000000000001";
const zosiaId = "00000000-0000-4000-8000-000000000002";

beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "easy4tutor-memory-"));
  process.env.TUTORFLOW_DATA_DIR = directory;
  store = await import("./store");
  getStudentMemory = (await import("./student-memory")).getStudentMemory;
  teacherId = (
    await store.createTeacher({
      name: "Tutor Memory",
      email: "memory@example.test",
      password: "test-only-password",
    })
  ).id;
  otherTeacherId = (
    await store.createTeacher({
      name: "Other Tutor",
      email: "other-memory@example.test",
      password: "test-only-password",
    })
  ).id;
  await store.mutateStore((data) => {
    data.students.push(
      student(annaId, "Anna Nowak", "archived"),
      student(zosiaId, "Zosia Kowalska", "active"),
    );
    data.lessons.push(
      lesson("history", "2042-03-20T10:00:00.000Z", "completed", [
        annaId,
        zosiaId,
      ]),
      lesson("no-show", "2042-03-25T10:00:00.000Z", "no_show", [annaId]),
      lesson("cancelled", "2042-04-05T10:00:00.000Z", "cancelled", [annaId]),
      lesson("upcoming-group", "2042-04-10T10:00:00.000Z", "scheduled", [
        annaId,
        zosiaId,
      ]),
    );
    data.lessonStudentOutcomes = [
      {
        id: "outcome-anna",
        teacherId,
        lessonId: "history",
        studentId: annaId,
        difficultyLevel: "easy",
        nextStep: "Conditionals",
        createdAt: "2042-03-20T11:00:00.000Z",
        updatedAt: "2042-03-20T11:00:00.000Z",
      },
      {
        id: "outcome-zosia",
        teacherId,
        lessonId: "history",
        studentId: zosiaId,
        difficultyLevel: "hard",
        nextStep: "OTHER_STUDENT_PRIVATE_OUTCOME",
        createdAt: "2042-03-20T11:00:00.000Z",
        updatedAt: "2042-03-20T11:00:00.000Z",
      },
    ];
  });
});

afterAll(async () => {
  delete process.env.TUTORFLOW_DATA_DIR;
  if (
    directory &&
    path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep) &&
    path.basename(directory).startsWith("easy4tutor-memory-")
  ) {
    await rm(directory, { recursive: true });
  }
});

describe("local student memory adapter", () => {
  it("retains archived/former-group history, isolates outcomes and excludes notes", async () => {
    const memory = await getStudentMemory(
      teacherId,
      annaId,
      "2042-04-01T12:00:00.000Z",
    );
    expect(memory.student.status).toBe("archived");
    expect(memory.latestLesson?.lessonId).toBe("history");
    expect(memory.currentNextStep?.text).toBe("Conditionals");
    expect(memory.attendance.recentNoShow).toBe(1);
    expect(memory.upcomingLesson?.id).toBe("upcoming-group");
    const serialized = JSON.stringify(memory);
    expect(serialized).not.toContain("OTHER_STUDENT_PRIVATE_OUTCOME");
    expect(serialized).not.toContain("DO_NOT_EXPOSE_SECRET_NOTE");
    expect(serialized).not.toContain("cancelled");
  });

  it("returns 404 without revealing a student from another workspace", async () => {
    await expect(
      getStudentMemory(otherTeacherId, annaId),
    ).rejects.toMatchObject<Partial<ApiFailure>>({
      status: 404,
      body: { code: "STUDENT_NOT_FOUND", message: expect.any(String) },
    });
  });
});

function student(
  id: string,
  displayName: string,
  status: "active" | "archived",
): StudentRecord {
  return {
    id,
    teacherId,
    firstName: displayName.split(" ")[0],
    lastName: displayName.split(" ")[1],
    displayName,
    name: displayName,
    email: "private@example.test",
    phone: "+48123456789",
    contact: "",
    subject: "Angielski",
    level: "B1",
    goal: "Rozmowa",
    notes: "PRIVATE_STUDENT_NOTE",
    status,
    defaultDurationMinutes: 60,
    defaultFormat: "online",
    defaultLocation: "",
    defaultPrice: null,
    groupIds: [],
    packageRemainingLessons: null,
    balanceDue: { amount: 0, currency: "PLN" },
    createdAt: "2042-01-01T00:00:00.000Z",
  };
}

function lesson(
  id: string,
  startsAt: string,
  status: LessonRecord["status"],
  studentIds: string[],
): LessonRecord {
  return {
    id,
    teacherId,
    color: "#334155",
    groupId:
      id.includes("group") || id === "history" ? "former-group" : undefined,
    participantIds: studentIds,
    startsAt,
    durationMinutes: 60,
    format: "online",
    location: "",
    price: null,
    mode: "single",
    subject: "Angielski",
    status,
    syncStatus: "disabled",
    topic: id === "history" ? "Shared topic" : id,
    planItems: [],
    homework: id === "history" ? "Ćwiczenia" : "",
    homeworkTitle: id === "history" ? "Zadanie grupowe" : undefined,
    generalNotes: id === "history" ? "DO_NOT_EXPOSE_SECRET_NOTE" : "",
    participants: studentIds.map((studentId) => ({
      studentId,
      attendanceStatus: status === "no_show" ? "absent" : "present",
      paymentStatus: "unpaid",
      results: [],
    })),
    createdAt: startsAt,
    updatedAt: startsAt,
  };
}
