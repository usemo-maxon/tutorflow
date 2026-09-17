import { describe, expect, it } from "vitest";
import { progressContext } from "./progress";
import type { Lesson } from "./domain";

function lesson(
  id: string,
  startsAt: string,
  status: Lesson["status"],
  participantIds = ["student"],
): Lesson {
  return {
    id,
    color: "#6F8FEF",
    startsAt,
    status,
    participantIds,
    participants: [],
    topic: id,
    planItems: [],
    durationMinutes: 60,
    format: "online",
    location: "https://example.test",
    price: null,
    mode: "single",
    syncStatus: "disabled",
    homework: "",
    generalNotes: "",
    createdAt: startsAt,
  };
}
describe("progress context", () => {
  const previous = lesson("previous", "2026-09-01T08:00:00Z", "completed");
  const overdue = lesson("overdue", "2026-09-02T08:00:00Z", "needs_completion");
  const current = lesson("current", "2026-09-07T08:00:00Z", "scheduled");
  const next = lesson("next", "2026-09-14T08:00:00Z", "scheduled");
  it("does not show an overdue lesson as the upcoming plan", () => {
    expect(
      progressContext([next, overdue, previous, current], "student"),
    ).toEqual({ previous, current, next });
  });
  it("anchors the thread to the opened lesson", () => {
    expect(
      progressContext([previous, current, next], "student", next.id),
    ).toEqual({ previous, current: next, next: undefined });
  });
  it("excludes cancelled lessons and other students", () => {
    expect(
      progressContext(
        [
          lesson("cancelled", "2026-09-01T08:00:00Z", "cancelled"),
          lesson("other", "2026-09-01T08:00:00Z", "completed", ["other"]),
        ],
        "student",
      ),
    ).toEqual({ previous: undefined, current: undefined, next: undefined });
  });
  it("handles an empty account", () => {
    expect(progressContext([], "student")).toEqual({
      previous: undefined,
      current: undefined,
      next: undefined,
    });
  });
});
