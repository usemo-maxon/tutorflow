import "server-only";

import type {
  AssignedMaterial,
  GroupMaterialsData,
  RecentLessonMaterial,
  StudentMaterialsData,
} from "@/lib/context-materials";
import type { MaterialLibraryItem } from "@/lib/materials";
import { ApiFailure } from "./errors";
import { createSupabaseServerClient } from "./supabase";

type ContextKind = "student" | "group";
type MaterialRow = {
  id: string;
  title: string;
  description: string | null;
  type: "note" | "file" | "link";
  external_url: string | null;
  text_content: string | null;
  subject: string | null;
  level: string | null;
  original_filename: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  folder_id: string | null;
};
type AssignmentRow = {
  assigned_at: string;
  material: MaterialRow | MaterialRow[] | null;
};
type RecentLessonRow = {
  id: string;
  starts_at: string;
  title: string | null;
};
type LessonMaterialRow = {
  lesson_id: string;
  material: MaterialRow | MaterialRow[] | null;
};

async function context(teacherId: string, mutation = false) {
  const supabase = await createSupabaseServerClient();
  const [{ data: auth }, tutor, subscription] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("tutor_profiles")
      .select("workspace_id")
      .eq("user_id", teacherId)
      .single(),
    supabase
      .from("subscriptions")
      .select("read_only")
      .eq("teacher_id", teacherId)
      .single(),
  ]);
  if (auth.user?.id !== teacherId)
    failure(401, "UNAUTHENTICATED", "Sesja wygasła. Zaloguj się ponownie.");
  if (tutor.error || subscription.error) notFound();
  if (mutation && subscription.data.read_only) {
    failure(
      403,
      "READ_ONLY",
      "W trybie tylko do odczytu nie można zmieniać przypisań.",
    );
  }
  return {
    supabase,
    workspaceId: tutor.data.workspace_id as string,
    readOnly: Boolean(subscription.data.read_only),
  };
}

const materialFields =
  "id,title,description,type,external_url,text_content,subject,level,original_filename,mime_type,file_size_bytes,archived_at,created_at,updated_at,folder_id";
const materialSelect = `assigned_at,material:materials!inner(${materialFields})`;

