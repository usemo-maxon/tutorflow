import "server-only";

import { randomUUID } from "node:crypto";
import {
  filterLessonTemplates,
  type LessonTemplate,
  type LessonTemplateFilters,
  type LessonTemplateInput,
  type LessonTemplatesData,
} from "@/lib/lesson-templates";
import { ApiFailure } from "./errors";
import { createSupabaseServerClient } from "./supabase";

async function templateContext(teacherId: string, mutation = false) {
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
    throw new ApiFailure(401, {
      code: "UNAUTHENTICATED",
      message: "Sesja wygasła. Zaloguj się ponownie.",
    });
  if (tutor.error || subscription.error) notFound();
  if (mutation && subscription.data.read_only)
    throw new ApiFailure(403, {
      code: "READ_ONLY",
      message: "W trybie tylko do odczytu nie można zmieniać szablonów.",
    });
  return {
    supabase,
    workspaceId: tutor.data.workspace_id as string,
    readOnly: Boolean(subscription.data.read_only),
  };
}

export async function getLessonTemplates(
  teacherId: string,
  filters: LessonTemplateFilters,
): Promise<LessonTemplatesData> {
  const { supabase, workspaceId, readOnly } = await templateContext(teacherId);
  const [
    templatesResult,
    sectionsResult,
    linksResult,
    assignmentsResult,
    materialsResult,
    tagsResult,
  ] = await Promise.all([
    supabase
      .from("lesson_templates")
      .select(
        "id,title,description,subject,level,objective,teacher_notes,estimated_duration_minutes,archived_at,created_at,updated_at",
      )
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false })
      .limit(500),
    supabase
      .from("lesson_template_sections")
      .select("id,template_id,title,content,estimated_minutes,position")
      .eq("workspace_id", workspaceId)
      .order("position"),
    supabase
      .from("lesson_template_materials")
      .select("template_id,material_id")
      .eq("workspace_id", workspaceId),
    supabase
      .from("lesson_template_tag_assignments")
      .select("template_id,tag_id")
      .eq("workspace_id", workspaceId),
    supabase
      .from("materials")
      .select("id,title,type,archived_at")
      .eq("workspace_id", workspaceId)
      .order("title")
      .limit(1000),
    supabase
      .from("material_tags")
      .select("id,name")
      .eq("workspace_id", workspaceId)
      .order("name"),
  ]);
  const failed = [
    templatesResult,
    sectionsResult,
    linksResult,
    assignmentsResult,
    materialsResult,
    tagsResult,
  ].find((item) => item.error);
  if (failed?.error) databaseFailure(failed.error);
  const materialMap = new Map(
    (materialsResult.data ?? []).map((item) => [
      item.id,
      {
        id: item.id,
        title: item.title,
        type: (item.type === "note" ? "text" : item.type) as
          "file" | "link" | "text",
        archived: Boolean(item.archived_at),
      },
    ]),
  );
  const tagMap = new Map(
    (tagsResult.data ?? []).map((item) => [item.id, item]),
  );
  const templates: LessonTemplate[] = (templatesResult.data ?? []).map(
    (row) => ({
      id: row.id,
      title: row.title,
      description: row.description ?? "",
      subject: row.subject ?? "",
      level: row.level ?? "",
      objective: row.objective ?? "",
      teacherNotes: row.teacher_notes ?? "",
      estimatedDurationMinutes: row.estimated_duration_minutes ?? undefined,
      sections: (sectionsResult.data ?? [])
        .filter((item) => item.template_id === row.id)
        .map((item) => ({
          id: item.id,
          title: item.title,
          content: item.content ?? "",
          estimatedMinutes: item.estimated_minutes ?? undefined,
          position: item.position,
        })),
      materials: (linksResult.data ?? [])
        .filter((item) => item.template_id === row.id)
        .map((item) => materialMap.get(item.material_id))
        .filter((item): item is NonNullable<typeof item> => Boolean(item)),
      tags: (assignmentsResult.data ?? [])
        .filter((item) => item.template_id === row.id)
        .map((item) => tagMap.get(item.tag_id))
        .filter((item): item is NonNullable<typeof item> => Boolean(item)),
      archived: Boolean(row.archived_at),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }),
  );
  const activeTemplates = templates.filter((item) => !item.archived);
  return {
    templates: filterLessonTemplates(templates, filters),
    // Keep archived items available in the editor when a historical reference
    // already exists. The tutor must explicitly remove or replace it.
    materials: [...materialMap.values()],
    tags: tagsResult.data ?? [],
    subjects: unique(activeTemplates.map((item) => item.subject)),
    levels: unique(activeTemplates.map((item) => item.level)),
    readOnly,
  };
}

