export type StudentComposerContext = "default" | "onboarding";
export type LessonAfterCreate = "lesson" | "onboarding";

export function studentCreatedPath(
  context: StudentComposerContext,
  studentId: string,
): string | null {
  return context === "default" ? `/app/uczniowie/${studentId}` : null;
}

export function lessonCreatedPath(
  afterCreate: LessonAfterCreate | undefined,
  lessonId: string,
): string | null {
  return afterCreate === "onboarding" ? null : `/app/lekcje/${lessonId}`;
}
