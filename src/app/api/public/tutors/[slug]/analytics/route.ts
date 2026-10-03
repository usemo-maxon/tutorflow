import { z } from "zod";
import { FUNNEL_EVENTS } from "@/lib/public-booking-analytics";
import {
  attributionForRequest,
  recordPublicFunnelEvent,
} from "@/server/public-booking-analytics";

const schema = z
  .object({
    event: z.enum(FUNNEL_EVENTS),
    source: z.string().max(80).optional(),
    utmSource: z.string().max(80).optional(),
    utmMedium: z.string().max(80).optional(),
    utmCampaign: z.string().max(80).optional(),
  })
  .strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  try {
    const body = schema.safeParse(await request.json());
    if (!body.success) return new Response(null, { status: 204 });
    void recordPublicFunnelEvent(
      (await params).slug,
      body.data.event,
      attributionForRequest(body.data),
    );
  } catch {
    /* Analytics must never alter the visitor journey. */
  }
  return new Response(null, {
    status: 204,
    headers: { "Cache-Control": "no-store" },
  });
}
