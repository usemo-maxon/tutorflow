import "server-only";

import type {
  FunnelEvent,
  SafeAttribution,
  TrafficSource,
} from "@/lib/public-booking-analytics";
import { FUNNEL_EVENTS, safeAttribution } from "@/lib/public-booking-analytics";
import { isSupabaseConfigured } from "./env";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "./supabase";
import { queryStore } from "./store";

export type PublicBookingAnalytics = {
  periodDays: 7 | 30 | 90;
  funnel: Record<FunnelEvent, number>;
  sources: Array<{ source: TrafficSource; bookings: number }>;
};

export async function recordPublicFunnelEvent(
  slug: string,
  event: FunnelEvent,
  attribution: SafeAttribution,
) {
  if (!FUNNEL_EVENTS.includes(event)) return;
  try {
    if (!isSupabaseConfigured() && process.env.NODE_ENV !== "production")
      return;
    const { error } = await createSupabaseAdminClient().rpc(
      "record_public_booking_funnel_event",
      {
        p_slug: slug,
        p_event: event,
        p_source: attribution.source,
      },
    );
    if (error)
      console.warn("Public booking analytics failed", {
        event,
        code: error.code,
      });
  } catch (error) {
    console.warn("Public booking analytics failed", {
      event,
      reason: error instanceof Error ? error.name : "unknown",
    });
  }
}

export async function getOwnPublicBookingAnalytics(
  teacherId: string,
  periodDays: 7 | 30 | 90,
): Promise<PublicBookingAnalytics> {
  const funnel = Object.fromEntries(
    FUNNEL_EVENTS.map((event) => [event, 0]),
  ) as Record<FunnelEvent, number>;
  if (!isSupabaseConfigured() && process.env.NODE_ENV !== "production") {
    const bookings = await queryStore((store) =>
      (store.bookings ?? []).filter(
        (booking) =>
          booking.teacherId === teacherId && booking.status !== "cancelled",
      ),
    );
    funnel.booking_completed = bookings.length;
    return {
      periodDays,
      funnel,
      sources: [
        { source: "direct" as TrafficSource, bookings: bookings.length },
      ].filter((item) => item.bookings),
    };
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc(
    "get_own_public_booking_analytics",
    { p_period_days: periodDays },
  );
  if (error) throw error;
  for (const row of (data ?? []) as Array<{ metric: string; count: number }>) {
    if ((FUNNEL_EVENTS as readonly string[]).includes(row.metric))
      funnel[row.metric as FunnelEvent] = Number(row.count) || 0;
  }
  const { data: sourceRows, error: sourceError } = await supabase.rpc(
    "get_own_public_booking_sources",
    { p_period_days: periodDays },
  );
  if (sourceError) throw sourceError;
  return {
    periodDays,
    funnel,
    sources: (sourceRows ?? []).map(
      (row: { source: TrafficSource; bookings: number }) => ({
        source: row.source,
        bookings: Number(row.bookings) || 0,
      }),
    ),
  };
}

export function attributionForRequest(input: unknown): SafeAttribution {
  return safeAttribution(
    (input && typeof input === "object" ? input : {}) as Record<
      string,
      unknown
    >,
  );
}
