import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { createBrowserClient } = vi.hoisted(() => ({
  createBrowserClient: vi.fn(() => ({ auth: {} })),
}));

vi.mock("@supabase/ssr", () => ({ createBrowserClient }));

describe("Supabase browser client configuration", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("uses bundled public configuration when available", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project-ref.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { createSupabaseBrowserClient } = await import("./supabase-browser");
    await createSupabaseBrowserClient();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(createBrowserClient).toHaveBeenCalledWith(
      "https://project-ref.supabase.co",
      "sb_publishable_test",
    );
  });

  it("loads Vercel integration aliases through the same-origin API", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json({
          url: "https://project-ref.supabase.co",
          key: "sb_publishable_from_server",
        }),
      ),
    );

    const { createSupabaseBrowserClient } = await import("./supabase-browser");
    await Promise.all([
      createSupabaseBrowserClient(),
      createSupabaseBrowserClient(),
    ]);

    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch).toHaveBeenCalledWith("/api/auth/config", {
      cache: "no-store",
      credentials: "same-origin",
    });
    expect(createBrowserClient).toHaveBeenCalledOnce();
  });
});
