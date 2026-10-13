import "server-only";

import { randomUUID } from "node:crypto";
import type {
  MaterialInput,
  MaterialLibraryFilters,
  MaterialLibraryItem,
  MaterialsLibraryData,
} from "@/lib/materials";
import {
  safeStorageFilename,
  validateMaterialFile,
} from "@/lib/materials";
import { ApiFailure } from "./errors";
import { createSupabaseServerClient } from "./supabase";

const BUCKET = "material-files";

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
  storage_path: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  folder_id: string | null;
  folder_name?: string | null;
  tags?: { id: string; name: string }[] | null;
};

async function materialContext(teacherId: string, mutation = false) {
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
  if (auth.user?.id !== teacherId) {
    throw new ApiFailure(401, {
      code: "UNAUTHENTICATED",
      message: "Sesja wygasła. Zaloguj się ponownie.",
    });
  }
  if (tutor.error || subscription.error) notFound();
  if (mutation && subscription.data.read_only) {
    throw new ApiFailure(403, {
      code: "READ_ONLY",
      message: "W trybie tylko do odczytu nie można zmieniać materiałów.",
    });
  }
  return {
    supabase,
    workspaceId: tutor.data.workspace_id as string,
    readOnly: Boolean(subscription.data.read_only),
  };
}

export async function getMaterialsLibrary(
  teacherId: string,
  filters: MaterialLibraryFilters,
): Promise<MaterialsLibraryData> {
  const { supabase, workspaceId, readOnly } = await materialContext(teacherId);
  const [results, folders, tags, metadata] = await Promise.all([
    supabase.rpc("search_material_library", {
      target_workspace_id: workspaceId,
      search_text: filters.search || null,
      material_kind: filters.type ?? null,
      subject_filter: filters.subject || null,
      level_filter: filters.level || null,
      folder_filter: filters.folderId ?? null,
      without_folder: filters.withoutFolder,
      tag_filter: filters.tagId ?? null,
      include_archived: filters.archived,
      result_limit: 200,
    }),
    supabase
      .from("material_folders")
      .select("id,name")
      .eq("workspace_id", workspaceId)
      .order("name"),
    supabase
      .from("material_tags")
      .select("id,name")
      .eq("workspace_id", workspaceId)
      .order("name"),
    supabase
      .from("materials")
      .select("subject,level")
      .eq("workspace_id", workspaceId)
      .is("archived_at", null)
      .limit(2_000),
  ]);
  if (results.error) databaseFailure(results.error);
  if (folders.error) databaseFailure(folders.error);
  if (tags.error) databaseFailure(tags.error);
  if (metadata.error) databaseFailure(metadata.error);
  const materials = ((results.data ?? []) as MaterialRow[]).map(materialView);
  return {
    materials,
    folders: folders.data ?? [],
    tags: tags.data ?? [],
    subjects: uniqueValues((metadata.data ?? []).map((item) => item.subject ?? "")),
    levels: uniqueValues((metadata.data ?? []).map((item) => item.level ?? "")),
    readOnly,
  };
}

export async function createMaterial(
  teacherId: string,
  input: MaterialInput,
  file?: File,
): Promise<MaterialLibraryItem> {
  const { supabase, workspaceId } = await materialContext(teacherId, true);
  const id = randomUUID();
  let storagePath: string | null = null;
  if (input.type === "file") {
    if (!file) validationFailure("Wybierz plik do przesłania.");
    const fileError = validateMaterialFile(file);
    if (fileError) validationFailure(fileError);
    storagePath = `${workspaceId}/${id}/${randomUUID()}-${safeStorageFilename(file.name)}`;
    const { error } = await supabase.storage.from(BUCKET).upload(storagePath, file, {
      upsert: false,
      contentType: file.type || undefined,
      cacheControl: "3600",
    });
    if (error) databaseFailure(error);
  }
  const row = materialWriteRow(input, teacherId, id, storagePath, file);
  const { error } = await supabase
    .from("materials")
    .insert({ ...row, workspace_id: workspaceId });
  if (error) {
    if (storagePath) await supabase.storage.from(BUCKET).remove([storagePath]);
    databaseFailure(error);
  }
  await setMaterialOrganization(supabase, id, input);
  return getMaterialView(supabase, workspaceId, id);
}

