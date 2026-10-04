import { describe, expect, it } from "vitest";
import type { PublicBookingRecord } from "./public-booking";
import { formatTime } from "./format";
import { selectNewBookings } from "./new-bookings";
import {
  BOOKING_CALENDAR_INTERACTION,
  bookingDetailHref,
  selectCalendarBookings,
} from "./booking-schedule";

function booking(
  bookingId: string,
  overrides: Partial<PublicBookingRecord> = {},
): PublicBookingRecord {
  return {
    bookingId,
    teacherId: "teacher-a",
    eventTypeId: "event-a",
    eventTypeName: "Pierwsze spotkanie",
    startsAt: "2026-10-02T15:30:00.000Z",
    endsAt: "2026-10-02T16:30:00.000Z",
    timezone: "Europe/Warsaw",
    durationMinutes: 60,
    priceGrosz: 10_000,
    currency: "PLN",
    format: "online",
    guestName: "Anna Nowak",
    guestEmail: "anna@example.test",
    guestPhone: "+48123456789",
    guestGoal: "Swobodniej mówić w pracy",
    guestMessage: "Prywatna wiadomość",
    status: "confirmed",
    createdAt: "2026-10-01T10:00:00.000Z",
    ...overrides,
  };
}

describe("new dashboard bookings", () => {
  it("shows active upcoming and ongoing bookings, newest signup first, even beyond the dashboard range", () => {
    const items = [
      booking("older"),
      booking("newest", {
        createdAt: "2026-10-02T12:00:00Z",
        startsAt: "2026-12-01T15:00:00Z",
        endsAt: "2026-12-01T16:00:00Z",
      }),
      booking("cancelled", { status: "cancelled" }),
      booking("converted", { status: "converted" }),
      booking("linked", { lessonId: "lesson-a" }),
      booking("foreign", { teacherId: "teacher-b" }),
      booking("ended", { endsAt: "2026-10-02T16:00:00Z" }),
    ];
    expect(
      selectNewBookings(
        items,
        "teacher-a",
        new Date("2026-10-02T16:00:00Z"),
      ).map((item) => item.bookingId),
    ).toEqual(["newest", "older"]);
    expect(items[0].bookingId).toBe("older");
  });

  it("handles an empty inbox", () => {
    expect(selectNewBookings([], "teacher-a", new Date())).toEqual([]);
  });
});

describe("booking schedule representation", () => {
  it("includes only confirmed unconverted bookings in the bounded tutor range", () => {
    const converted = booking("converted", {
      status: "converted",
      studentId: "student-a",
      lessonId: "lesson-a",
    });
    const result = selectCalendarBookings(
      [
        booking("visible"),
        booking("cancelled", { status: "cancelled" }),
        converted,
        booking("foreign", { teacherId: "teacher-b" }),
        booking("outside", {
          startsAt: "2026-11-02T15:30:00.000Z",
          endsAt: "2026-11-02T16:30:00.000Z",
        }),
      ],
      "teacher-a",
      {
        start: "2026-10-02T00:00:00.000Z",
        end: "2026-10-03T00:00:00.000Z",
      },
    );

    expect(result).toEqual([
      {
        id: "visible",
        guestName: "Anna Nowak",
        eventTypeName: "Pierwsze spotkanie",
        startsAt: "2026-10-02T15:30:00.000Z",
        endsAt: "2026-10-02T16:30:00.000Z",
        timezone: "Europe/Warsaw",
        status: "confirmed",
        readOnly: true,
      },
    ]);
    expect(formatTime(result[0].startsAt, result[0].timezone)).toBe("17:30");
  });

  it("does not expose guest contact details and stays read-only", () => {
    const [calendarBooking] = selectCalendarBookings(
      [booking("privacy")],
      "teacher-a",
    );
    expect(Object.keys(calendarBooking)).not.toContain("guestEmail");
    expect(Object.keys(calendarBooking)).not.toContain("guestPhone");
    expect(Object.keys(calendarBooking)).not.toContain("guestGoal");
    expect(Object.keys(calendarBooking)).not.toContain("guestMessage");
    expect(BOOKING_CALENDAR_INTERACTION).toEqual({
      draggable: false,
      resizable: false,
    });
    expect(bookingDetailHref("booking a/b")).toBe(
      "/app/rezerwacje/booking%20a%2Fb",
    );
  });
});
