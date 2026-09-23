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

describe("Telegram connect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("TELEGRAM_BOT_USERNAME", "easy4tutor_test_bot");
    mocks.insert.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("rejects an active Free account without creating a link code", async () => {
    mocks.currentTeacher.mockResolvedValue({
      id: "teacher-1",
      subscription: { status: "active", tier: "free" },
    });
    const response = await GET();
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "PLAN_REQUIRED" });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it("allows a trial account to create the Telegram link", async () => {
    mocks.currentTeacher.mockResolvedValue({
      id: "teacher-1",
      subscription: { status: "trial", tier: "free" },
    });
    await expect(GET()).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.insert).toHaveBeenCalledOnce();
  });
});
