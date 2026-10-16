import { z } from "zod";

export const reportReasons = [
  "copyright",
  "inappropriate",
  "personal_data",
  "misleading",
  "other",
] as const;

export const ReportTemplateInputSchema = z.object({
  reason: z.enum(reportReasons),
  explanation: z.string().trim().max(1_000).optional(),
});

export const FavoriteTemplateInputSchema = z.object({
  favorite: z.boolean(),
});

export const FeatureTemplateInputSchema = z
  .object({
    featured: z.boolean(),
    order: z.number().int().min(0).max(10_000).optional(),
  })
  .superRefine((value, context) => {
    if (value.featured && value.order === undefined) {
      context.addIssue({
        code: "custom",
        path: ["order"],
        message: "Podaj kolejność polecenia.",
      });
    }
  });

export const ResolveReportInputSchema = z.object({
  action: z.enum(["dismiss", "withdraw"]),
  reason: z.string().trim().min(1).max(1_000),
});

export type TemplateReportReason = (typeof reportReasons)[number];
export type ReportTemplateInput = z.infer<typeof ReportTemplateInputSchema>;

export interface CommunityTemplateReport {
  id: string;
  publicationId: string;
  publicationTitle: string;
  authorName: string;
  description: string;
  subject: string;
  level: string;
  objective: string;
  estimatedDurationMinutes: number;
  sections: Array<{
    id: string;
    title: string;
    content: string;
    estimatedMinutes?: number;
    position: number;
  }>;
  reason: TemplateReportReason;
  explanation?: string;
  status: "open" | "dismissed" | "withdrawn";
  createdAt: string;
}

export function reportReasonLabel(reason: TemplateReportReason) {
  return {
    copyright: "Naruszenie praw autorskich",
    inappropriate: "Nieodpowiednie treści",
    personal_data: "Dane osobowe",
    misleading: "Błędne lub wprowadzające w błąd materiały",
    other: "Inny powód",
  }[reason];
}
