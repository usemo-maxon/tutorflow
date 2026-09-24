import type {
  AppAction,
  AppData,
  CalendarBlock,
  Lesson,
  RecurrenceMutationScope,
} from "./domain";
import { formatInTimeZone } from "date-fns-tz";
import { getWeekDays, localDateKey, localInputToUtc } from "./format";

export const CALENDAR_SNAP_MINUTES = 30;
export const CALENDAR_SELECTION_THRESHOLD_PX = 6;

export type CalendarView = "day" | "week" | "month" | "agenda";

export type CalendarLessonDragEntry = {
  kind: "lesson";
  id: string;
  startsAt: string;
  durationMinutes: number;
  updatedAt?: string;
  seriesId?: string;
  recurrenceOriginalStartsAt?: string;
  status: Lesson["status"];
  timezone?: string;
};

export type CalendarDragEntry =
  | CalendarLessonDragEntry
  | {
      kind: "block";
      id: string;
      title: string;
      color: string;
      startsAt: string;
      endsAt: string;
      timezone: string;
      updatedAt: string;
    };

export interface CalendarRangeSelection {
  date: string;
  start: string;
  end: string;
  durationMinutes: number;
}

export function lessonDragEntry(lesson: Lesson): CalendarDragEntry {
  return {
    kind: "lesson",
    id: lesson.id,
    startsAt: lesson.startsAt,
    durationMinutes: lesson.durationMinutes,
    updatedAt: lesson.updatedAt,
    seriesId: lesson.seriesId,
    recurrenceOriginalStartsAt: lesson.recurrenceOriginalStartsAt,
    status: lesson.status,
    timezone: lesson.timezone,
  };
}

export function blockDragEntry(block: CalendarBlock): CalendarDragEntry {
  return {
    kind: "block",
    id: block.id,
    title: block.title,
    color: block.color,
    startsAt: block.startsAt,
    endsAt: block.endsAt,
    timezone: block.timezone,
    updatedAt: block.updatedAt,
  };
}

export function dragDurationMinutes(entry: CalendarDragEntry): number {
  if (entry.kind === "lesson") return entry.durationMinutes;
  return Math.round(
    (new Date(entry.endsAt).getTime() - new Date(entry.startsAt).getTime()) /
      60_000,
  );
}

export function canDragCalendarLesson(
  lesson: Pick<Lesson, "mode" | "status">,
  readOnly: boolean,
): boolean {
  return (
    !readOnly &&
    lesson.status !== "cancelled" &&
    (lesson.status !== "completed" || lesson.mode === "recurring")
  );
}

export function isCalendarRangeDrag(startY: number, currentY: number): boolean {
  return Math.abs(currentY - startY) >= CALENDAR_SELECTION_THRESHOLD_PX;
}

export function calendarBounds(
  lessons: Lesson[],
  timezone: string,
  data?: AppData,
): { startHour: number; endHour: number } {
  const starts = lessons.map(
    (lesson) =>
      Number(formatInTimeZone(lesson.startsAt, timezone, "H")) +
      Number(formatInTimeZone(lesson.startsAt, timezone, "m")) / 60,
  );
  const available = (data?.availability ?? [])
    .filter((rule) => rule.isAvailable && !rule.allDay)
    .flatMap((rule) => [
      Number(formatInTimeZone(rule.start, timezone, "H")),
      Number(formatInTimeZone(rule.end, timezone, "H")),
    ]);
  const blockStarts = (data?.calendarBlocks ?? []).map((block) =>
    Number(formatInTimeZone(block.startsAt, timezone, "H")),
  );
  const blockEnds = (data?.calendarBlocks ?? []).map(
    (block) => Number(formatInTimeZone(block.endsAt, timezone, "H")) + 1,
  );
  const externalStarts = (data?.externalGoogleEvents ?? [])
    .filter((event) => !event.allDay && event.startsAt)
    .map(
      (event) =>
        Number(formatInTimeZone(event.startsAt!, timezone, "H")) +
        Number(formatInTimeZone(event.startsAt!, timezone, "m")) / 60,
    );
  const externalEnds = (data?.externalGoogleEvents ?? [])
    .filter((event) => !event.allDay && event.endsAt)
    .map(
      (event) =>
        Number(formatInTimeZone(event.endsAt!, timezone, "H")) +
        Number(formatInTimeZone(event.endsAt!, timezone, "m")) / 60,
    );
  return {
    startHour: Math.floor(
      Math.min(7, ...starts, ...available, ...blockStarts, ...externalStarts),
    ),
    endHour: Math.min(
      24,
      Math.ceil(
        Math.max(
          22,
          ...available,
          ...blockEnds,
          ...externalEnds,
          ...lessons.map(
            (lesson, index) => starts[index] + lesson.durationMinutes / 60,
          ),
        ),
      ),
    ),
  };
}