export async function updateMaterial(
  teacherId: string,
  materialId: string,
  input: MaterialInput,
  file?: File,
): Promise<MaterialLibraryItem> {
  const { supabase, workspaceId } = await materialContext(teacherId, true);
  const { data: existing, error: existingError } = await supabase
    .from("materials")
    .select("id,type,storage_path")
    .eq("workspace_id", workspaceId)
    .eq("id", materialId)
    .maybeSingle();
  if (existingError) databaseFailure(existingError);
  if (!existing) notFound();
  const existingType = existing.type === "note" ? "text" : existing.type;
  if (existingType !== input.type) validationFailure("Nie można zmienić typu materiału.");

  let newStoragePath: string | null = null;
  if (input.type === "file" && file) {
    const fileError = validateMaterialFile(file);
    if (fileError) validationFailure(fileError);
    newStoragePath = `${workspaceId}/${materialId}/${randomUUID()}-${safeStorageFilename(file.name)}`;
    const { error } = await supabase.storage.from(BUCKET).upload(newStoragePath, file, {
      upsert: false,
      contentType: file.type || undefined,
      cacheControl: "3600",
    });
    if (error) databaseFailure(error);
  }
  const patch = materialWriteRow(
    input,
    teacherId,
    materialId,
    newStoragePath ?? existing.storage_path,
    file,
  );
  delete (patch as Partial<typeof patch>).id;
  delete (patch as Partial<typeof patch>).owner_user_id;
  if (input.type === "file" && !file) {
    delete (patch as Partial<typeof patch>).original_filename;
    delete (patch as Partial<typeof patch>).mime_type;
    delete (patch as Partial<typeof patch>).file_size_bytes;
  }
  const { data, error } = await supabase
    .from("materials")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .eq("id", materialId)
    .select(
      "id,title,description,type,external_url,text_content,subject,level,original_filename,mime_type,file_size_bytes,storage_path,archived_at,created_at,updated_at",
    )
    .maybeSingle();
  if (error || !data) {
    if (newStoragePath)
      await supabase.storage.from(BUCKET).remove([newStoragePath]);
    if (error) databaseFailure(error);
    notFound();
  }
  if (newStoragePath && existing.storage_path) {
    await supabase.storage.from(BUCKET).remove([existing.storage_path]);
  }
  await setMaterialOrganization(supabase, materialId, input);
  return getMaterialView(supabase, workspaceId, materialId);
}

export async function createMaterialFolder(teacherId: string, name: string) {
  const { supabase, workspaceId } = await materialContext(teacherId, true);
  const { data, error } = await supabase
    .from("material_folders")
    .insert({ workspace_id: workspaceId, name })
    .select("id,name")
    .single();
  if (error) organizationFailure(error, "Folder o tej nazwie już istnieje.");
  return data;
}

export async function renameMaterialFolder(
  teacherId: string,
  folderId: string,
  name: string,
) {
  const { supabase, workspaceId } = await materialContext(teacherId, true);
  const { data, error } = await supabase
    .from("material_folders")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .eq("id", folderId)
    .select("id,name")
    .maybeSingle();
  if (error) organizationFailure(error, "Folder o tej nazwie już istnieje.");
  if (!data) folderNotFound();
  return data;
}

export async function deleteMaterialFolder(
  teacherId: string,
  folderId: string,
) {
  const { supabase, workspaceId } = await materialContext(teacherId, true);
  const { data, error } = await supabase
    .from("material_folders")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("id", folderId)
    .select("id")
    .maybeSingle();
  if (error) databaseFailure(error);
  if (!data) folderNotFound();
  return { id: folderId, deleted: true as const };
}

