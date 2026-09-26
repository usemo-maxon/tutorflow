import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { StudentCreateInput } from "@/lib/domain";
import { ApiFailure } from "./errors";

let directory: string;
let teacherId: string;
let otherTeacherId: string;
let lessonId: string;
let participantIds: string[];
let outsiderStudentId: string;
let store: typeof import("./store");
let performAction: typeof import("./app-service").performAction;
let getLessonWorkspace: typeof import("./lesson-workspace").getLessonWorkspace;
let mutateLessonWorkspace: typeof import("./lesson-workspace").mutateLessonWorkspace;
let upsertLessonStudentOutcome: typeof import("./student-outcomes").upsertLessonStudentOutcome;

const student = (label: string): StudentCreateInput => ({
  firstName: label,
  lastName: "Outcome",
  email: `${label.toLowerCase()}@example.test`,
  phone: "",
  subject: "Angielski",
  level: "B1",
});

beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "easy4tutor-outcomes-"));
  process.env.TUTORFLOW_DATA_DIR = directory;
  store = await import("./store");
  performAction = (await import("./app-service")).performAction;
  const lessonWorkspace = await import("./lesson-workspace");
  getLessonWorkspace = lessonWorkspace.getLessonWorkspace;
  mutateLessonWorkspace = lessonWorkspace.mutateLessonWorkspace;
  upsertLessonStudentOutcome = (await import("./student-outcomes"))
    .upsertLessonStudentOutcome;

  teacherId = (
    await store.createTeacher({
      name: "Tutor Outcomes",
      email: "outcomes@example.test",
      password: "test-only-password",
    })
  ).id;
  otherTeacherId = (
    await store.createTeacher({
      name: "Other Tutor",
      email: "other-outcomes@example.test",
      password: "test-only-password",
    })
  ).id;
  await store.mutateStore((data) => {
    data.teachers.find((item) => item.id === teacherId)!.subscription.tier =
      "pro";
  });

  participantIds = [];
  for (const label of ["Anna", "Zosia", "Kuba"]) {
    const response = await performAction(teacherId, {
      type: "createStudent",
      student: student(label),
    });
    participantIds.push(response.result!.id!);
  }
  outsiderStudentId = (
    await performAction(teacherId, {
      type: "createStudent",
      student: student("Ola"),
    })
  ).result!.id!;
  const groupId = (
    await performAction(teacherId, {
      type: "createGroup",
      group: {
        name: "Grupa B1",
        subject: "Angielski",
        level: "B1",
        defaultDurationMinutes: 60,
        defaultPrice: null,
        notes: "",
      },
    })
  ).result!.id!;
  await performAction(teacherId, {
    type: "addGroupMembers",
    groupId,
    studentIds: participantIds,
  });
  lessonId = (
    await performAction(teacherId, {
      type: "createLesson",
      lesson: {
        target: { type: "group", id: groupId },
        mode: "single",
        occurrences: [
          { startsAt: "2042-03-10T16:00:00.000Z", durationMinutes: 60 },
        ],
        format: "online",
        location: "https://meet.example.test/outcomes",
        priceAmount: null,
        topic: "Past Simple",
        plan: [],
        allowOutsideAvailability: true,
      },
    })
  ).result!.id!;
});

afterAll(async () => {
  delete process.env.TUTORFLOW_DATA_DIR;
  if (
    directory &&
    path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep) &&
    path.basename(directory).startsWith("easy4tutor-outcomes-")
  ) {
    await rm(directory, { recursive: true });
  }
});

