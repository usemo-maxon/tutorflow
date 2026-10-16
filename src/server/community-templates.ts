import "server-only";

import {
  COMMUNITY_PUBLISHING_TERMS_VERSION,
  sanitizeCommunitySubmission,
  type CommunityPublicationStatus,
  type CommunityTemplateSubmission,
  type CommunityTemplateSubmissionInput,
} from "@/lib/community-templates";
import type { CommunityTemplateReport } from "@/lib/community-quality";
import { ApiFailure, logServerError } from "./errors";
import { createSupabaseServerClient } from "./supabase";

async function authenticatedClient(teacherId: string) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || data.user?.id !== teacherId) {
    throw new ApiFailure(401, {
      code: "UNAUTHENTICATED",
      message: "Sesja wygasła. Zaloguj się ponownie.",
    });
  }
  return supabase;
}

export async function submitCommunityTemplate(
  teacherId: string,
  templateId: string,
  input: CommunityTemplateSubmissionInput,
) {
  const supabase = await authenticatedClient(teacherId);
  let clean: ReturnType<typeof sanitizeCommunitySubmission>;
  try {
    clean = sanitizeCommunitySubmission(input);
  } catch (error) {
    throw new ApiFailure(422, {
      code: "UNSAFE_PUBLICATION_CONTENT",
      message:
        error instanceof Error
          ? error.message
          : "Treść publikacji zawiera niedozwolone odwołanie.",
    });
  }
  const { data, error } = await supabase.rpc("submit_community_template", {
    target_template_id: templateId,
    snapshot: {
      title: clean.title,
      description: clean.description,
      subject: clean.subject,
      level: clean.level,
      estimatedDurationMinutes: clean.estimatedDurationMinutes,
      objective: clean.objective,
      authorName: clean.authorName,
      sections: clean.sections,
    },
    rights_confirmed: clean.rightsConfirmed,
    terms_document_version: COMMUNITY_PUBLISHING_TERMS_VERSION,
  });
  if (error) publicationFailure(error);
  return { publicationId: data as string };
}