export async function archiveMaterial(teacherId: string, materialId: string) {
  const { supabase, workspaceId } = await materialContext(teacherId, true);
  const { data, error } = await supabase
    .from("materials")
    .update({ archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .eq("id", materialId)
    .is("archived_at", null)
    .select("id")
    .maybeSingle();
  if (error) databaseFailure(error);
  if (!data) notFound();
  return { id: materialId, archived: true as const };
}

export async function getMaterialFileTarget(
  teacherId: string,
  materialId: string,
): Promise<string> {
  const { supabase, workspaceId } = await materialContext(teacherId);
  const { data, error } = await supabase
    .from("materials")
    .select("type,storage_path,file_url")
    .eq("workspace_id", workspaceId)
    .eq("id", materialId)
    .maybeSingle();
  if (error) databaseFailure(error);
  if (!data || data.type !== "file") notFound();
  if (!data.storage_path) {
    if (data.file_url && /^https?:\/\//i.test(data.file_url)) return data.file_url;
    notFound();
  }
  const signed = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(data.storage_path, 60, { download: false });
  if (signed.error) databaseFailure(signed.error);
  return signed.data.signedUrl;
}

function materialWriteRow(
  input: MaterialInput,
  ownerUserId: string,
  id: string,
  storagePath: string | null,
  file?: File,
) {
  return {
    id,
    owner_user_id: ownerUserId,
    title: input.title,
    description: input.description || null,
    subject: input.subject || null,
    level: input.level || null,
    type: input.type === "text" ? "note" : input.type,
    external_url: input.type === "link" ? input.externalUrl : null,
    text_content: input.type === "text" ? input.textContent : null,
    file_url: input.type === "file" ? `/api/materials/${id}/open` : null,
    storage_path: input.type === "file" ? storagePath : null,
    original_filename: input.type === "file" && file ? file.name : null,
    mime_type: input.type === "file" && file ? file.type || null : null,
    file_size_bytes: input.type === "file" && file ? file.size : null,
  };
}

function materialView(row: MaterialRow): MaterialLibraryItem {
  return {
    id: row.id,
    title: row.title,
    type: row.type === "note" ? "text" : row.type,
    description: row.description ?? "",
    subject: row.subject ?? "",
    level: row.level ?? "",
    folder:
      row.folder_id && row.folder_name
        ? { id: row.folder_id, name: row.folder_name }
        : null,
    tags: Array.isArray(row.tags) ? row.tags : [],
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

async function setMaterialOrganization(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  materialId: string,
  input: MaterialInput,
) {
  const { error } = await supabase.rpc("set_material_organization", {
    target_material_id: materialId,
    target_folder_id: input.folderId,
    target_tag_ids: input.tagIds,
    new_tag_names: input.newTagNames,
  });
  if (error) organizationFailure(error, "Nie udało się przypisać folderu lub tagów.");
}

async function getMaterialView(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  workspaceId: string,
  materialId: string,
) {
  const material = await supabase
    .from("materials")
    .select(
      "id,title,description,type,external_url,text_content,subject,level,original_filename,mime_type,file_size_bytes,storage_path,archived_at,created_at,updated_at,folder_id",
    )
    .eq("workspace_id", workspaceId)
    .eq("id", materialId)
    .maybeSingle();
  if (material.error) databaseFailure(material.error);
  if (!material.data) notFound();
  const [folder, assignments] = await Promise.all([
    material.data.folder_id
      ? supabase
          .from("material_folders")
          .select("name")
          .eq("workspace_id", workspaceId)
          .eq("id", material.data.folder_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("material_tag_assignments")
      .select("tag:material_tags(id,name)")
      .eq("workspace_id", workspaceId)
      .eq("material_id", materialId),
  ]);
  if (folder.error) databaseFailure(folder.error);
  if (assignments.error) databaseFailure(assignments.error);
  return materialView({
    ...(material.data as MaterialRow),
    folder_name: folder.data?.name ?? null,
    tags: (assignments.data ?? []).flatMap((assignment) => assignment.tag ?? []),
  });
}

function uniqueValues(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "pl"),
  );
}

function validationFailure(message: string): never {
  throw new ApiFailure(422, { code: "VALIDATION_ERROR", message });
}

function notFound(): never {
  throw new ApiFailure(404, {
    code: "NOT_FOUND",
    message: "Nie znaleziono materiału.",
  });
}

function databaseFailure(error: unknown): never {
  throw new ApiFailure(500, {
    code: "DATABASE_ERROR",
    message: "Nie udało się zapisać materiału. Spróbuj ponownie.",
    retryable: true,
    details: error instanceof Error ? error.message : undefined,
  });
}

function organizationFailure(error: unknown, message: string): never {
  throw new ApiFailure(422, {
    code: "ORGANIZATION_ERROR",
    message,
    details: error instanceof Error ? error.message : undefined,
  });
}

function folderNotFound(): never {
  throw new ApiFailure(404, {
    code: "NOT_FOUND",
    message: "Nie znaleziono folderu.",
  });
}
