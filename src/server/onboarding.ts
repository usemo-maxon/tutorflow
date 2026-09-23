import "server-only";

import {
  deriveOnboardingProgress,
  missingOnboardingRequirements,
  type OnboardingProgress,
} from "@/lib/onboarding";
import { ApiFailure } from "./errors";
import { appDataFromStore } from "./store";
import { getAppData, localAllowed, mutateStore } from "./repository";
import { createSupabaseServerClient } from "./supabase";

export async function getOnboardingProgress(
  teacherId: string,
): Promise<OnboardingProgress> {
  return deriveOnboardingProgress(await getAppData(teacherId));
}

export async function completeOnboarding(
  teacherId: string,
): Promise<{ completedAt: string; alreadyCompleted: boolean }> {
  if (localAllowed()) {
    return mutateStore(teacherId, (store) => {
      const teacher = store.teachers.find((item) => item.id === teacherId);
      if (!teacher) throw unauthenticated();
      if (teacher.onboardingCompletedAt) {
        return {
          completedAt: teacher.onboardingCompletedAt,
          alreadyCompleted: true,
        };
      }
      assertComplete(
        deriveOnboardingProgress(appDataFromStore(store, teacherId)),
      );
      teacher.onboardingCompletedAt = new Date().toISOString();
      return {
        completedAt: teacher.onboardingCompletedAt,
        alreadyCompleted: false,
      };
    });
  }

  const progress = await getOnboardingProgress(teacherId);
  if (progress.completed) {
    const data = await getAppData(teacherId);
    return {
      completedAt: data.teacher.onboardingCompletedAt!,
      alreadyCompleted: true,
    };
  }
  assertComplete(progress);

  const supabase = await createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || authData.user?.id !== teacherId) throw unauthenticated();

  const completedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("profiles")
    .update({ onboarding_completed_at: completedAt })
    .eq("id", teacherId)
    .is("onboarding_completed_at", null)
    .select("onboarding_completed_at")
    .maybeSingle();
  if (error) throw error;
  if (data?.onboarding_completed_at) {
    return {
      completedAt: data.onboarding_completed_at,
      alreadyCompleted: false,
    };
  }

  const { data: existing, error: existingError } = await supabase
    .from("profiles")
    .select("onboarding_completed_at")
    .eq("id", teacherId)
    .single();
  if (existingError || !existing.onboarding_completed_at)
    throw existingError ?? new Error("ONBOARDING_COMPLETION_FAILED");
  return {
    completedAt: existing.onboarding_completed_at,
    alreadyCompleted: true,
  };
}

function assertComplete(progress: OnboardingProgress): void {
  const missing = missingOnboardingRequirements(progress);
  if (missing.length) {
    throw new ApiFailure(409, {
      code: "ONBOARDING_INCOMPLETE",
      message: "Dokończ wymagane kroki konfiguracji.",
      details: { missing },
    });
  }
}

function unauthenticated(): ApiFailure {
  return new ApiFailure(401, {
    code: "UNAUTHENTICATED",
    message: "Sesja wygasła. Zaloguj się ponownie.",
  });
}