describe("lesson student outcomes", () => {
  it("keeps a legacy lesson without outcomes readable", async () => {
    const workspace = await getLessonWorkspace(teacherId, lessonId);
    expect(workspace.participants).toHaveLength(3);
    expect(workspace.participants.every((item) => !item.outcome)).toBe(true);
  });

  it("does not create a new row for an entirely blank outcome", async () => {
    await expect(
      upsertLessonStudentOutcome({
        teacherId,
        lessonId,
        studentId: participantIds[0],
        progressSummary: "   ",
        difficultyNote: "",
        nextStep: "  ",
      }),
    ).resolves.toBeUndefined();
    expect(
      await store.queryStore((data) => data.lessonStudentOutcomes?.length ?? 0),
    ).toBe(0);
  });

  it("stores three independent group outcomes and updates only one", async () => {
    const drafts = [
      {
        progressSummary: "  Bardzo dobry postęp. ",
        difficultyLevel: "easy" as const,
        nextStep: "Wprowadzić conditionals.",
      },
      {
        progressSummary: "Częściowo opanowała pytania.",
        difficultyLevel: "hard" as const,
        difficultyNote: "Nadal pomija did.",
        nextStep: "Powtórzyć pytania w Past Simple.",
      },
      {
        progressSummary: "Dobra praca w dialogach.",
        difficultyLevel: "mixed" as const,
        nextStep: "Ćwiczyć mówienie.",
      },
    ];
    for (let index = 0; index < participantIds.length; index += 1) {
      await mutateLessonWorkspace(teacherId, lessonId, {
        type: "saveStudentOutcome",
        studentId: participantIds[index],
        ...drafts[index],
      });
    }

    const initial = await getLessonWorkspace(teacherId, lessonId);
    const anna = initial.participants[0].outcome!;
    expect(
      initial.participants.map((item) => item.outcome?.difficultyLevel),
    ).toEqual(["easy", "hard", "mixed"]);
    expect(anna.progressSummary).toBe("Bardzo dobry postęp.");

    await store.mutateStore((data) => {
      data.lessonStudentOutcomes!.find(
        (item) => item.studentId === participantIds[0],
      )!.updatedAt = "2000-01-01T00:00:00.000Z";
    });
    const updated = await mutateLessonWorkspace(teacherId, lessonId, {
      type: "saveStudentOutcome",
      studentId: participantIds[0],
      progressSummary: "Postęp utrwalony.",
      difficultyLevel: "mixed",
      difficultyNote: "   ",
      nextStep: "Dialogi warunkowe.",
    });
    expect(updated.participants[0].outcome).toMatchObject({
      id: anna.id,
      createdAt: anna.createdAt,
      progressSummary: "Postęp utrwalony.",
      difficultyLevel: "mixed",
      difficultyNote: undefined,
    });
    expect(updated.participants[0].outcome!.updatedAt).not.toBe(
      "2000-01-01T00:00:00.000Z",
    );
    expect(updated.participants[1].outcome).toEqual(
      initial.participants[1].outcome,
    );
    expect(updated.participants[2].outcome).toEqual(
      initial.participants[2].outcome,
    );
  });

  it("rejects non-participants and cross-workspace writes", async () => {
    await expect(
      upsertLessonStudentOutcome({
        teacherId,
        lessonId,
        studentId: outsiderStudentId,
        nextStep: "Nie powinno się zapisać.",
      }),
    ).rejects.toMatchObject<Partial<ApiFailure>>({
      status: 422,
      body: { code: "INVALID_PARTICIPANT", message: expect.any(String) },
    });
    await expect(
      upsertLessonStudentOutcome({
        teacherId: otherTeacherId,
        lessonId,
        studentId: participantIds[0],
        nextStep: "Nie powinno się zapisać.",
      }),
    ).rejects.toMatchObject<Partial<ApiFailure>>({
      status: 422,
      body: { code: "INVALID_PARTICIPANT", message: expect.any(String) },
    });
  });

  it("blocks read-only mutation and retains history for an archived student", async () => {
    await store.mutateStore((data) => {
      data.teachers.find(
        (item) => item.id === teacherId,
      )!.subscription.readOnly = true;
    });
    await expect(
      upsertLessonStudentOutcome({
        teacherId,
        lessonId,
        studentId: participantIds[0],
        nextStep: "Zablokowane.",
      }),
    ).rejects.toMatchObject<Partial<ApiFailure>>({
      status: 403,
      body: { code: "READ_ONLY", message: expect.any(String) },
    });
    await store.mutateStore((data) => {
      data.teachers.find(
        (item) => item.id === teacherId,
      )!.subscription.readOnly = false;
    });
    await performAction(teacherId, {
      type: "setStudentStatus",
      studentId: participantIds[0],
      status: "archived",
    });
    const workspace = await getLessonWorkspace(teacherId, lessonId);
    expect(workspace.participants[0]).toMatchObject({
      status: "archived",
      outcome: { progressSummary: "Postęp utrwalony." },
    });
  });

  it("rejects invalid IDs and difficulty values before persistence", async () => {
    await expect(
      upsertLessonStudentOutcome({
        teacherId,
        lessonId: randomUUID(),
        studentId: "not-a-uuid",
        difficultyLevel: "easy",
      }),
    ).rejects.toMatchObject<Partial<ApiFailure>>({ status: 422 });
  });
});
