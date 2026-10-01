import { addDays, format, parseISO } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import type {
  AppData,
  AvailabilityException,
  AvailabilityRule,
} from "./domain";

export const PUBLIC_SLOT_INTERVAL_MINUTES = 15;
export const DEFAULT_BOOKING_AVAILABILITY = {
  minimumNoticeHours: 12,
  bookingHorizonDays: 30,
} as const;

export type BookingAvailabilitySettings = {
  minimumNoticeHours: number;
  bookingHorizonDays: number;
};

export type PublicAvailabilityDay = {
  date: string;
  slots: Array<{ startsAt: string; endsAt: string }>;
};

type AvailabilityInput = {
  data: Pick<
    AppData,
    | "availability"
    | "availabilityExceptions"
    | "calendarBlocks"
    | "externalGoogleEvents"
    | "integrations"
    | "lessons"
  >;
  timezone: string;
  durationMinutes: number;
  startDate: string;
  endDate: string;
  settings?: BookingAvailabilitySettings;
  bookings?: Array<{
    startsAt: string;
    endsAt: string;
    status: "confirmed" | "cancelled" | "converted";
  }>;
  now?: Date;
};

const minuteOfDay = (time: string) => {
  const [hour, minute] = time.slice(0, 5).split(":").map(Number);
  return hour * 60 + minute;
};

