import { z } from "zod";

export const COMMUNITY_PUBLISHING_TERMS_VERSION = "T1.2-LEGAL-REVIEW-REQUIRED";

export const publicationStatuses = [
  "pending_review",
  "approved",
  "rejected",
  "withdrawn",
] as const;

export type CommunityPublicationStatus = (typeof publicationStatuses)[number];

export interface CommunityTemplateSection {
  id?: string;
  title: string;
  content: string;
  estimatedMinutes?: number;
  position: number;
}

export interface CommunityTemplateSubmission {
  id: string;
  sourceTemplateId: string;
  title: string;
  description: string;
  subject: string;
  level: string;
  objective: string;
  estimatedDurationMinutes: number;
  authorName: string;
  status: CommunityPublicationStatus;
  moderationFeedback?: string;
  rightsConfirmedAt: string;
  publishedAt?: string;
  withdrawnAt?: string;
  createdAt: string;
  isFeatured: boolean;
  featuredOrder?: number;
  adoptionCount: number;
  sections: CommunityTemplateSection[];
}

const CommunitySectionInputSchema = z.object({
  title: z.string().trim().min(1, "Każda sekcja musi mieć nazwę.").max(120),
  content: z.string().trim().max(5_000).default(""),
  estimatedMinutes: z.number().int().min(1).max(480).optional(),
});

export const CommunityTemplateSubmissionInputSchema = z.object({
  title: z.string().trim().min(1, "Podaj tytuł.").max(160),
  description: z.string().trim().max(2_000).default(""),
  subject: z.string().trim().min(1, "Podaj przedmiot.").max(80),
  level: z.string().trim().min(1, "Podaj poziom.").max(40),
  estimatedDurationMinutes: z.number().int().min(1).max(480),
  objective: z.string().trim().min(1, "Podaj cel lekcji.").max(5_000),
  authorName: z
    .string()
    .trim()
    .min(1, "Podaj publiczną nazwę autora.")
    .max(120),
  sections: z
    .array(CommunitySectionInputSchema)
    .min(1, "Dodaj co najmniej jedną sekcję.")
    .max(50),
  rightsConfirmed: z.literal(true, {
    error: "Potwierdź prawa do udostępnienia treści.",
  }),
});

export type CommunityTemplateSubmissionInput = z.infer<
  typeof CommunityTemplateSubmissionInputSchema
>;

const forbiddenReference =
  /(storage\/v1\/object|\/material-files\/|blob:|data:|file:|javascript:|supabase\S*\/storage)/iu;

export function sanitizeCommunityText(value: string) {
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu, "")
    .trim();
}

export function containsPrivateFileReference(value: string) {
  return forbiddenReference.test(value);
}

export function sanitizeCommunitySubmission(
  input: CommunityTemplateSubmissionInput,
) {
  const clean = {
    ...input,
    title: sanitizeCommunityText(input.title),
    description: sanitizeCommunityText(input.description),
    subject: sanitizeCommunityText(input.subject),
    level: sanitizeCommunityText(input.level),
    objective: sanitizeCommunityText(input.objective),
    authorName: sanitizeCommunityText(input.authorName),
    sections: input.sections.map((section) => ({
      ...section,
      title: sanitizeCommunityText(section.title),
      content: sanitizeCommunityText(section.content),
    })),
  };
  const combined = [
    clean.title,
    clean.description,
    clean.subject,
    clean.level,
    clean.objective,
    clean.authorName,
    ...clean.sections.flatMap((section) => [section.title, section.content]),
  ].join(" ");
  if (containsPrivateFileReference(combined)) {
    throw new Error(
      "Usuń prywatne odwołania do plików lub Storage przed wysłaniem.",
    );
  }
  return clean;
}

export function communityStatusLabel(status: CommunityPublicationStatus) {
  return {
    pending_review: "Oczekuje na weryfikację",
    approved: "Opublikowany",
    rejected: "Odrzucony",
    withdrawn: "Wycofany",
  }[status];
}
