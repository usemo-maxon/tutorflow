import { z } from "zod";
import type { MaterialTag } from "./materials";

export interface LessonTemplateSection {
  id: string;
  title: string;
  content: string;
  estimatedMinutes?: number;
  position: number;
}

export interface LessonTemplateMaterial {
  id: string;
  title: string;
  type: "file" | "link" | "text";
  archived: boolean;
}

export interface LessonTemplate {
  id: string;
  title: string;
  description: string;
  subject: string;
  level: string;
  objective: string;
  teacherNotes: string;
  estimatedDurationMinutes?: number;
  sections: LessonTemplateSection[];
  materials: LessonTemplateMaterial[];
  tags: MaterialTag[];
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LessonTemplatesData {
  templates: LessonTemplate[];
  materials: LessonTemplateMaterial[];
  tags: MaterialTag[];
  subjects: string[];
  levels: string[];
  readOnly: boolean;
}

const TemplateSectionSchema = z.object({
  id: z.uuid().optional(),
  title: z.string().trim().min(1).max(120),
  content: z.string().trim().max(5_000).default(""),
  estimatedMinutes: z.number().int().min(1).max(480).optional(),
});

export const LessonTemplateInputSchema = z.object({
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2_000).default(""),
  subject: z.string().trim().max(80).default(""),
  level: z.string().trim().max(40).default(""),
  objective: z.string().trim().max(5_000).default(""),
  teacherNotes: z.string().trim().max(20_000).default(""),
  estimatedDurationMinutes: z.number().int().min(1).max(480).optional(),
  sections: z.array(TemplateSectionSchema).max(50).default([]),
  materialIds: z.array(z.uuid()).max(100).default([]),
  tagIds: z.array(z.uuid()).max(20).default([]),
});

export type LessonTemplateInput = z.infer<typeof LessonTemplateInputSchema>;

export const LessonTemplateFiltersSchema = z.object({
  search: z.string().trim().max(120).default(""),
  subject: z.string().trim().max(80).default(""),
  level: z.string().trim().max(40).default(""),
  tagId: z.uuid().optional(),
  archived: z.boolean().default(false),
});

export type LessonTemplateFilters = z.infer<typeof LessonTemplateFiltersSchema>;

export function templateFiltersFromSearchParams(params: URLSearchParams) {
  const result = LessonTemplateFiltersSchema.safeParse({
    search: params.get("q") ?? "",
    subject: params.get("subject") ?? "",
    level: params.get("level") ?? "",
    tagId: params.get("tag") || undefined,
    archived: params.get("view") === "archived",
  });
  return result.success ? result.data : LessonTemplateFiltersSchema.parse({});
}

export function filterLessonTemplates(
  templates: LessonTemplate[],
  filters: Partial<LessonTemplateFilters>,
) {
  const search = (filters.search ?? "").toLocaleLowerCase("pl").trim();
  return templates.filter((template) => {
    if (template.archived !== Boolean(filters.archived)) return false;
    if (filters.subject && template.subject !== filters.subject) return false;
    if (filters.level && template.level !== filters.level) return false;
    if (filters.tagId && !template.tags.some((tag) => tag.id === filters.tagId))
      return false;
    if (!search) return true;
    return [
      template.title,
      template.description,
      template.subject,
      template.level,
      ...template.tags.map((tag) => tag.name),
    ]
      .join(" ")
      .toLocaleLowerCase("pl")
      .includes(search);
  });
}

export function appendTemplateText(current: string, incoming: string) {
  return [current.trim(), incoming.trim()].filter(Boolean).join("\n\n");
}

export function sectionPlanText(
  section: Pick<LessonTemplateSection, "title" | "content">,
) {
  return section.content.trim()
    ? `${section.title.trim()} — ${section.content.trim()}`
    : section.title.trim();
}
