import type { PublicBookingEventType } from "./booking-event-types";

export const RESERVED_PUBLIC_SLUGS = new Set(["app", "api", "admin", "logowanie", "rejestracja", "pricing", "ustawienia", "odzyskaj-haslo", "regulamin", "polityka-prywatnosci", "favicon.ico"]);
export type LessonFormat = "online" | "offline";
export type ProfileTheme = "minimal" | "professional" | "friendly" | "modern";
export type ProfileSectionId = "about" | "video" | "subjects" | "approach" | "experience" | "certificates" | "offers" | "faq" | "contact";
export interface ProfileSection { id: ProfileSectionId; visible: boolean; title: string }
export interface ProfileVideo { source: "youtube" | "upload"; videoId?: string; storagePath?: string; url?: string; posterPath?: string; posterUrl?: string; title: string; description?: string }
export interface ProfileCertificate { id: string; title: string; issuer: string; issuedAt?: string; expiresAt?: string; credentialNumber?: string; verificationUrl?: string; description?: string; storagePath?: string; fileUrl?: string; fileType?: "image" | "pdf"; visible: boolean }
export interface ProfileTimelineEntry { id: string; kind: "education" | "experience"; institution: string; title: string; startYear?: number; endYear?: number; current?: boolean; description?: string }
export interface ProfileFaq { id: string; question: string; answer: string; visible: boolean }
export interface TeachingApproach { philosophy?: string; lessonStructure?: string; materials?: string; homework?: string; personalization?: string; outcomes?: string; highlights: string[] }

export const DEFAULT_PROFILE_SECTIONS: ProfileSection[] = [
  { id: "about", visible: true, title: "O mnie" },
  { id: "video", visible: true, title: "Poznajmy się" },
  { id: "subjects", visible: true, title: "W czym mogę Ci pomóc" },
  { id: "approach", visible: true, title: "Jak uczę" },
  { id: "experience", visible: true, title: "Doświadczenie i edukacja" },
  { id: "certificates", visible: true, title: "Kwalifikacje" },
  { id: "offers", visible: true, title: "Wybierz lekcję" },
  { id: "faq", visible: true, title: "Najczęstsze pytania" },
  { id: "contact", visible: true, title: "Kontakt" },
];

export interface TutorPublicProfile {
  enabled: boolean;
  slug: string;
  photoUrl?: string;
  publicName: string;
  headline?: string;
  shortIntro?: string;
  about?: string;
  subjects: string[];
  specializations?: string[];
  levels: string[];
  audiences?: string[];
  languages?: string[];
  lessonFormats: LessonFormat[];
  city?: string;
  priceText?: string;
  contactLinks: string[];
  theme?: ProfileTheme;
  accentColor?: string;
  heroLayout?: "portrait" | "cover";
  coverUrl?: string;
  highlights?: string[];
  sections?: ProfileSection[];
  video?: ProfileVideo;
  certificates?: ProfileCertificate[];
  timeline?: ProfileTimelineEntry[];
  teachingApproach?: TeachingApproach;
  faq?: ProfileFaq[];
  publishedAt?: string;
  draftUpdatedAt?: string;
  hasUnpublishedChanges?: boolean;
}

export interface PublicTutorProfile extends Omit<TutorPublicProfile, "enabled"> { eventTypes: PublicBookingEventType[]; canonicalSlug?: string }

export function defaultPublicProfile(name: string): TutorPublicProfile {
  return { enabled: false, slug: normalizePublicSlug(name) || "moj-profil", publicName: name, subjects: [], specializations: [], levels: [], audiences: [], languages: [], lessonFormats: [], contactLinks: [], theme: "professional", accentColor: "#137d60", heroLayout: "portrait", highlights: [], sections: DEFAULT_PROFILE_SECTIONS.map((section) => ({ ...section })), certificates: [], timeline: [], teachingApproach: { highlights: [] }, faq: [] };
}

export function normalizeProfileAccentColor(value?: string): string | undefined {
  const color = value?.trim().toLowerCase();
  return color && /^#[0-9a-f]{6}$/.test(color) ? color : undefined;
}

export function normalizePublicSlug(value: string): string {
  return value.replace(/ł/gi, "l").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pl").trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-");
}

export function publicSlugError(value: string): string | undefined {
  const slug = normalizePublicSlug(value);
  if (slug.length < 3 || slug.length > 60) return "Adres musi mieć od 3 do 60 znaków.";
  if (RESERVED_PUBLIC_SLUGS.has(slug)) return "Ten adres jest zarezerwowany.";
  return undefined;
}

export function youtubeVideoId(value: string): string | undefined {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, "");
    const id = host === "youtu.be" ? url.pathname.slice(1) : host === "youtube.com" || host === "m.youtube.com" ? url.searchParams.get("v") : undefined;
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : undefined;
  } catch { return undefined; }
}

export function profileCompletion(profile: TutorPublicProfile, hasOffer = false) {
  const checks = [Boolean(profile.photoUrl), Boolean(profile.headline?.trim()), Boolean(profile.about?.trim()), profile.subjects.length > 0, hasOffer, Boolean(profile.video), Boolean(profile.certificates?.some((certificate) => certificate.visible)), profile.enabled];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

export function publicProfileDescription(profile: PublicTutorProfile): string {
  return profile.shortIntro || profile.headline || profile.about?.slice(0, 155) || `Korepetycje z ${profile.subjects.join(", ") || "wybranego przedmiotu"}.`;
}