export async function getOwnCommunitySubmissions(teacherId: string) {
  const supabase = await authenticatedClient(teacherId);
  const metadata = await supabase
    .from("community_template_submissions")
    .select(
      "publication_id,source_template_id,rights_confirmed_at,moderation_feedback,withdrawn_at,created_at",
    )
    .eq("submitter_user_id", teacherId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (metadata.error) publicationFailure(metadata.error);
  return loadSubmissions(supabase, metadata.data ?? []);
}

export async function withdrawCommunityTemplate(
  teacherId: string,
  publicationId: string,
) {
  const supabase = await authenticatedClient(teacherId);
  const { error } = await supabase.rpc("withdraw_community_template", {
    target_publication_id: publicationId,
  });
  if (error) publicationFailure(error);
  return { publicationId, status: "withdrawn" as const };
}

export async function getCommunityModerationQueue(teacherId: string) {
  const supabase = await authenticatedClient(teacherId);
  const admin = await supabase.rpc("current_user_is_platform_admin");
  if (admin.error) publicationFailure(admin.error);
  if (admin.data !== true) {
    throw new ApiFailure(403, {
      code: "ADMIN_REQUIRED",
      message: "Ta sekcja jest dostępna tylko dla administratorów Easy4Tutor.",
    });
  }
  const metadata = await supabase
    .from("community_template_submissions")
    .select(
      "publication_id,source_template_id,rights_confirmed_at,moderation_feedback,withdrawn_at,created_at",
    )
    .order("created_at", { ascending: false })
    .limit(500);
  if (metadata.error) publicationFailure(metadata.error);
  return loadSubmissions(supabase, metadata.data ?? []);
}

export async function moderateCommunityTemplate(
  teacherId: string,
  publicationId: string,
  action: "approve" | "reject" | "withdraw",
  feedback?: string,
) {
  const supabase = await authenticatedClient(teacherId);
  const { error } = await supabase.rpc("moderate_community_template", {
    target_publication_id: publicationId,
    moderation_action: action,
    feedback: feedback?.trim() || null,
  });
  if (error) publicationFailure(error);
  return { publicationId, action };
}

export async function setCommunityTemplateFeatured(
  teacherId: string,
  publicationId: string,
  featured: boolean,
  order?: number,
) {
  const supabase = await authenticatedClient(teacherId);
  const { error } = await supabase.rpc("set_shared_template_featured", {
    target_publication_id: publicationId,
    featured,
    display_order: featured ? order : null,
  });
  if (error) publicationFailure(error);
  return { publicationId, featured, order: featured ? order : undefined };
}

export async function getCommunityTemplateReports(teacherId: string) {
  const supabase = await authenticatedClient(teacherId);
  const admin = await supabase.rpc("current_user_is_platform_admin");
  if (admin.error) publicationFailure(admin.error);
  if (admin.data !== true) {
    throw new ApiFailure(403, {
      code: "ADMIN_REQUIRED",
      message: "Ta sekcja jest dostępna tylko dla administratorów Easy4Tutor.",
    });
  }
  const reports = await supabase
    .from("shared_template_reports")
    .select("id,publication_id,reason,explanation,status,created_at")
    .order("created_at", { ascending: false })
    .limit(500);
  if (reports.error) publicationFailure(reports.error);
  const publicationIds = [
    ...new Set((reports.data ?? []).map((item) => item.publication_id)),
  ];
  const [publications, sections] = publicationIds.length
    ? await Promise.all([
        supabase
          .from("shared_template_publications")
          .select(
            "id,title,description,subject,level,objective,estimated_duration_minutes,author_name",
          )
          .in("id", publicationIds),
        supabase
          .from("shared_template_sections")
          .select("id,publication_id,title,content,estimated_minutes,position")
          .in("publication_id", publicationIds)
          .order("position"),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
      ];
  if (publications.error) publicationFailure(publications.error);
  if (sections.error) publicationFailure(sections.error);
  const publicationMap = new Map(
    (publications.data ?? []).map((item) => [item.id, item]),
  );
  return (reports.data ?? []).flatMap((report): CommunityTemplateReport[] => {
    const publication = publicationMap.get(report.publication_id);
    if (!publication) return [];
    return [
      {
        id: report.id,
        publicationId: report.publication_id,
        publicationTitle: publication.title,
        authorName: publication.author_name,
        description: publication.description,
        subject: publication.subject,
        level: publication.level,
        objective: publication.objective,
        estimatedDurationMinutes: publication.estimated_duration_minutes,
        sections: (sections.data ?? [])
          .filter((section) => section.publication_id === publication.id)
          .map((section) => ({
            id: section.id,
            title: section.title,
            content: section.content,
            estimatedMinutes: section.estimated_minutes ?? undefined,
            position: section.position,
          })),
        reason: report.reason as CommunityTemplateReport["reason"],
        explanation: report.explanation ?? undefined,
        status: report.status as CommunityTemplateReport["status"],
        createdAt: report.created_at,
      },
    ];
  });
}

export async function resolveCommunityTemplateReport(
  teacherId: string,
  reportId: string,
  action: "dismiss" | "withdraw",
  reason: string,
) {
  const supabase = await authenticatedClient(teacherId);
  const { error } = await supabase.rpc("resolve_shared_template_report", {
    target_report_id: reportId,
    resolution_action: action,
    internal_reason: reason,
  });
  if (error) publicationFailure(error);
  return { reportId, action };
}

type SubmissionMetadata = {
  publication_id: string;
  source_template_id: string;
  rights_confirmed_at: string;
  moderation_feedback: string | null;
  withdrawn_at: string | null;
  created_at: string;
};

async function loadSubmissions(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  metadata: SubmissionMetadata[],
): Promise<CommunityTemplateSubmission[]> {
  if (!metadata.length) return [];
  const ids = metadata.map((item) => item.publication_id);
  const [publications, sections] = await Promise.all([
    supabase
      .from("shared_template_publications")
      .select(
        "id,title,description,subject,level,objective,estimated_duration_minutes,author_name,status,published_at,created_at,is_featured,featured_order,adoption_count",
      )
      .in("id", ids),
    supabase
      .from("shared_template_sections")
      .select("id,publication_id,title,content,estimated_minutes,position")
      .in("publication_id", ids)
      .order("position"),
  ]);
  if (publications.error) publicationFailure(publications.error);
  if (sections.error) publicationFailure(sections.error);
  const publicationMap = new Map(
    (publications.data ?? []).map((item) => [item.id, item]),
  );
  return metadata.flatMap((item) => {
    const publication = publicationMap.get(item.publication_id);
    if (!publication || publication.status === "draft") return [];
    return [
      {
        id: publication.id,
        sourceTemplateId: item.source_template_id,
        title: publication.title,
        description: publication.description,
        subject: publication.subject,
        level: publication.level,
        objective: publication.objective,
        estimatedDurationMinutes: publication.estimated_duration_minutes,
        authorName: publication.author_name,
        status: publication.status as CommunityPublicationStatus,
        moderationFeedback: item.moderation_feedback ?? undefined,
        rightsConfirmedAt: item.rights_confirmed_at,
        publishedAt: publication.published_at ?? undefined,
        withdrawnAt: item.withdrawn_at ?? undefined,
        createdAt: publication.created_at,
        isFeatured: publication.is_featured,
        featuredOrder: publication.featured_order ?? undefined,
        adoptionCount: publication.adoption_count,
        sections: (sections.data ?? [])
          .filter((section) => section.publication_id === publication.id)
          .map((section) => ({
            id: section.id,
            title: section.title,
            content: section.content,
            estimatedMinutes: section.estimated_minutes ?? undefined,
            position: section.position,
          })),
      },
    ];
  });
}

function publicationFailure(error: unknown): never {
  const details = String(
    (error as { message?: unknown } | null)?.message ?? error ?? "",
  );
  if (/rate limit/i.test(details)) {
    throw new ApiFailure(429, {
      code: "RATE_LIMITED",
      message: "Limit zgłoszeń został osiągnięty. Spróbuj ponownie później.",
    });
  }
  if (/rights confirmation|invalid|unsafe/i.test(details)) {
    throw new ApiFailure(422, {
      code: "VALIDATION_ERROR",
      message: "Sprawdź treść i potwierdzenie praw do publikacji.",
    });
  }
  if (/administrator|required|unavailable|not found/i.test(details)) {
    throw new ApiFailure(403, {
      code: "FORBIDDEN",
      message: "Nie masz uprawnień do wykonania tej operacji.",
    });
  }
  logServerError("community_templates_database", error);
  throw new ApiFailure(500, {
    code: "DATABASE_ERROR",
    message: "Nie udało się wykonać działania na publikacji.",
  });
}
