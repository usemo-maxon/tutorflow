import "server-only";

import { randomUUID } from "node:crypto";
import { cache } from "react";
import { toPublicBookingEventType } from "@/lib/booking-event-types";
import {
  DEFAULT_PROFILE_SECTIONS,
  defaultPublicProfile,
  normalizeProfileAccentColor,
  normalizePublicSlug,
  publicSlugError,
  profileContentKey,
  visiblePublicProfile,
  type ProfileCertificate,
  type ProfileFaq,
  type ProfileSection,
  type ProfileTimelineEntry,
  type PublicTutorProfile,
  type TutorPublicProfile,
} from "@/lib/public-profile";
import { isSupabaseConfigured } from "./env";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "./supabase";
import { mutateStore, queryStore } from "./store";
import { ApiFailure } from "./errors";
import { resolveEntitlements } from "@/lib/entitlements";
import {
  entitledPublicProfile,
  exceedsCertificatePublicationLimit,
  publishedProfileOffers,
} from "@/lib/profile-entitlements";
import {
  assertProfileEdits,
  profileDatabaseFailure,
} from "./profile-entitlements";

const textValue = (value: unknown, max: number) =>
  typeof value === "string"
    ? value.trim().slice(0, max) || undefined
    : undefined;
const listValue = (value: unknown, maxItems: number, maxLength = 100) =>
  Array.isArray(value)
    ? [
        ...new Set(
          value
            .map((item) => textValue(item, maxLength))
            .filter((item): item is string => Boolean(item)),
        ),
      ].slice(0, maxItems)
    : [];