export async function getStudentMaterials(
  teacherId: string,
  studentId: string,
): Promise<StudentMaterialsData> {
  const { supabase, workspaceId, readOnly } = await context(teacherId);
  const [student, direct, memberships, recentLessonsResult] = await Promise.all(
    [
      supabase
        .from("students")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("id", studentId)
        .maybeSingle(),
      supabase
        .from("student_material_assignments")
        .select(materialSelect)
        .eq("workspace_id", workspaceId)
        .eq("student_id", studentId)
        .order("assigned_at", { ascending: false }),
      supabase
        .from("group_members")
        .select("group_id,group:groups(id,name)")
        .eq("workspace_id", workspaceId)
        .eq("student_id", studentId)
        .eq("status", "active")
        .is("left_at", null),
      supabase
        .from("lessons")
        .select("id,starts_at,title,lesson_participants!inner(student_id)")
        .eq("workspace_id", workspaceId)
        .eq("lesson_participants.student_id", studentId)
        .eq("status", "completed")
        .order("starts_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(5),
    ],
  );
  if (
    student.error ||
    direct.error ||
    memberships.error ||
    recentLessonsResult.error
  )
    databaseFailure();
  if (!student.data) notFound();

  const groupRows = memberships.data ?? [];
  const groupIds = groupRows.map((item) => item.group_id);
  const recentLessons = (recentLessonsResult.data ??
    []) as unknown as RecentLessonRow[];
  const recentLessonIds = recentLessons.map((lesson) => lesson.id);
  const [inherited, recentLinks] = await Promise.all([
    groupIds.length
      ? supabase
          .from("group_material_assignments")
          .select(`group_id,${materialSelect}`)
          .eq("workspace_id", workspaceId)
          .in("group_id", groupIds)
          .order("assigned_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    recentLessonIds.length
      ? supabase
          .from("lesson_materials")
          .select(`lesson_id,material:materials!inner(${materialFields})`)
          .eq("workspace_id", workspaceId)
          .in("lesson_id", recentLessonIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (inherited.error || recentLinks.error) databaseFailure();
  const groups = new Map(
    groupRows.map((item) => {
      const group = first(
        item.group as
          { id: string; name: string } | { id: string; name: string }[] | null,
      );
      return [item.group_id, group];
    }),
  );
  return {
    direct: assignmentViews(
      (direct.data ?? []) as unknown as AssignmentRow[],
      "student",
    ),
    fromGroups: (
      (inherited.data ?? []) as unknown as (AssignmentRow & {
        group_id: string;
      })[]
    ).map((row) => {
      const material = assignmentView(row, "group");
      const group = groups.get(row.group_id);
      return group ? { ...material, group } : material;
    }),
    recentLessons: recentLessonMaterialViews(
      recentLessons,
      (recentLinks.data ?? []) as unknown as LessonMaterialRow[],
    ),
    readOnly,
  };
}

export async function getGroupMaterials(
  teacherId: string,
  groupId: string,
): Promise<GroupMaterialsData> {
  const { supabase, workspaceId, readOnly } = await context(teacherId);
  const [group, assignments] = await Promise.all([
    supabase
      .from("groups")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("id", groupId)
      .maybeSingle(),
    supabase
      .from("group_material_assignments")
      .select(materialSelect)
      .eq("workspace_id", workspaceId)
      .eq("group_id", groupId)
      .order("assigned_at", { ascending: false }),
  ]);
  if (group.error || assignments.error) databaseFailure();
  if (!group.data) notFound();
  return {
    materials: assignmentViews(
      (assignments.data ?? []) as unknown as AssignmentRow[],
      "group",
    ),
    readOnly,
  };
}

export async function assignContextMaterial(
  teacherId: string,
  kind: ContextKind,
  contextId: string,
  materialId: string,
) {
  const { supabase, workspaceId } = await context(teacherId, true);
  const table =
    kind === "student"
      ? "student_material_assignments"
      : "group_material_assignments";
  const key = kind === "student" ? "student_id" : "group_id";
  const { error } = await supabase.from(table).insert({
    workspace_id: workspaceId,
    [key]: contextId,
    material_id: materialId,
    assigned_by: teacherId,
  });
  if (error) {
    const code =
      typeof error === "object" && error && "code" in error
        ? String(error.code)
        : "";
    if (code === "23505") {
      failure(409, "ALREADY_ASSIGNED", "Ten materiał jest już przypisany.");
    }
    if (code === "23503" || code === "42501") notFound();
    databaseFailure();
  }
  return { materialId, assigned: true as const };
}

export async function removeContextMaterial(
  teacherId: string,
  kind: ContextKind,
  contextId: string,
  materialId: string,
) {
  const { supabase, workspaceId } = await context(teacherId, true);
  const table =
    kind === "student"
      ? "student_material_assignments"
      : "group_material_assignments";
  const key = kind === "student" ? "student_id" : "group_id";
  const { data, error } = await supabase
    .from(table)
    .delete()
    .eq("workspace_id", workspaceId)
    .eq(key, contextId)
    .eq("material_id", materialId)
    .select("material_id")
    .maybeSingle();
  if (error) databaseFailure();
  if (!data) notFound();
  return { materialId, removed: true as const };
}

function assignmentViews(rows: AssignmentRow[], source: "student" | "group") {
  return rows.map((row) => assignmentView(row, source));
}

function assignmentView(
  row: AssignmentRow,
  source: "student" | "group",
): AssignedMaterial {
  const material = first(row.material);
  if (!material) databaseFailure();
  return { ...materialView(material), assignedAt: row.assigned_at, source };
}

function recentLessonMaterialViews(
  lessons: RecentLessonRow[],
  links: LessonMaterialRow[],
): RecentLessonMaterial[] {
  const lessonById = new Map(lessons.map((lesson) => [lesson.id, lesson]));
  const materials = new Map<string, RecentLessonMaterial>();
  for (const link of links) {
    const material = first(link.material);
    const lesson = lessonById.get(link.lesson_id);
    if (!material || !lesson) continue;
    const source = {
      id: lesson.id,
      startsAt: lesson.starts_at,
      topic: lesson.title?.trim() || undefined,
    };
    const existing = materials.get(material.id);
    if (existing) {
      if (!existing.lessons.some((item) => item.id === lesson.id)) {
        existing.lessons.push(source);
      }
      continue;
    }
    materials.set(material.id, {
      ...materialView(material),
      lessons: [source],
    });
  }
  return [...materials.values()]
    .map((material) => ({
      ...material,
      lessons: material.lessons.sort((left, right) =>
        right.startsAt.localeCompare(left.startsAt),
      ),
    }))
    .sort((left, right) =>
      (right.lessons[0]?.startsAt ?? "").localeCompare(
        left.lessons[0]?.startsAt ?? "",
      ),
    );
}

function first<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function materialView(row: MaterialRow): MaterialLibraryItem {
  return {
    id: row.id,
    title: row.title,
    type: row.type === "note" ? "text" : row.type,
    description: row.description ?? "",
    subject: row.subject ?? "",
    level: row.level ?? "",
    folder: null,
    tags: [],
    textContent: row.text_content ?? undefined,
    externalUrl: row.external_url ?? undefined,
    originalFilename: row.original_filename ?? undefined,
    mimeType: row.mime_type ?? undefined,
    fileSizeBytes: row.file_size_bytes ?? undefined,
    archived: Boolean(row.archived_at),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function failure(status: number, code: string, message: string): never {
  throw new ApiFailure(status, { code, message });
}
function notFound(): never {
  failure(404, "NOT_FOUND", "Nie znaleziono ucznia, grupy lub materiału.");
}
function databaseFailure(): never {
  failure(
    500,
    "DATABASE_ERROR",
    "Nie udało się zmienić przypisania materiału.",
  );
}
