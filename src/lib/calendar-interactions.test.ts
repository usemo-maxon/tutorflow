import { describe, expect, it, vi } from "vitest";
import type { AppData, CalendarBlock, Lesson } from "./domain";
import {
  blockDragEntry,
  blockPresetFromCalendarRange,
  buildCalendarMoveAction,
  calendarBounds,
  calendarMinuteFromPointer,
  calendarQueryRange,
  calendarRangeFromMinutes,
  canDragCalendarLesson,
  dragDurationMinutes,
  isCalendarRangeDrag,
  lessonDragEntry,
  lessonPresetFromCalendarRange,
  moveCalendarEntryOptimistically,
  runOptimisticCalendarMove,
} from "./calendar-interactions";

const lesson = {
  id: "lesson-1",
  color: "#6F8FEF",
  participantIds: ["student-1"],
  startsAt: "2035-01-10T16:00:00.000Z",
  durationMinutes: 60,
  format: "online",
  location: "https://example.test/lesson",
  price: { amount: 12_345, currency: "PLN" },
  mode: "single",
  status: "scheduled",
  syncStatus: "disabled",
  topic: "Present perfect",
  subject: "English",
  updatedAt: "2035-01-01T10:00:00.000Z",
} as Lesson;
const block = {
  id: "block-1",
  title: "Prywatne",
  color: "#7F8A9A",
  startsAt: "2035-01-10T18:00:00.000Z",
  endsAt: "2035-01-10T19:30:00.000Z",
  timezone: "Europe/Warsaw",
  createdAt: "2035-01-01T10:00:00.000Z",
  updatedAt: "2035-01-01T10:00:00.000Z",
} satisfies CalendarBlock;
const data = {
  lessons: [lesson],
  calendarBlocks: [block],
} as AppData;