export function calendarQueryRange(
  anchor: Date,
  view: CalendarView,
  timezone: string,
): { start: string; end: string } {
  const anchorKey = localDateKey(anchor, timezone);
  const shiftDateKey = (dateKey: string, days: number) => {
    const date = new Date(`${dateKey}T00:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  };
  const monthStart = `${anchorKey.slice(0, 7)}-01`;
  const [year, month] = monthStart.split("-").map(Number);
  const nextMonth = new Date(Date.UTC(year, month, 1))
    .toISOString()
    .slice(0, 10);
  const weekStart = localDateKey(getWeekDays(anchor, timezone)[0], timezone);
  const startDate =
    view === "day" ? anchorKey : view === "month" ? monthStart : weekStart;
  const endDate =
    view === "day"
      ? shiftDateKey(anchorKey, 1)
      : view === "month"
        ? nextMonth
        : shiftDateKey(weekStart, 7);
  return {
    start: localInputToUtc(startDate, "00:00", timezone),
    end: localInputToUtc(endDate, "00:00", timezone),
  };
}

export function calendarMinuteFromPointer({
  clientY,
  columnTop,
  startHour,
  endHour,
  durationMinutes = CALENDAR_SNAP_MINUTES,
}: {
  clientY: number;
  columnTop: number;
  startHour: number;
  endHour: number;
  durationMinutes?: number;
}): number {
  const rawMinute = startHour * 60 + ((clientY - columnTop) / 68) * 60;
  const snapped =
    Math.round(rawMinute / CALENDAR_SNAP_MINUTES) * CALENDAR_SNAP_MINUTES;
  return Math.max(
    startHour * 60,
    Math.min(endHour * 60 - durationMinutes, snapped),
  );
}

export function calendarTimeFromMinute(minute: number): string {
  const hour = Math.floor(minute / 60);
  const minutes = minute % 60;
  return `${String(hour).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function calendarMinuteFromTime(time: string): number {
  const [hour = 0, minute = 0] = time.split(":").map(Number);
  return hour * 60 + minute;
}

export function calendarRangeFromMinutes(
  date: string,
  anchorMinute: number,
  currentMinute: number,
): CalendarRangeSelection {
  const startMinute = Math.min(anchorMinute, currentMinute);
  const endMinute = Math.max(
    startMinute + CALENDAR_SNAP_MINUTES,
    Math.max(anchorMinute, currentMinute),
  );
  return {
    date,
    start: calendarTimeFromMinute(startMinute),
    end: calendarTimeFromMinute(endMinute),
    durationMinutes: endMinute - startMinute,
  };
}

export function lessonPresetFromCalendarRange(
  range: CalendarRangeSelection,
  studentIds?: string[],
) {
  return {
    studentIds,
    date: range.date,
    time: range.start,
    durationMinutes: range.durationMinutes,
  };
}

export function blockPresetFromCalendarRange(range: CalendarRangeSelection) {
  return {
    date: range.date,
    start: range.start,
    end: range.end,
  };
}

export function buildCalendarMoveAction(
  entry: CalendarDragEntry,
  startsAt: string,
  timezone: string,
  allowOutsideAvailability = false,
  scope?: RecurrenceMutationScope,
): AppAction {
  if (entry.kind === "lesson") {
    return {
      type: "rescheduleLesson",
      lessonId: entry.id,
      startsAt,
      expectedUpdatedAt: entry.updatedAt,
      allowOutsideAvailability,
      scope,
    };
  }
  const endsAt = new Date(
    new Date(startsAt).getTime() + dragDurationMinutes(entry) * 60_000,
  ).toISOString();
  return {
    type: "updateCalendarBlock",
    blockId: entry.id,
    block: {
      title: entry.title,
      color: entry.color,
      startsAt,
      endsAt,
      timezone,
    },
    expectedUpdatedAt: entry.updatedAt,
  };
}

export function moveCalendarEntryOptimistically(
  data: AppData,
  entry: CalendarDragEntry,
  startsAt: string,
): AppData {
  if (entry.kind === "lesson") {
    return {
      ...data,
      lessons: data.lessons.map((lesson) =>
        lesson.id === entry.id ? { ...lesson, startsAt } : lesson,
      ),
    };
  }
  const endsAt = new Date(
    new Date(startsAt).getTime() + dragDurationMinutes(entry) * 60_000,
  ).toISOString();
  return {
    ...data,
    calendarBlocks: data.calendarBlocks.map((block) =>
      block.id === entry.id ? { ...block, startsAt, endsAt } : block,
    ),
  };
}

export async function runOptimisticCalendarMove({
  apply,
  persist,
  rollback,
}: {
  apply: () => void;
  persist: () => Promise<unknown>;
  rollback: () => void;
}): Promise<void> {
  apply();
  try {
    await persist();
  } catch (error) {
    rollback();
    throw error;
  }
}
