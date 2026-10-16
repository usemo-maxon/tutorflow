import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  currentTeacherId: vi.fn(),
  saveSharedTemplate: vi.fn(),
}));

vi.mock("@/server/auth", () => ({ currentTeacherId: mocks.currentTeacherId }));
vi.mock("@/server/shared-templates", () => ({
  saveSharedTemplate: mocks.saveSharedTemplate,
}));

import { POST } from "./route";

const context = {
  params: Promise.resolve({
    publicationId: "11000000-0000-4000-8000-000000000001",
  }),
};

describe("save shared template route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.currentTeacherId.mockResolvedValue(
      "11111111-1111-4111-8111-111111111111",
    );
    mocks.saveSharedTemplate.mockResolvedValue({ templateId: "private-copy" });
  });

  it("creates an independent private copy", async () => {
    const response = await POST(
      new Request("https://easy4tutor.pl/api/shared-templates/id/save", {
        method: "POST",
      }),
      context,
    );
    expect(response.status).toBe(201);
    expect(mocks.saveSharedTemplate).toHaveBeenCalledWith(
      "11111111-1111-4111-8111-111111111111",
      "11000000-0000-4000-8000-000000000001",
    );
  });

  it("rejects cross-site mutations before cloning", async () => {
    const response = await POST(
      new Request("https://easy4tutor.pl/api/shared-templates/id/save", {
        method: "POST",
        headers: { "sec-fetch-site": "cross-site" },
      }),
      context,
    );
    expect(response.status).toBe(403);
    expect(mocks.saveSharedTemplate).not.toHaveBeenCalled();
  });
});
