import { describe, expect, it } from "vitest";
import {
  buildCompletionOutcomes,
  difficultyLabel,
  participantCompletionStatus,
} from "./lesson-completion";

describe("lesson completion helpers", () => {
  it("maps stored difficulty values to Polish labels", () => {
    expect(["easy", "mixed", "hard"].map((value) => difficultyLabel(value as never))).toEqual([
      "Łatwo",
      "Różnie",
      "Trudno",
    ]);
  });

  it("trims values and omits fully blank outcomes", () => {
    expect(
      buildCompletionOutcomes({
        anna: {
          progressSummary: "  Opanowała pytania. ",
          difficultyLevel: "mixed",
          difficultyNote: " ",
          nextStep: " Powtórzyć did. ",
        },
        kuba: {
          progressSummary: " ",
          difficultyNote: "",
          nextStep: "",
        },
      }),
    ).toEqual([
      {
        studentId: "anna",
        progressSummary: "Opanowała pytania.",
        difficultyLevel: "mixed",
        difficultyNote: undefined,
        nextStep: "Powtórzyć did.",
      },
    ]);
  });

  it("distinguishes missing attendance from optional blank notes", () => {
    const blank = {
      progressSummary: "",
      difficultyNote: "",
      nextStep: "",
    };
    expect(participantCompletionStatus("unknown", blank)).toBe(
      "attendance-missing",
    );
    expect(participantCompletionStatus("present", blank)).toBe(
      "optional-empty",
    );
    expect(
      participantCompletionStatus("absent", { ...blank, nextStep: "Kontakt" }),
    ).toBe("ready");
  });
});
