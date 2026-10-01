export const RESERVED_PUBLIC_SLUGS = new Set([
  "app",
  "api",
  "admin",
  "logowanie",
  "rejestracja",
  "pricing",
  "ustawienia",
  "odzyskaj-haslo",
  "regulamin",
  "polityka-prywatnosci",
  "favicon.ico",
]);

export type LessonFormat = "online" | "offline";

export interface TutorPublicProfile {
  enabled: boolean;
  slug: string;
  photoUrl?: string;
  publicName: string;
  headline?: string;
  about?: string;
  subjects: string[];
  levels: string[];
  lessonFormats: LessonFormat[];
  city?: string;
  priceText?: string;
  contactLinks: string[];
}

export interface PublicTutorProfile extends Omit<
  TutorPublicProfile,
  "enabled"
> {
  eventTypes: PublicBookingEventType[];
}

export function normalizePublicSlug(value: string): string {
  return value
    .replace(/ł/gi, "l")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pl")
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function publicSlugError(value: string): string | undefined {
  const slug = normalizePublicSlug(value);
  if (slug.length < 3 || slug.length > 60)
    return "Adres musi mieć od 3 do 60 znaków.";
  if (RESERVED_PUBLIC_SLUGS.has(slug)) return "Ten adres jest zarezerwowany.";
  return undefined;
}

export function publicProfileDescription(profile: PublicTutorProfile): string {
  return (
    profile.headline ||
    profile.about?.slice(0, 155) ||
    `Korepetycje z ${profile.subjects.join(", ") || "wybranego przedmiotu"}.`
  );
}
import type { PublicBookingEventType } from "./booking-event-types";
