import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { addDays } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { buildBookingIcs } from "@/lib/booking-ics";

let directory: string;
let store: typeof import("./store");
let booking: typeof import("./public-booking");
let management: typeof import("./booking-management");
let availability: typeof import("./booking-availability");
let teacherId: string;
let otherTeacherId: string;
const eventTypeId = "99700000-0000-4000-8000-000000000001";
const otherEventTypeId = "99700000-0000-4000-8000-000000000002";

function slot(daysAhead: number, hour: number) {
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

function request(startsAt: string, patch: Record<string, unknown> = {}) {
  return {
    slug: "d27-anna",
    eventTypeId,
    startsAt,
    name: "Jan Gość",
    email: "jan@example.test",
    ...patch,
  };
}

function tokenFrom(url: string) {
  return new URL(url).pathname.split("/").at(-1)!;
}

beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "easy4tutor-d27-"));
  process.env.TUTORFLOW_DATA_DIR = directory;
  store = await import("./store");
  booking = await import("./public-booking");
  management = await import("./booking-management");
  availability = await import("./booking-availability");
  teacherId = (
    await store.createTeacher({
      name: "Anna Kowalska",
      email: "d27-anna@example.test",
      password: "test-only-password",
    })
  ).id;
  otherTeacherId = (
    await store.createTeacher({
      name: "Ewa Nowak",
      email: "d27-ewa@example.test",
      password: "test-only-password",
    })
  ).id;
  await store.mutateStore((data) => {
    const teacher = data.teachers.find((item) => item.id === teacherId)!;
    const other = data.teachers.find((item) => item.id === otherTeacherId)!;
    teacher.bookingAvailability = {
      minimumNoticeHours: 0,
      bookingHorizonDays: 30,
      cancellationNoticeHours: 24,
    };
    teacher.publicProfile = {
      enabled: true,
      slug: "d27-anna",
      photoUrl: "",
      publicName: "Anna Kowalska",
      headline: "",
      about: "",
      subjects: [],
      levels: [],
      lessonFormats: ["online", "offline"],
      city: "Warszawa",
      priceText: "",
      contactLinks: [],
    };
    other.bookingAvailability = { ...teacher.bookingAvailability };
    other.publicProfile = {
      ...teacher.publicProfile,
      slug: "d27-ewa",
      publicName: "Ewa Nowak",
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
        id: otherEventTypeId,
        teacherId: otherTeacherId,
        name: "Cudza lekcja",
        description: "",
        durationMinutes: 60,
        priceGrosz: 9000,
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
    path.basename(directory).startsWith("easy4tutor-d27-")
  ) {
    await rm(directory, { recursive: true });
  }
});

