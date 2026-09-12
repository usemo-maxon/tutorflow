import "server-only";

import { cookies } from "next/headers";
import type { Teacher } from "@/lib/domain";
import { isSupabaseConfigured } from "./env";
import { getAppData } from "./repository";
import { getTeacherBySession } from "./store";
import { createSupabaseServerClient } from "./supabase";

export const SESSION_COOKIE = "tutorflow_session";

export async function currentTeacher(): Promise<Teacher | null> {
  if (process.env.NODE_ENV === "production" || isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    try {
      return (await getAppData(data.user.id)).teacher;
    } catch {
      return null;
    }
  }
  const cookieStore = await cookies();
  return getTeacherBySession(cookieStore.get(SESSION_COOKIE)?.value);
}

export function safeReturnTo(value: unknown): string {
  return typeof value === "string" &&
    value.startsWith("/app/") &&
    !value.startsWith("//")
    ? value
    : "/app/dzisiaj";
}
