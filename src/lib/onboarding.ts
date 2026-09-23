import type { AppData } from "./domain";

export interface OnboardingProgress {
  profileReady: boolean;
  firstStudent: boolean;
  firstLesson: boolean;
  googleConnected: boolean;
  completed: boolean;
}

export type OnboardingRequirement = "profile" | "student" | "lesson";

export function isValidTimezone(timezone: string): boolean {
  if (!timezone.trim()) return false;
  try {
    new Intl.DateTimeFormat("pl-PL", { timeZone: timezone }).format();
    return true;
  } catch {
    return false;
  }
}

export function deriveOnboardingProgress(
  data: Pick<AppData, "teacher" | "students" | "lessons" | "integrations">,
): OnboardingProgress {
  return {
    profileReady:
      data.teacher.name.trim().length >= 2 &&
      isValidTimezone(data.teacher.timezone),
    firstStudent: data.students.some((student) => student.status === "active"),
    firstLesson: data.lessons.some((lesson) => lesson.status !== "cancelled"),
    googleConnected: data.integrations.google.status === "connected",
    completed: Boolean(data.teacher.onboardingCompletedAt),
  };
}

export function missingOnboardingRequirements(
  progress: OnboardingProgress,
): OnboardingRequirement[] {
  const missing: OnboardingRequirement[] = [];
  if (!progress.profileReady) missing.push("profile");
  if (!progress.firstStudent) missing.push("student");
  if (!progress.firstLesson) missing.push("lesson");
  return missing;
}
