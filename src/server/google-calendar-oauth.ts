import "server-only";

import { decryptSecret, encryptSecret } from "./crypto";
import {
  exchangeGoogleCode,
  type GoogleCredentials,
  type GoogleTokenResponse,
} from "./google-calendar";
import { createSupabaseAdminClient } from "./supabase";

const GOOGLE_PROVIDER = "google" as const;

interface TeacherContext {
  teacherId: string;
  workspaceId: string;
}

interface ExistingConnection {
  id: string;
  encrypted_credentials: string | null;
  selected_calendar_id: string | null;
  external_account_id: string | null;
  label: string | null;
  settings: Record<string, unknown> | null;
  created_at: string;
}

interface StoredConnection {
  id: string;
}

type PersistenceOperation =
  | "admin_client"
  | "teacher_profile_lookup"
  | "workspace_membership_lookup"
  | "connection_lookup"
  | "connection_upsert";

export class GoogleConnectionPersistenceError extends Error {
  readonly name = "GoogleConnectionPersistenceError";

  constructor(
    public readonly publicCode: string,
    public readonly operation: PersistenceOperation,
    public readonly databaseCode?: string,
    public readonly databaseCategory?: string,
  ) {
    super(publicCode);
  }
}

interface DatabaseErrorLike {
  code?: unknown;
}

function databaseCategory(code: string | undefined): string {
  if (!code) return "unexpected_database_result";
  if (code === "42501") return "permission_denied";
  if (code === "23503") return "foreign_key_violation";
  if (code === "23505") return "unique_constraint_violation";
  if (code.startsWith("22")) return "invalid_database_value";
  if (code.startsWith("23")) return "integrity_constraint_violation";
  if (code.startsWith("PGRST")) return "data_api_error";
  return "database_error";
}

function persistenceDatabaseError(
  publicCode: string,
  operation: PersistenceOperation,
  error?: DatabaseErrorLike | null,
) {
  const databaseCode =
    typeof error?.code === "string" && error.code ? error.code : undefined;
  return new GoogleConnectionPersistenceError(
    publicCode,
    operation,
    databaseCode,
    databaseCategory(databaseCode),
  );
}

export interface GoogleOAuthPersistenceDependencies {
  exchangeCode: (
    code: string,
    redirectUri: string,
  ) => Promise<GoogleTokenResponse>;
  resolveTeacherContext: (
    authenticatedUserId: string,
  ) => Promise<TeacherContext>;
  findExistingConnection: (
    teacherId: string,
    workspaceId: string,
  ) => Promise<ExistingConnection | null>;
  storeConnection: (
    values: Record<string, unknown>,
  ) => Promise<StoredConnection>;
  encrypt: (value: GoogleCredentials) => string;
  decrypt: (value: string) => GoogleCredentials;
  now: () => Date;
}