const idValue = (value: unknown) => textValue(value, 80) || randomUUID();
const safeHttpsUrl = (value: unknown) => {
  const candidate = textValue(value, 500);
  if (!candidate) return undefined;
  try {
    const url = new URL(candidate);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    return url.protocol === "https:" || (url.protocol === "http:" && loopback)
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
};
const safeStoragePath = (value: unknown, teacherId: string) => {
  const path = textValue(value, 500);
  if (!path || path.includes("..")) return undefined;
  if (
    !/^[0-9a-f-]{36}\/(video|certificate|poster)\/[0-9a-f-]{36}\.[a-z0-9]+$/i.test(
      path,
    )
  )
    return undefined;
  return !teacherId || path.startsWith(`${teacherId}/`) ? path : undefined;
};

export function cleanPublicProfile(
  input: TutorPublicProfile,
  teacherId = "",
): TutorPublicProfile {
  const slug = normalizePublicSlug(input.slug ?? "");
  const slugError = publicSlugError(slug);
  if (slugError)
    throw new ApiFailure(422, { code: "VALIDATION_ERROR", message: slugError });
  const sectionById = new Map(
    (input.sections ?? []).map((section) => [section.id, section]),
  );
  const sections: ProfileSection[] = DEFAULT_PROFILE_SECTIONS.map(
    (fallback) => {
      const section = sectionById.get(fallback.id);
      return {
        id: fallback.id,
        visible: section?.visible !== false,
        title: textValue(section?.title, 80) || fallback.title,
      };
    },
  ).sort(
    (a, b) =>
      (input.sections ?? []).findIndex((item) => item.id === a.id) -
      (input.sections ?? []).findIndex((item) => item.id === b.id),
  );
  const certificates: ProfileCertificate[] = (input.certificates ?? [])
    .slice(0, 20)
    .map((item) => ({
      id: idValue(item.id),
      title: textValue(item.title, 140) || "Kwalifikacja",
      issuer: textValue(item.issuer, 140) || "",
      issuedAt: textValue(item.issuedAt, 10),
      expiresAt: textValue(item.expiresAt, 10),
      credentialNumber: textValue(item.credentialNumber, 100),
      verificationUrl: safeHttpsUrl(item.verificationUrl),
      description: textValue(item.description, 600),
      storagePath: safeStoragePath(item.storagePath, teacherId),
      fileType:
        item.fileType === "pdf"
          ? "pdf"
          : item.fileType === "image"
            ? "image"
            : undefined,
      visible: Boolean(item.visible),
    }));
  const timeline: ProfileTimelineEntry[] = (input.timeline ?? [])
    .slice(0, 30)
    .map((item) => ({
      id: idValue(item.id),
      kind: item.kind === "education" ? "education" : "experience",
      institution: textValue(item.institution, 140) || "",
      title: textValue(item.title, 140) || "",
      startYear: Number.isInteger(item.startYear) ? item.startYear : undefined,
      endYear: Number.isInteger(item.endYear) ? item.endYear : undefined,
      current: Boolean(item.current),
      description: textValue(item.description, 800),
    }));
  const faq: ProfileFaq[] = (input.faq ?? []).slice(0, 20).map((item) => ({
    id: idValue(item.id),
    question: textValue(item.question, 180) || "",
    answer: textValue(item.answer, 1200) || "",
    visible: Boolean(item.visible),
  }));
  const video = input.video
    ? {
        source:
          input.video.source === "upload"
            ? ("upload" as const)
            : ("youtube" as const),
        videoId:
          input.video.source === "youtube" &&
          /^[A-Za-z0-9_-]{11}$/.test(input.video.videoId ?? "")
            ? input.video.videoId
            : undefined,
        storagePath:
          input.video.source === "upload"
            ? safeStoragePath(input.video.storagePath, teacherId)
            : undefined,
        posterPath: safeStoragePath(input.video.posterPath, teacherId),
        title: textValue(input.video.title, 140) || "Przedstawiam się",
        description: textValue(input.video.description, 500),
      }
    : undefined;
  return {
    enabled: Boolean(input.enabled),
    slug,
    photoUrl: safeHttpsUrl(input.photoUrl),
    publicName: textValue(input.publicName, 120) || "",
    headline: textValue(input.headline, 160),
    shortIntro: textValue(input.shortIntro, 260),
    about: textValue(input.about, 3000),
    subjects: listValue(input.subjects, 12),
    specializations: listValue(input.specializations, 24),
    levels: listValue(input.levels, 12),
    audiences: listValue(input.audiences, 12),
    languages: listValue(input.languages, 12),
    lessonFormats: (input.lessonFormats ?? [])
      .filter((item) => item === "online" || item === "offline")
      .slice(0, 2),
    city: textValue(input.city, 120),
    priceText: textValue(input.priceText, 120),
    contactLinks: listValue(input.contactLinks, 8, 500)
      .map(safeHttpsUrl)
      .filter((url): url is string => Boolean(url)),
    theme: ["minimal", "professional", "friendly", "modern"].includes(
      input.theme ?? "",
    )
      ? input.theme
      : "professional",
    accentColor: normalizeProfileAccentColor(input.accentColor) ?? "#137d60",
    heroLayout: input.heroLayout === "cover" ? "cover" : "portrait",
    coverUrl: safeHttpsUrl(input.coverUrl),
    highlights: listValue(input.highlights, 6, 70),
    sections,
    video: video?.videoId || video?.storagePath ? video : undefined,
    certificates,
    timeline,
    teachingApproach: {
      philosophy: textValue(input.teachingApproach?.philosophy, 1800),
      lessonStructure: textValue(input.teachingApproach?.lessonStructure, 1000),
      materials: textValue(input.teachingApproach?.materials, 1000),
      homework: textValue(input.teachingApproach?.homework, 1000),
      personalization: textValue(input.teachingApproach?.personalization, 1000),
      outcomes: textValue(input.teachingApproach?.outcomes, 1000),
      highlights: listValue(input.teachingApproach?.highlights, 8, 80),
    },
    faq,
  };
}

async function signProfileMedia<
  T extends TutorPublicProfile | PublicTutorProfile,
>(profile: T, ownClient = false): Promise<T> {
  const paths = [
    profile.video?.storagePath,
    profile.video?.posterPath,
    ...(profile.certificates ?? []).map((item) => item.storagePath),
  ].filter((path): path is string => Boolean(path));
  if (!paths.length || !isSupabaseConfigured()) return profile;
  try {
    const supabase = ownClient
      ? await createSupabaseServerClient()
      : createSupabaseAdminClient();
    const { data } = await supabase.storage
      .from("tutor-profile-media")
      .createSignedUrls([...new Set(paths)], ownClient ? 3600 : 300);
    const urls = new Map(
      (data ?? []).flatMap((item) =>
        item.path && item.signedUrl
          ? [[item.path, item.signedUrl] as const]
          : [],
      ),
    );
    return {
      ...profile,
      video: profile.video
        ? {
            ...profile.video,
            url: profile.video.storagePath
              ? urls.get(profile.video.storagePath)
              : undefined,
            posterUrl: profile.video.posterPath
              ? urls.get(profile.video.posterPath)
              : undefined,
          }
        : undefined,
      certificates: (profile.certificates ?? []).map((item) => ({
        ...item,
        fileUrl: item.storagePath ? urls.get(item.storagePath) : undefined,
      })),
    };
  } catch {
    return profile;
  }
}

export async function getOwnPublicProfile(
  teacherId: string,
  name: string,
): Promise<TutorPublicProfile> {
  if (!isSupabaseConfigured() && process.env.NODE_ENV !== "production")
    return queryStore((store) => {
      const teacher = store.teachers.find((item) => item.id === teacherId);
      const draft =
        teacher?.publicProfileDraft ??
        teacher?.publicProfile ??
        defaultPublicProfile(name);
      return {
        ...draft,
        enabled: Boolean(teacher?.publicProfile?.enabled),
        publishedSlug: teacher?.publicProfile?.enabled
          ? teacher.publicProfile.slug
          : undefined,
        hasUnpublishedChanges:
          !teacher?.publicProfile ||
          profileContentKey(draft) !== profileContentKey(teacher.publicProfile),
      };
    });
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("tutor_public_profiles")
    .select(
      "enabled,slug,draft_slug,draft_data,published_at,draft_updated_at,published_data",
    )
    .eq("tutor_id", teacherId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return defaultPublicProfile(name);
  const profile = cleanPublicProfile(
    {
      ...defaultPublicProfile(name),
      ...(data.draft_data as Partial<TutorPublicProfile>),
      enabled: data.enabled,
      slug: data.draft_slug,
    } as TutorPublicProfile,
    teacherId,
  );
  return signProfileMedia(
    {
      ...profile,
      publishedSlug: data.enabled ? data.slug : undefined,
      publishedAt: data.published_at ?? undefined,
      draftUpdatedAt: data.draft_updated_at,
      hasUnpublishedChanges:
        !data.published_data ||
        profileContentKey(profile) !==
          profileContentKey(
            cleanPublicProfile(
              {
                ...defaultPublicProfile(name),
                ...data.published_data,
                slug: data.slug,
              },
              teacherId,
            ),
          ),
    },
    true,
  );
}

export async function saveOwnPublicProfile(
  teacherId: string,
  name: string,
  input: TutorPublicProfile,
): Promise<TutorPublicProfile> {
  const profile = cleanPublicProfile(input, teacherId);
  if (!profile.publicName)
    throw new ApiFailure(422, {
      code: "VALIDATION_ERROR",
      message: "Podaj publiczną nazwę.",
    });
  if (!isSupabaseConfigured() && process.env.NODE_ENV !== "production")
    return mutateStore((store) => {
      const teacher = store.teachers.find((item) => item.id === teacherId);
      if (!teacher) throw new Error("NOT_FOUND");
      assertProfileEdits(
        profile,
        teacher.publicProfileDraft ?? teacher.publicProfile,
        resolveEntitlements(teacher.subscription),
      );
      const duplicate = store.teachers.some(
        (item) =>
          item.id !== teacherId &&
          (item.publicProfileDraft?.slug === profile.slug ||
            item.publicProfile?.slug === profile.slug),
      );
      if (duplicate) throw new Error("Ten adres jest już zajęty.");
      teacher.publicProfileDraft = {
        ...profile,
        enabled: Boolean(teacher.publicProfile?.enabled),
        publishedSlug: teacher.publicProfile?.enabled
          ? teacher.publicProfile.slug
          : undefined,
        hasUnpublishedChanges:
          !teacher.publicProfile ||
          profileContentKey(profile) !==
            profileContentKey(teacher.publicProfile),
      };
      return teacher.publicProfileDraft;
    });
  const supabase = await createSupabaseServerClient();
  const [{ data: tutor }, { data: existing }] = await Promise.all([
    supabase
      .from("tutor_profiles")
      .select("workspace_id")
      .eq("user_id", teacherId)
      .single(),
    supabase
      .from("tutor_public_profiles")
      .select("slug,enabled,published_at")
      .eq("tutor_id", teacherId)
      .maybeSingle(),
  ]);
  if (!tutor) throw new Error("NOT_FOUND");
  const draft = {
    ...profile,
    enabled: undefined,
    publishedAt: undefined,
    draftUpdatedAt: undefined,
    hasUnpublishedChanges: undefined,
  };
  const { error } = await supabase.from("tutor_public_profiles").upsert(
    {
      tutor_id: teacherId,
      workspace_id: tutor.workspace_id,
      enabled: existing?.enabled ?? false,
      slug: existing?.enabled ? existing.slug : profile.slug,
      draft_slug: profile.slug,
      public_name: profile.publicName,
      draft_data: draft,
      draft_updated_at: new Date().toISOString(),
    },
    { onConflict: "tutor_id" },
  );
  if (error) profileDatabaseFailure(error);
  return signProfileMedia(
    {
      ...profile,
      enabled: existing?.enabled ?? false,
      publishedSlug: existing?.enabled ? existing.slug : undefined,
      publishedAt: existing?.published_at ?? undefined,
      hasUnpublishedChanges: true,
      draftUpdatedAt: new Date().toISOString(),
    },
    true,
  );
}

export async function publishOwnPublicProfile(
  teacherId: string,
  name: string,
  input: TutorPublicProfile,
): Promise<TutorPublicProfile> {
  const profile = cleanPublicProfile(input, teacherId);
  if (!profile.publicName || !profile.headline || !profile.subjects.length)
    throw new ApiFailure(422, {
      code: "VALIDATION_ERROR",
      message:
        "Przed publikacją uzupełnij nazwę, nagłówek i co najmniej jeden przedmiot.",
    });
  if (!isSupabaseConfigured() && process.env.NODE_ENV !== "production")
    return mutateStore((store) => {
      const teacher = store.teachers.find((item) => item.id === teacherId);
      if (!teacher) throw new Error("NOT_FOUND");
      const rights = resolveEntitlements(teacher.subscription);
      assertProfileEdits(
        profile,
        teacher.publicProfileDraft ?? teacher.publicProfile,
        rights,
      );
      assertProfileEdits(profile, teacher.publicProfile, rights);
      if (
        exceedsCertificatePublicationLimit(
          profile,
          teacher.publicProfile,
          rights.maxPublishedCertificates,
        )
      ) {
        throw new ApiFailure(403, {
          code: "PLAN_LIMIT_REACHED",
          message:
            "Osiągnięto limit opublikowanych certyfikatów. Ukryj inną pozycję lub wybierz Premium.",
        });
      }
      const duplicate = store.teachers.some(
        (item) =>
          item.id !== teacherId &&
          (item.publicProfileDraft?.slug === profile.slug ||
            item.publicProfile?.slug === profile.slug),
      );
      if (duplicate) throw new Error("Ten adres jest już zajęty.");
      teacher.publicProfile = {
        ...profile,
        enabled: true,
        publishedSlug: profile.slug,
        publishedAt: new Date().toISOString(),
        hasUnpublishedChanges: false,
      };
      teacher.publicProfileDraft = teacher.publicProfile;
      return teacher.publicProfile;
    });
  const supabase = await createSupabaseServerClient();
  await saveOwnPublicProfile(teacherId, name, profile);
  const publishedData = {
    ...profile,
    enabled: undefined,
    publishedAt: undefined,
    draftUpdatedAt: undefined,
    hasUnpublishedChanges: undefined,
  };
  const { data, error } = await supabase.rpc("publish_own_tutor_profile", {
    p_profile: publishedData,
    p_slug: profile.slug,
  });
  if (error) profileDatabaseFailure(error);
  return signProfileMedia(
    {
      ...profile,
      enabled: true,
      publishedSlug: profile.slug,
      publishedAt: data as string,
      hasUnpublishedChanges: false,
    },
    true,
  );
}

export async function unpublishOwnPublicProfile(
  teacherId: string,
): Promise<void> {
  if (!isSupabaseConfigured() && process.env.NODE_ENV !== "production")
    return mutateStore((store) => {
      const teacher = store.teachers.find((item) => item.id === teacherId);
      if (teacher?.publicProfile) teacher.publicProfile.enabled = false;
    });
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("tutor_public_profiles")
    .update({ enabled: false })
    .eq("tutor_id", teacherId);
  if (error) throw new Error("Nie udało się wyłączyć profilu.");
}

export const getPublishedTutorProfile = cache(
  async (slug: string): Promise<PublicTutorProfile | null> => {
    const normalized = normalizePublicSlug(slug);
    if (normalized !== slug) return null;
    if (!isSupabaseConfigured() && process.env.NODE_ENV !== "production")
      return queryStore((store) => {
        const teacher = store.teachers.find(
          (item) =>
            item.publicProfile?.enabled &&
            item.publicProfile.slug === normalized,
        );
        const profile = teacher?.publicProfile;
        if (!profile || !teacher) return null;
        const rights = resolveEntitlements(teacher.subscription);
        return entitledPublicProfile(
          {
            ...cleanPublicProfile(profile, teacher.id),
            enabled: undefined,
            eventTypes: publishedProfileOffers(
              (store.bookingEventTypes ?? []).filter(
                (item) => item.teacherId === teacher.id,
              ),
              rights,
            ).map(toPublicBookingEventType),
          } as unknown as PublicTutorProfile,
          rights,
        );
      });
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .rpc("get_published_tutor_profile", { p_slug: normalized })
      .maybeSingle();
    if (error || !data) return null;
    const row = data as unknown as {
      slug: string;
      profile_data: Partial<TutorPublicProfile>;
      published_at: string | null;
      event_types: PublicTutorProfile["eventTypes"] | null;
    };
    const profile = cleanPublicProfile({
      ...defaultPublicProfile("Tutor"),
      ...row.profile_data,
      enabled: true,
      slug: row.slug,
    } as TutorPublicProfile) as unknown as PublicTutorProfile;
    return signProfileMedia(
      visiblePublicProfile({
        ...profile,
        canonicalSlug: row.slug,
        publishedAt: row.published_at ?? undefined,
        eventTypes: row.event_types ?? [],
      }),
    );
  },
);

export async function uploadPublicPhoto(
  teacherId: string,
  file: File,
): Promise<string> {
  if (
    !/^image\/(jpeg|png|webp)$/.test(file.type) ||
    file.size > 3 * 1024 * 1024
  )
    throw new Error("Wybierz obraz JPG, PNG lub WebP do 3 MB.");
  if (!isSupabaseConfigured())
    throw new Error("Zdjęcia są dostępne po skonfigurowaniu Supabase Storage.");
  const supabase = await createSupabaseServerClient();
  const extension =
    file.type.split("/")[1] === "jpeg" ? "jpg" : file.type.split("/")[1];
  const path = `${teacherId}/${randomUUID()}.${extension}`;
  const { error } = await supabase.storage
    .from("tutor-public-photos")
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error("Nie udało się przesłać zdjęcia.");
  return supabase.storage.from("tutor-public-photos").getPublicUrl(path).data
    .publicUrl;
}
