import { describe, expect, it } from "vitest";
import {
  MAIN_TOUR_STEPS,
  PRODUCT_TOUR_VERSION,
  reduceTourState,
  shouldShowTourInvitation,
  targetForStep,
  type ProductTourState,
} from "./product-tour";

const notStarted: ProductTourState = {
  version: PRODUCT_TOUR_VERSION,
  status: "not_started",
  currentStep: 0,
};

describe("product tour", () => {
  it("shows the first-time invitation only after setup on Dzisiaj", () => {
    expect(
      shouldShowTourInvitation({
        pathname: "/app/dzisiaj",
        onboardingCompleted: true,
        state: notStarted,
      }),
    ).toBe(true);
    expect(
      shouldShowTourInvitation({
        pathname: "/app/start",
        onboardingCompleted: false,
        state: notStarted,
      }),
    ).toBe(false);
  });

  it.each(["completed", "skipped", "invitation_dismissed"] as const)(
    "does not invite returning users with %s state",
    (status) => {
      expect(
        shouldShowTourInvitation({
          pathname: "/app/dzisiaj",
          onboardingCompleted: true,
          state: { ...notStarted, status },
        }),
      ).toBe(false);
    },
  );

  it("starts, advances, goes back, skips and completes without domain actions", () => {
    const started = reduceTourState(notStarted, { type: "start" });
    expect(started).toEqual({
      version: PRODUCT_TOUR_VERSION,
      status: "in_progress",
      currentStep: 0,
    });
    const next = reduceTourState(started, { type: "next" });
    expect(next.currentStep).toBe(1);
    expect(reduceTourState(next, { type: "back" }).currentStep).toBe(0);
    expect(reduceTourState(next, { type: "skip" }).status).toBe("skipped");
    expect(reduceTourState(next, { type: "complete" }).status).toBe(
      "completed",
    );
    expect(Object.keys(next).sort()).toEqual([
      "currentStep",
      "status",
      "version",
    ]);
  });

  it("persists a bounded step index suitable for route transitions", () => {
    let state = notStarted;
    for (let index = 0; index < 20; index += 1) {
      state = reduceTourState(state, { type: "next" });
    }
    expect(state.currentStep).toBe(MAIN_TOUR_STEPS.length - 1);
    expect(MAIN_TOUR_STEPS[state.currentStep].route).toBe("/app/rezerwacje");
  });

  it("manual restart always returns completed progress to step one", () => {
    expect(
      reduceTourState(
        { ...notStarted, status: "completed", currentStep: 6 },
        { type: "restart" },
      ),
    ).toEqual({
      version: PRODUCT_TOUR_VERSION,
      status: "in_progress",
      currentStep: 0,
    });
  });

  it("uses a stable mobile navigation and creation target", () => {
    expect(targetForStep(MAIN_TOUR_STEPS[1], true)).toBe("mobile-navigation");
    expect(targetForStep(MAIN_TOUR_STEPS[2], true)).toBe(
      "mobile-global-create",
    );
    expect(targetForStep(MAIN_TOUR_STEPS[2], false)).toBe(
      "desktop-global-create",
    );
  });

  it("describes plan-dependent features without changing entitlements", () => {
    expect(MAIN_TOUR_STEPS[3].description).toContain("zależy od planu");
    expect(MAIN_TOUR_STEPS[6].description).toContain("zależą od");
  });
});
