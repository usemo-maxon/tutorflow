import type { ReactNode } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { requirePlatformAdmin } from "@/server/platform-admin";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const admin = await requirePlatformAdmin();
  return <AdminShell role={admin.role}>{children}</AdminShell>;
}
