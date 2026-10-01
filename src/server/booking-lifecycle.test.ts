import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { PublicBookingRecord } from "@/lib/public-booking";

let directory: string;
let store: typeof import("./store");
let lifecycle: typeof import("./booking-lifecycle");
let teacherId: string;
let otherTeacherId: string;

function booking(
  id: string,
  owner = teacherId,
  patch: Partial<PublicBookingRecord> = {},
): PublicBookingRecord {
  const startsAt = new Date(Date.now() + 3 * 86_400_000).toISOString();
  return {
    bookingId: id,
    teacherId: owner,
    eventTypeId: "99000000-0000-4000-8000-000000000001",
    eventTypeName: "Konwersacje",
    durationMinutes: 60,
    priceGrosz: 9000,
    currency: "PLN",
    format: "online",
    startsAt,
    endsAt: new Date(Date.parse(startsAt) + 60 * 60_000).toISOString(),
    timezone: "Europe/Warsaw",
    guestName: "Jan Kowalski",
    guestEmail: "jan@example.com",
    guestPhone: "+48 500 000 000",
    guestLevel: "B1",
    guestGoal: "Swobodne rozmowy",
    guestMessage: "Pierwsza wiadomość pozostaje historią",
    status: "confirmed",
    createdAt: new Date().toISOString(),
    ...patch,
  };
}

const newStudent = {
  mode: "new" as const,
  student: {
    firstName: "Jan",
    lastName: "Kowalski",
    email: "jan@example.com",
    phone: "+48 500 000 000",
    level: "B1",
    goal: "Swobodne rozmowy",
  },
};

beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "easy4tutor-lifecycle-"));
  process.env.TUTORFLOW_DATA_DIR = directory;
  store = await import("./store");
  lifecycle = await import("./booking-lifecycle");
  teacherId = (
    await store.createTeacher({
      name: "Tutor Booking",
      email: "lifecycle@example.test",
      password: "test-only-password",
    })
  ).id;
  otherTeacherId = (
    await store.createTeacher({
      name: "Other Tutor",
      email: "other-lifecycle@example.test",
      password: "test-only-password",
    })
  ).id;
});

beforeEach(async () => {
  await store.mutateStore((data) => {
    data.students = [];
    data.lessons = [];
    data.bookings = [];
    data.calendarBlocks = [];
    data.externalGoogleEvents = [];
    const teacher = data.teachers.find((item) => item.id === teacherId)!;
    teacher.subscription.status = "active";
    teacher.subscription.tier = "free";
    teacher.subscription.readOnly = false;
  });
});

afterAll(async () => {
  delete process.env.TUTORFLOW_DATA_DIR;
  if (
    directory &&
    path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep) &&
    path.basename(directory).startsWith("easy4tutor-lifecycle-")
  ) {
    await rm(directory, { recursive: true });
  }
});

