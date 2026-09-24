import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentTeacherId: vi.fn(),
  searchGlobal: vi.fn(),
}));

vi.mock("@/server/auth", () => ({
  currentTeacherId: mocks.currentTeacherId,
}));

vi.mock("@/server/global-search", () => ({
  searchGlobal: mocks.searchGlobal,
}));

import { GET } from "./route";

describe("GET /api/search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentTeacherId.mockResolvedValue("teacher-a");
    mocks.searchGlobal.mockResolvedValue({
      students: [],
      groups: [],
      lessons: [],
    });
  });

  it("returns 401 when no authenticated teacher exists", async () => {
    mocks.currentTeacherId.mockResolvedValue(null);
    const response = await GET(
      new Request("https://easy4tutor.pl/api/search?q=zo"),
    );
    expect(response.status).toBe(401);
    expect(mocks.searchGlobal).not.toHaveBeenCalled();
  });

  it("returns empty entity results without searching below two characters", async () => {
    const response = await GET(
      new Request("https://easy4tutor.pl/api/search?q=z"),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      students: [],
      groups: [],
      lessons: [],
    });
    expect(mocks.searchGlobal).not.toHaveBeenCalled();
  });

  it("derives the teacher server-side for a normal query", async () => {
    await GET(new Request("https://easy4tutor.pl/api/search?q=Zosia"));
    expect(mocks.searchGlobal).toHaveBeenCalledWith("teacher-a", "zosia");
  });

  it("rejects queries longer than 80 characters", async () => {
    const query = "x".repeat(81);
    const response = await GET(
      new Request(`https://easy4tutor.pl/api/search?q=${query}`),
    );
    expect(response.status).toBe(422);
    expect(mocks.searchGlobal).not.toHaveBeenCalled();
  });
});
