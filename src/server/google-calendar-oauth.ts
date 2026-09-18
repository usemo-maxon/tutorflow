import "server-only";

import { decryptSecret, encryptSecret } from "./crypto";
import {
  exchangeGoogleCode,
  type GoogleCredentials,
  type GoogleTokenResponse,
} from "./google-calendar";
import { createSupabaseAdminClient } from "./supabase";

interface ExistingConnection {
  id: string;
  encrypted_credentials: string | null;
  selected_calendar_id: string | null;
  external_account_id: string | null;
  label: string | null;
}

interface StoredConnection {
  id: string;
}

export interface GoogleOAuthPersistenceDependencies {
  exchangeCode: (
    code: string,
    redirectUri: string,
  ) => Promise<GoogleTokenResponse>;
  findExistingConnection: (
    teacherId: string,
  ) => Promise<ExistingConnection | null>;
  findWorkspaceId: (teacherId: string) => Promise<string>;
  storeConnection: (
    values: Record<string, unknown>,
  ) => Promise<StoredConnection>;
  encrypt: (value: GoogleCredentials) => string;
  decrypt: (value: string) => GoogleCredentials;
  now: () => Date;
}

function defaultDependencies(): GoogleOAuthPersistenceDependencies {
  const admin = createSupabaseAdminClient();
  return {
    exchangeCode: exchangeGoogleCode,
    async findExistingConnection(teacherId) {
      const { data, error } = await admin
        .from("integration_connections")
        .select(
          "id,encrypted_credentials,selected_calendar_id,external_account_id,label",
        )
        .eq("teacher_id", teacherId)
        .eq("provider", "google")
        .maybeSingle();
      if (error) throw new Error("GOOGLE_CONNECTION_LOOKUP_FAILED");
      return (data as ExistingConnection | null) ?? null;
    },
    async findWorkspaceId(teacherId) {
      const { data, error } = await admin
        .from("tutor_profiles")
        .select("workspace_id")
        .eq("id", teacherId)
        .eq("user_id", teacherId)
        .single();
      if (error || !data?.workspace_id)
        throw new Error("GOOGLE_WORKSPACE_NOT_FOUND");
      return data.workspace_id as string;
    },
    async storeConnection(values) {
      const { data, error } = await admin
        .from("integration_connections")
        .upsert(values, { onConflict: "teacher_id,provider" })
        .select("id")
        .single();
      if (error || !data?.id) throw new Error("GOOGLE_CONNECTION_WRITE_FAILED");
      return { id: data.id as string };
    },
    encrypt: encryptSecret,
    decrypt: decryptSecret,
    now: () => new Date(),
  };
}

export async function persistGoogleCalendarConnection(
  input: { teacherId: string; code: string; redirectUri: string },
  dependencies: GoogleOAuthPersistenceDependencies = defaultDependencies(),
): Promise<{ connectionId: string; reusedRefreshToken: boolean }> {
  const [tokens, existing, workspaceId] = await Promise.all([
    dependencies.exchangeCode(input.code, input.redirectUri),
    dependencies.findExistingConnection(input.teacherId),
    dependencies.findWorkspaceId(input.teacherId),
  ]);

  let existingCredentials: GoogleCredentials | null = null;
  if (!tokens.refresh_token && existing?.encrypted_credentials) {
    existingCredentials = dependencies.decrypt(existing.encrypted_credentials);
  }
  const refreshToken =
    tokens.refresh_token ?? existingCredentials?.refreshToken;
  if (!refreshToken) throw new Error("GOOGLE_REFRESH_TOKEN_MISSING");

  const now = dependencies.now();
  const calendarId = existing?.selected_calendar_id || "primary";
  const credentials: GoogleCredentials = {
    accessToken: tokens.access_token,
    refreshToken,
    expiresAt: now.getTime() + tokens.expires_in * 1000,
    calendarId,
  };
  const connection = await dependencies.storeConnection({
    workspace_id: workspaceId,
    teacher_id: input.teacherId,
    provider: "google",
    status: "connected",
    label: existing?.label || "Kalendarz główny",
    external_account_id: existing?.external_account_id || calendarId,
    selected_calendar_id: calendarId,
    encrypted_credentials: dependencies.encrypt(credentials),
    sync_token: null,
    sync_state: "pending",
    sync_requested_at: now.toISOString(),
    last_error: null,
    updated_at: now.toISOString(),
  });
  return {
    connectionId: connection.id,
    reusedRefreshToken: !tokens.refresh_token && Boolean(existingCredentials),
  };
}
