export const FUNNEL_EVENTS = [
  "profile_view",
  "event_type_selected",
  "slot_selected",
  "booking_started",
  "booking_completed",
] as const;

export type FunnelEvent = (typeof FUNNEL_EVENTS)[number];
export type TrafficSource =
  | "instagram"
  | "tiktok"
  | "facebook"
  | "linkedin"
  | "google"
  | "direct"
  | "other";

const SOURCES: Record<string, TrafficSource> = {
  instagram: "instagram",
  ig: "instagram",
  tiktok: "tiktok",
  facebook: "facebook",
  fb: "facebook",
  linkedin: "linkedin",
  google: "google",
};

export type SafeAttribution = {
  source: TrafficSource;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
};

function bounded(value: unknown, max = 80) {
  return typeof value === "string"
    ? value.trim().toLowerCase().slice(0, max) || undefined
    : undefined;
}

export function normalizeTrafficSource(value: unknown): TrafficSource {
  const normalized = bounded(value);
  if (!normalized) return "direct";
  return SOURCES[normalized] ?? "other";
}

export function safeAttribution(input: {
  source?: unknown;
  utmSource?: unknown;
  utmMedium?: unknown;
  utmCampaign?: unknown;
}): SafeAttribution {
  const utmSource = bounded(input.utmSource);
  return {
    source: normalizeTrafficSource(utmSource ?? input.source),
    ...(utmSource ? { utmSource } : {}),
    ...(bounded(input.utmMedium)
      ? { utmMedium: bounded(input.utmMedium) }
      : {}),
    ...(bounded(input.utmCampaign)
      ? { utmCampaign: bounded(input.utmCampaign) }
      : {}),
  };
}

export function attributionFromSearch(
  search: URLSearchParams,
): SafeAttribution {
  return safeAttribution({
    utmSource: search.get("utm_source") ?? undefined,
    utmMedium: search.get("utm_medium") ?? undefined,
    utmCampaign: search.get("utm_campaign") ?? undefined,
  });
}

export function conversionPercent(
  numerator: number,
  denominator: number,
): number {
  if (
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    denominator <= 0
  )
    return 0;
  return Math.round((Math.max(0, numerator) / denominator) * 1000) / 10;
}
