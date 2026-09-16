import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { formatInTimeZone } from "date-fns-tz";
import type { CreateLessonInput, StudentCreateInput } from "../lib/domain";

let storage: typeof import("./store");
let perform: typeof import("./app-service").performAction;
let directory: string;
let teacherId: string;
let studentId: string;
const student: StudentCreateInput = {
  firstName: "Uczeń",
  lastName: "testowy",
  displayName: "Uczeń testowy",
  email: "",
  phone: "",
  subject: "Angielski",
  level: "B1",
  goal: "",
  notes: "",
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
      patch: {
        ...student,
        firstName: "Długie imię",
        lastName: "ucznia — test",
        displayName: "Długie imię ucznia — test",
        defaultPrice: null,
      },
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
        student: {
          ...student,
          firstName: "Drugi",
          lastName: "uczeń",
          displayName: "Drugi uczeń",
        },
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
  it("uses completed recurring history only as a reference for a future move", async () => {
    const input = create("2025-02-04", "recurring");
    input.occurrences.push(
      { startsAt: "2042-03-25T16:00:00.000Z", durationMinutes: 60 },
      { startsAt: "2042-04-01T15:00:00.000Z", durationMinutes: 60 },
    );
    input.recurrence = {
      frequency: "weekly",
      count: 3,
      timezone: "Europe/Warsaw",
    };
    const created = await perform(teacherId, {
      type: "createLesson",
      lesson: input,
    });
    const [historicalId] = created.result!.ids!;
    const historical = created.data.lessons.find(
      (lesson) => lesson.id === historicalId,
    )!;
    await perform(teacherId, {
      type: "saveLesson",
      lessonId: historicalId,
      topic: historical.topic,
      planItems: historical.planItems,
      homework: historical.homework,
      generalNotes: historical.generalNotes,
      participants: historical.participants,
      complete: true,
    });

    const moved = await perform(teacherId, {
      type: "rescheduleLesson",
      lessonId: historicalId,
      startsAt: "2025-02-05T17:00:00.000Z",
      scope: "future",
    });
    const series = moved.data.lessons
      .filter((lesson) => lesson.seriesId === historical.seriesId)
      .sort((left, right) =>
        left.recurrenceOriginalStartsAt!.localeCompare(
          right.recurrenceOriginalStartsAt!,
        ),
      );
    expect(series[0]).toMatchObject({
      id: historicalId,
      startsAt: "2025-02-04T09:00:00.000Z",
      status: "completed",
    });
    expect(
      series
        .slice(1)
        .map((lesson) =>
          formatInTimeZone(
            lesson.startsAt,
            "Europe/Warsaw",
            "yyyy-MM-dd HH:mm",
          ),
        ),
    ).toEqual(["2042-03-26 18:00", "2042-04-02 18:00"]);
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
  it("imports detailed student statistics and rejects invalid scores", async () => {
    const response = await perform(teacherId, {
      type: "importStudentStats",
      studentId,
      sourceFile: "postep.csv",
      records: [
        {
          occurredAt: "2031-03-08T12:00:00.000Z",
          topic: "Speaking",
          skill: "Płynność wypowiedzi",
          score: 8.5,
          durationMinutes: 45,
          attendanceStatus: "present",
        },
      ],
    });
    expect(response.data.studentStatImports[0]).toMatchObject({
      studentId,
      sourceFile: "postep.csv",
      score: 8.5,
    });
    await expect(
      perform(teacherId, {
        type: "importStudentStats",
        studentId,
        sourceFile: "bledny.csv",
        records: [
          {
            occurredAt: "2031-03-08T12:00:00.000Z",
            topic: "Test",
            skill: "Gramatyka",
            score: 12,
            durationMinutes: 30,
            attendanceStatus: "present",
          },
        ],
      }),
    ).rejects.toThrow();
  });
  it("blocks lessons on a day marked unavailable for the whole day", async () => {
    const created = await perform(teacherId, {
      type: "createAvailability",
      rule: {
        kind: "single",
        allDay: true,
        label: "Urlop",
        start: "2032-04-09T22:00:00.000Z",
        end: "2032-04-10T22:00:00.000Z",
      },
    });
    expect(created.data.availability.at(-1)).toMatchObject({
      allDay: true,
      label: "Urlop",
    });
    await expect(
      perform(teacherId, {
        type: "createLesson",
        lesson: create("2032-04-10"),
      }),
    ).rejects.toThrow();
  });
  it("warns about probable student duplicates without creating a record", async () => {
    const current = await storage.getAppData(teacherId);
    const before = current.students.length;
    const existing = current.students.find((item) => item.id === studentId)!;
    await expect(
      perform(teacherId, {
        type: "createStudent",
        student: {
          ...student,
          firstName: existing.firstName,
          lastName: existing.lastName,
          displayName: existing.displayName,
        },
      }),
    ).rejects.toThrow();
    expect((await storage.getAppData(teacherId)).students).toHaveLength(before);
  });
  it("creates shared contacts and keeps relation flags per student", async () => {
    const second = (await storage.getAppData(teacherId)).students.find(
      (item) => item.id !== studentId,
    )!;
    const contact = {
      firstName: "Anna",
      lastName: "Testowa",
      email: "anna.parent@example.test",
      phone: "+48 600 111 222",
      type: "parent" as const,
      relationship: "Mama",
      isPrimary: true,
      isBillingContact: true,
    };
    await perform(teacherId, {
      type: "createStudentContact",
      studentId,
      contact,
    });
    const response = await perform(teacherId, {
      type: "createStudentContact",
      studentId: second.id,
      contact: { ...contact, relationship: "Opiekun", isBillingContact: false },
    });
    const links = response.data.contacts.filter(
      (item) => item.email === contact.email,
    );
    expect(links).toHaveLength(2);
    expect(new Set(links.map((item) => item.contactId)).size).toBe(1);
    expect(
      links.find((item) => item.studentId === studentId)?.isBillingContact,
    ).toBe(true);
  });
  it("creates, archives and restores groups while preserving membership history", async () => {
    const created = await perform(teacherId, {
      type: "createGroup",
      group: {
        name: "Grupa testowa",
        subject: "Angielski",
        level: "B1",
        defaultDurationMinutes: 60,
        defaultPrice: { amount: 8000, currency: "PLN" },
        notes: "",
      },
    });
    const groupId = created.result!.id!;
    await perform(teacherId, {
      type: "addGroupMembers",
      groupId,
      studentIds: [studentId, studentId],
    });
    let group = (await storage.getAppData(teacherId)).groups.find(
      (item) => item.id === groupId,
    )!;
    expect(
      group.members.filter((member) => member.status === "active"),
    ).toHaveLength(1);
    await perform(teacherId, { type: "removeGroupMember", groupId, studentId });
    group = (await storage.getAppData(teacherId)).groups.find(
      (item) => item.id === groupId,
    )!;
    expect(group.members[0]).toMatchObject({ status: "suspended" });
    expect(group.members[0].leftAt).toBeTruthy();
    await perform(teacherId, {
      type: "setGroupStatus",
      groupId,
      status: "archived",
    });
    const restored = await perform(teacherId, {
      type: "setGroupStatus",
      groupId,
      status: "active",
    });
    expect(
      restored.data.groups.find((item) => item.id === groupId)?.status,
    ).toBe("active");
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
        patch: {
          ...student,
          firstName: "Przejęty",
          lastName: "",
          displayName: "Przejęty",
        },
      }),
    ).rejects.toThrow();
    expect(
      (await storage.getAppData(teacherId)).students.find(
        (item) => item.id === studentId,
      )?.name,
    ).not.toBe("Przejęty");
  });
  it("moves lessons and blocks transactionally with half-open conflict rules", async () => {
    const calendarTeacher = await storage.createTeacher({
      name: "Test kalendarza",
      email: "calendar-moves@example.test",
      password: "test-only-password",
    });
    const calendarStudentId = (
      await perform(calendarTeacher.id, {
        type: "createStudent",
        student: { ...student, displayName: "Uczeń kalendarza" },
      })
    ).result!.id!;
    const schedule = async (startsAt: string) =>
      perform(calendarTeacher.id, {
        type: "createLesson",
        lesson: {
          ...create("2036-05-12"),
          participantIds: [calendarStudentId],
          occurrences: [{ startsAt, durationMinutes: 60 }],
        },
      });
    const first = await schedule("2036-05-12T17:00:00.000Z");
    const second = await schedule("2036-05-12T18:00:00.000Z");
    const firstId = first.result!.ids![0];
    const secondId = second.result!.ids![0];

    await expect(
      perform(calendarTeacher.id, {
        type: "rescheduleLesson",
        lessonId: firstId,
        startsAt: "2036-05-12T18:30:00.000Z",
      }),
    ).rejects.toThrow();
    expect(
      (await storage.getAppData(calendarTeacher.id)).lessons.find(
        (item) => item.id === firstId,
      )?.startsAt,
    ).toBe("2036-05-12T17:00:00.000Z");

    const moved = await perform(calendarTeacher.id, {
      type: "rescheduleLesson",
      lessonId: firstId,
      startsAt: "2036-05-12T19:00:00.000Z",
    });
    expect(
      moved.data.lessons.find((item) => item.id === firstId),
    ).toMatchObject({
      startsAt: "2036-05-12T19:00:00.000Z",
      durationMinutes: 60,
    });
    expect(
      moved.data.lessons.find((item) => item.id === secondId)?.startsAt,
    ).toBe("2036-05-12T18:00:00.000Z");

    const createdBlock = await perform(calendarTeacher.id, {
      type: "createCalendarBlock",
      block: {
        title: "Prywatne",
        startsAt: "2036-05-12T20:00:00.000Z",
        endsAt: "2036-05-12T21:30:00.000Z",
        timezone: "Europe/Warsaw",
      },
    });
    const blockId = createdBlock.result!.id!;
    const block = createdBlock.data.calendarBlocks.find(
      (item) => item.id === blockId,
    )!;
    const movedBlock = await perform(calendarTeacher.id, {
      type: "updateCalendarBlock",
      blockId,
      block: {
        title: block.title,
        startsAt: "2036-05-12T21:00:00.000Z",
        endsAt: "2036-05-12T22:30:00.000Z",
        timezone: block.timezone,
      },
      expectedUpdatedAt: block.updatedAt,
    });
    expect(
      movedBlock.data.calendarBlocks.find((item) => item.id === blockId),
    ).toMatchObject({
      startsAt: "2036-05-12T21:00:00.000Z",
      endsAt: "2036-05-12T22:30:00.000Z",
    });
    expect(movedBlock.data.lessons).toHaveLength(2);

    await expect(
      perform(calendarTeacher.id, {
        type: "updateCalendarBlock",
        blockId,
        block: {
          title: block.title,
          startsAt: "2036-05-12T19:30:00.000Z",
          endsAt: "2036-05-12T21:00:00.000Z",
          timezone: block.timezone,
        },
      }),
    ).rejects.toThrow();
    expect(
      (await storage.getAppData(calendarTeacher.id)).calendarBlocks.find(
        (item) => item.id === blockId,
      )?.startsAt,
    ).toBe("2036-05-12T21:00:00.000Z");
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
        patch: { ...student, firstName: "No", lastName: "", displayName: "No" },
      }),
    ).rejects.toThrow();
    expect((await storage.getAppData(teacherId)).students.length).toBe(2);
  });
});
