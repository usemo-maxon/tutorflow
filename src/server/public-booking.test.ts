import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { addDays } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { ApiFailure } from "./errors";

let directory: string;
let store: typeof import("./store");
let createPublicBooking: typeof import("./public-booking").createPublicBooking;
let getPublicTutorAvailability: typeof import("./booking-availability").getPublicTutorAvailability;
let teacherId: string;
let otherTeacherId: string;
const eventTypeId = "99000000-0000-4000-8000-000000000001";
const hiddenEventTypeId = "99000000-0000-4000-8000-000000000002";
const otherEventTypeId = "99000000-0000-4000-8000-000000000003";

function slot(daysAhead: number, hour = 10) {
  const date = formatInTimeZone(
    addDays(new Date(), daysAhead),
    "Europe/Warsaw",
    "yyyy-MM-dd",
  );
  return fromZonedTime(
    `${date}T${String(hour).padStart(2, "0")}:00:00`,
    "Europe/Warsaw",
  ).toISOString();
}

const request = (startsAt: string, patch: Record<string, unknown> = {}) => ({
  slug: "anna-kowalska",
  eventTypeId,
  startsAt,
  name: "  Jan  ",
  email: " JAN@EXAMPLE.COM ",
  phone: "+48 500 000 000",
  level: "B1",
  goal: "Konwersacje",
  message: "Do zobaczenia",
  ...patch,
});

beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "easy4tutor-booking-"));
  process.env.TUTORFLOW_DATA_DIR = directory;
  store = await import("./store");
  createPublicBooking = (await import("./public-booking")).createPublicBooking;
  getPublicTutorAvailability = (await import("./booking-availability"))
    .getPublicTutorAvailability;
  teacherId = (
    await store.createTeacher({
      name: "Anna Kowalska",
      email: "anna-booking@example.test",
      password: "test-only-password",
    })
  ).id;
  otherTeacherId = (
    await store.createTeacher({
      name: "Inny Tutor",
      email: "other-booking@example.test",
      password: "test-only-password",
    })
  ).id;
  await store.mutateStore((data) => {
    const teacher = data.teachers.find((item) => item.id === teacherId)!;
    const other = data.teachers.find((item) => item.id === otherTeacherId)!;
    teacher.bookingAvailability = {
      minimumNoticeHours: 0,
      bookingHorizonDays: 30,
    };
    teacher.publicProfile = {
      enabled: true,
      slug: "anna-kowalska",
      photoUrl: "",
      publicName: "Anna Kowalska",
      headline: "",
      about: "",
      subjects: [],
      levels: [],
      lessonFormats: ["online"],
      city: "",
      priceText: "",
      contactLinks: [],
    };
    other.publicProfile = {
      ...teacher.publicProfile,
      slug: "inny-tutor",
      publicName: "Inny Tutor",
    };
    data.bookingEventTypes = [
      {
        id: eventTypeId,
        teacherId,
        name: "Lekcja indywidualna",
        description: "",
        durationMinutes: 60,
        priceGrosz: 9000,
        currency: "PLN",
        format: "online",
        active: true,
        isPublic: true,
        displayOrder: 0,
      },
      {
        id: hiddenEventTypeId,
        teacherId,
        name: "Ukryta",
        description: "",
        durationMinutes: 45,
        priceGrosz: 7000,
        currency: "PLN",
        format: "online",
        active: true,
        isPublic: false,
        displayOrder: 1,
      },
      {
        id: otherEventTypeId,
        teacherId: otherTeacherId,
        name: "Cudza oferta",
        description: "",
        durationMinutes: 30,
        priceGrosz: 5000,
        currency: "PLN",
        format: "online",
        active: true,
        isPublic: true,
        displayOrder: 0,
      },
    ];
  });
});

afterAll(async () => {
  delete process.env.TUTORFLOW_DATA_DIR;
  if (
    directory &&
    path.resolve(directory).startsWith(path.resolve(tmpdir()) + path.sep) &&
    path.basename(directory).startsWith("easy4tutor-booking-")
  ) {
    await rm(directory, { recursive: true });
  }
});

