import { createHash, randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { currentTeacher } from "@/server/auth";
import { siteUrl } from "@/server/env";
import { createSupabaseServerClient } from "@/server/supabase";

export async function GET() {
  const teacher = await currentTeacher();
  if (!teacher) redirect("/logowanie");
  const state = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(state).digest("hex");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("oauth_states").insert({
    token_hash: tokenHash,
    teacher_id: teacher.id,
    provider: "google",
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  });
  if (error) redirect("/app/ustawienia/integracje?google=error");
  const callback = `${siteUrl()}/api/integrations/google/callback`;
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: callback,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/calendar.events",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  }).toString();
  redirect(url.toString());
}
