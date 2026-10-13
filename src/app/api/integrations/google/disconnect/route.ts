import { currentTeacher } from "@/server/auth";
import { decryptSecret } from "@/server/crypto";
import { createSupabaseAdminClient } from "@/server/supabase";
export async function POST() {
  const user = await currentTeacher();
  if (!user) return Response.json({ code: "UNAUTHENTICATED" }, { status: 401 });
  const admin = createSupabaseAdminClient();
  const { data: profile } = await admin
    .from("tutor_profiles")
    .select("id,workspace_id")
    .eq("user_id", user.id)
    .single();
  if (!profile) return Response.json({ code: "NOT_FOUND" }, { status: 404 });
  const { data: connection } = await admin
    .from("integration_connections")
    .select("id,encrypted_credentials")
    .eq("teacher_id", profile.id)
    .eq("workspace_id", profile.workspace_id)
    .eq("provider", "google")
    .maybeSingle();
  if (connection?.encrypted_credentials) {
    try {
      const credentials = decryptSecret(connection.encrypted_credentials) as {
        accessToken?: string;
        refreshToken?: string;
      };
      const token = credentials.refreshToken || credentials.accessToken;
      if (token)
        await fetch("https://oauth2.googleapis.com/revoke", {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token }),
        });
    } catch {}
  }
  if (connection) {
    await admin
      .from("google_event_mappings")
      .delete()
      .eq("connection_id", connection.id);
    const { error } = await admin
      .from("integration_connections")
      .delete()
      .eq("id", connection.id)
      .eq("teacher_id", profile.id);
    if (error)
      return Response.json({ code: "DISCONNECT_FAILED" }, { status: 503 });
  }
  return Response.json(
    { ok: true },
    { headers: { "cache-control": "no-store" } },
  );
}
