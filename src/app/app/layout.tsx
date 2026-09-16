import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { Providers } from "@/components/providers";
import { currentTeacher } from "@/server/auth";

export default async function TeacherLayout({
  children,
}: {
  children: ReactNode;
}) {
  const teacher = await currentTeacher();
  if (!teacher) redirect("/logowanie");
  return (
    <Providers>
      <AppShell teacher={teacher}>{children}</AppShell>
    </Providers>
  );
}
