import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentTeacher: vi.fn(),
  insert: vi.fn(),
}));

vi.mock("@/server/auth", () => ({ currentTeacher: mocks.currentTeacher }));
vi.mock("@/server/supabase", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    from: vi.fn(() => ({ insert: mocks.insert })),
  })),
}));

import { GET } from "./route";

describe("Google Calendar OAuth connect", () => {
  beforeEach(() => {
    vi.stubEnv("GOOGLE_CALENDAR_CLIENT_ID", "calendar-client-id");
    vi.stubEnv("GOOGLE_CALENDAR_CLIENT_SECRET", "calendar-client-secret");
    vi.stubEnv(
      "GOOGLE_CALENDAR_REDIRECT_URI",
      "https://easy4tutor.pl/api/integrations/google/callback",
    );
    mocks.currentTeacher.mockResolvedValue({ id: "teacher-1" });
    mocks.insert.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("stores a hashed expiring state and redirects with Calendar-specific OAuth settings", async () => {
    const response = await GET(
      new Request("https://easy4tutor.pl/api/integrations/google/connect"),
    );
    const location = new URL(response.headers.get("location")!);
    const state = location.searchParams.get("state")!;
    const inserted = mocks.insert.mock.calls[0]?.[0];

    expect(location.origin + location.pathname).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    expect(location.searchParams.get("client_id")).toBe("calendar-client-id");
    expect(location.searchParams.get("redirect_uri")).toBe(
      "https://easy4tutor.pl/api/integrations/google/callback",
    );
    expect(location.searchParams.get("response_type")).toBe("code");
    expect(location.searchParams.get("access_type")).toBe("offline");
    expect(location.searchParams.get("prompt")).toBe("consent");
    expect(location.searchParams.get("include_granted_scopes")).toBe("true");
    expect(location.searchParams.get("scope")).toBe(
      "https://www.googleapis.com/auth/calendar.events",
    );
    expect(inserted).toMatchObject({
      teacher_id: "teacher-1",
      provider: "google",
      token_hash: createHash("sha256").update(state).digest("hex"),
    });
    expect(Date.parse(inserted.expires_at)).toBeGreaterThan(Date.now());
  });

  it("requires an authenticated teacher", async () => {
    mocks.currentTeacher.mockResolvedValue(null);
    const response = await GET(
      new Request("https://easy4tutor.pl/api/integrations/google/connect"),
    );
    expect(response.headers.get("location")).toBe(
      "https://easy4tutor.pl/logowanie",
    );
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
