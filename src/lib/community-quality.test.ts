import { describe, expect, it } from "vitest";
import {
  FeatureTemplateInputSchema,
  ReportTemplateInputSchema,
  ResolveReportInputSchema,
} from "./community-quality";

describe("community quality inputs", () => {
  it("accepts bounded report reasons and optional explanations", () => {
    expect(
      ReportTemplateInputSchema.safeParse({
        reason: "copyright",
        explanation: "Kontekst",
      }).success,
    ).toBe(true);
    expect(
      ReportTemplateInputSchema.safeParse({ reason: "spam" }).success,
    ).toBe(false);
    expect(
      ReportTemplateInputSchema.safeParse({
        reason: "other",
        explanation: "x".repeat(1001),
      }).success,
    ).toBe(false);
  });

  it("requires an order for administrator curation", () => {
    expect(
      FeatureTemplateInputSchema.safeParse({ featured: true, order: 0 })
        .success,
    ).toBe(true);
    expect(
      FeatureTemplateInputSchema.safeParse({ featured: true }).success,
    ).toBe(false);
    expect(
      FeatureTemplateInputSchema.safeParse({ featured: false }).success,
    ).toBe(true);
  });

  it("requires a bounded internal moderation reason", () => {
    expect(
      ResolveReportInputSchema.safeParse({
        action: "dismiss",
        reason: "Brak naruszenia",
      }).success,
    ).toBe(true);
    expect(
      ResolveReportInputSchema.safeParse({ action: "withdraw", reason: "" })
        .success,
    ).toBe(false);
  });
});
