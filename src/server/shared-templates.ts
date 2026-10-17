import "server-only";

import {
  filterSharedTemplates,
  type SharedTemplate,
  type SharedTemplateFilters,
  type SharedTemplatesData,
} from "@/lib/shared-templates";
import type { ReportTemplateInput } from "@/lib/community-quality";
import { ApiFailure, logServerError } from "./errors";
import { createSupabaseServerClient } from "./supabase";

async function sharedTemplateContext(teacherId: string) {
  const supabase = await createSupabaseServerClient();
  const [{ data: auth }, subscription] = await Promise.all([
    supabase.auth.getUser(),
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
  if (subscription.error) databaseFailure(subscription.error);
  return {
    supabase,
    readOnly: Boolean(subscription.data.read_only),
  };
}

export async function getSharedTemplates(
  teacherId: string,
  filters: SharedTemplateFilters,
): Promise<SharedTemplatesData> {
  const { supabase, readOnly } = await sharedTemplateContext(teacherId);
  const [publicationsResult, sectionsResult, favoritesResult] =
    await Promise.all([
      supabase
        .from("shared_template_publications")
        .select(
          "id,title,description,subject,level,objective,estimated_duration_minutes,source_kind,author_name,source_attribution,excluded_private_attachments,published_at,is_featured,featured_order,adoption_count",
        )
        .eq("status", "approved")
        .order("published_at", { ascending: false })
        .limit(500),
      supabase
        .from("shared_template_sections")
        .select("id,publication_id,title,content,estimated_minutes,position")
        .order("position"),
      supabase
        .from("shared_template_favorites")
        .select("publication_id")
        .eq("user_id", teacherId),
    ]);
  if (publicationsResult.error) databaseFailure(publicationsResult.error);
  if (sectionsResult.error) databaseFailure(sectionsResult.error);
  if (favoritesResult.error) databaseFailure(favoritesResult.error);
  const favorites = new Set(
    (favoritesResult.data ?? []).map((item) => item.publication_id),
  );

  const templates: SharedTemplate[] = (publicationsResult.data ?? []).map(
    (row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      subject: row.subject,
      level: row.level,
      objective: row.objective,
      estimatedDurationMinutes: row.estimated_duration_minutes,
      sourceKind: row.source_kind as "official" | "community",
      authorName: row.author_name,
      sourceAttribution: row.source_attribution ?? row.author_name,
      excludedPrivateAttachments: row.excluded_private_attachments,
      publishedAt: row.published_at,
      isFeatured: row.is_featured,
      featuredOrder: row.featured_order ?? undefined,
      adoptionCount: row.adoption_count,
      isFavorite: favorites.has(row.id),
      sections: (sectionsResult.data ?? [])
        .filter((section) => section.publication_id === row.id)
        .map((section) => ({
          id: section.id,
          title: section.title,
          content: section.content,
          estimatedMinutes: section.estimated_minutes ?? undefined,
          position: section.position,
        })),
    }),
  );
  return {
    templates: filterSharedTemplates(templates, filters),
    subjects: unique(templates.map((item) => item.subject)),
    levels: unique(templates.map((item) => item.level)),
    readOnly,
  };
}

export async function setSharedTemplateFavorite(
  teacherId: string,
  publicationId: string,
  favorite: boolean,
) {
  const { supabase } = await sharedTemplateContext(teacherId);
  const { data, error } = await supabase.rpc("set_shared_template_favorite", {
    target_publication_id: publicationId,
    favorite,
  });
  if (error) databaseFailure(error);
  return { publicationId, favorite: Boolean(data) };
}

export async function reportSharedTemplate(
  teacherId: string,
  publicationId: string,
  input: ReportTemplateInput,
) {
  const { supabase } = await sharedTemplateContext(teacherId);
  const { data, error } = await supabase.rpc("report_shared_template", {
    target_publication_id: publicationId,
    report_reason: input.reason,
    report_explanation: input.explanation?.trim() || null,
  });
  if (error) databaseFailure(error);
  return { reportId: data as string };
}

export async function saveSharedTemplate(
  teacherId: string,
  publicationId: string,
  copyId: string,
) {
  const { supabase, readOnly } = await sharedTemplateContext(teacherId);
  if (readOnly)
    throw new ApiFailure(403, {
      code: "READ_ONLY",
      message: "W trybie tylko do odczytu nie można zapisywać szablonów.",
    });
  const { data, error } = await supabase.rpc(
    "save_shared_template_to_library",
    { target_publication_id: publicationId, target_copy_id: copyId },
  );
  if (error) databaseFailure(error);
  return { templateId: data as string };
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "pl"),
  );
}

function databaseFailure(error: unknown): never {
  const details = String(
    (error as { message?: unknown } | null)?.message ?? error ?? "",
  );
  if (/rate limit|already submitted/i.test(details)) {
    throw new ApiFailure(429, {
      code: "RATE_LIMITED",
      message: "To zgłoszenie zostało już przyjęte lub osiągnięto limit.",
    });
  }
  if (/invalid report/i.test(details)) {
    throw new ApiFailure(422, {
      code: "VALIDATION_ERROR",
      message: "Sprawdź powód i opis zgłoszenia.",
    });
  }
  if (/unavailable|not found/i.test(details)) {
    throw new ApiFailure(404, {
      code: "NOT_FOUND",
      message: "Ten szablon nie jest już dostępny.",
    });
  }
  logServerError("shared_templates_database", error);
  throw new ApiFailure(500, {
    code: "DATABASE_ERROR",
    message: "Nie udało się wczytać biblioteki szablonów. Spróbuj ponownie.",
  });
}