describe("booking lifecycle", () => {
  it("isolates booking lists and details by tutor workspace", async () => {
    await store.mutateStore((data) => {
      data.bookings = [booking("own"), booking("other", otherTeacherId)];
    });
    await expect(lifecycle.listTutorBookings(teacherId)).resolves.toMatchObject([
      { bookingId: "own", guestEmail: "jan@example.com" },
    ]);
    const detail = await lifecycle.getTutorBooking(teacherId, "own");
    expect(detail).toMatchObject({
      guestPhone: "+48 500 000 000",
      guestLevel: "B1",
      guestGoal: "Swobodne rozmowy",
      guestMessage: "Pierwsza wiadomość pozostaje historią",
      proposedStudent: { firstName: "Jan", lastName: "Kowalski" },
    });
    await expect(
      lifecycle.getTutorBooking(teacherId, "other"),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("atomically creates a normal Student and Lesson and retains Booking history", async () => {
    await store.mutateStore((data) => data.bookings!.push(booking("convert")));
    const result = await lifecycle.convertTutorBooking(
      teacherId,
      "convert",
      newStudent,
    );
    const snapshot = await store.queryStore((data) => ({
      student: data.students.find((item) => item.id === result.studentId),
      lesson: data.lessons.find((item) => item.id === result.lessonId),
      booking: data.bookings?.find((item) => item.bookingId === "convert"),
    }));
    expect(snapshot.student).toMatchObject({
      firstName: "Jan",
      level: "B1",
      goal: "Swobodne rozmowy",
      status: "active",
    });
    expect(snapshot.lesson).toMatchObject({
      participantIds: [result.studentId],
      topic: "Konwersacje",
      price: { amount: 9000, currency: "PLN" },
      status: "scheduled",
    });
    expect(snapshot.booking).toMatchObject({
      status: "converted",
      studentId: result.studentId,
      lessonId: result.lessonId,
      convertedAt: result.convertedAt,
      guestMessage: "Pierwsza wiadomość pozostaje historią",
    });
  });

  it("suggests and explicitly links a matching existing Student", async () => {
    await store.mutateStore((data) => {
      data.bookings!.push(booking("existing"));
      data.students.push({
        id: "existing-student",
        teacherId,
        firstName: "Jan",
        lastName: "Kowalski",
        displayName: "Jan Kowalski",
        name: "Jan Kowalski",
        email: "jan@example.com",
        phone: "",
        contact: "jan@example.com",
        subject: "",
        level: "B1",
        goal: "",
        notes: "",
        status: "active",
        defaultDurationMinutes: 60,
        defaultFormat: "online",
        defaultLocation: "",
        defaultPrice: null,
        groupIds: [],
        packageRemainingLessons: null,
        balanceDue: { amount: 0, currency: "PLN" },
        createdAt: new Date().toISOString(),
      });
    });
    const detail = await lifecycle.getTutorBooking(teacherId, "existing");
    expect(detail.matchingStudents.map((item) => item.id)).toEqual([
      "existing-student",
    ]);
    const result = await lifecycle.convertTutorBooking(teacherId, "existing", {
      mode: "existing",
      studentId: "existing-student",
    });
    expect(result.studentId).toBe("existing-student");
    expect(await store.queryStore((data) => data.students)).toHaveLength(1);
  });

  it("respects the Free active-student limit without changing the booking", async () => {
    await store.mutateStore((data) => {
      data.bookings!.push(booking("limited"));
      for (let index = 0; index < 3; index += 1) {
        data.students.push({
          id: `student-${index}`,
          teacherId,
          firstName: `Uczeń ${index}`,
          lastName: "",
          displayName: `Uczeń ${index}`,
          name: `Uczeń ${index}`,
          email: "",
          phone: "",
          contact: "",
          subject: "",
          level: "",
          goal: "",
          notes: "",
          status: "active",
          defaultDurationMinutes: 60,
          defaultFormat: "online",
          defaultLocation: "",
          defaultPrice: null,
          groupIds: [],
          packageRemainingLessons: null,
          balanceDue: { amount: 0, currency: "PLN" },
          createdAt: new Date().toISOString(),
        });
      }
    });
    await expect(
      lifecycle.convertTutorBooking(teacherId, "limited", newStudent),
    ).rejects.toMatchObject({ status: 403 });
    const unchanged = await store.queryStore((data) => ({
      booking: data.bookings?.find((item) => item.bookingId === "limited"),
      students: data.students.length,
      lessons: data.lessons.length,
    }));
    expect(unchanged).toMatchObject({
      booking: { status: "confirmed", guestEmail: "jan@example.com" },
      students: 3,
      lessons: 0,
    });
  });

  it("rolls back Student creation when a real conflict appears after booking", async () => {
    const item = booking("conflict");
    await store.mutateStore((data) => {
      data.bookings!.push(item);
      data.calendarBlocks!.push({
        id: "late-block",
        teacherId,
        title: "Nowa blokada",
        color: "#7F8A9A",
        startsAt: item.startsAt,
        endsAt: item.endsAt,
        timezone: item.timezone,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    });
    await expect(
      lifecycle.convertTutorBooking(teacherId, "conflict", newStudent),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      await store.queryStore((data) => ({
        students: data.students.length,
        lessons: data.lessons.length,
        status: data.bookings?.[0]?.status,
      })),
    ).toEqual({ students: 0, lessons: 0, status: "confirmed" });
  });

  it("is idempotent and a converted booking cannot create duplicates", async () => {
    await store.mutateStore((data) => data.bookings!.push(booking("retry")));
    const first = await lifecycle.convertTutorBooking(teacherId, "retry", newStudent);
    const retry = await lifecycle.convertTutorBooking(teacherId, "retry", newStudent);
    expect(retry).toEqual({ ...first, alreadyConverted: true });
    expect(
      await store.queryStore((data) => ({
        students: data.students.length,
        lessons: data.lessons.length,
      })),
    ).toEqual({ students: 1, lessons: 1 });
  });

  it("rejects cross-workspace booking and Student identifiers", async () => {
    await store.mutateStore((data) => {
      data.bookings!.push(booking("own-cross"), booking("foreign", otherTeacherId));
      data.students.push({
        id: "foreign-student",
        teacherId: otherTeacherId,
        firstName: "Cudzy",
        lastName: "Uczeń",
        displayName: "Cudzy Uczeń",
        name: "Cudzy Uczeń",
        email: "foreign@example.com",
        phone: "",
        contact: "foreign@example.com",
        subject: "",
        level: "",
        goal: "",
        notes: "",
        status: "active",
        defaultDurationMinutes: 60,
        defaultFormat: "online",
        defaultLocation: "",
        defaultPrice: null,
        groupIds: [],
        packageRemainingLessons: null,
        balanceDue: { amount: 0, currency: "PLN" },
        createdAt: new Date().toISOString(),
      });
    });
    await expect(
      lifecycle.convertTutorBooking(teacherId, "foreign", newStudent),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      lifecycle.convertTutorBooking(teacherId, "own-cross", {
        mode: "existing",
        studentId: "foreign-student",
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
});
