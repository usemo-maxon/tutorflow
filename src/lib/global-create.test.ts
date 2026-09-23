import { describe, expect, it } from "vitest";
import {
  GLOBAL_CREATE_GROUPS,
  getGlobalCreateRoute,
  parsePaymentsCreateAction,
  removeActionFromUrl,
} from "./global-create";

describe("global create actions", () => {
  it("exposes exactly the six L0.6 actions", () => {
    expect(
      GLOBAL_CREATE_GROUPS.flatMap((group) =>
        group.actions.map((action) => action.id),
      ),
    ).toEqual(["lesson", "student", "group", "block", "payment", "package"]);
  });

  it("keeps lesson and student as direct composer actions", () => {
    expect(getGlobalCreateRoute("lesson")).toBeNull();
    expect(getGlobalCreateRoute("student")).toBeNull();
  });

  it.each([
    ["group", "/app/uczniowie/grupy?action=new"],
    ["block", "/app/kalendarz?action=block"],
    ["payment", "/app/platnosci?action=payment"],
    ["package", "/app/platnosci?action=package"],
  ] as const)("maps %s to its existing page workflow", (action, route) => {
    expect(getGlobalCreateRoute(action)).toBe(route);
  });
});

describe("payments URL actions", () => {
  it.each(["payment", "package"] as const)(
    "allows the %s auto-open request",
    (action) => {
      expect(parsePaymentsCreateAction(action)).toBe(action);
    },
  );

  it("ignores unknown actions", () => {
    expect(parsePaymentsCreateAction("lesson")).toBeNull();
    expect(parsePaymentsCreateAction("anything-else")).toBeNull();
    expect(parsePaymentsCreateAction(null)).toBeNull();
  });

  it("consumes only the action parameter", () => {
    expect(
      removeActionFromUrl("/app/platnosci", "action=payment&status=overdue"),
    ).toBe("/app/platnosci?status=overdue");
    expect(removeActionFromUrl("/app/platnosci", "action=package")).toBe(
      "/app/platnosci",
    );
  });
});
