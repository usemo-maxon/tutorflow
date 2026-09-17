import { describe, expect, it, vi } from "vitest";
import type { AppData, CalendarBlock, Lesson } from "./domain";
import {
  blockDragEntry,
  blockPresetFromCalendarRange,
  buildCalendarMoveAction,
  calendarRangeFromMinutes,
  dragDurationMinutes,
  lessonDragEntry,
  lessonPresetFromCalendarRange,
  moveCalendarEntryOptimistically,
  runOptimisticCalendarMove,
} from "./calendar-interactions";

const lesson = {
  id: "lesson-1",
  color: "#6F8FEF",
  startsAt: "2035-01-10T16:00:00.000Z",
  durationMinutes: 60,
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
  });

  it("moves a CalendarBlock without changing its type or duration", () => {
    const entry = blockDragEntry(block);
    const moved = moveCalendarEntryOptimistically(
      data,
      entry,
      "2035-01-11T09:00:00.000Z",
    );
    expect(dragDurationMinutes(entry)).toBe(90);
    expect(moved.calendarBlocks[0]).toMatchObject({
      id: block.id,
      title: block.title,
      startsAt: "2035-01-11T09:00:00.000Z",
      endsAt: "2035-01-11T10:30:00.000Z",
    });
    expect(moved.lessons).toEqual(data.lessons);
  });

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