describe("calendar drag and selection interactions", () => {
  it("moves a single lesson optimistically while preserving its duration", () => {
    const entry = lessonDragEntry(lesson);
    const moved = moveCalendarEntryOptimistically(
      data,
      entry,
      "2035-01-10T20:00:00.000Z",
    );
    expect(moved.lessons[0]).toMatchObject({
      startsAt: "2035-01-10T20:00:00.000Z",
      durationMinutes: 60,
    });
    expect({ ...moved.lessons[0], startsAt: lesson.startsAt }).toEqual(lesson);
    expect(
      buildCalendarMoveAction(
        entry,
        moved.lessons[0].startsAt,
        "Europe/Warsaw",
      ),
    ).toMatchObject({
      type: "rescheduleLesson",
      lessonId: lesson.id,
      expectedUpdatedAt: lesson.updatedAt,
    });
  });

  it("keeps the recurring drag scope explicit in the persisted action", () => {
    const recurring = {
      ...lesson,
      mode: "recurring",
      seriesId: "series-1",
      recurrenceOriginalStartsAt: lesson.startsAt,
      status: "scheduled",
    } as Lesson;
    const entry = lessonDragEntry(recurring);

    expect(
      buildCalendarMoveAction(
        entry,
        "2035-01-11T17:00:00.000Z",
        "Europe/Warsaw",
        false,
        "single",
      ),
    ).toMatchObject({ scope: "single" });
    expect(
      buildCalendarMoveAction(
        entry,
        "2035-01-11T17:00:00.000Z",
        "Europe/Warsaw",
        false,
        "future",
      ),
    ).toMatchObject({ scope: "future" });
    expect(
      buildCalendarMoveAction(
        entry,
        "2035-01-11T17:00:00.000Z",
        "Europe/Warsaw",
        true,
        "future",
      ),
    ).toMatchObject({ scope: "future", allowOutsideAvailability: true });
  });

  it.each([30, 90, 240])(
    "moves a %i-minute CalendarBlock without changing its identity or metadata",
    (durationMinutes) => {
      const source = {
        ...block,
        endsAt: new Date(
          new Date(block.startsAt).getTime() + durationMinutes * 60_000,
        ).toISOString(),
      };
      const sourceData = { ...data, calendarBlocks: [source] } as AppData;
      const entry = blockDragEntry(source);
      const startsAt = "2035-01-11T09:00:00.000Z";
      const moved = moveCalendarEntryOptimistically(
        sourceData,
        entry,
        startsAt,
      );
      expect(dragDurationMinutes(entry)).toBe(durationMinutes);
      expect(moved.calendarBlocks[0]).toEqual({
        ...source,
        startsAt,
        endsAt: new Date(
          new Date(startsAt).getTime() + durationMinutes * 60_000,
        ).toISOString(),
      });
      expect(
        buildCalendarMoveAction(entry, startsAt, source.timezone),
      ).toMatchObject({
        type: "updateCalendarBlock",
        blockId: source.id,
        expectedUpdatedAt: source.updatedAt,
        block: {
          title: source.title,
          color: source.color,
          timezone: source.timezone,
        },
      });
      expect(moved.lessons).toEqual(sourceData.lessons);
    },
  );

  it.each([
    [9 * 60 + 7, 9 * 60],
    [9 * 60 + 16, 9 * 60 + 30],
    [9 * 60 + 44, 9 * 60 + 30],
    [9 * 60 + 46, 10 * 60],
  ])("snaps minute %i to %i", (rawMinute, expected) => {
    expect(
      calendarMinuteFromPointer({
        clientY: ((rawMinute - 7 * 60) / 60) * 68,
        columnTop: 0,
        startHour: 7,
        endHour: 22,
      }),
    ).toBe(expected);
  });

  it.each([30, 60, 90, 120])(
    "clamps a %i-minute drag at both calendar bounds",
    (durationMinutes) => {
      expect(
        calendarMinuteFromPointer({
          clientY: -500,
          columnTop: 0,
          startHour: 7,
          endHour: 22,
          durationMinutes,
        }),
      ).toBe(7 * 60);
      expect(
        calendarMinuteFromPointer({
          clientY: 5000,
          columnTop: 0,
          startHour: 7,
          endHour: 22,
          durationMinutes,
        }),
      ).toBe(22 * 60 - durationMinutes);
    },
  );

  it("turns a dragged range into exact composer prefills", () => {
    const range = calendarRangeFromMinutes("2035-01-10", 16 * 60, 17 * 60 + 30);
    expect(range).toEqual({
      date: "2035-01-10",
      start: "16:00",
      end: "17:30",
      durationMinutes: 90,
    });
    expect(lessonPresetFromCalendarRange(range, ["student-1"])).toEqual({
      studentIds: ["student-1"],
      date: "2035-01-10",
      time: "16:00",
      durationMinutes: 90,
    });
    expect(blockPresetFromCalendarRange(range)).toEqual({
      date: "2035-01-10",
      start: "16:00",
      end: "17:30",
    });
  });

  it("normalizes reverse and same-slot range selections", () => {
    const forward = calendarRangeFromMinutes(
      "2035-01-10",
      16 * 60,
      17 * 60 + 30,
    );
    expect(
      calendarRangeFromMinutes("2035-01-10", 17 * 60 + 30, 16 * 60),
    ).toEqual(forward);
    expect(calendarRangeFromMinutes("2035-01-10", 16 * 60, 16 * 60)).toEqual({
      date: "2035-01-10",
      start: "16:00",
      end: "16:30",
      durationMinutes: 30,
    });
  });

  it("keeps slight pointer movement as a click until the 6px threshold", () => {
    expect(isCalendarRangeDrag(100, 105)).toBe(false);
    expect(isCalendarRangeDrag(100, 94)).toBe(true);
    expect(isCalendarRangeDrag(100, 106)).toBe(true);
  });

  it("enforces lesson drag guards for read-only, cancelled, and completed rows", () => {
    expect(canDragCalendarLesson(lesson, false)).toBe(true);
    expect(
      canDragCalendarLesson({ ...lesson, status: "cancelled" }, false),
    ).toBe(false);
    expect(
      canDragCalendarLesson({ ...lesson, status: "completed" }, false),
    ).toBe(false);
    expect(
      canDragCalendarLesson(
        { ...lesson, status: "completed", mode: "recurring" },
        false,
      ),
    ).toBe(true);
    expect(canDragCalendarLesson(lesson, true)).toBe(false);
  });

  it("uses a stable empty-day fallback and includes early and late entries", () => {
    expect(calendarBounds([], "Europe/Warsaw")).toEqual({
      startHour: 7,
      endHour: 22,
    });
    const early = {
      ...lesson,
      startsAt: "2035-01-10T04:30:00.000Z",
    };
    const late = {
      ...lesson,
      id: "lesson-late",
      startsAt: "2035-01-10T21:30:00.000Z",
      durationMinutes: 60,
    };
    expect(calendarBounds([early, late], "Europe/Warsaw")).toEqual({
      startHour: 5,
      endHour: 24,
    });
    const boundedData = {
      ...data,
      lessons: [],
      calendarBlocks: [
        {
          ...block,
          startsAt: "2035-01-10T21:00:00.000Z",
          endsAt: "2035-01-10T22:30:00.000Z",
        },
      ],
      externalGoogleEvents: [
        {
          id: "google-1",
          title: "Early Google event",
          startsAt: "2035-01-10T02:15:00.000Z",
          endsAt: "2035-01-10T03:15:00.000Z",
          allDay: false,
          status: "confirmed",
          transparency: "opaque",
          color: "#4285F4",
          readOnly: true,
          blocksTime: true,
        },
      ],
    } as AppData;
    expect(calendarBounds([], "Europe/Warsaw", boundedData)).toEqual({
      startHour: 3,
      endHour: 24,
    });
  });

  it("builds Monday-first, month, and DST-short-day query ranges", () => {
    expect(
      calendarQueryRange(
        new Date("2026-01-04T12:00:00.000Z"),
        "week",
        "Europe/Warsaw",
      ),
    ).toEqual({
      start: "2025-12-28T23:00:00.000Z",
      end: "2026-01-04T23:00:00.000Z",
    });
    expect(
      calendarQueryRange(
        new Date("2026-02-15T12:00:00.000Z"),
        "month",
        "Europe/Warsaw",
      ),
    ).toEqual({
      start: "2026-01-31T23:00:00.000Z",
      end: "2026-02-28T23:00:00.000Z",
    });
    expect(
      calendarQueryRange(
        new Date("2026-03-29T12:00:00.000Z"),
        "day",
        "Europe/Warsaw",
      ),
    ).toEqual({
      start: "2026-03-28T23:00:00.000Z",
      end: "2026-03-29T22:00:00.000Z",
    });
  });

  it("keeps the optimistic value after persistence succeeds", async () => {
    let current = data;
    const rollback = vi.fn();
    await runOptimisticCalendarMove({
      apply: () => {
        current = moveCalendarEntryOptimistically(
          data,
          lessonDragEntry(lesson),
          "2035-01-10T20:00:00.000Z",
        );
      },
      persist: () => Promise.resolve(),
      rollback,
    });
    expect(current.lessons[0].startsAt).toBe("2035-01-10T20:00:00.000Z");
    expect(rollback).not.toHaveBeenCalled();
  });

  it("rolls the optimistic value back when persistence fails", async () => {
    let current = data;
    const apply = vi.fn(() => {
      current = moveCalendarEntryOptimistically(
        data,
        lessonDragEntry(lesson),
        "2035-01-10T20:00:00.000Z",
      );
    });
    const rollback = vi.fn(() => {
      current = data;
    });
    await expect(
      runOptimisticCalendarMove({
        apply,
        persist: () => Promise.reject(new Error("network")),
        rollback,
      }),
    ).rejects.toThrow("network");
    expect(apply).toHaveBeenCalledOnce();
    expect(rollback).toHaveBeenCalledOnce();
    expect(current.lessons[0].startsAt).toBe(lesson.startsAt);
  });
});