const toTime = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(
    minutes % 60,
  ).padStart(2, "0")}`;

const overlaps = (
  start: number,
  end: number,
  otherStart: number,
  otherEnd: number,
) => start < otherEnd && end > otherStart;

function isUnavailableByException(
  exceptions: AvailabilityException[],
  date: string,
  startMinute: number,
  endMinute: number,
) {
  return exceptions.some(
    (exception) =>
      exception.date === date &&
      exception.kind === "unavailable" &&
      (!exception.startTime ||
        !exception.endTime ||
        overlaps(
          startMinute,
          endMinute,
          minuteOfDay(exception.startTime),
          minuteOfDay(exception.endTime),
        )),
  );
}

function fitsAvailability(
  rules: AvailabilityRule[],
  exceptions: AvailabilityException[],
  timezone: string,
  date: string,
  weekday: number,
  startMinute: number,
  endMinute: number,
  startsAt: Date,
  endsAt: Date,
) {
  if (isUnavailableByException(exceptions, date, startMinute, endMinute)) {
    return false;
  }

  const availableExceptions = exceptions.filter(
    (exception) => exception.date === date && exception.kind === "available",
  );
  if (availableExceptions.length) {
    return availableExceptions.some(
      (exception) =>
        !exception.startTime ||
        !exception.endTime ||
        (startMinute >= minuteOfDay(exception.startTime) &&
          endMinute <= minuteOfDay(exception.endTime)),
    );
  }

  const unavailable = rules.filter((rule) => {
    if (rule.isAvailable) return false;
    if (rule.kind === "single") {
      return overlaps(
        startsAt.getTime(),
        endsAt.getTime(),
        Date.parse(rule.start),
        Date.parse(rule.end),
      );
    }
    if (rule.weekday !== weekday) return false;
    if (rule.allDay) return true;
    return overlaps(
      startMinute,
      endMinute,
      minuteOfDay(formatInTimeZone(rule.start, timezone, "HH:mm")),
      minuteOfDay(formatInTimeZone(rule.end, timezone, "HH:mm")),
    );
  });
  if (unavailable.length) return false;

  const weeklyAvailable = rules.filter(
    (rule) => rule.isAvailable && rule.kind === "recurring",
  );
  if (!weeklyAvailable.length) return true;
  return weeklyAvailable.some((rule) => {
    if (rule.weekday !== weekday) return false;
    if (rule.allDay) return true;
    const ruleStart = minuteOfDay(
      formatInTimeZone(rule.start, timezone, "HH:mm"),
    );
    const ruleEnd = minuteOfDay(formatInTimeZone(rule.end, timezone, "HH:mm"));
    return startMinute >= ruleStart && endMinute <= ruleEnd;
  });
}

function isBusy(
  data: AvailabilityInput["data"],
  bookings: NonNullable<AvailabilityInput["bookings"]>,
  start: Date,
  end: Date,
  date: string,
) {
  const startTime = start.getTime();
  const endTime = end.getTime();
  if (
    data.lessons.some(
      (lesson) =>
        lesson.status !== "cancelled" &&
        overlaps(
          startTime,
          endTime,
          Date.parse(lesson.startsAt),
          Date.parse(lesson.startsAt) + lesson.durationMinutes * 60_000,
        ),
    )
  ) {
    return true;
  }
  if (
    bookings.some(
      (booking) =>
        booking.status === "confirmed" &&
        overlaps(
          startTime,
          endTime,
          Date.parse(booking.startsAt),
          Date.parse(booking.endsAt),
        ),
    )
  ) {
    return true;
  }
  if (
    data.calendarBlocks.some((block) =>
      overlaps(
        startTime,
        endTime,
        Date.parse(block.startsAt),
        Date.parse(block.endsAt),
      ),
    )
  ) {
    return true;
  }
  if (data.integrations.google.status !== "connected") return false;
  return data.externalGoogleEvents.some((event) => {
    if (!event.blocksTime) return false;
    if (event.allDay) {
      return Boolean(
        event.startDate &&
        event.endDate &&
        date >= event.startDate &&
        date < event.endDate,
      );
    }
    return Boolean(
      event.startsAt &&
      event.endsAt &&
      overlaps(
        startTime,
        endTime,
        Date.parse(event.startsAt),
        Date.parse(event.endsAt),
      ),
    );
  });
}

/** Calculates public free slots and is rerun by the local booking command. */
export function calculatePublicAvailability({
  data,
  timezone,
  durationMinutes,
  startDate,
  endDate,
  settings = DEFAULT_BOOKING_AVAILABILITY,
  bookings = [],
  now = new Date(),
}: AvailabilityInput): PublicAvailabilityDay[] {
  const first = parseISO(startDate);
  const last = parseISO(endDate);
  const earliest = new Date(
    now.getTime() + settings.minimumNoticeHours * 3_600_000,
  );
  const latest = new Date(
    now.getTime() + settings.bookingHorizonDays * 86_400_000,
  );
  const days: PublicAvailabilityDay[] = [];

  for (let cursor = first; cursor <= last; cursor = addDays(cursor, 1)) {
    const date = format(cursor, "yyyy-MM-dd");
    const weekday = Number(format(cursor, "i"));
    const slots: PublicAvailabilityDay["slots"] = [];
    for (
      let startMinute = 0;
      startMinute + durationMinutes <= 24 * 60;
      startMinute += PUBLIC_SLOT_INTERVAL_MINUTES
    ) {
      const endMinute = startMinute + durationMinutes;
      const localStart = `${date}T${toTime(startMinute)}:00`;
      const startsAt = fromZonedTime(localStart, timezone);
      // Spring-forward wall times do not exist. Skip them rather than silently
      // presenting a different hour to the visitor.
      if (
        formatInTimeZone(startsAt, timezone, "yyyy-MM-dd'T'HH:mm:ss") !==
        localStart
      ) {
        continue;
      }
      const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);
      if (
        !fitsAvailability(
          data.availability,
          data.availabilityExceptions,
          timezone,
          date,
          weekday,
          startMinute,
          endMinute,
          startsAt,
          endsAt,
        )
      ) {
        continue;
      }
      if (
        startsAt < earliest ||
        startsAt > latest ||
        isBusy(data, bookings, startsAt, endsAt, date)
      ) {
        continue;
      }
      slots.push({
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
      });
    }
    days.push({ date, slots });
  }
  return days;
}

export function localDateForTimezone(timestamp: Date, timezone: string) {
  return formatInTimeZone(timestamp, timezone, "yyyy-MM-dd");
}
