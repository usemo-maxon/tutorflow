import { describe, expect, it } from "vitest";
import { BETA_FEEDBACK_MAILTO, BETA_SUPPORT_EMAIL } from "./beta-feedback";

describe("beta feedback contact", () => {
  it("opens a privacy-aware Polish feedback template", () => {
    const url = new URL(BETA_FEEDBACK_MAILTO);

    expect(url.protocol).toBe("mailto:");
    expect(url.pathname).toBe(BETA_SUPPORT_EMAIL);
    expect(url.searchParams.get("subject")).toContain("problem lub opinia");
    expect(url.searchParams.get("body")).toContain("Obszar easy4tutor:");
    expect(url.searchParams.get("body")).toContain("Problem lub sugestia:");
    expect(url.searchParams.get("body")).toContain(
      "Kroki do odtworzenia (opcjonalnie):",
    );
    expect(url.searchParams.get("body")).toContain(
      "nie wpisywać imion uczniów",
    );
  });
});
