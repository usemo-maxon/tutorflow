import { describe, expect, it } from "vitest";
import {
  formatMoney,
  lessonCountLabel,
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

  it("rejects nonexistent and ambiguous Warsaw wall-clock times", () => {
    expect(() =>
      localInputToUtc("2026-03-29", "02:30", "Europe/Warsaw"),
    ).toThrow("NONEXISTENT_LOCAL_TIME");
    expect(() =>
      localInputToUtc("2026-10-25", "02:30", "Europe/Warsaw"),
    ).toThrow("AMBIGUOUS_LOCAL_TIME");
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
