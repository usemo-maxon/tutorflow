export type PlatformAdminRole =
  | "platform_owner"
  | "platform_admin"
  | "support_moderator";

export type AdminPermission =
  | "overview.read"
  | "users.read"
  | "users.manage"
  | "subscriptions.read"
  | "subscriptions.manage"
  | "payments.read"
  | "support.read"
  | "support.manage"
  | "system.read"
  | "system.retry"
  | "audit.read"
  | "settings.read"
  | "settings.manage"
  | "admins.manage"
  | "lifetime.manage";

const ROLE_PERMISSIONS: Record<PlatformAdminRole, readonly AdminPermission[]> = {
  platform_owner: [
    "overview.read",
    "users.read",
    "users.manage",
    "subscriptions.read",
    "subscriptions.manage",
    "payments.read",
    "support.read",
    "support.manage",
    "system.read",
    "system.retry",
    "audit.read",
    "settings.read",
    "settings.manage",
    "admins.manage",
    "lifetime.manage",
  ],
  platform_admin: [
    "overview.read",
    "users.read",
    "users.manage",
    "subscriptions.read",
    "subscriptions.manage",
    "payments.read",
    "support.read",
    "support.manage",
    "system.read",
    "system.retry",
    "audit.read",
    "settings.read",
  ],
  support_moderator: ["users.read", "support.read", "support.manage"],
};

export function hasAdminPermission(
  role: PlatformAdminRole,
  permission: AdminPermission,
): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function adminRoleLabel(role: PlatformAdminRole): string {
  return role === "platform_owner"
    ? "Właściciel platformy"
    : role === "platform_admin"
      ? "Administrator platformy"
      : "Moderator wsparcia";
}

export const ADMIN_PAGE_SIZE = 25;

