import { describe, expect, it } from "vitest";
import type { ExternalGoogleEvent } from "./domain";
import {
  allDayEventOccursOn,
  buildAllDayWeekSegments,
  monthContinuation,
} from "./google-all-day";

const event = (
  id: string,
  startDate: string,
  endDate: string,
  overrides: Partial<ExternalGoogleEvent> = {},
): ExternalGoogleEvent => ({
  id,
  title: id,
  startDate,
  endDate,
  allDay: true,
  status: "confirmed",
  transparency: "opaque",
  color: "#6F8FEF",
  readOnly: true,
  blocksTime: false,
  ...overrides,
});

describe("Google all-day calendar presentation", () => {
  it("treats endDate as exclusive", () => {
    const holiday = event("holiday", "2026-10-17", "2026-10-18");
    expect(allDayEventOccursOn(holiday, "2026-10-17")).toBe(true);
    expect(allDayEventOccursOn(holiday, "2026-10-18")).toBe(false);
  });

  it("spans multi-day and cross-year events in the week lane", () => {
    const layout = buildAllDayWeekSegments(
      [event("conference", "2026-12-31", "2027-01-03")],
      [
        "2026-12-28",
        "2026-12-29",
        "2026-12-30",
        "2026-12-31",
        "2027-01-01",
        "2027-01-02",
        "2027-01-03",
      ],
    );
    expect(layout.visible[0]).toMatchObject({
      startIndex: 3,
      span: 3,
      lane: 0,
    });
  });

  it("stacks compactly and reports per-day overflow", () => {
    const layout = buildAllDayWeekSegments(
      [
        event("one", "2026-10-12", "2026-10-15"),
        event("two", "2026-10-13", "2026-10-16"),
        event("three", "2026-10-14", "2026-10-17"),
        event("hidden", "2026-10-14", "2026-10-17", { visible: false }),
      ],
      [
        "2026-10-12",
        "2026-10-13",
        "2026-10-14",
        "2026-10-15",
        "2026-10-16",
        "2026-10-17",
        "2026-10-18",
      ],
    );
    expect(layout.visible).toHaveLength(2);
    expect(layout.overflowByDay[2]).toBe(1);
  });

  it("marks coherent month continuation edges", () => {
    const conference = event("conference", "2026-10-17", "2026-10-20");
    expect(monthContinuation(conference, "2026-10-17")).toBe("start");
    expect(monthContinuation(conference, "2026-10-18")).toBe("middle");
    expect(monthContinuation(conference, "2026-10-19")).toBe("end");
  });
});
