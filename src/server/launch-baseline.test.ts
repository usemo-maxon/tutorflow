import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let dataDirectory: string;
let teacherId: string;
let studentId: string;
let createTeacher: typeof import("./store").createTeacher;
let getAppData: typeof import("./store").getAppData;
let performAction: typeof import("./app-service").performAction;
let getLessonWorkspace: typeof import("./lesson-workspace").getLessonWorkspace;
let mutateLessonWorkspace: typeof import("./lesson-workspace").mutateLessonWorkspace;
let getFinancialOverview: typeof import("./finance").getFinancialOverview;

beforeAll(async () => {
  dataDirectory = await mkdtemp(
    path.join(tmpdir(), "easy4tutor-launch-baseline-"),
  );
  process.env.TUTORFLOW_DATA_DIR = dataDirectory;

  const store = await import("./store");
  const appService = await import("./app-service");
  const lessonWorkspace = await import("./lesson-workspace");
  const finance = await import("./finance");

  createTeacher = store.createTeacher;
  getAppData = store.getAppData;
  performAction = appService.performAction;
  getLessonWorkspace = lessonWorkspace.getLessonWorkspace;
  mutateLessonWorkspace = lessonWorkspace.mutateLessonWorkspace;
  getFinancialOverview = finance.getFinancialOverview;

  teacherId = (
    await createTeacher({
      name: "Joanna Kowalska",
      email: "joanna.kowalska@example.test",
      password: "test-only-password",
    })
  ).id;
});

afterAll(async () => {
  delete process.env.TUTORFLOW_DATA_DIR;
  if (
    dataDirectory &&
    path.resolve(dataDirectory).startsWith(path.resolve(tmpdir()) + path.sep) &&
    path.basename(dataDirectory).startsWith("easy4tutor-launch-baseline-")
  ) {
    await rm(dataDirectory, { recursive: true });
  }
});

