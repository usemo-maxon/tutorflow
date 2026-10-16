import { z } from "zod";
import type { MaterialLibraryItem } from "./materials";

export const MaterialAssignmentInputSchema = z.object({
  materialId: z.uuid(),
});

export interface AssignedMaterial extends MaterialLibraryItem {
  assignedAt: string;
  source: "student" | "group";
  group?: { id: string; name: string };
}

export interface RecentLessonMaterial extends MaterialLibraryItem {
  lessons: Array<{
    id: string;
    startsAt: string;
    topic?: string;
  }>;
}

export interface StudentMaterialsData {
  direct: AssignedMaterial[];
  fromGroups: AssignedMaterial[];
  recentLessons: RecentLessonMaterial[];
  readOnly: boolean;
}

export type StudentResourceSource =
  | { kind: "student" }
  | { kind: "group"; group?: { id: string; name: string } }
  | {
      kind: "lesson";
      lesson: RecentLessonMaterial["lessons"][number];
    };

export interface StudentResourceItem {
  material: MaterialLibraryItem;
  sources: StudentResourceSource[];
}

export function composeStudentResourceContext(
  data: StudentMaterialsData,
  limit = 8,
): StudentResourceItem[] {
  const merged = new Map<string, StudentResourceItem>();
  const add = (
    material: MaterialLibraryItem,
    source: StudentResourceSource,
  ) => {
    const existing = merged.get(material.id);
    if (!existing) {
      merged.set(material.id, { material, sources: [source] });
      return;
    }
    if (!existing.sources.some((item) => sameResourceSource(item, source))) {
      existing.sources.push(source);
    }
  };
  data.direct.forEach((material) => add(material, { kind: "student" }));
  data.fromGroups.forEach((material) =>
    add(material, { kind: "group", group: material.group }),
  );
  data.recentLessons.forEach((material) =>
    material.lessons.forEach((lesson) =>
      add(material, { kind: "lesson", lesson }),
    ),
  );
  return [...merged.values()].slice(0, limit);
}

function sameResourceSource(
  left: StudentResourceSource,
  right: StudentResourceSource,
) {
  if (left.kind !== right.kind) return false;
  if (left.kind === "student" && right.kind === "student") return true;
  if (left.kind === "group" && right.kind === "group") {
    return left.group?.id === right.group?.id;
  }
  if (left.kind === "lesson" && right.kind === "lesson") {
    return left.lesson.id === right.lesson.id;
  }
  return false;
}

export interface GroupMaterialsData {
  materials: AssignedMaterial[];
  readOnly: boolean;
}
