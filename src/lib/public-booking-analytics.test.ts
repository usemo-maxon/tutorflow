import { describe, expect, it } from "vitest";
import {
  attributionFromSearch,
  conversionPercent,
  normalizeTrafficSource,
  safeAttribution,
} from "./public-booking-analytics";

describe("public booking analytics", () => {
  it("normalizes known UTM sources and bounds campaign values", () => {
    expect(
      attributionFromSearch(
        new URLSearchParams(
          "utm_source=Instagram&utm_medium=Social&utm_campaign=Launch",
        ),
      ),
    ).toEqual({
      source: "instagram",
      utmSource: "instagram",
      utmMedium: "social",
      utmCampaign: "launch",
    });
    expect(
      safeAttribution({ utmSource: "x".repeat(100) }).utmSource,
    ).toHaveLength(80);
  });
  it("uses direct without attribution and other for unknown sources", () => {
    expect(normalizeTrafficSource(undefined)).toBe("direct");
    expect(normalizeTrafficSource("newsletter")).toBe("other");
  });
  it("never produces an invalid conversion percentage", () => {
    expect(conversionPercent(3, 0)).toBe(0);
    expect(conversionPercent(3, Number.NaN)).toBe(0);
    expect(conversionPercent(3, 10)).toBe(30);
  });
});
