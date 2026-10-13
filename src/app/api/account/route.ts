import { z } from "zod";
import { currentTeacher } from "@/server/auth";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "@/server/supabase";
export async function DELETE(request: Request) {
  const teacher = await currentTeacher();
  if (!teacher)
    return Response.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  const parsed = z
    .object({ confirmation: z.literal("USUŃ KONTO") })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ code: "CONFIRMATION_REQUIRED" }, { status: 422 });
  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from("tutor_profiles")
    .select("id,workspace_id")
    .eq("user_id", teacher.id)
    .maybeSingle();
  if (profile)
    await admin
      .from("integration_connections")
      .delete()
      .eq("teacher_id", profile.id)
      .eq("workspace_id", profile.workspace_id);
  await admin
    .from("subscriptions")
    .update({ status: "cancelled", read_only: true, renews_at: null })
    .eq("teacher_id", teacher.id);
  const { error } = await admin.auth.admin.deleteUser(teacher.id);
  if (error) return Response.json({ code: "DELETE_FAILED" }, { status: 503 });
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  return Response.json(
    { ok: true },
    { headers: { "cache-control": "no-store" } },
  );
}
