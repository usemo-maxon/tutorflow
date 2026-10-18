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
    const [
      profileResult,
      subscriptionResult,
      ownerLifetimeResult,
      platformAdminResult,
      suspendedResult,
      overrideResult,
    ] = await Promise.all([
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
      supabase.rpc("current_user_has_owner_lifetime_access"),
      supabase.rpc("current_user_is_platform_admin"),
      supabase.rpc("current_user_is_suspended"),
      supabase.rpc("current_user_subscription_override"),
    ]);
    if (
      profileResult.error ||
      subscriptionResult.error ||
      ownerLifetimeResult.error ||
      platformAdminResult.error ||
      suspendedResult.error ||
      overrideResult.error
    )
      return null;
    if (suspendedResult.data === true) return null;
    const profile = profileResult.data;
    const subscription = subscriptionResult.data;
    return {
      id: data.user.id,
      name: profile.full_name,
      email: profile.email,
      timezone: profile.timezone,
      onboardingCompletedAt: profile.onboarding_completed_at ?? undefined,
      isPlatformAdmin: platformAdminResult.data === true,
      subscription: mapSubscriptionRow(
        subscription,
        ownerLifetimeResult.data === true,
        readOverrideTier(overrideResult.data),
      ),
    };
  }
  const cookieStore = await cookies();
  return getTeacherBySession(cookieStore.get(SESSION_COOKIE)?.value);
});

function readOverrideTier(value: unknown): "pro" | "founder" | undefined {
  if (!value || typeof value !== "object") return undefined;
  const tier = (value as { tier?: unknown }).tier;
  return tier === "pro" || tier === "founder" ? tier : undefined;
}

export const currentTeacherId = cache(async (): Promise<string | null> => {
  if (process.env.NODE_ENV === "production" || isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    const suspendedResult = await supabase.rpc("current_user_is_suspended");
    if (suspendedResult.error || suspendedResult.data === true) return null;
    return data.user.id;
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
