import { describe, expect, it, vi } from "vitest";
import type { GoogleCredentials } from "./google-calendar";
import {
  persistGoogleCalendarConnection,
  type GoogleOAuthPersistenceDependencies,
} from "./google-calendar-oauth";

function dependencies(
  overrides: Partial<GoogleOAuthPersistenceDependencies> = {},
) {
  const stored: Record<string, unknown>[] = [];
  const defaults: GoogleOAuthPersistenceDependencies = {
    exchangeCode: vi.fn(async () => ({
      access_token: "new-access-token",
      refresh_token: "new-refresh-token",
      expires_in: 3600,
    })),
    resolveTeacherContext: vi.fn(async () => ({
      teacherId: "teacher-1",
      workspaceId: "workspace-1",
    })),
    findExistingConnection: vi.fn(async () => null),
    storeConnection: vi.fn(async (values) => {
      stored.push(values);
      return { id: "connection-1" };
    }),
    recoverAfterReconnect: vi.fn(async () => undefined),
    encrypt: vi.fn((value) => JSON.stringify(value)),
    decrypt: vi.fn((value) => JSON.parse(value) as GoogleCredentials),
    now: () => new Date("2035-01-10T10:00:00.000Z"),
  };
  return { dependencies: { ...defaults, ...overrides }, stored };
}

describe("Google Calendar OAuth connection persistence", () => {
  it("persists a new connection with the exact configured redirect URI", async () => {
    const setup = dependencies();
    const result = await persistGoogleCalendarConnection(
      {
        authenticatedUserId: "auth-user-1",
        code: "authorization-code",
        redirectUri: "https://easy4tutor.pl/api/integrations/google/callback",
      },
      setup.dependencies,
    );

    expect(setup.dependencies.exchangeCode).toHaveBeenCalledWith(
      "authorization-code",
      "https://easy4tutor.pl/api/integrations/google/callback",
    );
    expect(setup.dependencies.resolveTeacherContext).toHaveBeenCalledWith(
      "auth-user-1",
    );
    expect(setup.dependencies.findExistingConnection).toHaveBeenCalledWith(
      "teacher-1",
      "workspace-1",
    );
    expect(setup.stored[0]).toMatchObject({
      workspace_id: "workspace-1",
      teacher_id: "teacher-1",
      provider: "google",
      status: "connected",
      selected_calendar_id: "primary",
      external_account_id: null,
      settings: {},
      sync_state: "pending",
      last_error: null,
    });
    expect(result).toEqual({
      connectionId: "connection-1",
      teacherId: "teacher-1",
      workspaceId: "workspace-1",
      reusedRefreshToken: false,
    });
  });

  it("preserves the encrypted refresh token when Google omits a new one", async () => {
    const existingCredentials: GoogleCredentials = {
      accessToken: "old-access-token",
      refreshToken: "existing-refresh-token",
      expiresAt: 1,
      calendarId: "calendar-2",
    };
    const setup = dependencies({
      exchangeCode: vi.fn(async () => ({
        access_token: "new-access-token",
        expires_in: 1800,
      })),
      findExistingConnection: vi.fn(async () => ({
        id: "connection-1",
        encrypted_credentials: JSON.stringify(existingCredentials),
        selected_calendar_id: "calendar-2",
        external_account_id: "account-1",
        label: "Mój kalendarz",
        settings: { importDeclined: false },
        created_at: "2034-12-01T10:00:00.000Z",
      })),
    });

    const result = await persistGoogleCalendarConnection(
      {
        authenticatedUserId: "auth-user-1",
        code: "authorization-code",
        redirectUri: "https://easy4tutor.pl/api/integrations/google/callback",
      },
      setup.dependencies,
    );

    const encrypted = vi.mocked(setup.dependencies.encrypt).mock.calls[0]?.[0];
    expect(encrypted).toMatchObject({
      accessToken: "new-access-token",
      refreshToken: "existing-refresh-token",
      calendarId: "calendar-2",
    });
    expect(setup.stored[0]).toMatchObject({
      selected_calendar_id: "calendar-2",
      external_account_id: "account-1",
      label: "Mój kalendarz",
      settings: { importDeclined: false },
      created_at: "2034-12-01T10:00:00.000Z",
    });
    expect(result.reusedRefreshToken).toBe(true);
    expect(setup.dependencies.recoverAfterReconnect).toHaveBeenCalledWith(
      "teacher-1",
      "workspace-1",
    );
  });

  it("rejects a first connection when Google supplies no refresh token", async () => {
    const setup = dependencies({
      exchangeCode: vi.fn(async () => ({
        access_token: "new-access-token",
        expires_in: 1800,
      })),
    });
    await expect(
      persistGoogleCalendarConnection(
        {
          authenticatedUserId: "auth-user-1",
          code: "authorization-code",
          redirectUri: "https://easy4tutor.pl/api/integrations/google/callback",
        },
        setup.dependencies,
      ),
    ).rejects.toThrow("GOOGLE_REFRESH_TOKEN_MISSING");
    expect(setup.dependencies.storeConnection).not.toHaveBeenCalled();
  });

  it("does not report success when the database connection write fails", async () => {
    const setup = dependencies({
      storeConnection: vi.fn(async () => {
        throw new Error("GOOGLE_CONNECTION_WRITE_FAILED");
      }),
    });
    await expect(
      persistGoogleCalendarConnection(
        {
          authenticatedUserId: "auth-user-1",
          code: "authorization-code",
          redirectUri: "https://easy4tutor.pl/api/integrations/google/callback",
        },
        setup.dependencies,
      ),
    ).rejects.toThrow("GOOGLE_CONNECTION_WRITE_FAILED");
  });

  it("rejects a teacher/workspace mismatch before token exchange or persistence", async () => {
    const setup = dependencies({
      resolveTeacherContext: vi.fn(async () => {
        throw new Error("GOOGLE_TEACHER_WORKSPACE_FORBIDDEN");
      }),
    });

    await expect(
      persistGoogleCalendarConnection(
        {
          authenticatedUserId: "auth-user-1",
          code: "authorization-code",
          redirectUri: "https://easy4tutor.pl/api/integrations/google/callback",
        },
        setup.dependencies,
      ),
    ).rejects.toThrow("GOOGLE_TEACHER_WORKSPACE_FORBIDDEN");
    expect(setup.dependencies.exchangeCode).not.toHaveBeenCalled();
    expect(setup.dependencies.findExistingConnection).not.toHaveBeenCalled();
    expect(setup.dependencies.storeConnection).not.toHaveBeenCalled();
  });
});
