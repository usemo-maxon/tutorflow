import { describe, expect, it } from "vitest";
import {
  DEFAULT_CALENDAR_COLOR,
  getCalendarEventSurface,
  getCalendarTint,
  getReadableForeground,
  normalizeCalendarColor,
} from "./calendar-colors";

describe("calendar colors", () => {
  it("normalizes valid hex colors and rejects arbitrary CSS", () => {
    expect(normalizeCalendarColor(" #7c9cf5 ")).toBe("#7C9CF5");
    expect(normalizeCalendarColor("rgb(0, 0, 0)")).toBeNull();
    expect(normalizeCalendarColor("#1234")).toBeNull();
  });

  it("uses a stable default and safe opaque pastel tint", () => {
    expect(DEFAULT_CALENDAR_COLOR).toBe("#6F8FEF");
    expect(getCalendarTint()).toBe("#EEF2FD");
    expect(getCalendarTint("#000000")).toBe("#E0E0E0");
    expect(getCalendarTint("#FFFFFF")).toBe("#FFFFFF");
  });

  it("selects a readable foreground for light and dark custom colors", () => {
    expect(getReadableForeground("#FFF000")).toBe("#000000");
    expect(getReadableForeground("#10152B")).toBe("#FFFFFF");
  });

  it.each(["#FFFFFF", "#050505", "#FF00FF"])(
    "keeps calendar text AA-readable for custom color %s",
    (customColor) => {
      const surface = getCalendarEventSurface(customColor);
      const foreground = getReadableForeground(surface);
      expect(contrastRatio(surface, foreground)).toBeGreaterThanOrEqual(4.5);
      expect(getCalendarTint(customColor)).toMatch(/^#[0-9A-F]{6}$/);
    },
  );
});

function contrastRatio(first: string, second: string) {
  const values = [first, second]
    .map(relativeLuminance)
    .sort((left, right) => right - left);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

function relativeLuminance(color: string) {
  const channels = [1, 3, 5].map((offset) => {
    const channel = Number.parseInt(color.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}
