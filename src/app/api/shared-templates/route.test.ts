import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentTeacherId: vi.fn(),
  getSharedTemplates: vi.fn(),
}));

vi.mock("@/server/auth", () => ({ currentTeacherId: mocks.currentTeacherId }));
vi.mock("@/server/shared-templates", () => ({
  getSharedTemplates: mocks.getSharedTemplates,
}));

import { GET } from "./route";

describe("shared template catalog route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentTeacherId.mockResolvedValue(
      "11111111-1111-4111-8111-111111111111",
    );
    mocks.getSharedTemplates.mockResolvedValue({
      templates: [],
      subjects: [],
      levels: [],
      readOnly: false,
    });
  });

  it("allows an authenticated tutor to browse with validated filters", async () => {
    const response = await GET(
      new Request(
        "https://easy4tutor.pl/api/shared-templates?q=travel&level=A2&duration=60",
      ),
    );
    expect(response.status).toBe(200);
    expect(mocks.getSharedTemplates).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      {
        search: "travel",
        subject: "",
        level: "A2",
        duration: "60",
        view: "recommended",
        sort: "popular",
      },
    );
  });

  it("rejects unauthenticated catalog access", async () => {
    mocks.currentTeacherId.mockResolvedValue(null);
    const response = await GET(
      new Request("https://easy4tutor.pl/api/shared-templates"),
    );
    expect(response.status).toBe(401);
    expect(mocks.getSharedTemplates).not.toHaveBeenCalled();
  });
});
