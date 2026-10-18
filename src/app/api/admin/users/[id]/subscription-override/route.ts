import { NextResponse } from "next/server";
import { assertSameOrigin, formString } from "@/server/admin-request";
import { requirePlatformAdmin } from "@/server/platform-admin";
import { createSupabaseAdminClient } from "@/server/supabase";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  assertSameOrigin(request);
  const admin = await requirePlatformAdmin("subscriptions.manage");
  const { id } = await params;
  const form = await request.formData();
  const tier = formString(form, "tier", 20); const kind = formString(form, "kind", 40); const reason = formString(form, "reason"); const expiresInput = formString(form, "expiresAt", 80);
  const expiresAt = expiresInput ? new Date(expiresInput) : null;
  if (!/^[0-9a-f-]{36}$/i.test(id) || !["pro", "founder"].includes(tier) || !["promotional", "support", "billing_correction"].includes(kind) || reason.length < 3 || (expiresAt && Number.isNaN(expiresAt.getTime()))) {
    return NextResponse.json({ code: "INVALID_INPUT", message: "Nieprawidłowe dane operacji." }, { status: 400 });
  }
  const { error } = await createSupabaseAdminClient().rpc("manage_subscription_override", { target_user_id: id, override_action: "grant", override_kind: kind, override_tier: tier, override_expires_at: expiresAt?.toISOString() ?? null, action_reason: reason, actor_user_id: admin.userId });
  if (error) return NextResponse.json({ code: "ACTION_FAILED", message: "Operacja została odrzucona." }, { status: error.code === "42501" ? 403 : 400 });
  return NextResponse.redirect(new URL(`/app/admin/users/${id}`, request.url), 303);
}

