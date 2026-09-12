import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { addDays } from "date-fns";
import type { LessonStatus, Money } from "./domain";
import { copy } from "./copy";

export function formatMoney(money: Money | null | undefined): string {
  if (!money) return "Lekcja próbna";
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: money.currency,
    minimumFractionDigits: money.amount % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(money.amount / 100);
}

export function formatDateTime(iso: string, timezone: string): string {
  return formatInTimeZone(iso, timezone, "d MMMM, HH:mm", { locale: plLocale });
}

export function formatTime(iso: string, timezone: string): string {
  return formatInTimeZone(iso, timezone, "HH:mm");
}

export function formatDay(iso: string | Date, timezone: string): string {
  return formatInTimeZone(iso, timezone, "EEEE, d MMMM", { locale: plLocale });
}

export function formatShortDay(iso: string | Date, timezone: string): string {
  return formatInTimeZone(iso, timezone, "EEE, d MMM", { locale: plLocale });
}

export function localDateKey(iso: string | Date, timezone: string): string {
  return formatInTimeZone(iso, timezone, "yyyy-MM-dd");
}

export function localInputToUtc(
  date: string,
  time: string,
  timezone: string,
): string {
  return fromZonedTime(`${date}T${time}:00`, timezone).toISOString();
}

export function recurrencePreview({
  date,
  time,
  timezone,
  frequency,
  count,
}: {
  date: string;
  time: string;
  timezone: string;
  frequency: "weekly" | "biweekly";
  count: number;
}): string[] {
  const safeCount = Math.min(Math.max(count, 1), 52);
  const baseDate = new Date(`${date}T00:00:00.000Z`);
  const step = frequency === "weekly" ? 1 : 2;
  return Array.from({ length: safeCount }, (_, index) => {
    const localOccurrence = new Date(baseDate);
    localOccurrence.setUTCDate(baseDate.getUTCDate() + index * step * 7);
    const localString = `${localOccurrence.toISOString().slice(0, 10)}T${time}:00`;
    return fromZonedTime(localString, timezone).toISOString();
  });
}

export function getWeekDays(anchor: Date, timezone: string): Date[] {
  const weekday = Number(formatInTimeZone(anchor, timezone, "i"));
  const start = addDays(anchor, 1 - weekday);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

export function statusLabel(status: LessonStatus): string {
  return copy.status[status];
}

export function lessonCountLabel(count: number): string {
  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;
  const noun =
    count === 1
      ? "lekcja"
      : lastDigit >= 2 &&
          lastDigit <= 4 &&
          !(lastTwoDigits >= 12 && lastTwoDigits <= 14)
        ? "lekcje"
        : "lekcji";
  return `${count} ${noun}`;
}

// date-fns locales are small static data; keeping this import here avoids locale setup in components.
import { pl as plLocale } from "date-fns/locale";
