import { describe, expect, it } from "vitest";
import { nearestGoogleEventColorId } from "./google-calendar-colors";

describe("Google Calendar color mapping", () => {
  it("maps exact and custom colors deterministically to Google event colors", () => {
    expect(nearestGoogleEventColorId("#5484ED")).toBe("9");
    expect(nearestGoogleEventColorId("#DC2127")).toBe("11");
    expect(nearestGoogleEventColorId("#6F8FEF")).toBe("9");
  });

  it("falls back to the easy4tutor default for an absent color", () => {
    expect(nearestGoogleEventColorId()).toBe("9");
  });
});
