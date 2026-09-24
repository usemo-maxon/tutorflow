import { createHash } from "node:crypto";
import { after, NextResponse } from "next/server";
import { GoogleApiError } from "@/server/google-calendar";
import { currentTeacher } from "@/server/auth";
import { assertEntitlement } from "@/server/entitlements";
import {
  GoogleConnectionPersistenceError,
  persistGoogleCalendarConnection,
} from "@/server/google-calendar-oauth";
import { initializeGoogleConnection } from "@/server/google-calendar-sync";
import { createSupabaseServerClient } from "@/server/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

function redirectResponse(request: Request, path: string) {
  const response = NextResponse.redirect(new URL(path, request.url));
  response.headers.set(
    "Cache-Control",
    "private, no-store, no-cache, max-age=0, must-revalidate",
  );
  response.headers.set("Pragma", "no-cache");
  return response;
}

function callbackLog(operation: string, details: Record<string, unknown> = {}) {
  console.info(
    JSON.stringify({
      scope: "google_calendar",
      component: "oauth_callback",
      operation,
      ...details,
    }),
  );
}

function errorCategory(error: unknown): string {
  if (error instanceof GoogleApiError) return error.message;
  if (error instanceof Error && /^GOOGLE_[A-Z0-9_]+$/.test(error.message))
    return error.message;
  return "GOOGLE_CALLBACK_INTERNAL_ERROR";
}

function persistenceErrorDetails(error: unknown): Record<string, unknown> {
  if (!(error instanceof GoogleConnectionPersistenceError)) return {};
  return {
    persistenceOperation: error.operation,
    databaseCode: error.databaseCode,
    databaseCategory: error.databaseCategory,
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const providerError = url.searchParams.get("error");
  if (!state) {
    callbackLog("state_validation", {
      result: "rejected",
      error: "missing_state",
    });
    return redirectResponse(request, "/app/ustawienia/integracje?google=error");
  }

  const missingConfiguration = [
    "GOOGLE_CALENDAR_CLIENT_ID",
    "GOOGLE_CALENDAR_CLIENT_SECRET",
    "GOOGLE_CALENDAR_REDIRECT_URI",
  ].filter((name) => !process.env[name]);
  if (missingConfiguration.length) {
    callbackLog("configuration", {
      result: "error",
      error: "missing_environment_variables",
      missing: missingConfiguration,
    });
    return redirectResponse(request, "/app/ustawienia/integracje?google=error");
  }

  const supabase = await createSupabaseServerClient();
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) {
    callbackLog("authentication", { result: "rejected" });
    return redirectResponse(request, "/logowanie");
  }

  const teacherId = auth.user.id;
  const tokenHash = createHash("sha256").update(state).digest("hex");
  const { data: consumedState, error: stateError } = await supabase
    .from("oauth_states")
    .delete()
    .eq("token_hash", tokenHash)
    .eq("teacher_id", teacherId)
    .eq("provider", "google")
    .is("consumed_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("teacher_id")
    .maybeSingle();
  if (stateError || !consumedState) {
    callbackLog("state_validation", {
      teacherId,
      result: "rejected",
      error: stateError ? "state_store_error" : "invalid_expired_or_used_state",
    });
    return redirectResponse(request, "/app/ustawienia/integracje?google=error");
  }

  if (providerError) {
    callbackLog("provider_authorization", {
      teacherId,
      result: "rejected",
      error: "provider_authorization_rejected",
    });
    return redirectResponse(request, "/app/ustawienia/integracje?google=error");
  }
  if (!code) {
    callbackLog("token_exchange", {
      teacherId,
      result: "rejected",
      error: "missing_code",
    });
    return redirectResponse(request, "/app/ustawienia/integracje?google=error");
  }

  const teacher = await currentTeacher();
  if (!teacher || teacher.id !== teacherId) {
    callbackLog("entitlement_validation", { teacherId, result: "rejected" });
    return redirectResponse(request, "/logowanie");
  }
  try {
    assertEntitlement(teacher.subscription, "googleCalendar");
  } catch {
    callbackLog("entitlement_validation", {
      teacherId,
      result: "rejected",
      error: "plan_required",
    });
    return redirectResponse(
      request,
      "/app/ustawienia/integracje?google=plan_required",
    );
  }

  try {
    const result = await persistGoogleCalendarConnection({
      authenticatedUserId: teacherId,
      code,
      redirectUri: process.env.GOOGLE_CALENDAR_REDIRECT_URI!,
    });
    callbackLog("connection_persisted", {
      teacherId: result.teacherId,
      workspaceId: result.workspaceId,
      connectionId: result.connectionId,
      result: "success",
      refreshToken: result.reusedRefreshToken ? "preserved" : "received",
    });
    after(async () => {
      try {
        const initialization = await initializeGoogleConnection(
          result.connectionId,
        );
        callbackLog("connection_initialize", {
          teacherId: result.teacherId,
          workspaceId: result.workspaceId,
          connectionId: result.connectionId,
          result:
            initialization.sync === "fulfilled" &&
            initialization.watch === "fulfilled"
              ? "success"
              : "retryable_error",
          sync: initialization.sync,
          watch: initialization.watch,
        });
      } catch {
        callbackLog("connection_initialize", {
          teacherId: result.teacherId,
          workspaceId: result.workspaceId,
          connectionId: result.connectionId,
          result: "retryable_error",
          error: "GOOGLE_CONNECTION_INITIALIZATION_RETRYABLE",
        });
      }
    });
  } catch (error) {
    callbackLog("connection_persist", {
      teacherId,
      result: "error",
      error: errorCategory(error),
      ...persistenceErrorDetails(error),
      providerStatus:
        error instanceof GoogleApiError ? error.status : undefined,
    });
    return redirectResponse(request, "/app/ustawienia/integracje?google=error");
  }
  return redirectResponse(
    request,
    "/app/ustawienia/integracje?google=connected",
  );
}
