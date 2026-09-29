import { beforeEach, describe, expect, it, vi } from "vitest";

const currentTeacherId = vi.fn();
const getGroupContinuity = vi.fn();

vi.mock("@/server/auth", () => ({ currentTeacherId }));
vi.mock("@/server/group-continuity", () => ({ getGroupContinuity }));

const { GET } = await import("./route");

describe("GET /api/groups/[groupId]/continuity", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns private continuity for the authenticated tutor", async () => {
    currentTeacherId.mockResolvedValue("teacher");
    getGroupContinuity.mockResolvedValue({ group: { id: "group" } });
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ groupId: "group" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(getGroupContinuity).toHaveBeenCalledWith("teacher", "group");
  });

  it("does not accept client-provided authority without a session", async () => {
    currentTeacherId.mockResolvedValue(null);
    const response = await GET(
      new Request("http://localhost?teacherId=someone-else"),
      { params: Promise.resolve({ groupId: "group" }) },
    );

    expect(response.status).toBe(401);
    expect(getGroupContinuity).not.toHaveBeenCalled();
  });
});
