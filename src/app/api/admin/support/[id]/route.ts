import { NextResponse } from "next/server";
import { assertSameOrigin, formString } from "@/server/admin-request";
import { requirePlatformAdmin } from "@/server/platform-admin";
import { createSupabaseAdminClient } from "@/server/supabase";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  assertSameOrigin(request);
  const admin = await requirePlatformAdmin("support.manage");
  const { id } = await params; const form = await request.formData();
  const action = formString(form, "action", 20); const value = formString(form, "value", 50); const body = formString(form, "body", 5000); const reason = formString(form, "reason"); const internal = form.get("internal") === "on";
  if (!/^[0-9a-f-]{36}$/i.test(id) || !["status", "assign", "message"].includes(action) || reason.length < 3) return NextResponse.json({ code: "INVALID_INPUT", message: "Nieprawidłowe dane operacji." }, { status: 400 });
  const { error } = await createSupabaseAdminClient().rpc("manage_support_ticket", { target_ticket_id: id, ticket_action: action, action_value: action === "assign" ? admin.userId : value, message_body: body, is_internal_note: internal, action_reason: reason, actor_user_id: admin.userId });
  if (error) return NextResponse.json({ code: "ACTION_FAILED", message: "Operacja została odrzucona." }, { status: error.code === "42501" ? 403 : 400 });
  return NextResponse.redirect(new URL(`/app/admin/support/${id}`, request.url), 303);
}

