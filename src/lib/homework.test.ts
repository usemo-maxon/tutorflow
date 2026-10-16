import { describe, expect, it } from "vitest";
import { homeworkFilter, isHomeworkOverdue } from "./homework";

describe("homework workflow", () => {
  const now = "2026-10-13T10:00:00.000Z";

  it("derives overdue only for still-assigned work", () => {
    expect(isHomeworkOverdue("2026-10-12T21:59:00.000Z", "assigned", now)).toBe(
      true,
    );
    expect(
      isHomeworkOverdue("2026-10-12T21:59:00.000Z", "completed", now),
    ).toBe(false);
    expect(isHomeworkOverdue("2026-10-12T21:59:00.000Z", "reviewed", now)).toBe(
      false,
    );
    expect(isHomeworkOverdue(undefined, "assigned", now)).toBe(false);
  });

  it("does not imply that completed work was reviewed", () => {
    expect(homeworkFilter({ status: "completed", overdue: false })).toBe(
      "finished",
    );
    expect(homeworkFilter({ status: "reviewed", overdue: false })).toBe(
      "finished",
    );
    expect(homeworkFilter({ status: "assigned", overdue: true })).toBe(
      "overdue",
    );
    expect(homeworkFilter({ status: "not_completed", overdue: false })).toBe(
      "finished",
    );
  });
});
