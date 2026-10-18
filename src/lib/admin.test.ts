import { describe, expect, it } from "vitest";
import { hasAdminPermission } from "./admin";

describe("platform administration permissions", () => {
  it("keeps owner-only powers separate", () => {
    expect(hasAdminPermission("platform_owner", "admins.manage")).toBe(true);
    expect(hasAdminPermission("platform_admin", "admins.manage")).toBe(false);
    expect(hasAdminPermission("support_moderator", "lifetime.manage")).toBe(false);
  });

  it("limits support moderators to account metadata and tickets", () => {
    expect(hasAdminPermission("support_moderator", "users.read")).toBe(true);
    expect(hasAdminPermission("support_moderator", "support.manage")).toBe(true);
    expect(hasAdminPermission("support_moderator", "payments.read")).toBe(false);
    expect(hasAdminPermission("support_moderator", "subscriptions.manage")).toBe(false);
  });
});
