import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import type { Teacher } from "@/lib/domain";
import { safeAppPath } from "@/lib/auth-redirect";
import { isSupabaseConfigured } from "./env";
import { getTeacherBySession } from "./store";
import { createSupabaseServerClient } from "./supabase";
import { mapSubscriptionRow } from "./subscription";

export const SESSION_COOKIE = "tutorflow_session";

export const currentTeacher = cache(async (): Promise<Teacher | null> => {
  if (process.env.NODE_ENV === "production" || isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    const [profileResult, subscriptionResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("email,full_name,timezone,onboarding_completed_at")
        .eq("id", data.user.id)
        .single(),
      supabase
        .from("subscriptions")
        .select(
          "status,tier,billing_interval,read_only,trial_ends_at,renews_at",
        )
        .eq("teacher_id", data.user.id)
        .single(),
    ]);
    if (profileResult.error || subscriptionResult.error) return null;
    const profile = profileResult.data;
    const subscription = subscriptionResult.data;
    return {
      id: data.user.id,
      name: profile.full_name,
      email: profile.email,
      timezone: profile.timezone,
      onboardingCompletedAt: profile.onboarding_completed_at ?? undefined,
      subscription: mapSubscriptionRow(subscription),
    };
  }
  const cookieStore = await cookies();
  return getTeacherBySession(cookieStore.get(SESSION_COOKIE)?.value);
});

export const currentTeacherId = cache(async (): Promise<string | null> => {
  if (process.env.NODE_ENV === "production" || isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();
    return error ? null : (data.user?.id ?? null);
  }
  const cookieStore = await cookies();
  return (
    (await getTeacherBySession(cookieStore.get(SESSION_COOKIE)?.value))?.id ??
    null
  );
});

export function safeReturnTo(value: unknown): string {
  return safeAppPath(typeof value === "string" ? value : null);
}
