import {
  DEFAULT_CALENDAR_COLOR,
  normalizeCalendarColor,
} from "@/lib/calendar-colors";

// Google Calendar event colors returned by the Calendar API colors endpoint.
// Keep this provider vocabulary out of the easy4tutor domain/UI layer.
export const GOOGLE_EVENT_COLORS = {
  "1": "#A4BDFC",
  "2": "#7AE7BF",
  "3": "#DBADFF",
  "4": "#FF887C",
  "5": "#FBD75B",
  "6": "#FFB878",
  "7": "#46D6DB",
  "8": "#E1E1E1",
  "9": "#5484ED",
  "10": "#51B749",
  "11": "#DC2127",
} as const;

function linearRgb(hex: string): [number, number, number] {
  const normalized = normalizeCalendarColor(hex) ?? DEFAULT_CALENDAR_COLOR;
  return [1, 3, 5].map((offset) => {
    const value =
      Number.parseInt(normalized.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
}

export function nearestGoogleEventColorId(color?: string | null): string {
  const source = linearRgb(color ?? DEFAULT_CALENDAR_COLOR);
  let nearest = "9";
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (const [id, candidate] of Object.entries(GOOGLE_EVENT_COLORS)) {
    const target = linearRgb(candidate);
    const distance = source.reduce(
      (total, channel, index) => total + (channel - target[index]) ** 2,
      0,
    );
    if (distance < nearestDistance) {
      nearest = id;
      nearestDistance = distance;
    }
  }
  return nearest;
}
