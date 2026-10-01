import "server-only";

import { randomUUID } from "node:crypto";
import { cache } from "react";
import { toPublicBookingEventType } from "@/lib/booking-event-types";
import type {
  PublicTutorProfile,
  TutorPublicProfile,
} from "@/lib/public-profile";
import { normalizePublicSlug, publicSlugError } from "@/lib/public-profile";
import { isSupabaseConfigured } from "./env";
import { createSupabaseServerClient } from "./supabase";
import { mutateStore, queryStore } from "./store";

const emptyProfile = (name: string): TutorPublicProfile => ({
  enabled: false,
  slug: normalizePublicSlug(name) || "moj-profil",
  publicName: name,
  subjects: [],
  levels: [],
  lessonFormats: [],
  contactLinks: [],
});

function profileFromPublishedRow(row: {
  slug: string;
  photo_url: string | null;
  public_name: string;
  headline: string | null;
  about: string | null;
  subjects: string[] | null;
  levels: string[] | null;
  lesson_formats: ("online" | "offline")[] | null;
  city: string | null;
  price_text: string | null;
  contact_links: string[] | null;
  event_types: PublicTutorProfile["eventTypes"] | null;
}): PublicTutorProfile {
  return {
    slug: row.slug,
    photoUrl: row.photo_url ?? undefined,
    publicName: row.public_name,
    headline: row.headline ?? undefined,
    about: row.about ?? undefined,
    subjects: row.subjects ?? [],
    levels: row.levels ?? [],
    lessonFormats: row.lesson_formats ?? [],
    city: row.city ?? undefined,
    priceText: row.price_text ?? undefined,
    contactLinks: row.contact_links ?? [],
    eventTypes: row.event_types ?? [],
  };
}

function clean(input: TutorPublicProfile): TutorPublicProfile {
  const slug = normalizePublicSlug(input.slug);
  const error = publicSlugError(slug);
  if (error) throw new Error(error);
  const text = (value: string | undefined, max: number) =>
    value?.trim().slice(0, max) || undefined;
  const list = (items: string[], max: number) =>
    [...new Set(items.map((item) => item.trim()).filter(Boolean))].slice(
      0,
      max,
    );
  return {
    enabled: Boolean(input.enabled),
    slug,
    publicName: text(input.publicName, 120) || "",
    headline: text(input.headline, 160),
    about: text(input.about, 2000),
    subjects: list(input.subjects, 12),
    levels: list(input.levels, 12),
    lessonFormats: input.lessonFormats.filter(
      (item) => item === "online" || item === "offline",
    ),
    city: text(input.city, 120),
    priceText: text(input.priceText, 120),
    contactLinks: list(input.contactLinks, 4).filter((link) =>
      /^https:\/\//.test(link),
    ),
  };
}

export async function getOwnPublicProfile(
  teacherId: string,
  name: string,
): Promise<TutorPublicProfile> {
  if (!isSupabaseConfigured() && process.env.NODE_ENV !== "production") {
    return queryStore(
      (store) =>
        store.teachers.find((teacher) => teacher.id === teacherId)
          ?.publicProfile ?? emptyProfile(name),
    );
  }
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("tutor_public_profiles")
    .select(
      "enabled,slug,photo_url,public_name,headline,about,subjects,levels,lesson_formats,city,price_text,contact_links",
    )
    .eq("tutor_id", teacherId)
    .maybeSingle();
  if (!data) return emptyProfile(name);
  return {
    enabled: data.enabled,
    slug: data.slug,
    photoUrl: data.photo_url ?? undefined,
    publicName: data.public_name,
    headline: data.headline ?? undefined,
    about: data.about ?? undefined,
    subjects: data.subjects ?? [],
    levels: data.levels ?? [],
    lessonFormats: data.lesson_formats ?? [],
    city: data.city ?? undefined,
    priceText: data.price_text ?? undefined,
    contactLinks: data.contact_links ?? [],
  };
}

export async function saveOwnPublicProfile(
  teacherId: string,
  name: string,
  input: TutorPublicProfile,
): Promise<TutorPublicProfile> {
  const profile = clean(input);
  if (!profile.publicName) throw new Error("Podaj publiczną nazwę.");
  if (!isSupabaseConfigured() && process.env.NODE_ENV !== "production") {
    return mutateStore((store) => {
      const teacher = store.teachers.find((item) => item.id === teacherId);
      if (!teacher) throw new Error("NOT_FOUND");
      const duplicate = store.teachers.some(
        (item) =>
          item.id !== teacherId && item.publicProfile?.slug === profile.slug,
      );
      if (duplicate) throw new Error("Ten adres jest już zajęty.");
      teacher.publicProfile = profile;
      return profile;
    });
  }
  const supabase = await createSupabaseServerClient();
  const { data: tutor } = await supabase
    .from("tutor_profiles")
    .select("workspace_id")
    .eq("user_id", teacherId)
    .single();
  if (!tutor) throw new Error("NOT_FOUND");
  const { error } = await supabase
    .from("tutor_public_profiles")
    .upsert(
      {
        tutor_id: teacherId,
        workspace_id: tutor.workspace_id,
        enabled: profile.enabled,
        slug: profile.slug,
        photo_url: profile.photoUrl ?? null,
        public_name: profile.publicName,
        headline: profile.headline ?? null,
        about: profile.about ?? null,
        subjects: profile.subjects,
        levels: profile.levels,
        lesson_formats: profile.lessonFormats,
        city: profile.city ?? null,
        price_text: profile.priceText ?? null,
        contact_links: profile.contactLinks,
      },
      { onConflict: "tutor_id" },
    );
  if (error)
    throw new Error(
      error.code === "23505"
        ? "Ten adres jest już zajęty."
        : "Nie udało się zapisać strony.",
    );
  return profile;
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
        return {
          slug: profile.slug,
          photoUrl: profile.photoUrl,
          publicName: profile.publicName,
          headline: profile.headline,
          about: profile.about,
          subjects: profile.subjects,
          levels: profile.levels,
          lessonFormats: profile.lessonFormats,
          city: profile.city,
          priceText: profile.priceText,
          contactLinks: profile.contactLinks,
          eventTypes: (store.bookingEventTypes ?? [])
            .filter(
              (item) =>
                item.teacherId === teacher.id && item.active && item.isPublic,
            )
            .sort((a, b) => a.displayOrder - b.displayOrder)
            .map(toPublicBookingEventType),
        };
      });
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase
      .rpc("get_published_tutor_profile", { p_slug: normalized })
      .maybeSingle();
    if (error || !data) return null;
    return profileFromPublishedRow(
      data as Parameters<typeof profileFromPublishedRow>[0],
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
