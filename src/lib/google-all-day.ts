import type { ExternalGoogleEvent } from "./domain";

export const ALL_DAY_WEEK_VISIBLE_LANES = 2;
export const MONTH_VISIBLE_ITEMS = 3;

export function dateOnlyPrevious(date: string): string {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}

export function allDayEventOccursOn(
  event: Pick<ExternalGoogleEvent, "allDay" | "startDate" | "endDate">,
  day: string,
): boolean {
  return Boolean(
    event.allDay &&
    event.startDate &&
    event.endDate &&
    event.startDate <= day &&
    day < event.endDate,
  );
}

export interface AllDayWeekSegment {
  event: ExternalGoogleEvent;
  startIndex: number;
  span: number;
  lane: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
}

export function buildAllDayWeekSegments(
  events: ExternalGoogleEvent[],
  dayKeys: string[],
): { visible: AllDayWeekSegment[]; overflowByDay: number[] } {
  if (!dayKeys.length) return { visible: [], overflowByDay: [] };
  const rangeStart = dayKeys[0];
  const rangeEnd = dayKeys.at(-1)!;
  const laneEnds: number[] = [];
  const allSegments = events
    .filter(
      (event) =>
        event.visible !== false &&
        event.allDay &&
        event.startDate &&
        event.endDate &&
        event.startDate <= rangeEnd &&
        event.endDate > rangeStart,
    )
    .toSorted(
      (left, right) =>
        left.startDate!.localeCompare(right.startDate!) ||
        right.endDate!.localeCompare(left.endDate!) ||
        left.title.localeCompare(right.title),
    )
    .map((event) => {
      const firstCovered = dayKeys.findIndex((day) => day >= event.startDate!);
      const startIndex = Math.max(0, firstCovered);
      let endIndex = dayKeys.findIndex((day) => day >= event.endDate!);
      if (endIndex < 0) endIndex = dayKeys.length;
      let lane = laneEnds.findIndex((laneEnd) => laneEnd <= startIndex);
      if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = endIndex;
      return {
        event,
        startIndex,
        span: Math.max(1, endIndex - startIndex),
        lane,
        continuesBefore: event.startDate! < rangeStart,
        continuesAfter: event.endDate! > rangeEnd,
      };
    });
  const overflowByDay = dayKeys.map(
    (_, dayIndex) =>
      allSegments.filter(
        (segment) =>
          segment.lane >= ALL_DAY_WEEK_VISIBLE_LANES &&
          segment.startIndex <= dayIndex &&
          dayIndex < segment.startIndex + segment.span,
      ).length,
  );
  return {
    visible: allSegments.filter(
      (segment) => segment.lane < ALL_DAY_WEEK_VISIBLE_LANES,
    ),
    overflowByDay,
  };
}

export function monthContinuation(
  event: ExternalGoogleEvent,
  day: string,
): "single" | "start" | "middle" | "end" {
  if (!event.allDay || !event.startDate || !event.endDate) return "single";
  const lastDay = dateOnlyPrevious(event.endDate);
  if (event.startDate === day && lastDay === day) return "single";
  if (event.startDate === day) return "start";
  if (lastDay === day) return "end";
  return "middle";
}