export async function createLessonTemplate(
  teacherId: string,
  input: LessonTemplateInput,
) {
  const { supabase, workspaceId } = await templateContext(teacherId, true);
  const id = randomUUID();
  const { error } = await supabase.from("lesson_templates").insert({
    id,
    workspace_id: workspaceId,
    owner_user_id: teacherId,
    ...templateRow(input),
  });
  if (error) databaseFailure(error);
  try {
    await replaceContent(supabase, id, input);
  } catch (error) {
    await supabase.from("lesson_templates").delete().eq("id", id);
    throw error;
  }
  return await getTemplateById(teacherId, id);
}

export async function updateLessonTemplate(
  teacherId: string,
  templateId: string,
  input: LessonTemplateInput,
) {
  const { supabase, workspaceId } = await templateContext(teacherId, true);
  const { data, error } = await supabase
    .from("lesson_templates")
    .update({ ...templateRow(input), updated_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .eq("id", templateId)
    .is("archived_at", null)
    .select("id")
    .maybeSingle();
  if (error) databaseFailure(error);
  if (!data) notFound();
  await replaceContent(supabase, templateId, input);
  return getTemplateById(teacherId, templateId);
}

export async function duplicateLessonTemplate(
  teacherId: string,
  templateId: string,
) {
  const source = await getTemplateById(teacherId, templateId);
  return createLessonTemplate(teacherId, {
    title: `${source.title} — kopia`,
    description: source.description,
    subject: source.subject,
    level: source.level,
    objective: source.objective,
    teacherNotes: source.teacherNotes,
    estimatedDurationMinutes: source.estimatedDurationMinutes,
    sections: source.sections.map((section) => ({
      title: section.title,
      content: section.content,
      estimatedMinutes: section.estimatedMinutes,
    })),
    materialIds: source.materials.map((item) => item.id),
    tagIds: source.tags.map((item) => item.id),
  });
}

export async function archiveLessonTemplate(
  teacherId: string,
  templateId: string,
) {
  const { supabase, workspaceId } = await templateContext(teacherId, true);
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("lesson_templates")
    .update({ archived_at: now, updated_at: now })
    .eq("workspace_id", workspaceId)
    .eq("id", templateId)
    .is("archived_at", null)
    .select("id")
    .maybeSingle();
  if (error) databaseFailure(error);
  if (!data) notFound();
  return { id: templateId, archived: true as const };
}

export async function applyLessonTemplate(
  teacherId: string,
  lessonId: string,
  templateId: string,
) {
  const { supabase } = await templateContext(teacherId, true);
  const { error } = await supabase.rpc("apply_lesson_template", {
    target_lesson_id: lessonId,
    target_template_id: templateId,
  });
  if (error) databaseFailure(error);
}

async function getTemplateById(teacherId: string, templateId: string) {
  const data = await getLessonTemplates(teacherId, {
    search: "",
    subject: "",
    level: "",
    archived: false,
  });
  const template = data.templates.find((item) => item.id === templateId);
  if (!template) notFound();
  return template;
}

function templateRow(input: LessonTemplateInput) {
  return {
    title: input.title,
    description: input.description || null,
    subject: input.subject || null,
    level: input.level || null,
    objective: input.objective || null,
    teacher_notes: input.teacherNotes || null,
    estimated_duration_minutes: input.estimatedDurationMinutes ?? null,
  };
}

async function replaceContent(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  templateId: string,
  input: LessonTemplateInput,
) {
  const { error } = await supabase.rpc("replace_lesson_template_content", {
    target_template_id: templateId,
    template_sections: input.sections.map((section) => ({
      id: section.id ?? randomUUID(),
      title: section.title,
      content: section.content,
      estimatedMinutes: section.estimatedMinutes,
    })),
    material_ids: input.materialIds,
    tag_ids: input.tagIds,
  });
  if (error) databaseFailure(error);
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "pl"),
  );
}
function notFound(): never {
  throw new ApiFailure(404, {
    code: "NOT_FOUND",
    message: "Nie znaleziono szablonu.",
  });
}
function databaseFailure(error: unknown): never {
  console.error("Lesson templates database failure", error);
  throw new ApiFailure(500, {
    code: "DATABASE_ERROR",
    message: "Nie udało się zapisać szablonu. Spróbuj ponownie.",
  });
}
