import type { CalendarBooking } from "./domain";
import type { PublicBookingRecord } from "./public-booking";
import { isActivePublicBooking } from "./public-booking";

type BookingScheduleSource = Pick<
  PublicBookingRecord,
  | "bookingId"
  | "teacherId"
  | "guestName"
  | "eventTypeName"
  | "startsAt"
  | "endsAt"
  | "timezone"
  | "status"
  | "studentId"
  | "lessonId"
>;

export function selectCalendarBookings(
  bookings: BookingScheduleSource[],
  teacherId: string,
  range?: { start: string; end: string },
): CalendarBooking[] {
  return bookings
    .filter(
      (booking) =>
        booking.teacherId === teacherId &&
        isActivePublicBooking(booking) &&
        (!range ||
          (booking.startsAt < range.end && booking.endsAt > range.start)),
    )
    .map((booking): CalendarBooking => ({
      id: booking.bookingId,
      guestName: booking.guestName,
      eventTypeName: booking.eventTypeName,
      startsAt: booking.startsAt,
      endsAt: booking.endsAt,
      timezone: booking.timezone,
      status: "confirmed",
      readOnly: true,
    }))
    .sort((left, right) => left.startsAt.localeCompare(right.startsAt));
}

export function bookingDetailHref(bookingId: string): string {
  return `/app/rezerwacje/${encodeURIComponent(bookingId)}`;
}

export const BOOKING_CALENDAR_INTERACTION = {
  draggable: false,
  resizable: false,
} as const;
