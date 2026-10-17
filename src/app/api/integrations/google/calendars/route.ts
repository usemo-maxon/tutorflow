import { z } from "zod";
import { currentTeacher } from "@/server/auth";
import { assertEntitlement } from "@/server/entitlements";
import { createSupabaseAdminClient } from "@/server/supabase";

export const runtime = "nodejs";

const preferencesSchema = z.union([
  z.object({
    target: z.literal("easy4tutor"),
    visible: z.boolean(),
  }),
  z
    .object({
      target: z.literal("google"),
      calendarId: z.string().min(1).max(1024),
      visible: z.boolean().optional(),
      countAsBusy: z.boolean().optional(),
      color: z
        .union([z.string().regex(/^#[0-9A-Fa-f]{6}$/), z.null()])
        .optional(),
    })
    .refine(
      (value) =>
        value.visible !== undefined ||
        value.countAsBusy !== undefined ||
        value.color !== undefined,
      "At least one preference is required",
    ),
]);

export async function PATCH(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site")
    return Response.json({ ok: false }, { status: 403 });
  const teacher = await currentTeacher();
  if (!teacher) return Response.json({ ok: false }, { status: 401 });
  try {
    assertEntitlement(teacher.subscription, "googleCalendar");
  } catch {
    return Response.json({ ok: false }, { status: 403 });
  }
  const parsed = preferencesSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return Response.json(
      { ok: false, code: "INVALID_PREFERENCES" },
      { status: 400 },
    );

  const admin = createSupabaseAdminClient();
  const { data: connection, error: connectionError } = await admin
    .from("integration_connections")
    .select("id")
    .eq("teacher_id", teacher.id)
    .eq("provider", "google")
    .eq("status", "connected")
    .maybeSingle();
  if (connectionError || !connection)
    return Response.json(
      { ok: false, code: "GOOGLE_NOT_CONNECTED" },
      { status: 404 },
    );

  if (parsed.data.target === "easy4tutor") {
    const { error } = await admin
      .from("integration_connections")
      .update({
        easy4tutor_visible: parsed.data.visible,
        updated_at: new Date().toISOString(),
      })
      .eq("id", connection.id)
      .eq("teacher_id", teacher.id);
    if (error) return Response.json({ ok: false }, { status: 503 });
  } else {
    const update: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (parsed.data.visible !== undefined) update.visible = parsed.data.visible;
    if (parsed.data.countAsBusy !== undefined)
      update.count_as_busy = parsed.data.countAsBusy;
    if (parsed.data.color !== undefined)
      update.custom_color = parsed.data.color?.toUpperCase() ?? null;
    const { data, error } = await admin
      .from("google_calendars")
      .update(update)
      .eq("connection_id", connection.id)
      .eq("teacher_id", teacher.id)
      .eq("calendar_id", parsed.data.calendarId)
      .select("id")
      .maybeSingle();
    if (error) return Response.json({ ok: false }, { status: 503 });
    if (!data) return Response.json({ ok: false }, { status: 404 });
  }
  return Response.json(
    { ok: true },
    { headers: { "cache-control": "no-store" } },
  );
}
