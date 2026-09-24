import { describe, expect, it } from "vitest";
import {
  formatMoney,
  getWeekDays,
  lessonCountLabel,
  localDateKey,
  localInputToUtc,
  recurrencePreview,
} from "./format";

describe("formatMoney", () => {
  it("formats grosz without treating it as a float amount", () => {
    expect(formatMoney({ amount: 3900, currency: "PLN" })).toContain("39");
    expect(formatMoney(null)).toBe("Lekcja próbna");
    expect(formatMoney({ amount: 148140, currency: "PLN" })).toContain(
      "1481,40",
    );
  });
});

describe("timezone conversion", () => {
  it("keeps early-morning recurrence dates independent of the browser timezone", () => {
    const previous = process.env.TZ;
    process.env.TZ = "Europe/Warsaw";
    try {
      expect(
        recurrencePreview({
          date: "2026-09-07",
          time: "00:30",
          timezone: "Europe/Warsaw",
          frequency: "weekly",
          count: 2,
        }),
      ).toEqual(["2026-09-06T22:30:00.000Z", "2026-09-13T22:30:00.000Z"]);
    } finally {
      if (previous) process.env.TZ = previous;
      else delete process.env.TZ;
    }
  });
  it("converts Warsaw local time to UTC", () => {
    expect(localInputToUtc("2026-09-05", "14:30", "Europe/Warsaw")).toBe(
      "2026-09-05T12:30:00.000Z",
    );
  });

  it("keeps recurring wall time stable across DST", () => {
    const preview = recurrencePreview({
      date: "2026-03-22",
      time: "10:00",
      timezone: "Europe/Warsaw",
      frequency: "weekly",
      count: 2,
    });
    expect(preview).toEqual([
      "2026-03-22T09:00:00.000Z",
      "2026-03-29T08:00:00.000Z",
    ]);
  });

  it("keeps recurring wall time stable across the autumn DST transition", () => {
    expect(
      recurrencePreview({
        date: "2026-10-18",
        time: "18:00",
        timezone: "Europe/Warsaw",
        frequency: "weekly",
        count: 3,
      }),
    ).toEqual([
      "2026-10-18T16:00:00.000Z",
      "2026-10-25T17:00:00.000Z",
      "2026-11-01T17:00:00.000Z",
    ]);
  });

  it("rejects nonexistent and ambiguous Warsaw wall-clock times", () => {
    expect(() =>
      localInputToUtc("2026-03-29", "02:30", "Europe/Warsaw"),
    ).toThrow("NONEXISTENT_LOCAL_TIME");
    expect(() =>
      localInputToUtc("2026-10-25", "02:30", "Europe/Warsaw"),
    ).toThrow("AMBIGUOUS_LOCAL_TIME");
  });

  it("accepts valid times adjacent to Warsaw DST transitions", () => {
    expect(localInputToUtc("2026-03-29", "01:30", "Europe/Warsaw")).toBe(
      "2026-03-29T00:30:00.000Z",
    );
    expect(localInputToUtc("2026-03-29", "03:30", "Europe/Warsaw")).toBe(
      "2026-03-29T01:30:00.000Z",
    );
    expect(localInputToUtc("2026-10-25", "01:30", "Europe/Warsaw")).toBe(
      "2026-10-24T23:30:00.000Z",
    );
    expect(localInputToUtc("2026-10-25", "03:30", "Europe/Warsaw")).toBe(
      "2026-10-25T02:30:00.000Z",
    );
  });

  it("uses the selected IANA timezone instead of hardcoding Warsaw", () => {
    expect(localInputToUtc("2026-07-15", "18:00", "Europe/London")).toBe(
      "2026-07-15T17:00:00.000Z",
    );
    expect(localInputToUtc("2026-07-15", "18:00", "America/New_York")).toBe(
      "2026-07-15T22:00:00.000Z",
    );
  });
});

describe("Monday-first calendar weeks", () => {
  it.each([
    ["2026-01-04T12:00:00.000Z", "2025-12-29", "2026-01-04"],
    ["2026-12-31T12:00:00.000Z", "2026-12-28", "2027-01-03"],
  ])("maps %s to its Polish week", (anchor, first, last) => {
    const days = getWeekDays(new Date(anchor), "Europe/Warsaw");
    expect(localDateKey(days[0], "Europe/Warsaw")).toBe(first);
    expect(localDateKey(days[6], "Europe/Warsaw")).toBe(last);
  });
});

describe("Polish lesson count", () => {
  it.each([
    [0, "0 lekcji"],
    [1, "1 lekcja"],
    [2, "2 lekcje"],
    [5, "5 lekcji"],
    [12, "12 lekcji"],
    [22, "22 lekcje"],
  ])("formats %i correctly", (count, expected) => {
    expect(lessonCountLabel(count)).toBe(expected);
  });
});
