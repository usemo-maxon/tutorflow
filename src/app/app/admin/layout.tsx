import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { currentTeacher } from "@/server/auth";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const teacher = await currentTeacher();
  if (!teacher?.isPlatformAdmin) notFound();
  return children;
}
