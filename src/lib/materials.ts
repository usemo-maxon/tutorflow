import { z } from "zod";

export const MATERIAL_FILE_MAX_BYTES = 10 * 1024 * 1024;

export const materialTypes = ["file", "link", "text"] as const;
export type MaterialType = (typeof materialTypes)[number];

export interface MaterialFolder {
  id: string;
  name: string;
}

export interface MaterialTag {
  id: string;
  name: string;
}

export interface MaterialLibraryItem {
  id: string;
  title: string;
  type: MaterialType;
  description: string;
  subject: string;
  level: string;
  folder: MaterialFolder | null;
  tags: MaterialTag[];
  textContent?: string;
  externalUrl?: string;
  originalFilename?: string;
  mimeType?: string;
  fileSizeBytes?: number;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MaterialsLibraryData {
  materials: MaterialLibraryItem[];
  folders: MaterialFolder[];
  tags: MaterialTag[];
  subjects: string[];
  levels: string[];
  readOnly: boolean;
}

const baseFields = {
  title: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2_000).default(""),
  subject: z.string().trim().max(80).default(""),
  level: z.string().trim().max(40).default(""),
  folderId: z.uuid().nullable().default(null),
  tagIds: z.array(z.uuid()).max(20).default([]),
  newTagNames: z.array(z.string().trim().min(1).max(50)).max(20).default([]),
};

export const MaterialInputSchema = z.discriminatedUnion("type", [
  z.object({ ...baseFields, type: z.literal("file") }),
  z.object({
    ...baseFields,
    type: z.literal("link"),
    externalUrl: z
      .url("Wpisz pełny adres URL.")
      .refine((value) => ["http:", "https:"].includes(new URL(value).protocol), {
        message: "Dozwolone są tylko adresy http i https.",
      }),
  }),
  z.object({
    ...baseFields,
    type: z.literal("text"),
    textContent: z.string().trim().min(1).max(50_000),
  }),
]);

export type MaterialInput = z.infer<typeof MaterialInputSchema>;

export const MaterialFolderInputSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export const MaterialLibraryFiltersSchema = z.object({
  search: z.string().trim().max(120).default(""),
  type: z.enum(["file", "link", "text"]).optional(),
  subject: z.string().trim().max(80).default(""),
  level: z.string().trim().max(40).default(""),
  folderId: z.uuid().optional(),
  withoutFolder: z.boolean().default(false),
  tagId: z.uuid().optional(),
  archived: z.boolean().default(false),
});

export type MaterialLibraryFilters = z.infer<typeof MaterialLibraryFiltersSchema>;

export function materialFormInput(form: FormData) {
  const type = String(form.get("type") ?? "");
  return {
    type,
    title: String(form.get("title") ?? ""),
    description: String(form.get("description") ?? ""),
    subject: String(form.get("subject") ?? ""),
    level: String(form.get("level") ?? ""),
    folderId: String(form.get("folderId") ?? "") || null,
    tagIds: form.getAll("tagIds").map(String),
    newTagNames: String(form.get("newTagNames") ?? "")
      .split(",")
      .map(normalizeOrganizationName)
      .filter(Boolean),
    ...(type === "link"
      ? { externalUrl: String(form.get("externalUrl") ?? "") }
      : {}),
    ...(type === "text"
      ? { textContent: String(form.get("textContent") ?? "") }
      : {}),
  };
}

export function materialFiltersFromSearchParams(params: URLSearchParams) {
  const parsed = MaterialLibraryFiltersSchema.safeParse({
    search: params.get("q") ?? "",
    type: params.get("type") || undefined,
    subject: params.get("subject") ?? "",
    level: params.get("level") ?? "",
    folderId:
      params.get("folder") && params.get("folder") !== "none"
        ? params.get("folder") ?? undefined
        : undefined,
    withoutFolder: params.get("folder") === "none",
    tagId: params.get("tag") || undefined,
    archived: params.get("view") === "archived",
  });
  return parsed.success ? parsed.data : MaterialLibraryFiltersSchema.parse({});
}

export function normalizeOrganizationName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

const allowedFiles: Record<string, readonly string[]> = {
  ".pdf": ["application/pdf"],
  ".jpg": ["image/jpeg"],
  ".jpeg": ["image/jpeg"],
  ".png": ["image/png"],
  ".webp": ["image/webp"],
  ".doc": ["application/msword"],
  ".docx": [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ],
};

export function validateMaterialFile(file: {
  name: string;
  type: string;
  size: number;
}): string | null {
  if (file.size <= 0) return "Plik jest pusty.";
  if (file.size > MATERIAL_FILE_MAX_BYTES)
    return "Plik może mieć maksymalnie 10 MB.";
  const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
  const mimeTypes = allowedFiles[extension];
  if (!mimeTypes || (file.type && !mimeTypes.includes(file.type))) {
    return "Dozwolone formaty: PDF, JPG, PNG, WEBP, DOC i DOCX.";
  }
  return null;
}

export function safeStorageFilename(filename: string): string {
  const extension = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  const base = filename
    .slice(0, filename.length - extension.length)
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `${base || "material"}${extension}`;
}

export function filterMaterials(
  materials: MaterialLibraryItem[],
  options: {
    search?: string;
    type?: MaterialType | "all";
    subject?: string;
    level?: string;
    folderId?: string | "none";
    tagId?: string;
    archived?: boolean;
  },
): MaterialLibraryItem[] {
  const search = (options.search ?? "").trim().toLocaleLowerCase("pl");
  return materials.filter((material) => {
    if (material.archived !== Boolean(options.archived)) return false;
    if (options.type && options.type !== "all" && material.type !== options.type)
      return false;
    if (options.subject && material.subject !== options.subject) return false;
    if (options.level && material.level !== options.level) return false;
    if (options.folderId === "none" && material.folder) return false;
    if (
      options.folderId &&
      options.folderId !== "none" &&
      material.folder?.id !== options.folderId
    )
      return false;
    if (options.tagId && !material.tags.some((tag) => tag.id === options.tagId))
      return false;
    if (!search) return true;
    return [
      material.title,
      material.description,
      material.subject,
      material.level,
      material.textContent ?? "",
      ...material.tags.map((tag) => tag.name),
    ]
      .join(" ")
      .toLocaleLowerCase("pl")
      .includes(search);
  });
}
