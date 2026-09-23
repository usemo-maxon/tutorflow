import { describe, expect, it } from "vitest";
import {
  assertActiveStudentCapacity,
  assertEntitlement,
  entitledTeacherIds,
} from "./entitlements";

describe("server entitlement policy", () => {
  it("returns consistent plan errors", () => {
    expect(() =>
      assertEntitlement({ status: "active", tier: "free" }, "googleCalendar"),
    ).toThrowError(
      expect.objectContaining({
        status: 403,
        body: expect.objectContaining({ code: "PLAN_REQUIRED" }),
      }),
    );
    expect(() =>
      assertActiveStudentCapacity({ status: "active", tier: "free" }, 3),
    ).toThrowError(
      expect.objectContaining({
        status: 403,
        body: expect.objectContaining({ code: "PLAN_LIMIT_REACHED" }),
      }),
    );
  });

  it.each(["googleCalendar", "telegramReminders"] as const)(
    "skips active Free background %s work and preserves entitled accounts",
    (capability) => {
      const allowed = entitledTeacherIds(
        [
          { teacher_id: "free", status: "active", tier: "free" },
          { teacher_id: "trial", status: "trial", tier: "free" },
          { teacher_id: "pro", status: "active", tier: "pro" },
          { teacher_id: "founder", status: "active", tier: "founder" },
        ],
        capability,
      );
      expect([...allowed]).toEqual(["trial", "pro", "founder"]);
    },
  );
});
