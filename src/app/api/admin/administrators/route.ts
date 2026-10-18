import { NextResponse } from "next/server";
import { assertSameOrigin, formString } from "@/server/admin-request";
import { requirePlatformAdmin } from "@/server/platform-admin";
import { createSupabaseAdminClient } from "@/server/supabase";

export async function POST(request: Request) {
  assertSameOrigin(request);
  const admin = await requirePlatformAdmin("admins.manage");
  const form = await request.formData(); const userId = formString(form, "userId", 36); const role = formString(form, "role", 30); const action = formString(form, "action", 20); const reason = formString(form, "reason");
  if (!/^[0-9a-f-]{36}$/i.test(userId) || !["platform_owner", "platform_admin", "support_moderator"].includes(role) || !["grant", "revoke"].includes(action) || reason.length < 3) return NextResponse.json({ code: "INVALID_INPUT", message: "Nieprawidłowe dane roli." }, { status: 400 });
  const { error } = await createSupabaseAdminClient().rpc("manage_platform_admin_role", { target_user_id: userId, requested_role: role, role_action: action, action_reason: reason, actor_user_id: admin.userId });
  if (error) return NextResponse.json({ code: "ACTION_FAILED", message: "Zmiana roli została odrzucona." }, { status: error.code === "42501" ? 403 : 400 });
  return NextResponse.redirect(new URL("/app/admin/settings", request.url), 303);
}
