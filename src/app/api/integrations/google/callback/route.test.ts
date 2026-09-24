import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  getUser: vi.fn(),
  persist: vi.fn(),
  initialize: vi.fn(),
  currentTeacher: vi.fn(),
  stateResult: {
    data: { teacher_id: "teacher-1" } as { teacher_id: string } | null,
    error: null as Error | null,
  },
  filters: [] as Array<[string, string, unknown]>,
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: mocks.after };
});

vi.mock("@/server/supabase", () => ({
  createSupabaseServerClient: vi.fn(async () => {
    const query = {
      delete: vi.fn(() => query),
      eq: vi.fn((column: string, value: unknown) => {
        mocks.filters.push(["eq", column, value]);
        return query;
      }),
      is: vi.fn((column: string, value: unknown) => {
        mocks.filters.push(["is", column, value]);
        return query;
      }),
      gt: vi.fn((column: string, value: unknown) => {
        mocks.filters.push(["gt", column, value]);
        return query;
      }),
      select: vi.fn(() => query),
      maybeSingle: vi.fn(async () => mocks.stateResult),
    };
    return {
      auth: { getUser: mocks.getUser },
      from: vi.fn(() => query),
    };
  }),
}));

vi.mock("@/server/google-calendar-oauth", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/server/google-calendar-oauth")>();
  return { ...actual, persistGoogleCalendarConnection: mocks.persist };
});

vi.mock("@/server/google-calendar-sync", () => ({
  initializeGoogleConnection: mocks.initialize,
}));
vi.mock("@/server/auth", () => ({ currentTeacher: mocks.currentTeacher }));

import { GET } from "./route";
import { GoogleConnectionPersistenceError } from "@/server/google-calendar-oauth";

const callbackUrl = "https://easy4tutor.pl/api/integrations/google/callback";