describe("public booking transaction", () => {
  it("creates a confirmed booking from authoritative event data without creating a Student", async () => {
    const studentsBefore = await store.queryStore(
      (data) => data.students.length,
    );
    const confirmation = await createPublicBooking(request(slot(2)));
    const saved = await store.queryStore((data) => data.bookings?.[0]);

    expect(confirmation).toEqual({
      bookingId: expect.any(String),
      eventTypeName: "Lekcja indywidualna",
      startsAt: slot(2),
      endsAt: new Date(Date.parse(slot(2)) + 60 * 60_000).toISOString(),
      timezone: "Europe/Warsaw",
      guestEmail: "jan@example.com",
    });
    expect(Object.keys(confirmation).sort()).toEqual(
      [
        "bookingId",
        "endsAt",
        "eventTypeName",
        "guestEmail",
        "startsAt",
        "timezone",
      ].sort(),
    );
    expect(saved).toMatchObject({
      eventTypeId,
      durationMinutes: 60,
      priceGrosz: 9000,
      currency: "PLN",
      format: "online",
      guestName: "Jan",
      status: "confirmed",
    });
    expect(await store.queryStore((data) => data.students.length)).toBe(
      studentsBefore,
    );
  });

  it("immediately removes an existing booking from public availability", async () => {
    const startsAt = slot(2);
    const date = formatInTimeZone(startsAt, "Europe/Warsaw", "yyyy-MM-dd");
    const availability = await getPublicTutorAvailability(
      "anna-kowalska",
      eventTypeId,
      date,
      date,
    );
    expect(
      availability.days[0]?.slots.some((item) => item.startsAt === startsAt),
    ).toBe(false);
  });

  it("allows only one of two concurrent requests for the same slot", async () => {
    const startsAt = slot(3);
    const results = await Promise.allSettled([
      createPublicBooking(request(startsAt, { email: "a@example.com" })),
      createPublicBooking(request(startsAt, { email: "b@example.com" })),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected).toMatchObject({
      reason: expect.objectContaining({ status: 409 }),
    });
  });

  it("rejects lesson and calendar-block conflicts during server revalidation", async () => {
    await store.mutateStore((data) => {
      data.lessons.push({
        id: "lesson-booking-conflict",
        teacherId,
        color: "#000000",
        participantIds: [],
        startsAt: slot(4),
        durationMinutes: 60,
        format: "online",
        location: "",
        price: null,
        mode: "single",
        timezone: "Europe/Warsaw",
        status: "scheduled",
        syncStatus: "disabled",
        topic: "Konflikt",
        planItems: [],
        homework: "",
        generalNotes: "",
        participants: [],
        createdAt: new Date().toISOString(),
      });
      (data.calendarBlocks ??= []).push({
        id: "block-booking-conflict",
        teacherId,
        title: "Zajęty",
        color: "#000000",
        startsAt: slot(5),
        endsAt: new Date(Date.parse(slot(5)) + 60 * 60_000).toISOString(),
        timezone: "Europe/Warsaw",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    });
    await expect(createPublicBooking(request(slot(4)))).rejects.toMatchObject({
      status: 409,
    });
    await expect(createPublicBooking(request(slot(5)))).rejects.toMatchObject({
      status: 409,
    });
  });

  it("rejects unpublished, cross-tutor, and invalid guest input", async () => {
    await expect(
      createPublicBooking(request(slot(6), { eventTypeId: hiddenEventTypeId })),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      createPublicBooking(request(slot(6), { eventTypeId: otherEventTypeId })),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      createPublicBooking(request(slot(6), { email: "nie-email" })),
    ).rejects.toBeInstanceOf(ApiFailure);
    await expect(
      createPublicBooking(request(slot(6), { website: "spam.example" })),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      createPublicBooking(
        request(slot(6), { durationMinutes: 15, priceGrosz: 1 }),
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
});
