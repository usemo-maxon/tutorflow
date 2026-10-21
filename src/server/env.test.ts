import { afterEach, describe, expect, it, vi } from "vitest";
import { isSupabaseConfigured } from "./env";

describe("backend selection", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the isolated file backend in development when a data directory is set", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("TUTORFLOW_DATA_DIR", "C:\\tmp\\easy4tutor-demo");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");

    expect(isSupabaseConfigured()).toBe(false);
  });

  it("does not let the development override disable Supabase in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("TUTORFLOW_DATA_DIR", "C:\\tmp\\easy4tutor-demo");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");

    expect(isSupabaseConfigured()).toBe(true);
  });

  it("keeps Supabase enabled when the local data directory is blank", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("TUTORFLOW_DATA_DIR", "   ");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");

    expect(isSupabaseConfigured()).toBe(true);
  });
});
