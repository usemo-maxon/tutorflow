import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  adminFactory: vi.fn(),
  sessionFactory: vi.fn(),
  upsert: vi.fn(),
  writeResult: {
    data: { id: "connection-1" } as { id: string } | null,
    error: null as { code: string; message: string } | null,
  },
  membership: {
    workspace_id: "workspace-1",
    user_id: "auth-user-1",
    status: "active",
  } as { workspace_id: string; user_id: string; status: string } | null,
}));

vi.mock("./supabase", () => ({
  createSupabaseAdminClient: mocks.adminFactory,
  createSupabaseServerClient: mocks.sessionFactory,
}));

import {
  createGoogleOAuthPersistenceDependencies,
  GoogleConnectionPersistenceError,
} from "./google-calendar-oauth";

function adminClient() {
  return {
    from(table: string) {
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        upsert: vi.fn((values: Record<string, unknown>, options: unknown) => {
          mocks.upsert(values, options);
          return query;
        }),
        maybeSingle: vi.fn(async () => {
          if (table === "tutor_profiles") {
            return {
              data: {
                id: "teacher-1",
                workspace_id: "workspace-1",
                user_id: "auth-user-1",
              },
              error: null,
            };
          }
          if (table === "workspace_members") {
            return { data: mocks.membership, error: null };
          }
          return { data: null, error: null };
        }),
        single: vi.fn(async () => mocks.writeResult),
      };
      return query;
    },
  };
}

describe("Google Calendar privileged persistence dependencies", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.membership = {
      workspace_id: "workspace-1",
      user_id: "auth-user-1",
      status: "active",
    };
    mocks.adminFactory.mockReturnValue(adminClient());
    mocks.writeResult.data = { id: "connection-1" };
    mocks.writeResult.error = null;
  });

  it("uses only the server admin client and upserts on teacher plus provider", async () => {
    const dependencies = createGoogleOAuthPersistenceDependencies();
    const teacher = await dependencies.resolveTeacherContext("auth-user-1");
    await dependencies.storeConnection({
      teacher_id: teacher.teacherId,
      workspace_id: teacher.workspaceId,
      provider: "google",
      encrypted_credentials: "encrypted-value",
    });

    expect(mocks.adminFactory).toHaveBeenCalledOnce();
    expect(mocks.sessionFactory).not.toHaveBeenCalled();
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        teacher_id: "teacher-1",
        workspace_id: "workspace-1",
        provider: "google",
      }),
      { onConflict: "teacher_id,provider" },
    );
  });

  it("rejects a mismatched workspace membership before any credential write", async () => {
    mocks.membership = {
      workspace_id: "other-workspace",
      user_id: "auth-user-1",
      status: "active",
    };
    const dependencies = createGoogleOAuthPersistenceDependencies();

    await expect(
      dependencies.resolveTeacherContext("auth-user-1"),
    ).rejects.toEqual(
      expect.objectContaining<Partial<GoogleConnectionPersistenceError>>({
        publicCode: "GOOGLE_TEACHER_WORKSPACE_FORBIDDEN",
        operation: "workspace_membership_lookup",
      }),
    );
    expect(mocks.upsert).not.toHaveBeenCalled();
    expect(mocks.sessionFactory).not.toHaveBeenCalled();
  });

  it("retains only safe database diagnostics when the privileged upsert fails", async () => {
    mocks.writeResult.data = null;
    mocks.writeResult.error = {
      code: "42501",
      message: "permission denied; refresh-token=must-not-be-propagated",
    };
    const dependencies = createGoogleOAuthPersistenceDependencies();

    await expect(
      dependencies.storeConnection({
        teacher_id: "teacher-1",
        workspace_id: "workspace-1",
        provider: "google",
        encrypted_credentials: "encrypted-value",
      }),
    ).rejects.toEqual(
      expect.objectContaining<Partial<GoogleConnectionPersistenceError>>({
        publicCode: "GOOGLE_CONNECTION_WRITE_FAILED",
        operation: "connection_upsert",
        databaseCode: "42501",
        databaseCategory: "permission_denied",
        message: "GOOGLE_CONNECTION_WRITE_FAILED",
      }),
    );
  });
});
