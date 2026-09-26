import type {
  AttendanceStatus,
  LessonStudentOutcome,
  StudentOutcomeDifficulty,
} from "./domain";

export interface LessonOutcomeDraft {
  progressSummary: string;
  difficultyLevel?: StudentOutcomeDifficulty;
  difficultyNote: string;
  nextStep: string;
}

export const difficultyOptions: ReadonlyArray<{
  value: StudentOutcomeDifficulty;
  label: string;
}> = [
  { value: "easy", label: "Łatwo" },
  { value: "mixed", label: "Różnie" },
  { value: "hard", label: "Trudno" },
];

export function outcomeDraft(
  outcome?: LessonStudentOutcome,
): LessonOutcomeDraft {
  return {
    progressSummary: outcome?.progressSummary ?? "",
    difficultyLevel: outcome?.difficultyLevel,
    difficultyNote: outcome?.difficultyNote ?? "",
    nextStep: outcome?.nextStep ?? "",
  };
}

export function buildCompletionOutcomes(
  drafts: Record<string, LessonOutcomeDraft>,
) {
  return Object.entries(drafts)
    .map(([studentId, draft]) => ({
      studentId,
      progressSummary: normalizeText(draft.progressSummary),
      difficultyLevel: draft.difficultyLevel,
      difficultyNote: normalizeText(draft.difficultyNote),
      nextStep: normalizeText(draft.nextStep),
    }))
    .filter(
      (outcome) =>
        outcome.progressSummary ||
        outcome.difficultyLevel ||
        outcome.difficultyNote ||
        outcome.nextStep,
    );
}

export function participantCompletionStatus(
  attendance: AttendanceStatus,
  draft: LessonOutcomeDraft,
): "attendance-missing" | "ready" | "optional-empty" {
  if (attendance === "unknown") return "attendance-missing";
  return draft.progressSummary.trim() ||
    draft.difficultyLevel ||
    draft.difficultyNote.trim() ||
    draft.nextStep.trim()
    ? "ready"
    : "optional-empty";
}

export function difficultyLabel(difficulty?: StudentOutcomeDifficulty) {
  return difficultyOptions.find((option) => option.value === difficulty)?.label;
}

function normalizeText(value: string) {
  return value.trim() || undefined;
}
