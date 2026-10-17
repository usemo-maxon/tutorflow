import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ currentTeacher: vi.fn() }));

vi.mock("@/server/auth", () => ({ currentTeacher: mocks.currentTeacher }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

import AdminLayout from "./layout";

describe("platform admin layout", () => {
  it("rejects an ordinary authenticated tutor", async () => {
    mocks.currentTeacher.mockResolvedValue({ isPlatformAdmin: false });
    await expect(
      AdminLayout({ children: <div>Moderation</div> }),
    ).rejects.toThrow("NOT_FOUND");
  });

  it("renders moderation tools for an authorized platform administrator", async () => {
    mocks.currentTeacher.mockResolvedValue({ isPlatformAdmin: true });
    await expect(
      AdminLayout({ children: <div>Moderation</div> }),
    ).resolves.toMatchObject({ props: { children: expect.anything() } });
  });
});
