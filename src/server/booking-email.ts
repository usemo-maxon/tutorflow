import "server-only";

export type BookingConfirmationEmail = {
  deliveryKey: string;
  to: string;
  tutorPublicName: string;
  eventTypeName: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  format: "online" | "offline";
  publicLocation?: string;
  managementUrl: string;
  calendarUrl: string;
  kind?: "confirmation" | "rescheduled";
};

export type BookingEmailSender = (
  message: BookingConfirmationEmail,
) => Promise<void>;

export type BookingReminderEmail = Omit<
  BookingConfirmationEmail,
  "calendarUrl" | "format" | "publicLocation" | "kind"
> & { durationMinutes: number };

export type BookingReminderEmailSender = (
  message: BookingReminderEmail,
) => Promise<void>;

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

function emailDate(message: BookingConfirmationEmail) {
  const date = new Intl.DateTimeFormat("pl-PL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: message.timezone,
  }).format(new Date(message.startsAt));
  const time = (timestamp: string) =>
    new Intl.DateTimeFormat("pl-PL", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: message.timezone,
    }).format(new Date(timestamp));
  return `${date}, ${time(message.startsAt)}–${time(message.endsAt)}`;
}

/** The provider-specific HTTP call stays behind this server-only boundary. */
export const sendBookingConfirmationEmail: BookingEmailSender = async (
  message,
) => {
  if (process.env.NODE_ENV === "test") return;
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.BOOKING_EMAIL_FROM?.trim();
  if (!apiKey || !from) throw new Error("BOOKING_EMAIL_NOT_CONFIGURED");

  const format =
    message.format === "online"
      ? "Online"
      : message.publicLocation
        ? `Stacjonarnie — ${message.publicLocation}`
        : "Stacjonarnie";
  const date = emailDate(message);
  const rescheduled = message.kind === "rescheduled";
  const heading = rescheduled
    ? "Termin rezerwacji został zmieniony"
    : "Rezerwacja potwierdzona";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    signal: AbortSignal.timeout(8_000),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": message.deliveryKey,
    },
    body: JSON.stringify({
      from,
      to: [message.to],
      subject: `${rescheduled ? "Termin rezerwacji został zmieniony" : "Potwierdzenie rezerwacji"} — ${message.eventTypeName}`,
      text: [
        rescheduled
          ? "Termin rezerwacji został zmieniony."
          : "Twoja rezerwacja jest potwierdzona.",
        `Nauczyciel: ${message.tutorPublicName}`,
        `Zajęcia: ${message.eventTypeName}`,
        `Termin: ${date}`,
        `Strefa czasowa: ${message.timezone}`,
        `Format: ${format}`,
        `Zarządzaj rezerwacją: ${message.managementUrl}`,
        `Dodaj do kalendarza: ${message.calendarUrl}`,
      ].join("\n"),
      html: `<div style="font-family:Arial,sans-serif;color:#172033;line-height:1.55"><h1 style="font-size:24px">${heading}</h1><p><strong>${escapeHtml(message.tutorPublicName)}</strong><br>${escapeHtml(message.eventTypeName)}</p><p>${escapeHtml(date)}<br>${escapeHtml(message.timezone)}<br>${escapeHtml(format)}</p><p><a href="${escapeHtml(message.calendarUrl)}">${rescheduled ? "Zaktualizuj wydarzenie w kalendarzu" : "Dodaj do kalendarza"}</a></p><p><a href="${escapeHtml(message.managementUrl)}">Zobacz rezerwację</a></p></div>`,
    }),
  });
  if (!response.ok)
    throw new Error(`BOOKING_EMAIL_PROVIDER_${response.status}`);
};

export const sendBookingReminderEmail: BookingReminderEmailSender = async (
  message,
) => {
  if (process.env.NODE_ENV === "test") return;
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.BOOKING_EMAIL_FROM?.trim();
  if (!apiKey || !from) throw new Error("BOOKING_EMAIL_NOT_CONFIGURED");
  const starts = new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: message.timezone,
  }).format(new Date(message.startsAt));
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    signal: AbortSignal.timeout(8_000),
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": message.deliveryKey,
    },
    body: JSON.stringify({
      from,
      to: [message.to],
      subject: `Przypomnienie o lekcji — ${message.eventTypeName}`,
      text: [
        "Przypomnienie o lekcji",
        `Termin: ${starts}. Lekcja z ${message.tutorPublicName}.`,
        message.eventTypeName,
        `${message.durationMinutes} min`,
        `Strefa czasowa: ${message.timezone}`,
        `Zobacz rezerwację: ${message.managementUrl}`,
      ].join("\n"),
      html: `<div style="font-family:Arial,sans-serif;color:#172033;line-height:1.55"><h1 style="font-size:24px">Przypomnienie o lekcji</h1><p><strong>${escapeHtml(starts)}</strong><br>Lekcja z ${escapeHtml(message.tutorPublicName)}.</p><p>${escapeHtml(message.eventTypeName)}<br>${message.durationMinutes} min<br>${escapeHtml(message.timezone)}</p><p><a href="${escapeHtml(message.managementUrl)}">Zobacz rezerwację</a></p></div>`,
    }),
  });
  if (!response.ok)
    throw new Error(`BOOKING_EMAIL_PROVIDER_${response.status}`);
};
