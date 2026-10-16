import type {
  LessonWorkspaceData,
  LessonWorkspaceMaterial,
  PreviousLessonReuseCandidate,
} from "./lesson-workspace";

export const PREPARATION_HISTORY_LESSON_LIMIT = 5;
export const PREPARATION_HISTORY_MATERIAL_LIMIT = 8;
export const PREPARATION_AVAILABLE_MATERIAL_LIMIT = 12;

export type PreparationMaterialSource =
  | {
      kind: "current_lesson";
      label: string;
      lessonId: string;
      lessonStartsAt: string;
    }
  | {
      kind: "previous_lesson";
      label: string;
      lessonId: string;
      lessonStartsAt: string;
      lessonTopic?: string;
    }
  | {
      kind: "student_assignment";
      label: string;
    }
  | {
      kind: "group_assignment";
      label: string;
    };

export interface PreparationMaterial extends LessonWorkspaceMaterial {
  available: boolean;
  sources: PreparationMaterialSource[];
}

export interface LessonPreparationContext {
  historicalMaterials: PreparationMaterial[];
  availableMaterials: PreparationMaterial[];
  recentLessonCount: number;
}

export function composeLessonPreparationContext(
  workspace: Pick<
    LessonWorkspaceData,
    "lesson" | "materials" | "availableMaterials" | "previousLessons"
  >,
): LessonPreparationContext {
  const recentLessons = (workspace.previousLessons ?? []).slice(
    0,
    PREPARATION_HISTORY_LESSON_LIMIT,
  );
  const historical = mergeMaterials(
    recentLessons.flatMap((lesson) =>
      lesson.materials.map((material) => ({
        material,
        source: previousLessonSource(lesson),
        available: material.available,
      })),
    ),
  ).slice(0, PREPARATION_HISTORY_MATERIAL_LIMIT);

  const available = mergeMaterials([
    ...workspace.materials.map((material) => ({
      material,
      source: {
        kind: "current_lesson" as const,
        label: "Bieżąca lekcja",
        lessonId: workspace.lesson.id,
        lessonStartsAt: workspace.lesson.startsAt,
      },
      available: true,
    })),
    ...workspace.availableMaterials.student.map((material) => ({
      material,
      source: {
        kind: "student_assignment" as const,
        label: material.sourceLabel
          ? `Uczeń: ${material.sourceLabel}`
          : "Materiał ucznia",
      },
      available: true,
    })),
    ...workspace.availableMaterials.group.map((material) => ({
      material,
      source: {
        kind: "group_assignment" as const,
        label: material.sourceLabel
          ? `Grupa: ${material.sourceLabel}`
          : "Materiał grupy",
      },
      available: true,
    })),
    ...historical
      .filter((material) => material.available)
      .flatMap((material) =>
        material.sources.map((source) => ({
          material,
          source,
          available: true,
        })),
      ),
  ]).slice(0, PREPARATION_AVAILABLE_MATERIAL_LIMIT);

  return {
    historicalMaterials: historical,
    availableMaterials: available,
    recentLessonCount: recentLessons.length,
  };
}

function previousLessonSource(
  lesson: PreviousLessonReuseCandidate,
): PreparationMaterialSource {
  return {
    kind: "previous_lesson",
    label: lesson.topic || "Poprzednia lekcja",
    lessonId: lesson.id,
    lessonStartsAt: lesson.startsAt,
    lessonTopic: lesson.topic || undefined,
  };
}

function mergeMaterials(
  entries: Array<{
    material: LessonWorkspaceMaterial;
    source: PreparationMaterialSource;
    available: boolean;
  }>,
): PreparationMaterial[] {
  const merged = new Map<string, PreparationMaterial>();
  for (const entry of entries) {
    const existing = merged.get(entry.material.id);
    if (!existing) {
      merged.set(entry.material.id, {
        ...entry.material,
        available: entry.available,
        sources: [entry.source],
      });
      continue;
    }
    existing.available ||= entry.available;
    if (!existing.sources.some((source) => sameSource(source, entry.source))) {
      existing.sources.push(entry.source);
    }
  }
  return [...merged.values()];
}

function sameSource(
  left: PreparationMaterialSource,
  right: PreparationMaterialSource,
) {
  if (left.kind !== right.kind || left.label !== right.label) return false;
  if ("lessonId" in left && "lessonId" in right) {
    return left.lessonId === right.lessonId;
  }
  return true;
}
