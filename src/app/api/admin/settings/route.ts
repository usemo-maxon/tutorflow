import { NextResponse } from "next/server";
import { assertSameOrigin, formString } from "@/server/admin-request";
import { requirePlatformAdmin } from "@/server/platform-admin";
import { createSupabaseAdminClient } from "@/server/supabase";

export async function POST(request: Request) {
  assertSameOrigin(request);
  const admin = await requirePlatformAdmin("settings.manage");
  const form = await request.formData(); const key = formString(form, "key", 80); const raw = formString(form, "value", 16384); const reason = formString(form, "reason");
  let value: unknown; try { value = JSON.parse(raw); } catch { return NextResponse.json({ code: "INVALID_JSON", message: "Wartość musi być poprawnym JSON." }, { status: 400 }); }
  const { error } = await createSupabaseAdminClient().rpc("update_platform_setting", { setting_key: key, setting_value: value, action_reason: reason, actor_user_id: admin.userId });
  if (error) return NextResponse.json({ code: "ACTION_FAILED", message: "Ustawienie zostało odrzucone." }, { status: error.code === "42501" ? 403 : 400 });
  return NextResponse.redirect(new URL("/app/admin/settings", request.url), 303);
}
