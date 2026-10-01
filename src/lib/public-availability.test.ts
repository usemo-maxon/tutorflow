import { describe, expect, it } from "vitest";
import { calculatePublicAvailability } from "./public-availability";

const baseData = (overrides: Record<string, unknown> = {}) =>
  ({
    availability: [
      {
        id: "hours",
        kind: "recurring",
        label: "Godziny pracy",
        weekday: 1,
        isAvailable: true,
        start: "2026-01-01T08:00:00.000Z",
        end: "2026-01-01T10:00:00.000Z",
      },
    ],
    availabilityExceptions: [],
    lessons: [],
    calendarBlocks: [],
    externalGoogleEvents: [],
    integrations: { google: { status: "connected" } },
    ...overrides,
  }) as never;

const calculate = (data = baseData(), overrides = {}) =>
  calculatePublicAvailability({
    data,
    timezone: "UTC",
    durationMinutes: 60,
    startDate: "2026-01-05",
    endDate: "2026-01-05",
    settings: {
      minimumNoticeHours: 0,
      bookingHorizonDays: 30,
      cancellationNoticeHours: 24,
    },
    now: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  });

describe("calculatePublicAvailability", () => {
  it("only offers starts whose whole event fits an availability window", () => {
    const slots = calculate()[0].slots;
    expect(slots.map((slot) => slot.startsAt.slice(11, 16))).toEqual([
      "08:00",
      "08:15",
      "08:30",
      "08:45",
      "09:00",
    ]);
  });

  it("removes overlaps from lessons and calendar blocks", () => {
    const lesson = calculate(
      baseData({
        lessons: [
          {
            startsAt: "2026-01-05T08:30:00.000Z",
            durationMinutes: 60,
            status: "scheduled",
          },
        ],
        calendarBlocks: [
          {
            startsAt: "2026-01-05T08:00:00.000Z",
            endsAt: "2026-01-05T08:30:00.000Z",
          },
        ],
      }),
    )[0].slots;
    expect(lesson).toEqual([]);
  });

  it("uses the same confirmed-unconverted booking state as the active schedule", () => {
    const bookings = [
      {
        startsAt: "2026-01-05T08:30:00.000Z",
        endsAt: "2026-01-05T09:30:00.000Z",
        status: "confirmed" as const,
      },
      {
        startsAt: "2026-01-05T09:30:00.000Z",
        endsAt: "2026-01-05T10:00:00.000Z",
        status: "cancelled" as const,
      },
      {
        startsAt: "2026-01-05T09:30:00.000Z",
        endsAt: "2026-01-05T10:00:00.000Z",
        status: "converted" as const,
      },
    ];
    const slots = calculate(baseData(), { bookings })[0].slots;

    expect(slots.map((slot) => slot.startsAt.slice(11, 16))).toEqual([]);
    expect(
      calculate(baseData(), {
        bookings: bookings.filter((booking) => booking.status !== "confirmed"),
      })[0].slots,
    ).toHaveLength(5);
  });

  it("respects availability exceptions", () => {
    const slots = calculate(
      baseData({
        availabilityExceptions: [
          {
            id: "holiday",
            date: "2026-01-05",
            kind: "unavailable",
            timezone: "UTC",
            reason: "",
          },
        ],
      }),
    )[0].slots;
    expect(slots).toEqual([]);
  });

  it("uses synchronized blocking Google events only for a connected integration", () => {
    const blocked = calculate(
      baseData({
        externalGoogleEvents: [
          {
            startsAt: "2026-01-05T09:00:00.000Z",
            endsAt: "2026-01-05T10:00:00.000Z",
            allDay: false,
            status: "confirmed",
            blocksTime: true,
          },
        ],
      }),
    )[0].slots;
    expect(blocked.map((slot) => slot.startsAt.slice(11, 16))).toEqual([
      "08:00",
    ]);

    const withoutGoogle = calculate(
      baseData({
        integrations: { google: { status: "not_connected" } },
        externalGoogleEvents: [
          {
            startsAt: "2026-01-05T09:00:00.000Z",
            endsAt: "2026-01-05T10:00:00.000Z",
            allDay: false,
            status: "confirmed",
            blocksTime: true,
          },
        ],
      }),
    )[0].slots;
    expect(withoutGoogle).toHaveLength(5);
  });

  it("enforces minimum notice and booking horizon", () => {
    const notice = calculate(baseData(), {
      data: baseData({
        availability: [
          {
            id: "hours",
            kind: "recurring",
            label: "Godziny pracy",
            weekday: 1,
            isAvailable: true,
            start: "2026-01-01T08:00:00.000Z",
            end: "2026-01-01T11:00:00.000Z",
          },
        ],
      }),
      now: new Date("2026-01-05T08:10:00.000Z"),
      settings: {
        minimumNoticeHours: 1,
        bookingHorizonDays: 30,
        cancellationNoticeHours: 24,
      },
    })[0].slots;
    expect(notice.map((slot) => slot.startsAt.slice(11, 16))).toEqual([
      "09:15",
      "09:30",
      "09:45",
      "10:00",
    ]);

    const horizon = calculate(baseData(), {
      startDate: "2026-02-05",
      endDate: "2026-02-05",
      settings: {
        minimumNoticeHours: 0,
        bookingHorizonDays: 30,
        cancellationNoticeHours: 24,
      },
    })[0].slots;
    expect(horizon).toEqual([]);
  });

  it("uses tutor-local wall-clock times and skips DST-gap times", () => {
    const days = calculatePublicAvailability({
      data: baseData({
        availability: [
          {
            id: "sunday",
            kind: "recurring",
            label: "Godziny pracy",
            weekday: 7,
            isAvailable: true,
            allDay: true,
            start: "2026-01-04T00:00:00.000Z",
            end: "2026-01-04T23:59:00.000Z",
          },
        ],
      }),
      timezone: "Europe/Warsaw",
      durationMinutes: 15,
      startDate: "2026-03-29",
      endDate: "2026-03-29",
      settings: {
        minimumNoticeHours: 0,
        bookingHorizonDays: 365,
        cancellationNoticeHours: 24,
      },
      now: new Date("2026-01-01T00:00:00.000Z"),
    });
    const localTimes = days[0].slots.map((slot) =>
      new Intl.DateTimeFormat("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Europe/Warsaw",
      }).format(new Date(slot.startsAt)),
    );
    expect(localTimes).not.toContain("02:00");
    expect(localTimes).toContain("03:00");
  });

  it("returns only dates and free slot timestamps", () => {
    const result = calculate();
    expect(Object.keys(result[0])).toEqual(["date", "slots"]);
    expect(Object.keys(result[0].slots[0])).toEqual(["startsAt", "endsAt"]);
  });
});
