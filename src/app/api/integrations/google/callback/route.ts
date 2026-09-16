import { createHash } from "node:crypto";
import { redirect } from "next/navigation";
import { encryptSecret } from "@/server/crypto";
import { siteUrl } from "@/server/env";
import {
  exchangeGoogleCode,
  type GoogleCredentials,
} from "@/server/google-calendar";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "@/server/supabase";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!state || !code) redirect("/app/ustawienia/integracje?google=error");
  const supabase = await createSupabaseServerClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/logowanie");
  const tokenHash = createHash("sha256").update(state).digest("hex");
  const { data: oauthState } = await supabase
    .from("oauth_states")
    .select("token_hash")
    .eq("token_hash", tokenHash)
    .eq("teacher_id", auth.user.id)
    .is("consumed_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (!oauthState) redirect("/app/ustawienia/integracje?google=error");
  await supabase
    .from("oauth_states")
    .update({ consumed_at: new Date().toISOString() })
    .eq("token_hash", tokenHash);
  try {
    const tokens = await exchangeGoogleCode(
      code,
      `${siteUrl()}/api/integrations/google/callback`,
    );
    if (!tokens.refresh_token) throw new Error("GOOGLE_REFRESH_TOKEN_MISSING");
    const credentials: GoogleCredentials = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + tokens.expires_in * 1000,
      calendarId: "primary",
    };
    const admin = createSupabaseAdminClient();
    const { data: tutor } = await admin
      .from("tutor_profiles")
      .select("workspace_id")
      .eq("user_id", auth.user.id)
      .single();
    if (!tutor) throw new Error("WORKSPACE_NOT_FOUND");
    const { error } = await admin.from("integration_connections").upsert({
      workspace_id: tutor.workspace_id,
      teacher_id: auth.user.id,
      provider: "google",
      status: "connected",
      label: "Kalendarz główny",
      encrypted_credentials: encryptSecret(credentials),
      last_error: null,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
  } catch {
    redirect("/app/ustawienia/integracje?google=error");
  }
  redirect("/app/ustawienia/integracje?google=connected");
}
