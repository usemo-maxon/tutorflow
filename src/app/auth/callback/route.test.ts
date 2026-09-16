import { afterEach, describe, expect, it, vi } from "vitest";

const { exchangeCodeForSession } = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
}));

vi.mock("@/server/supabase", () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: { exchangeCodeForSession },
  })),
}));

import { GET } from "./route";

describe("Google OAuth callback", () => {
  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("exchanges the code and redirects on the localhost origin", async () => {
    vi.stubEnv("NODE_ENV", "development");
    exchangeCodeForSession.mockResolvedValue({ error: null });

    const response = await GET(
      new Request(
        "http://localhost:3000/auth/callback?code=authorization-code&next=%2Fapp%2Fkalendarz",
      ),
    );

    expect(exchangeCodeForSession).toHaveBeenCalledWith("authorization-code");
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/app/kalendarz",
    );
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("uses Vercel forwarded host and protocol in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    exchangeCodeForSession.mockResolvedValue({ error: null });

    const response = await GET(
      new Request(
        "http://internal-vercel-host/auth/callback?code=authorization-code",
        {
          headers: {
            "x-forwarded-host": "easy4tutor.pl",
            "x-forwarded-proto": "https",
          },
        },
      ),
    );

    expect(response.headers.get("location")).toBe(
      "https://easy4tutor.pl/app/dzisiaj",
    );
  });

  it("rejects an external next destination", async () => {
    vi.stubEnv("NODE_ENV", "development");
    exchangeCodeForSession.mockResolvedValue({ error: null });

    const response = await GET(
      new Request(
        "http://localhost:3000/auth/callback?code=authorization-code&next=https%3A%2F%2Fevil.example",
      ),
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/app/dzisiaj",
    );
  });

  it("returns a safe login error without exposing provider details", async () => {
    vi.stubEnv("NODE_ENV", "development");
    exchangeCodeForSession.mockResolvedValue({
      error: new Error("sensitive provider error"),
    });

    const response = await GET(
      new Request(
        "http://localhost:3000/auth/callback?code=secret-authorization-code",
      ),
    );
    const location = response.headers.get("location");

    expect(location).toBe(
      "http://localhost:3000/logowanie?error=google_oauth_failed",
    );
    expect(location).not.toContain("sensitive");
    expect(location).not.toContain("secret-authorization-code");
  });
});
