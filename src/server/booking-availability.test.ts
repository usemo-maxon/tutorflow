import { describe, expect, it } from "vitest";
import { assertPublicAvailabilityRange } from "./booking-availability";

describe("assertPublicAvailabilityRange", () => {
  it("rejects malformed, impossible, reversed, and oversized public ranges", () => {
    expect(() =>
      assertPublicAvailabilityRange("2026-02-30", "2026-03-01"),
    ).toThrow();
    expect(() =>
      assertPublicAvailabilityRange("2026-03-02", "2026-03-01"),
    ).toThrow();
    expect(() =>
      assertPublicAvailabilityRange("2026-03-01", "2026-03-15"),
    ).toThrow();
  });

  it("allows the bounded 14-day range", () => {
    expect(() =>
      assertPublicAvailabilityRange("2026-03-01", "2026-03-14"),
    ).not.toThrow();
  });
});