describe("Google Calendar OAuth callback", () => {
  beforeEach(() => {
    vi.stubEnv("GOOGLE_CALENDAR_CLIENT_ID", "calendar-client-id");
    vi.stubEnv("GOOGLE_CALENDAR_CLIENT_SECRET", "calendar-client-secret");
    vi.stubEnv("GOOGLE_CALENDAR_REDIRECT_URI", callbackUrl);
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "teacher-1" } },
      error: null,
    });
    mocks.currentTeacher.mockResolvedValue({
      id: "teacher-1",
      subscription: { status: "trial", tier: "free" },
    });
    mocks.persist.mockResolvedValue({
      connectionId: "connection-1",
      teacherId: "teacher-1",
      workspaceId: "workspace-1",
      reusedRefreshToken: false,
    });
    mocks.initialize.mockResolvedValue({
      sync: "fulfilled",
      watch: "fulfilled",
    });
    mocks.stateResult.data = { teacher_id: "teacher-1" };
    mocks.stateResult.error = null;
    mocks.after.mockImplementation((callback: () => unknown) => {
      void Promise.resolve(callback()).catch(() => undefined);
    });
    vi.spyOn(console, "info").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
    mocks.filters.length = 0;
  });

  it("consumes owned state, persists the connection, starts initialization, and redirects successfully", async () => {
    const response = await GET(
      new Request(`${callbackUrl}?state=valid-state&code=authorization-code`),
    );

    expect(mocks.filters).toEqual(
      expect.arrayContaining([
        ["eq", "teacher_id", "teacher-1"],
        ["eq", "provider", "google"],
        ["is", "consumed_at", null],
      ]),
    );
    expect(
      mocks.filters.some(
        ([kind, column]) => kind === "gt" && column === "expires_at",
      ),
    ).toBe(true);
    expect(mocks.persist).toHaveBeenCalledWith({
      authenticatedUserId: "teacher-1",
      code: "authorization-code",
      redirectUri: callbackUrl,
    });
    expect(mocks.after).toHaveBeenCalledOnce();
    expect(mocks.initialize).toHaveBeenCalledWith("connection-1");
    expect(response.headers.get("location")).toBe(
      "https://easy4tutor.pl/app/ustawienia/integracje?google=connected",
    );
  });

  it.each([
    "GOOGLE_CALENDAR_CLIENT_ID",
    "GOOGLE_CALENDAR_CLIENT_SECRET",
    "GOOGLE_CALENDAR_REDIRECT_URI",
  ])("rejects a missing %s configuration", async (name) => {
    vi.stubEnv(name, "");
    const response = await GET(
      new Request(`${callbackUrl}?state=valid-state&code=authorization-code`),
    );
    expect(response.headers.get("location")).toContain("google=error");
    expect(mocks.persist).not.toHaveBeenCalled();
  });

  it("rejects a missing state without exposing the authorization code", async () => {
    const response = await GET(
      new Request(`${callbackUrl}?code=secret-authorization-code`),
    );
    expect(response.headers.get("location")).toContain("google=error");
    expect(response.headers.get("location")).not.toContain("secret");
  });

  it("rejects an invalid, expired, or already-used state", async () => {
    mocks.stateResult.data = null;
    const response = await GET(
      new Request(`${callbackUrl}?state=invalid&code=authorization-code`),
    );
    expect(response.headers.get("location")).toContain("google=error");
    expect(mocks.persist).not.toHaveBeenCalled();
  });

  it("rejects a missing code after consuming the valid state", async () => {
    const response = await GET(new Request(`${callbackUrl}?state=valid-state`));
    expect(response.headers.get("location")).toContain("google=error");
    expect(mocks.persist).not.toHaveBeenCalled();
  });

  it("rechecks entitlement before exchanging the authorization code", async () => {
    mocks.currentTeacher.mockResolvedValue({
      id: "teacher-1",
      subscription: { status: "active", tier: "free" },
    });
    const response = await GET(
      new Request(`${callbackUrl}?state=valid-state&code=authorization-code`),
    );
    expect(response.headers.get("location")).toContain("google=plan_required");
    expect(mocks.persist).not.toHaveBeenCalled();
  });

  it("returns a generic error when token exchange or persistence fails", async () => {
    mocks.persist.mockRejectedValue(new Error("GOOGLE_TOKEN_EXCHANGE_FAILED"));
    const response = await GET(
      new Request(`${callbackUrl}?state=valid-state&code=authorization-code`),
    );
    expect(response.headers.get("location")).toContain("google=error");
    expect(response.headers.get("location")).not.toContain("TOKEN_EXCHANGE");
  });

  it("logs safe database diagnostics without leaking OAuth or credential secrets", async () => {
    mocks.persist.mockRejectedValue(
      new GoogleConnectionPersistenceError(
        "GOOGLE_CONNECTION_WRITE_FAILED",
        "connection_upsert",
        "42501",
        "permission_denied",
      ),
    );
    const response = await GET(
      new Request(
        `${callbackUrl}?state=valid-state&code=secret-authorization-code`,
      ),
    );

    const logs = vi
      .mocked(console.info)
      .mock.calls.map(([entry]) => String(entry))
      .join("\n");
    expect(response.headers.get("location")).toContain("google=error");
    expect(logs).toContain('"error":"GOOGLE_CONNECTION_WRITE_FAILED"');
    expect(logs).toContain('"persistenceOperation":"connection_upsert"');
    expect(logs).toContain('"databaseCode":"42501"');
    expect(logs).toContain('"databaseCategory":"permission_denied"');
    expect(logs).not.toContain("secret-authorization-code");
    expect(logs).not.toContain("access-token");
    expect(logs).not.toContain("refresh-token");
    expect(logs).not.toContain("client-secret");
    expect(logs).not.toContain("service-role");
  });

  it("keeps the successful redirect when post-persistence Google initialization is temporary unavailable", async () => {
    mocks.initialize.mockRejectedValue(new Error("GOOGLE_NETWORK_ERROR"));
    const response = await GET(
      new Request(`${callbackUrl}?state=valid-state&code=authorization-code`),
    );
    expect(response.headers.get("location")).toContain("google=connected");
    expect(mocks.persist).toHaveBeenCalledOnce();
  });
});
