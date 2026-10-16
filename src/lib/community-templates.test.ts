import { describe, expect, it } from "vitest";
import {
  CommunityTemplateSubmissionInputSchema,
  communityStatusLabel,
  sanitizeCommunitySubmission,
} from "./community-templates";

const valid = {
  title: "Rozmowa — B1",
  description: "Bezpieczny opis",
  subject: "Język angielski",
  level: "B1",
  estimatedDurationMinutes: 60,
  objective: "Uczeń prowadzi rozmowę.",
  authorName: "Tutor z Mazur",
  rightsConfirmed: true as const,
  sections: [
    { title: "Rozgrzewka", content: "Trzy pytania", estimatedMinutes: 10 },
  ],
};

describe("community template publication input", () => {
  it("requires explicit rights confirmation and complete reusable content", () => {
    expect(
      CommunityTemplateSubmissionInputSchema.safeParse(valid).success,
    ).toBe(true);
    expect(
      CommunityTemplateSubmissionInputSchema.safeParse({
        ...valid,
        rightsConfirmed: false,
      }).success,
    ).toBe(false);
  });

  it("removes control characters and rejects private file references", () => {
    expect(
      sanitizeCommunitySubmission({ ...valid, title: "  Plan\u0000 lekcji  " })
        .title,
    ).toBe("Plan lekcji");
    expect(() =>
      sanitizeCommunitySubmission({
        ...valid,
        sections: [
          {
            title: "Plik",
            content: "https://project.supabase.co/storage/v1/object/private/x",
          },
        ],
      }),
    ).toThrow(/prywatne odwołania/i);
  });

  it("exposes the four Polish lifecycle labels", () => {
    expect([
      communityStatusLabel("pending_review"),
      communityStatusLabel("approved"),
      communityStatusLabel("rejected"),
      communityStatusLabel("withdrawn"),
    ]).toEqual([
      "Oczekuje na weryfikację",
      "Opublikowany",
      "Odrzucony",
      "Wycofany",
    ]);
  });
});