describe("canonical launch regression baseline", () => {
  it("preserves completed history, finance idempotency, and the future recurring occurrence", async () => {
    const createdStudent = await performAction(teacherId, {
      type: "createStudent",
      student: {
        firstName: "Zofia",
        lastName: "Nowak",
        displayName: "Zofia Nowak",
        email: "zofia.nowak@example.test",
        phone: "+48 600 700 800",
        subject: "Język angielski",
        level: "B1",
        goal: "Swobodna rozmowa podczas podróży",
        notes: "Preferuje materiały wizualne.",
        defaultDurationMinutes: 60,
        defaultFormat: "online",
        defaultLocation: "https://meet.example.test/zofia",
        defaultPrice: { amount: 14000, currency: "PLN" },
        timezone: "Europe/Warsaw",
      },
    });
    studentId = createdStudent.result!.id!;
    expect(
      createdStudent.data.students.find((student) => student.id === studentId),
    ).toMatchObject({
      id: studentId,
      name: "Zofia Nowak",
      status: "active",
      subject: "Język angielski",
      level: "B1",
      defaultDurationMinutes: 60,
      defaultFormat: "online",
      defaultPrice: { amount: 14000, currency: "PLN" },
    });

    const createdSeries = await performAction(teacherId, {
      type: "createLesson",
      lesson: {
        participantIds: [studentId],
        mode: "recurring",
        occurrences: [
          { startsAt: "2041-04-01T15:00:00.000Z", durationMinutes: 60 },
          { startsAt: "2041-04-08T15:00:00.000Z", durationMinutes: 60 },
        ],
        format: "online",
        location: "https://meet.example.test/zofia",
        priceAmount: 14000,
        subject: "Język angielski",
        topic: "Rozmowa na lotnisku",
        plan: ["Powtórka słownictwa", "Dialog sytuacyjny"],
        recurrence: {
          frequency: "weekly",
          count: 2,
          timezone: "Europe/Warsaw",
        },
      },
    });
    const [firstLessonId, secondLessonId] = createdSeries.result!.ids!;
    const createdLessons = createdSeries.data.lessons.filter((lesson) =>
      [firstLessonId, secondLessonId].includes(lesson.id),
    );
    expect(createdLessons).toHaveLength(2);
    expect(createdLessons[0].seriesId).toEqual(expect.any(String));
    expect(new Set(createdLessons.map((lesson) => lesson.seriesId)).size).toBe(
      1,
    );
    expect(createdLessons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: firstLessonId,
          participantIds: [studentId],
          durationMinutes: 60,
          timezone: "Europe/Warsaw",
          status: "scheduled",
        }),
        expect.objectContaining({
          id: secondLessonId,
          participantIds: [studentId],
          durationMinutes: 60,
          timezone: "Europe/Warsaw",
          status: "scheduled",
        }),
      ]),
    );

    let firstWorkspace = await getLessonWorkspace(teacherId, firstLessonId);
    firstWorkspace = await mutateLessonWorkspace(teacherId, firstLessonId, {
      type: "updatePlan",
      topic: "Rozmowa na lotnisku i odprawa",
      objectives: "Uczeń samodzielnie przeprowadza dialog przy odprawie.",
      items: [
        ...firstWorkspace.lesson.planItems,
        {
          id: randomUUID(),
          position: firstWorkspace.lesson.planItems.length,
          text: "Informacja zwrotna i utrwalenie zwrotów",
        },
      ],
      expectedUpdatedAt: firstWorkspace.lesson.updatedAt,
    });
    firstWorkspace = await mutateLessonWorkspace(teacherId, firstLessonId, {
      type: "saveNote",
      noteType: "private",
      content: "Warto wrócić do wymowy słowa departure.",
    });
    firstWorkspace = await mutateLessonWorkspace(teacherId, firstLessonId, {
      type: "saveNote",
      noteType: "summary",
      content: "Zofia potrafi przejść przez odprawę po angielsku.",
    });
    firstWorkspace = await mutateLessonWorkspace(teacherId, firstLessonId, {
      type: "upsertHomework",
      title: "Dialog na lotnisku",
      description: "Nagraj dwuminutowy dialog przy stanowisku odprawy.",
      dueAt: "2041-04-07T18:00:00.000Z",
    });
    firstWorkspace = await mutateLessonWorkspace(teacherId, firstLessonId, {
      type: "markAttendance",
      studentId,
      status: "present",
    });
    firstWorkspace = await mutateLessonWorkspace(teacherId, firstLessonId, {
      type: "completeLesson",
    });

    expect(firstWorkspace.lesson).toMatchObject({
      id: firstLessonId,
      topic: "Rozmowa na lotnisku i odprawa",
      objectives: "Uczeń samodzielnie przeprowadza dialog przy odprawie.",
      privateNote: "Warto wrócić do wymowy słowa departure.",
      summary: "Zofia potrafi przejść przez odprawę po angielsku.",
      status: "completed",
    });
    expect(firstWorkspace.lesson.planItems).toHaveLength(3);
    expect(firstWorkspace.homework).toMatchObject({
      title: "Dialog na lotnisku",
      description: "Nagraj dwuminutowy dialog przy stanowisku odprawy.",
    });
    expect(firstWorkspace.participants).toEqual([
      expect.objectContaining({ studentId, attendanceStatus: "present" }),
    ]);

    const retriedCompletion = await mutateLessonWorkspace(
      teacherId,
      firstLessonId,
      { type: "completeLesson" },
    );
    const finance = await getFinancialOverview(teacherId, { studentId });
    const persisted = await getAppData(teacherId);
    const firstPersisted = persisted.lessons.find(
      (lesson) => lesson.id === firstLessonId,
    )!;
    const secondPersisted = persisted.lessons.find(
      (lesson) => lesson.id === secondLessonId,
    )!;

    expect(retriedCompletion.lesson.status).toBe("completed");
    expect(persisted.lessons).toHaveLength(2);
    expect(
      finance.openCharges.filter((charge) => charge.lessonId === firstLessonId),
    ).toHaveLength(1);
    expect(finance.openCharges[0]).toMatchObject({
      lessonId: firstLessonId,
      studentId,
      amount: 14000,
      currency: "PLN",
      status: "open",
    });
    expect(firstPersisted).toMatchObject({
      status: "completed",
      seriesId: secondPersisted.seriesId,
      participantIds: [studentId],
      durationMinutes: 60,
    });
    expect(firstPersisted.participants[0].attendanceStatus).toBe("present");
    expect(secondPersisted).toMatchObject({
      startsAt: "2041-04-08T15:00:00.000Z",
      status: "scheduled",
      topic: "Rozmowa na lotnisku",
      participantIds: [studentId],
      durationMinutes: 60,
    });
    expect(secondPersisted.planItems).toHaveLength(2);
    expect(secondPersisted.homework).toBe("");
    expect(secondPersisted.generalNotes).toBe("");
  });
});
