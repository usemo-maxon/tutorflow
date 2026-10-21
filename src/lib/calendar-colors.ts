export const DEFAULT_CALENDAR_COLOR = "#6F8FEF";

export const CALENDAR_COLOR_PALETTE = [
  { name: "Blue", label: "Niebieski", hex: "#6F8FEF" },
  { name: "Sky", label: "Błękitny", hex: "#6FAFD9" },
  { name: "Teal", label: "Morski", hex: "#63B3A6" },
  { name: "Sage", label: "Szałwiowy", hex: "#8FAF8F" },
  { name: "Mint", label: "Miętowy", hex: "#8FC9B5" },
  { name: "Amber", label: "Bursztynowy", hex: "#D8A85D" },
  { name: "Peach", label: "Brzoskwiniowy", hex: "#E3A17E" },
  { name: "Rose", label: "Różany", hex: "#D98593" },
  { name: "Lavender", label: "Lawendowy", hex: "#9B8FD6" },
  { name: "Plum", label: "Śliwkowy", hex: "#9A78A8" },
  { name: "Slate", label: "Łupkowy", hex: "#7F8A9A" },
  { name: "Sand", label: "Piaskowy", hex: "#B6A58D" },
] as const;

const calendarColorPattern = /^#[0-9A-F]{6}$/;

export function normalizeCalendarColor(value: string): string | null {
  const normalized = value.trim().toUpperCase();
  return calendarColorPattern.test(normalized) ? normalized : null;
}

export function isCalendarColor(value: unknown): value is string {
  return typeof value === "string" && normalizeCalendarColor(value) === value;
}

export type CalendarHsl = {
  hue: number;
  saturation: number;
  lightness: number;
};

export function calendarHexToHsl(value: string): CalendarHsl {
  const [red, green, blue] = rgb(value).map((channel) => channel / 255);
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const delta = maximum - minimum;
  const lightness = (maximum + minimum) / 2;
  let hue = 0;

  if (delta) {
    if (maximum === red) hue = ((green - blue) / delta) % 6;
    else if (maximum === green) hue = (blue - red) / delta + 2;
    else hue = (red - green) / delta + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }

  const saturation = delta ? delta / (1 - Math.abs(2 * lightness - 1)) : 0;

  return {
    hue,
    saturation: saturation * 100,
    lightness: lightness * 100,
  };
}

export function calendarHslToHex({
  hue,
  saturation,
  lightness,
}: CalendarHsl): string {
  const normalizedHue = ((hue % 360) + 360) % 360;
  const normalizedSaturation = Math.min(100, Math.max(0, saturation)) / 100;
  const normalizedLightness = Math.min(100, Math.max(0, lightness)) / 100;
  const chroma =
    (1 - Math.abs(2 * normalizedLightness - 1)) * normalizedSaturation;
  const section = normalizedHue / 60;
  const secondary = chroma * (1 - Math.abs((section % 2) - 1));
  const offset = normalizedLightness - chroma / 2;
  const channels =
    section < 1
      ? [chroma, secondary, 0]
      : section < 2
        ? [secondary, chroma, 0]
        : section < 3
          ? [0, chroma, secondary]
          : section < 4
            ? [0, secondary, chroma]
            : section < 5
              ? [secondary, 0, chroma]
              : [chroma, 0, secondary];

  return `#${channels.map((channel) => toHex((channel + offset) * 255)).join("")}`;
}

function rgb(hex: string): [number, number, number] {
  const normalized = normalizeCalendarColor(hex) ?? DEFAULT_CALENDAR_COLOR;
  return [
    Number.parseInt(normalized.slice(1, 3), 16),
    Number.parseInt(normalized.slice(3, 5), 16),
    Number.parseInt(normalized.slice(5, 7), 16),
  ];
}

function toHex(value: number): string {
  return Math.round(value).toString(16).padStart(2, "0").toUpperCase();
}

export function mixCalendarColor(
  color: string,
  target: string,
  targetWeight: number,
): string {
  const sourceRgb = rgb(color);
  const targetRgb = rgb(target);
  const weight = Math.min(1, Math.max(0, targetWeight));
  return `#${sourceRgb
    .map((channel, index) =>
      toHex(channel * (1 - weight) + targetRgb[index] * weight),
    )
    .join("")}`;
}

/** A calm, opaque pastel that is safe for large workspace surfaces. */
export function getCalendarTint(color?: string | null): string {
  return mixCalendarColor(
    normalizeCalendarColor(color ?? "") ?? DEFAULT_CALENDAR_COLOR,
    "#FFFFFF",
    0.88,
  );
}

/** A slightly stronger tint for compact calendar entries. */
export function getCalendarEventSurface(color?: string | null): string {
  return mixCalendarColor(
    normalizeCalendarColor(color ?? "") ?? DEFAULT_CALENDAR_COLOR,
    "#FFFFFF",
    0.78,
  );
}

function relativeLuminance(color: string): number {
  const [red, green, blue] = rgb(color).map((channel) => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return red * 0.2126 + green * 0.7152 + blue * 0.0722;
}

export function getReadableForeground(color?: string | null): string {
  const background =
    normalizeCalendarColor(color ?? "") ?? DEFAULT_CALENDAR_COLOR;
  const backgroundLuminance = relativeLuminance(background);
  const dark = "#000000";
  const light = "#FFFFFF";
  const darkContrast = (backgroundLuminance + 0.05) / 0.05;
  const lightContrast = 1.05 / (backgroundLuminance + 0.05);
  return darkContrast >= lightContrast ? dark : light;
}
