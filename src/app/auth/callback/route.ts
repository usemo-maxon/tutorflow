import { NextResponse } from "next/server";
import { safeRelativePath } from "@/lib/auth-redirect";
import { createSupabaseServerClient } from "@/server/supabase";

export const dynamic = "force-dynamic";

function firstHeaderValue(value: string | null): string | null {
  return value?.split(",", 1)[0]?.trim() || null;
}

function requestOrigin(request: Request): string {
  const url = new URL(request.url);

  if (process.env.NODE_ENV !== "production") return url.origin;

  const forwardedHost = firstHeaderValue(
    request.headers.get("x-forwarded-host"),
  );
  const forwardedProto = firstHeaderValue(
    request.headers.get("x-forwarded-proto"),
  );

  if (
    forwardedHost &&
    (forwardedProto === "https" || forwardedProto === "http")
  ) {
    return `${forwardedProto}://${forwardedHost}`;
  }

  return url.origin;
}

function noStoreRedirect(origin: string, path: string) {
  const response = NextResponse.redirect(new URL(path, origin));
  response.headers.set(
    "Cache-Control",
    "private, no-store, no-cache, max-age=0, must-revalidate",
  );
  response.headers.set("Pragma", "no-cache");
  return response;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = requestOrigin(request);
  const code = url.searchParams.get("code");

  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return noStoreRedirect(
        origin,
        safeRelativePath(url.searchParams.get("next")),
      );
    }
  }

  return noStoreRedirect(origin, "/logowanie?error=google_oauth_failed");
}
