import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { LessonRecord, StudentRecord } from "./store";
import { ApiFailure } from "./errors";

let directory: string;
let teacherId: string;
let otherTeacherId: string;
let getGroupContinuity: typeof import("./group-continuity").getGroupContinuity;
let store: typeof import("./store");

const groupId = "00000000-0000-4000-8000-000000000010";
const annaId = "00000000-0000-4000-8000-000000000001";
const zosiaId = "00000000-0000-4000-8000-000000000002";
const kubaId = "00000000-0000-4000-8000-000000000003";

beforeAll(async () => {
  directory = await mkdtemp(
    path.join(tmpdir(), "easy4tutor-group-continuity-"),
  );
  process.env.TUTORFLOW_DATA_DIR = directory;
  store = await import("./store");
  getGroupContinuity = (await import("./group-continuity")).getGroupContinuity;
  teacherId = (
    await store.createTeacher({
      name: "Group Tutor",
      email: "group-continuity@example.test",
      password: "test-only-password",
    })
  ).id;
  otherTeacherId = (
    await store.createTeacher({
      name: "Other Tutor",
      email: "other-group-continuity@example.test",
      password: "test-only-password",
    })
  ).id;
  await store.mutateStore((data) => {
    data.students.push(
      student(annaId, "Anna Nowak"),
      student(zosiaId, "Zosia Kowalska"),
      student(kubaId, "Kuba Zieliński"),
    );
    data.groups.push({
      id: groupId,
      teacherId,
      name: "Business English B1",
      subject: "Angielski",
      level: "B1",
      status: "active",
      defaultDurationMinutes: 60,
      defaultPrice: null,
      notes: "",
      members: [
        {
          id: "membership-anna",
          studentId: annaId,
          status: "suspended",
          joinedAt: "2042-01-01T00:00:00.000Z",
          leftAt: "2042-03-21T00:00:00.000Z",
        },
        {
          id: "membership-zosia",
          studentId: zosiaId,
          status: "active",
          joinedAt: "2042-01-01T00:00:00.000Z",
        },
        {
          id: "membership-kuba",
          studentId: kubaId,
          status: "active",
          joinedAt: "2042-03-25T00:00:00.000Z",
        },
      ],
      createdAt: "2042-01-01T00:00:00.000Z",
    });
    data.lessons.push(
      lesson(
        "group-history",
        "2042-03-20T10:00:00.000Z",
        "completed",
        [annaId, zosiaId],
        groupId,
      ),
      lesson("individual-history", "2042-03-22T10:00:00.000Z", "completed", [
        zosiaId,
      ]),
      lesson(
        "cancelled-next",
        "2042-04-02T10:00:00.000Z",
        "cancelled",
        [zosiaId, kubaId],
        groupId,
      ),
      lesson(
        "scheduled-next",
        "2042-04-03T10:00:00.000Z",
        "scheduled",
        [zosiaId, kubaId],
        groupId,
      ),
    );
    data.lessonStudentOutcomes = [
      {
        id: "outcome-anna",
        teacherId,
        lessonId: "group-history",
        studentId: annaId,
        progressSummary: "ANNA_PRIVATE_CONTEXT",
        difficultyLevel: "easy",
        createdAt: "2042-03-20T11:00:00.000Z",
        updatedAt: "2042-03-20T11:00:00.000Z",
      },
      {
        id: "outcome-zosia",
        teacherId,
        lessonId: "individual-history",
        studentId: zosiaId,
        difficultyLevel: "hard",
        difficultyNote: "ZOSIA_PRIVATE_CONTEXT",
        nextStep: "Powtórka",
        createdAt: "2042-03-22T11:00:00.000Z",
        updatedAt: "2042-03-22T11:00:00.000Z",
      },
    ];
  });
});

afterAll(async () => {
  delete process.env.TUTORFLOW_DATA_DIR;
  if (
    directory &&
    path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep) &&
    path.basename(directory).startsWith("easy4tutor-group-continuity-")
  ) {
    await rm(directory, { recursive: true });
  }
});

describe("local group continuity adapter", () => {
  it("uses group lessons for history, current membership for preparation, and global memory per student", async () => {
    const result = await getGroupContinuity(
      teacherId,
      groupId,
      "2042-04-01T12:00:00.000Z",
    );

    expect(result.nextLesson?.id).toBe("scheduled-next");
    expect(result.recentLessons.map((lesson) => lesson.id)).toEqual([
      "group-history",
    ]);
    expect(result.lastLesson?.participantCount).toBe(2);
    expect(result.members.map((member) => member.student.id)).toEqual([
      kubaId,
      zosiaId,
    ]);
    expect(
      result.members.find((member) => member.student.id === kubaId)
        ?.isNewToGroup,
    ).toBe(true);
    const zosia = result.members.find(
      (member) => member.student.id === zosiaId,
    )!;
    expect(zosia.difficulty).toMatchObject({
      level: "hard",
      note: "ZOSIA_PRIVATE_CONTEXT",
      source: "other_lesson",
    });
    expect(JSON.stringify(zosia)).not.toContain("ANNA_PRIVATE_CONTEXT");
  });

  it("returns a non-leaking 404 across workspaces", async () => {
    await expect(
      getGroupContinuity(otherTeacherId, groupId),
    ).rejects.toMatchObject<Partial<ApiFailure>>({
      status: 404,
      body: { code: "GROUP_NOT_FOUND", message: expect.any(String) },
    });
  });
});

function student(id: string, displayName: string): StudentRecord {
  return {
    id,
    teacherId,
    firstName: displayName.split(" ")[0],
    lastName: displayName.split(" ")[1],
    displayName,
    name: displayName,
    email: "private@example.test",
    phone: "",
    contact: "",
    subject: "Angielski",
    level: "B1",
    goal: "",
    notes: "",
    status: "active",
    defaultDurationMinutes: 60,
    defaultFormat: "online",
    defaultLocation: "",
    defaultPrice: null,
    groupIds: [groupId],
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
  group?: string,
): LessonRecord {
  return {
    id,
    teacherId,
    color: "#334155",
    groupId: group,
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
    topic: id,
    planItems: [],
    planObjectives: group ? "Shared objective" : "",
    homework: id === "group-history" ? "Exercises 4–6" : "",
    homeworkTitle: id === "group-history" ? "Shared homework" : undefined,
    generalNotes: "",
    participants: studentIds.map((studentId) => ({
      studentId,
      attendanceStatus: "present",
      paymentStatus: "unpaid",
      results: [],
    })),
    createdAt: startsAt,
    updatedAt: startsAt,
  };
}
