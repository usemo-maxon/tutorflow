import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { currentTeacher } from "@/server/auth";
import { createSupabaseServerClient } from "@/server/supabase";

export const runtime = "nodejs";

function noStoreRedirect(request: Request, destination: string) {
  const response = NextResponse.redirect(new URL(destination, request.url));
  response.headers.set(
    "Cache-Control",
    "private, no-store, no-cache, max-age=0, must-revalidate",
  );
  return response;
}

export async function GET(request: Request) {
  const teacher = await currentTeacher();
  if (!teacher) return noStoreRedirect(request, "/logowanie");
  const missingConfiguration = [
    "GOOGLE_CALENDAR_CLIENT_ID",
    "GOOGLE_CALENDAR_CLIENT_SECRET",
    "GOOGLE_CALENDAR_REDIRECT_URI",
  ].filter((name) => !process.env[name]);
  if (missingConfiguration.length) {
    console.error(
      JSON.stringify({
        scope: "google_calendar",
        operation: "oauth_connect",
        teacherId: teacher.id,
        result: "error",
        error: "missing_environment_variables",
        missing: missingConfiguration,
      }),
    );
    return noStoreRedirect(request, "/app/ustawienia/integracje?google=error");
  }
  const state = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(state).digest("hex");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("oauth_states").insert({
    token_hash: tokenHash,
    teacher_id: teacher.id,
    provider: "google",
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  });
  if (error) {
    console.error(
      JSON.stringify({
        scope: "google_calendar",
        operation: "oauth_state_create",
        teacherId: teacher.id,
        result: "error",
        error: "state_store_error",
      }),
    );
    return noStoreRedirect(request, "/app/ustawienia/integracje?google=error");
  }
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CALENDAR_CLIENT_ID!,
    redirect_uri: process.env.GOOGLE_CALENDAR_REDIRECT_URI!,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/calendar.events",
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  }).toString();
  return noStoreRedirect(request, url.toString());
}
