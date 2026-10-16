import { z } from "zod";

export interface SharedTemplateSection {
  id: string;
  title: string;
  content: string;
  estimatedMinutes?: number;
  position: number;
}

export interface SharedTemplate {
  id: string;
  title: string;
  description: string;
  subject: string;
  level: string;
  objective: string;
  estimatedDurationMinutes: number;
  sourceKind: "official" | "community";
  authorName: string;
  sourceAttribution: string;
  excludedPrivateAttachments: boolean;
  publishedAt: string;
  isFeatured: boolean;
  featuredOrder?: number;
  adoptionCount: number;
  isFavorite: boolean;
  sections: SharedTemplateSection[];
}

export interface SharedTemplatesData {
  templates: SharedTemplate[];
  subjects: string[];
  levels: string[];
  readOnly: boolean;
}

export const SharedTemplateFiltersSchema = z.object({
  search: z.string().trim().max(120).default(""),
  subject: z.string().trim().max(80).default(""),
  level: z.string().trim().max(40).default(""),
  duration: z.enum(["", "45", "60", "90"]).default(""),
  view: z
    .enum(["recommended", "popular", "newest", "saved"])
    .default("recommended"),
  sort: z.enum(["popular", "newest"]).default("popular"),
});

export type SharedTemplateFilters = z.infer<typeof SharedTemplateFiltersSchema>;

export function sharedTemplateFiltersFromSearchParams(params: URLSearchParams) {
  const result = SharedTemplateFiltersSchema.safeParse({
    search: params.get("q") ?? "",
    subject: params.get("subject") ?? "",
    level: params.get("level") ?? "",
    duration: params.get("duration") ?? "",
    view: params.get("view") ?? "recommended",
    sort: params.get("sort") ?? "popular",
  });
  return result.success ? result.data : SharedTemplateFiltersSchema.parse({});
}

export type SharedTemplateView = SharedTemplateFilters["view"];

export function discoverSharedTemplates(
  templates: SharedTemplate[],
  view: SharedTemplateView,
  sort: SharedTemplateFilters["sort"],
) {
  const visible = templates.filter((template) => {
    if (view === "recommended") return template.isFeatured;
    if (view === "popular") return template.adoptionCount > 0;
    if (view === "saved") return template.isFavorite;
    return true;
  });
  return [...visible].sort((left, right) => {
    if (view === "recommended") {
      const order =
        (left.featuredOrder ?? Number.MAX_SAFE_INTEGER) -
        (right.featuredOrder ?? Number.MAX_SAFE_INTEGER);
      if (order) return order;
    }
    if (sort === "popular") {
      const popularity = right.adoptionCount - left.adoptionCount;
      if (popularity) return popularity;
    }
    return Date.parse(right.publishedAt) - Date.parse(left.publishedAt);
  });
}

export function filterSharedTemplates(
  templates: SharedTemplate[],
  filters: Partial<SharedTemplateFilters>,
) {
  const search = (filters.search ?? "").toLocaleLowerCase("pl").trim();
  const durationLimit = filters.duration ? Number(filters.duration) : 0;
  return templates.filter((template) => {
    if (filters.subject && template.subject !== filters.subject) return false;
    if (filters.level && template.level !== filters.level) return false;
    if (durationLimit && template.estimatedDurationMinutes > durationLimit)
      return false;
    if (!search) return true;
    return [
      template.title,
      template.description,
      template.subject,
      template.level,
      template.objective,
      template.authorName,
      ...template.sections.flatMap((section) => [
        section.title,
        section.content,
      ]),
    ]
      .join(" ")
      .toLocaleLowerCase("pl")
      .includes(search);
  });
}
