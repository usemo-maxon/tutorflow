import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
}));

vi.mock("@/server/env", () => ({
  isSupabaseConfigured: vi.fn(() => true),
  siteUrl: vi.fn(() => "https://easy4tutor.pl"),
}));

vi.mock("@/server/supabase", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: {
      signUp: mocks.signUp,
      signInWithPassword: mocks.signInWithPassword,
    },
  })),
  getSupabasePublicConfig: vi.fn(),
}));

import { POST } from "./route";

describe("registration authentication destinations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.signUp.mockResolvedValue({
      data: { user: { id: "teacher-1" }, session: null },
      error: null,
    });
    mocks.signInWithPassword.mockResolvedValue({
      data: { user: { id: "teacher-1" } },
      error: null,
    });
  });

  it("sends email registration confirmation to /app/start", async () => {
    const response = await POST(
      new Request("https://easy4tutor.pl/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: "Anna Nowak",
          email: "anna@example.test",
          password: "bezpieczne-haslo",
        }),
      }),
      { params: Promise.resolve({ action: "register" }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          emailRedirectTo:
            "https://easy4tutor.pl/api/auth/callback?next=%2Fapp%2Fstart",
        }),
      }),
    );
  });

  it("keeps normal login authentication behavior", async () => {
    const response = await POST(
      new Request("https://easy4tutor.pl/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "anna@example.test",
          password: "bezpieczne-haslo",
        }),
      }),
      { params: Promise.resolve({ action: "login" }) },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ teacher: { id: "teacher-1" } });
  });
});
