import { beforeEach, describe, expect, it, vi } from "vitest";

const currentTeacherId = vi.fn();
const getStudentMemory = vi.fn();

vi.mock("@/server/auth", () => ({ currentTeacherId }));
vi.mock("@/server/student-memory", () => ({ getStudentMemory }));

const { GET } = await import("./route");

describe("GET /api/students/[studentId]/memory", () => {
  beforeEach(() => {
    currentTeacherId.mockReset();
    getStudentMemory.mockReset();
  });

  it("rejects an unauthenticated request", async () => {
    currentTeacherId.mockResolvedValue(null);
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ studentId: "student-1" }),
    });
    expect(response.status).toBe(401);
    expect(getStudentMemory).not.toHaveBeenCalled();
  });

  it("uses only authenticated authority and disables shared caching", async () => {
    currentTeacherId.mockResolvedValue("teacher-1");
    getStudentMemory.mockResolvedValue({ student: { id: "student-1" } });
    const response = await GET(
      new Request("http://localhost?workspaceId=attacker-workspace"),
      { params: Promise.resolve({ studentId: "student-1" }) },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(getStudentMemory).toHaveBeenCalledWith("teacher-1", "student-1");
  });
});
