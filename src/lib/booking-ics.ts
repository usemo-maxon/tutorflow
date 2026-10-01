import type { GuestBooking } from "./public-booking";

const escapeIcs = (value: string) =>
  value
    .replaceAll("\\", "\\\\")
    .replaceAll("\r\n", "\\n")
    .replaceAll("\n", "\\n")
    .replaceAll(",", "\\,")
    .replaceAll(";", "\\;");

const utcTimestamp = (value: string) =>
  new Date(value)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");

function foldIcsLine(line: string) {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = "";
  let limit = 75;
  for (const character of line) {
    if (encoder.encode(current + character).length > limit) {
      parts.push(current);
      current = character;
      limit = 74;
    } else {
      current += character;
    }
  }
  parts.push(current);
  return parts.join("\r\n ");
}

export function buildBookingIcs(input: {
  booking: GuestBooking;
  reference: string;
  managementUrl: string;
  generatedAt?: Date;
}) {
  const { booking } = input;
  const location =
    booking.format === "online"
      ? "Online"
      : booking.publicLocation || "Stacjonarnie";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//easy4tutor//Booking//PL",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-TIMEZONE:${escapeIcs(booking.timezone)}`,
    "BEGIN:VEVENT",
    `UID:${escapeIcs(input.reference)}@easy4tutor.pl`,
    `DTSTAMP:${utcTimestamp((input.generatedAt ?? new Date()).toISOString())}`,
    `SEQUENCE:${booking.rescheduleCount ?? 0}`,
    `DTSTART:${utcTimestamp(booking.startsAt)}`,
    `DTEND:${utcTimestamp(booking.endsAt)}`,
    `SUMMARY:${escapeIcs(`${booking.eventTypeName} — ${booking.tutorPublicName}`)}`,
    `DESCRIPTION:${escapeIcs(`Rezerwacja easy4tutor z ${booking.tutorPublicName}. Zarządzaj rezerwacją: ${input.managementUrl}`)}`,
    `LOCATION:${escapeIcs(location)}`,
    `STATUS:${booking.status === "cancelled" ? "CANCELLED" : "CONFIRMED"}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ];
  return lines.map(foldIcsLine).join("\r\n");
}