describe("D2.7 guest booking management", () => {
  it("creates an opaque token, emails the guest, and exposes no token material in normal booking data", async () => {
    const sender = vi.fn(async () => undefined);
    const confirmation = await booking.createPublicBooking(
      request(slot(5, 9)),
      { emailSender: sender, baseUrl: "https://easy4tutor.pl" },
    );
    const token = tokenFrom(confirmation.managementUrl);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(sender).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "jan@example.test",
        managementUrl: confirmation.managementUrl,
        calendarUrl: `${confirmation.managementUrl}/kalendarz.ics`,
      }),
    );
    const stored = await store.queryStore((data) => data.bookings?.[0]);
    expect(stored?.managementTokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored?.managementTokenHash).not.toContain(token);
    expect(stored?.confirmationEmailSentAt).toEqual(expect.any(String));
    const normalData = await booking.getOwnPublicBookings(teacherId);
    expect(JSON.stringify(normalData)).not.toContain(token);
    expect(JSON.stringify(normalData)).not.toContain("managementTokenHash");
  });

  it("grants access only to the token's booking and rejects invalid or cross-booking tokens", async () => {
    const first = await booking.createPublicBooking(request(slot(5, 11)), {
      baseUrl: "https://easy4tutor.pl",
    });
    const second = await booking.createPublicBooking(request(slot(5, 13)), {
      baseUrl: "https://easy4tutor.pl",
    });
    const firstView = await management.getGuestBooking(
      tokenFrom(first.managementUrl),
    );
    const secondView = await management.getGuestBooking(
      tokenFrom(second.managementUrl),
    );
    expect(firstView.startsAt).toBe(slot(5, 11));
    expect(secondView.startsAt).toBe(slot(5, 13));
    await expect(
      management.getGuestBooking("A".repeat(43)),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      management.getGuestBooking(tokenFrom(first.managementUrl) + "x"),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("cancels a confirmed booking and immediately reopens availability and active calendar data", async () => {
    const startsAt = slot(6, 10);
    const confirmation = await booking.createPublicBooking(request(startsAt), {
      baseUrl: "https://easy4tutor.pl",
    });
    expect(
      (await store.getAppData(teacherId)).calendarBookings.some(
        (item) => item.startsAt === startsAt,
      ),
    ).toBe(true);
    await management.cancelGuestBooking(tokenFrom(confirmation.managementUrl));
    const stored = await store.queryStore((data) =>
      data.bookings?.find((item) => item.startsAt === startsAt),
    );
    expect(stored).toMatchObject({ status: "cancelled", cancelledBy: "guest" });
    expect(
      (await store.getAppData(teacherId)).calendarBookings.some(
        (item) => item.startsAt === startsAt,
      ),
    ).toBe(false);
    const date = formatInTimeZone(startsAt, "Europe/Warsaw", "yyyy-MM-dd");
    const reopened = await availability.getPublicTutorAvailability(
      "d27-anna",
      eventTypeId,
      date,
      date,
    );
    expect(
      reopened.days[0]?.slots.some((item) => item.startsAt === startsAt),
    ).toBe(true);
  });

  it("blocks anonymous cancellation after conversion and after the exact deadline", async () => {
    const converted = await booking.createPublicBooking(request(slot(7, 10)), {
      baseUrl: "https://easy4tutor.pl",
    });
    const convertedToken = tokenFrom(converted.managementUrl);
    await store.mutateStore((data) => {
      const record = data.bookings?.find(
        (item) => item.startsAt === slot(7, 10),
      );
      if (!record) throw new Error("missing converted booking fixture");
      record.status = "converted";
      record.studentId = "student-d27";
      record.lessonId = "lesson-d27";
      record.convertedAt = new Date().toISOString();
    });
    expect((await management.getGuestBooking(convertedToken)).canCancel).toBe(
      false,
    );
    await expect(
      management.cancelGuestBooking(convertedToken),
    ).rejects.toMatchObject({ body: { code: "BOOKING_CONVERTED" } });

    const deadline = await booking.createPublicBooking(request(slot(8, 10)), {
      baseUrl: "https://easy4tutor.pl",
    });
    const afterDeadline = new Date(Date.parse(slot(8, 10)) - 23 * 3_600_000);
    await expect(
      management.cancelGuestBooking(
        tokenFrom(deadline.managementUrl),
        afterDeadline,
      ),
    ).rejects.toMatchObject({
      body: { code: "BOOKING_CANCELLATION_DEADLINE" },
    });
  });

  it("uses the same canonical transition for tutor cancellation without guest deadline", async () => {
    const startsAt = slot(9, 10);
    await booking.createPublicBooking(request(startsAt), {
      baseUrl: "https://easy4tutor.pl",
    });
    const record = await store.queryStore((data) =>
      data.bookings?.find((item) => item.startsAt === startsAt),
    );
    const result = await management.cancelTutorBooking(
      teacherId,
      record!.bookingId,
      new Date(Date.parse(startsAt) - 30 * 60_000),
    );
    expect(result.status).toBe("cancelled");
    expect(
      await store.queryStore(
        (data) =>
          data.bookings?.find((item) => item.bookingId === record!.bookingId)
            ?.cancelledBy,
      ),
    ).toBe("tutor");
    expect(await booking.getOwnPublicBookings(teacherId)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          bookingId: record!.bookingId,
          status: "cancelled",
        }),
      ]),
    );
    await expect(
      management.cancelTutorBooking(otherTeacherId, record!.bookingId),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("creates a valid, timezone-safe ICS without private data", async () => {
    const confirmation = await booking.createPublicBooking(
      request(slot(10, 12), { message: "PRIVATE NOTE" }),
      { baseUrl: "https://easy4tutor.pl" },
    );
    const token = tokenFrom(confirmation.managementUrl);
    const content = buildBookingIcs({
      booking: await management.getGuestBooking(token),
      reference: management.hashBookingManagementToken(token).slice(0, 24),
      managementUrl: confirmation.managementUrl,
      generatedAt: new Date("2026-10-01T10:00:00.000Z"),
    });
    expect(content).toContain("BEGIN:VCALENDAR\r\nVERSION:2.0");
    expect(content).toContain("DTSTART:");
    expect(content).toContain("DTEND:");
    expect(content).toContain("X-WR-TIMEZONE:Europe/Warsaw");
    expect(content).toContain("Anna Kowalska");
    expect(content).not.toContain(teacherId);
    expect(content).not.toContain("PRIVATE NOTE");
    expect(content).not.toContain("workspace");
  });

  it("keeps the committed booking when email delivery fails", async () => {
    const startsAt = slot(11, 10);
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const confirmation = await booking.createPublicBooking(request(startsAt), {
      baseUrl: "https://easy4tutor.pl",
      emailSender: async () => {
        throw new Error("provider unavailable secret-detail");
      },
    });
    expect(confirmation.managementUrl).toContain("/rezerwacja/");
    expect(
      await store.queryStore((data) =>
        data.bookings?.some(
          (item) => item.startsAt === startsAt && item.status === "confirmed",
        ),
      ),
    ).toBe(true);
    expect(log).toHaveBeenCalledWith(
      "Booking confirmation email failed",
      expect.objectContaining({ reason: "Error" }),
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret-detail");
    log.mockRestore();
  });
});

describe("D2.8 guest rescheduling", () => {
  it("moves atomically, releases the old slot, blocks the new slot, updates ICS and emails the new time", async () => {
    const oldStart = slot(12, 9);
    const newStart = slot(13, 11);
    const confirmation = await booking.createPublicBooking(request(oldStart), {
      baseUrl: "https://easy4tutor.pl",
    });
    const token = tokenFrom(confirmation.managementUrl);
    const sender = vi.fn(async () => undefined);
    const moved = await management.rescheduleGuestBooking(token, newStart, {
      baseUrl: "https://easy4tutor.pl",
      emailSender: sender,
    });
    expect(moved).toMatchObject({
      startsAt: newStart,
      rescheduleCount: 1,
      canReschedule: true,
    });
    expect(sender).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "rescheduled",
        startsAt: newStart,
        managementUrl: confirmation.managementUrl,
        calendarUrl: `${confirmation.managementUrl}/kalendarz.ics`,
      }),
    );
    const oldDate = formatInTimeZone(oldStart, "Europe/Warsaw", "yyyy-MM-dd");
    const newDate = formatInTimeZone(newStart, "Europe/Warsaw", "yyyy-MM-dd");
    expect(
      (
        await availability.getPublicTutorAvailability(
          "d27-anna",
          eventTypeId,
          oldDate,
          oldDate,
        )
      ).days[0]?.slots.some((item) => item.startsAt === oldStart),
    ).toBe(true);
    expect(
      (
        await availability.getPublicTutorAvailability(
          "d27-anna",
          eventTypeId,
          newDate,
          newDate,
        )
      ).days[0]?.slots.some((item) => item.startsAt === newStart),
    ).toBe(false);
    const ics = buildBookingIcs({
      booking: await management.getGuestBooking(token),
      reference: management.hashBookingManagementToken(token).slice(0, 24),
      managementUrl: confirmation.managementUrl,
      generatedAt: new Date("2026-10-01T10:00:00.000Z"),
    });
    expect(ics).toContain("SEQUENCE:1");
    expect(ics).toContain(
      `DTSTART:${new Date(newStart)
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}Z$/, "Z")}`,
    );
  });

  it("keeps the old booking when the target is occupied and permits only one concurrent winner", async () => {
    const first = await booking.createPublicBooking(request(slot(14, 9)), {
      baseUrl: "https://easy4tutor.pl",
    });
    const second = await booking.createPublicBooking(
      request(slot(14, 11), { email: "second@example.test" }),
      { baseUrl: "https://easy4tutor.pl" },
    );
    const target = slot(15, 10);
    const results = await Promise.allSettled([
      management.rescheduleGuestBooking(
        tokenFrom(first.managementUrl),
        target,
        { baseUrl: "https://easy4tutor.pl" },
      ),
      management.rescheduleGuestBooking(
        tokenFrom(second.managementUrl),
        target,
        { baseUrl: "https://easy4tutor.pl" },
      ),
    ]);
    expect(results.filter((item) => item.status === "fulfilled")).toHaveLength(
      1,
    );
    expect(results.filter((item) => item.status === "rejected")).toHaveLength(
      1,
    );
    const stored = await store.queryStore((data) =>
      data.bookings?.filter(
        (item) => item.startsAt === target && item.status === "confirmed",
      ),
    );
    expect(stored).toHaveLength(1);
    const loserOriginals = await store.queryStore((data) =>
      data.bookings?.filter(
        (item) =>
          [slot(14, 9), slot(14, 11)].includes(item.startsAt) &&
          item.status === "confirmed",
      ),
    );
    expect(loserOriginals).toHaveLength(1);
  });

  it("enforces deadline and blocks cancelled or converted bookings", async () => {
    const deadlineStart = slot(16, 10);
    const deadline = await booking.createPublicBooking(request(deadlineStart), {
      baseUrl: "https://easy4tutor.pl",
    });
    await expect(
      management.rescheduleGuestBooking(
        tokenFrom(deadline.managementUrl),
        slot(17, 10),
        {
          now: new Date(Date.parse(deadlineStart) - 23 * 3_600_000),
          baseUrl: "https://easy4tutor.pl",
        },
      ),
    ).rejects.toMatchObject({
      body: { code: "BOOKING_RESCHEDULE_DEADLINE" },
    });

    const cancelled = await booking.createPublicBooking(request(slot(18, 10)), {
      baseUrl: "https://easy4tutor.pl",
    });
    const cancelledToken = tokenFrom(cancelled.managementUrl);
    await management.cancelGuestBooking(cancelledToken);
    await expect(
      management.rescheduleGuestBooking(cancelledToken, slot(19, 10), {
        baseUrl: "https://easy4tutor.pl",
      }),
    ).rejects.toMatchObject({ body: { code: "BOOKING_CANCELLED" } });

    const converted = await booking.createPublicBooking(request(slot(20, 10)), {
      baseUrl: "https://easy4tutor.pl",
    });
    const convertedToken = tokenFrom(converted.managementUrl);
    await store.mutateStore((data) => {
      const record = data.bookings?.find(
        (item) => item.startsAt === slot(20, 10),
      );
      if (!record) throw new Error("missing converted fixture");
      record.status = "converted";
      record.studentId = "student-d28";
      record.lessonId = "lesson-d28";
      record.convertedAt = new Date().toISOString();
    });
    await expect(
      management.rescheduleGuestBooking(convertedToken, slot(21, 10), {
        baseUrl: "https://easy4tutor.pl",
      }),
    ).rejects.toMatchObject({ body: { code: "BOOKING_CONVERTED" } });
  });
});
