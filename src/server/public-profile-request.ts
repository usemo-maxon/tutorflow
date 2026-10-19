import "server-only";
import { z } from "zod";
import { currentTeacher } from "./auth";
import { ApiFailure } from "./errors";
import type { TutorPublicProfile } from "@/lib/public-profile";

const text = (max: number) => z.string().max(max).optional();
const list = (count: number, length = 100) =>
  z.array(z.string().max(length)).max(count);
const date = z.union([z.literal(""), z.iso.date()]).optional();
const schema = z.object({
  enabled: z.boolean(),
  slug: z.string().max(120),
  publicName: z.string().max(120),
  photoUrl: text(500),
  headline: text(160),
  shortIntro: text(260),
  about: text(3000),
  subjects: list(12),
  specializations: list(24).optional(),
  levels: list(12),
  audiences: list(12).optional(),
  languages: list(12).optional(),
  lessonFormats: z.array(z.enum(["online", "offline"])).max(2),
  city: text(120),
  priceText: text(120),
  contactLinks: list(8, 500),
  theme: z.enum(["minimal", "professional", "friendly", "modern"]).optional(),
  accentColor: text(20),
  heroLayout: z.enum(["portrait", "cover"]).optional(),
  coverUrl: text(500),
  highlights: list(6, 70).optional(),
  sections: z
    .array(
      z.object({
        id: z.enum([
          "about",
          "video",
          "subjects",
          "approach",
          "experience",
          "certificates",
          "offers",
          "faq",
          "contact",
        ]),
        visible: z.boolean(),
        title: z.string().max(80),
      }),
    )
    .max(9)
    .optional(),
  video: z
    .object({
      source: z.enum(["youtube", "upload"]),
      videoId: text(11),
      storagePath: text(500),
      posterPath: text(500),
      title: z.string().max(140),
      description: text(500),
    })
    .optional(),
  certificates: z
    .array(
      z.object({
        id: z.string().max(80),
        title: z.string().max(140),
        issuer: z.string().max(140),
        issuedAt: date,
        expiresAt: date,
        credentialNumber: text(100),
        verificationUrl: text(500),
        description: text(600),
        storagePath: text(500),
        fileType: z.enum(["image", "pdf"]).optional(),
        visible: z.boolean(),
      }),
    )
    .max(20)
    .optional(),
  timeline: z
    .array(
      z.object({
        id: z.string().max(80),
        kind: z.enum(["education", "experience"]),
        institution: z.string().max(140),
        title: z.string().max(140),
        startYear: z.number().int().min(1900).max(2200).optional(),
        endYear: z.number().int().min(1900).max(2200).optional(),
        current: z.boolean().optional(),
        description: text(800),
      }),
    )
    .max(30)
    .optional(),
  faq: z
    .array(
      z.object({
        id: z.string().max(80),
        question: z.string().max(180),
        answer: z.string().max(1200),
        visible: z.boolean(),
      }),
    )
    .max(20)
    .optional(),
  teachingApproach: z
    .object({
      philosophy: text(1800),
      lessonStructure: text(1000),
      materials: text(1000),
      homework: text(1000),
      personalization: text(1000),
      outcomes: text(1000),
      highlights: list(8, 80),
    })
    .optional(),
});

export function parseProfileInput(input: unknown): TutorPublicProfile {
  const parsed = schema.safeParse(input);
  if (!parsed.success)
    throw new ApiFailure(422, {
      code: "VALIDATION_ERROR",
      message: "Sprawdź format i długość danych profilu.",
      details: {
        fields: parsed.error.issues.map((issue) => issue.path.join(".")),
      },
    });
  return parsed.data;
}

export async function profileMutationTeacher(request: Request) {
  const origin = request.headers.get("origin");
  if (
    request.headers.get("sec-fetch-site") === "cross-site" ||
    (origin && origin !== new URL(request.url).origin)
  ) {
    throw new ApiFailure(403, {
      code: "CROSS_SITE_REQUEST",
      message: "Żądanie zostało odrzucone.",
    });
  }
  const teacher = await currentTeacher();
  if (!teacher)
    throw new ApiFailure(401, {
      code: "UNAUTHENTICATED",
      message: "Zaloguj się ponownie.",
    });
  if (
    teacher.subscription.readOnly &&
    teacher.subscription.accessGrant !== "owner_lifetime"
  )
    throw new ApiFailure(403, {
      code: "READ_ONLY",
      message: "Konto jest w trybie tylko do odczytu.",
    });
  return teacher;
}

export async function readProfileInput(
  request: Request,
): Promise<TutorPublicProfile> {
  let input: unknown;
  try {
    input = await request.json();
  } catch {
    throw new ApiFailure(400, {
      code: "VALIDATION_ERROR",
      message: "Nieprawidłowe dane profilu.",
    });
  }
  return parseProfileInput(input);
}
