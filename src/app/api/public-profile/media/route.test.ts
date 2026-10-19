import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ teacher: vi.fn(), prepare: vi.fn() }));
vi.mock("@/server/auth", () => ({ currentTeacher: mocks.teacher }));
vi.mock("@/server/supabase", () => ({
  createSupabaseServerClient: async () => ({
    storage: { from: () => ({ createSignedUploadUrl: mocks.prepare }) },
  }),
}));
import { POST } from "./route";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.teacher.mockResolvedValue({
    id: "tutor-id",
    subscription: { tier: "free", status: "active", readOnly: false },
  });
  mocks.prepare.mockResolvedValue({
    data: { token: "test-token" },
    error: null,
  });
});
const request = (body: unknown) =>
  new Request("https://example.test/api/public-profile/media", {
    method: "POST",
    body: JSON.stringify(body),
  });
describe("profile media preparation", () => {
  it.each([
    null,
    { kind: "__proto__", type: "video/mp4", size: 1 },
    { kind: "video", type: "video/mp4", size: -1 },
    { kind: "video", type: "video/mp4", size: 75 * 1024 * 1024 + 1 },
  ])("rejects invalid metadata before signing", async (body) => {
    expect((await POST(request(body))).status).toBe(422);
    expect(mocks.prepare).not.toHaveBeenCalled();
  });
  it("denies hosted video to Free", async () => {
    expect(
      (await POST(request({ kind: "video", type: "video/mp4", size: 1024 })))
        .status,
    ).toBe(403);
    expect(mocks.prepare).not.toHaveBeenCalled();
  });
  it("allows Free certificate preparation using a server-owned path", async () => {
    const response = await POST(
      request({ kind: "certificate", type: "application/pdf", size: 1024 }),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).path).toMatch(
      /^tutor-id\/certificate\/[\da-f-]+\.pdf$/,
    );
  });
  it("denies read-only accounts", async () => {
    mocks.teacher.mockResolvedValue({
      id: "tutor-id",
      subscription: { tier: "pro", status: "past_due", readOnly: true },
    });
    expect(
      (await POST(request({ kind: "video", type: "video/mp4", size: 1024 })))
        .status,
    ).toBe(403);
  });
  it("preserves verified lifetime access", async () => {
    mocks.teacher.mockResolvedValue({
      id: "tutor-id",
      subscription: {
        tier: "free",
        status: "past_due",
        readOnly: true,
        accessGrant: "owner_lifetime",
      },
    });
    expect(
      (await POST(request({ kind: "video", type: "video/mp4", size: 1024 })))
        .status,
    ).toBe(200);
  });
});
