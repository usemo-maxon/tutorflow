import {
  isActivePublicBooking,
  type PublicBookingRecord,
} from "./public-booking";

export function selectNewBookings(
  bookings: PublicBookingRecord[],
  teacherId: string,
  now: Date,
) {
  return bookings
    .filter(
      (booking) =>
        booking.teacherId === teacherId &&
        isActivePublicBooking(booking) &&
        Date.parse(booking.endsAt) > now.getTime(),
    )
    .sort(
      (a, b) =>
        Date.parse(b.createdAt) - Date.parse(a.createdAt) ||
        a.bookingId.localeCompare(b.bookingId),
    );
}
