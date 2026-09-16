import { describe, expect, it } from "vitest";
import {
  consumePackageUnit,
  generateWeeklyOccurrences,
  packageBalance,
  reversePackageUsage,
} from "./lesson";

describe("recurring lesson representation", () => {
  it("keeps Warsaw wall-clock time stable across CET to CEST", () => {
    const occurrences = generateWeeklyOccurrences({
      startDate: "2026-03-23",
      startTime: "17:00",
      timezone: "Europe/Warsaw",
      daysOfWeek: [1],
      intervalWeeks: 1,
      count: 3,
    });
    expect(occurrences).toEqual([
      "2026-03-23T16:00:00.000Z",
      "2026-03-30T15:00:00.000Z",
      "2026-04-06T15:00:00.000Z",
    ]);
  });

  it("supports multiple weekdays and a finite end date", () => {
    expect(
      generateWeeklyOccurrences({
        startDate: "2026-09-14",
        startTime: "09:00",
        timezone: "Europe/Warsaw",
        daysOfWeek: [1, 3],
        intervalWeeks: 1,
        count: 20,
        endDate: "2026-09-23",
      }),
    ).toHaveLength(4);
  });

  it("keeps Warsaw wall-clock time stable across CEST to CET", () => {
    expect(
      generateWeeklyOccurrences({
        startDate: "2026-10-19",
        startTime: "17:00",
        timezone: "Europe/Warsaw",
        daysOfWeek: [1],
        intervalWeeks: 1,
        count: 3,
      }),
    ).toEqual([
      "2026-10-19T15:00:00.000Z",
      "2026-10-26T16:00:00.000Z",
      "2026-11-02T16:00:00.000Z",
    ]);
  });

  it("supports every two weeks on multiple weekdays", () => {
    expect(
      generateWeeklyOccurrences({
        startDate: "2026-09-14",
        startTime: "18:00",
        timezone: "Europe/Warsaw",
        daysOfWeek: [1, 3],
        intervalWeeks: 2,
        count: 4,
      }).map((value) => value.slice(0, 10)),
    ).toEqual(["2026-09-14", "2026-09-16", "2026-09-28", "2026-09-30"]);
  });
});

describe("package ledger", () => {
  it("consumes exactly once for retries and reverses exactly once", () => {
    const empty = { totalLessons: 2, usages: [] };
    const consumed = consumePackageUnit(empty, "lesson-1", "complete-lesson-1");
    const retried = consumePackageUnit(
      consumed,
      "lesson-1",
      "complete-lesson-1-retry",
    );
    expect(packageBalance(retried)).toBe(1);
    expect(retried.usages).toHaveLength(1);

    const reversed = reversePackageUsage(retried, "lesson-1", "undo-lesson-1");
    const reversalRetry = reversePackageUsage(
      reversed,
      "lesson-1",
      "undo-lesson-1-retry",
    );
    expect(packageBalance(reversalRetry)).toBe(2);
    expect(reversalRetry.usages).toHaveLength(2);
  });
});
