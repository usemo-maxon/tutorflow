import { NextResponse } from "next/server";
import { assertSameOrigin, formString } from "@/server/admin-request";
import { requirePlatformAdmin } from "@/server/platform-admin";
import { createSupabaseAdminClient } from "@/server/supabase";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  assertSameOrigin(request);
  const admin = await requirePlatformAdmin("users.manage");
  const { id } = await params;
  const form = await request.formData();
  const action = formString(form, "action", 20);
  const reason = formString(form, "reason");
  if (!/^[0-9a-f-]{36}$/i.test(id) || !["suspend", "restore"].includes(action) || reason.length < 3) {
    return NextResponse.json({ code: "INVALID_INPUT", message: "Nieprawidłowe dane operacji." }, { status: 400 });
  }
  const { error } = await createSupabaseAdminClient().rpc("manage_account_suspension", { target_user_id: id, suspension_action: action, action_reason: reason, actor_user_id: admin.userId });
  if (error) return NextResponse.json({ code: "ACTION_FAILED", message: "Operacja została odrzucona." }, { status: error.code === "42501" ? 403 : 400 });
  return NextResponse.redirect(new URL(`/app/admin/users/${id}`, request.url), 303);
}