export function createGoogleOAuthPersistenceDependencies(): GoogleOAuthPersistenceDependencies {
  let admin: ReturnType<typeof createSupabaseAdminClient>;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    throw new GoogleConnectionPersistenceError(
      "GOOGLE_ADMIN_CONFIGURATION_MISSING",
      "admin_client",
      undefined,
      "configuration_error",
    );
  }

  return {
    exchangeCode: exchangeGoogleCode,
    async resolveTeacherContext(authenticatedUserId) {
      const { data: tutorProfile, error: profileError } = await admin
        .from("tutor_profiles")
        .select("id,workspace_id,user_id")
        .eq("user_id", authenticatedUserId)
        .maybeSingle();
      if (profileError) {
        throw persistenceDatabaseError(
          "GOOGLE_TEACHER_PROFILE_LOOKUP_FAILED",
          "teacher_profile_lookup",
          profileError,
        );
      }
      if (
        !tutorProfile ||
        tutorProfile.user_id !== authenticatedUserId ||
        !tutorProfile.id ||
        !tutorProfile.workspace_id
      ) {
        throw new GoogleConnectionPersistenceError(
          "GOOGLE_TEACHER_WORKSPACE_FORBIDDEN",
          "teacher_profile_lookup",
        );
      }

      const { data: membership, error: membershipError } = await admin
        .from("workspace_members")
        .select("workspace_id,user_id,status")
        .eq("workspace_id", tutorProfile.workspace_id)
        .eq("user_id", authenticatedUserId)
        .eq("status", "active")
        .maybeSingle();
      if (membershipError) {
        throw persistenceDatabaseError(
          "GOOGLE_WORKSPACE_MEMBERSHIP_LOOKUP_FAILED",
          "workspace_membership_lookup",
          membershipError,
        );
      }
      if (
        !membership ||
        membership.user_id !== authenticatedUserId ||
        membership.workspace_id !== tutorProfile.workspace_id ||
        membership.status !== "active"
      ) {
        throw new GoogleConnectionPersistenceError(
          "GOOGLE_TEACHER_WORKSPACE_FORBIDDEN",
          "workspace_membership_lookup",
        );
      }

      return {
        teacherId: tutorProfile.id as string,
        workspaceId: tutorProfile.workspace_id as string,
      };
    },
    async findExistingConnection(teacherId, workspaceId) {
      const { data, error } = await admin
        .from("integration_connections")
        .select(
          "id,encrypted_credentials,selected_calendar_id,external_account_id,label,settings,created_at",
        )
        .eq("teacher_id", teacherId)
        .eq("workspace_id", workspaceId)
        .eq("provider", GOOGLE_PROVIDER)
        .maybeSingle();
      if (error) {
        throw persistenceDatabaseError(
          "GOOGLE_CONNECTION_LOOKUP_FAILED",
          "connection_lookup",
          error,
        );
      }
      return (data as ExistingConnection | null) ?? null;
    },
    async storeConnection(values) {
      const { data, error } = await admin
        .from("integration_connections")
        .upsert(values, { onConflict: "teacher_id,provider" })
        .select("id")
        .single();
      if (error || !data?.id) {
        throw persistenceDatabaseError(
          "GOOGLE_CONNECTION_WRITE_FAILED",
          "connection_upsert",
          error,
        );
      }
      return { id: data.id as string };
    },
    encrypt: encryptSecret,
    decrypt: decryptSecret,
    now: () => new Date(),
  };
}

export async function persistGoogleCalendarConnection(
  input: {
    authenticatedUserId: string;
    code: string;
    redirectUri: string;
  },
  dependencies?: GoogleOAuthPersistenceDependencies,
): Promise<{
  connectionId: string;
  teacherId: string;
  workspaceId: string;
  reusedRefreshToken: boolean;
}> {
  const persistence =
    dependencies ?? createGoogleOAuthPersistenceDependencies();
  const teacher = await persistence.resolveTeacherContext(
    input.authenticatedUserId,
  );
  const [tokens, existing] = await Promise.all([
    persistence.exchangeCode(input.code, input.redirectUri),
    persistence.findExistingConnection(teacher.teacherId, teacher.workspaceId),
  ]);

  let existingCredentials: GoogleCredentials | null = null;
  if (!tokens.refresh_token && existing?.encrypted_credentials) {
    existingCredentials = persistence.decrypt(existing.encrypted_credentials);
  }
  const refreshToken =
    tokens.refresh_token ?? existingCredentials?.refreshToken;
  if (!refreshToken) throw new Error("GOOGLE_REFRESH_TOKEN_MISSING");

  const now = persistence.now();
  const timestamp = now.toISOString();
  const calendarId = existing?.selected_calendar_id || "primary";
  const credentials: GoogleCredentials = {
    accessToken: tokens.access_token,
    refreshToken,
    expiresAt: now.getTime() + tokens.expires_in * 1000,
    calendarId,
  };
  const connection = await persistence.storeConnection({
    workspace_id: teacher.workspaceId,
    teacher_id: teacher.teacherId,
    provider: GOOGLE_PROVIDER,
    status: "connected",
    label: existing?.label || "Kalendarz główny",
    external_account_id: existing?.external_account_id ?? null,
    selected_calendar_id: calendarId,
    settings: existing?.settings ?? {},
    encrypted_credentials: persistence.encrypt(credentials),
    sync_token: null,
    sync_state: "pending",
    sync_requested_at: timestamp,
    last_error: null,
    created_at: existing?.created_at ?? timestamp,
    updated_at: timestamp,
  });
  return {
    connectionId: connection.id,
    teacherId: teacher.teacherId,
    workspaceId: teacher.workspaceId,
    reusedRefreshToken: !tokens.refresh_token && Boolean(existingCredentials),
  };
}
