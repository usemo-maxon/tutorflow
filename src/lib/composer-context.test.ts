import { describe, expect, it } from "vitest";
import { lessonCreatedPath, studentCreatedPath } from "./composer-context";

describe("composer post-create destinations", () => {
  it("keeps the normal student detail redirect", () => {
    expect(studentCreatedPath("default", "student-1")).toBe(
      "/app/uczniowie/student-1",
    );
  });

  it("keeps the onboarding student composer on the checklist", () => {
    expect(studentCreatedPath("onboarding", "student-1")).toBeNull();
  });

  it("keeps the normal lesson detail redirect", () => {
    expect(lessonCreatedPath(undefined, "lesson-1")).toBe(
      "/app/lekcje/lesson-1",
    );
  });

  it("keeps the onboarding lesson composer on the checklist", () => {
    expect(lessonCreatedPath("onboarding", "lesson-1")).toBeNull();
  });
});
