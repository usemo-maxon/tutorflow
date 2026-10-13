import { z } from "zod";
import { createSupabaseAdminClient } from "@/server/supabase";
const schema = z.object({
  contentUrl: z.url().max(2000),
  description: z.string().trim().min(10).max(5000),
  reason: z.string().trim().min(10).max(5000),
  email: z.email().max(255),
  additionalInfo: z.string().max(5000).optional().default(""),
  accurate: z.literal("true"),
  company: z.string().max(0).optional().default(""),
});
const attempts = new Map<string, { count: number; reset: number }>();
export async function POST(request: Request) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  const hit = attempts.get(ip);
  if (hit && hit.reset > now && hit.count >= 5)
    return Response.json({ code: "RATE_LIMITED" }, { status: 429 });
  attempts.set(ip, {
    count: hit && hit.reset > now ? hit.count + 1 : 1,
    reset: hit && hit.reset > now ? hit.reset : now + 3_600_000,
  });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ code: "VALIDATION_ERROR" }, { status: 422 });
  const admin = createSupabaseAdminClient();
  const { error } = await admin
    .from("illegal_content_reports")
    .insert({
      content_url: parsed.data.contentUrl,
      description: parsed.data.description,
      legal_reason: parsed.data.reason,
      reporter_email: parsed.data.email,
      additional_info: parsed.data.additionalInfo,
      status: "received",
    });
  if (error) return Response.json({ code: "STORE_FAILED" }, { status: 503 });
  return Response.json(
    { ok: true },
    { status: 201, headers: { "cache-control": "no-store" } },
  );
}
