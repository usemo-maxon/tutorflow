import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultPublicProfile } from "@/lib/public-profile";

const mocks = vi.hoisted(() => ({
  currentTeacher: vi.fn(),
  save: vi.fn(),
  publish: vi.fn(),
  unpublish: vi.fn(),
}));
vi.mock("@/server/auth", () => ({ currentTeacher: mocks.currentTeacher }));
vi.mock("@/server/public-profile", () => ({
  getOwnPublicProfile: vi.fn(),
  saveOwnPublicProfile: mocks.save,
  publishOwnPublicProfile: mocks.publish,
  unpublishOwnPublicProfile: mocks.unpublish,
}));
import { POST, PUT, DELETE } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.currentTeacher.mockResolvedValue({
    id: "owner",
    name: "Anna",
    subscription: { tier: "free", status: "active", readOnly: false },
  });
  mocks.save.mockResolvedValue(defaultPublicProfile("Anna Profil"));
  mocks.publish.mockResolvedValue(defaultPublicProfile("Anna Profil"));
});
const request = (method: string, headers = {}) =>
  new Request("https://example.test/api/public-profile", {
    method,
    headers: { "content-type": "application/json", ...headers },
    ...(method === "DELETE"
      ? {}
      : { body: JSON.stringify(defaultPublicProfile("Anna Profil")) }),
  });

describe("profile mutation authorization", () => {
  it.each([
    [PUT, "PUT"],
    [POST, "POST"],
    [DELETE, "DELETE"],
  ] as const)("requires identity and write access", async (handler, method) => {
    mocks.currentTeacher.mockResolvedValue(null);
    expect((await handler(request(method))).status).toBe(401);
    mocks.currentTeacher.mockResolvedValue({
      id: "owner",
      subscription: { tier: "pro", status: "past_due", readOnly: true },
    });
    expect((await handler(request(method))).status).toBe(403);
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.publish).not.toHaveBeenCalled();
    expect(mocks.unpublish).not.toHaveBeenCalled();
  });
  it("rejects a cross-origin cookie request before mutation", async () => {
    expect(
      (await PUT(request("PUT", { origin: "https://attacker.test" }))).status,
    ).toBe(403);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("returns validation errors for malformed JSON", async () => {
    const response = await PUT(
      new Request("https://example.test/api/public-profile", {
        method: "PUT",
        body: "{",
      }),
    );
    expect(response.status).toBe(400);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("preserves verified lifetime write access independent of ordinary expiration", async () => {
    mocks.currentTeacher.mockResolvedValue({
      id: "owner",
      name: "Anna",
      subscription: {
        tier: "free",
        status: "past_due",
        readOnly: true,
        accessGrant: "owner_lifetime",
      },
    });
    expect((await PUT(request("PUT"))).status).toBe(200);
    expect(mocks.save).toHaveBeenCalledOnce();
  });
});
