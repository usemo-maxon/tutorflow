import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("community template responsive contracts", () => {
  it("keeps submission and moderation usable at a 390px viewport", async () => {
    const css = await readFile(
      new URL("../app/globals.css", import.meta.url),
      "utf8",
    );
    expect(css).toMatch(
      /@media \(max-width: 700px\)[\s\S]*?\.community-publish-dialog[\s\S]*?width:\s*100%/,
    );
    expect(css).toMatch(
      /@media \(max-width: 700px\)[\s\S]*?\.community-publish-section\s*{\s*grid-template-columns:\s*32px minmax\(0, 1fr\)/,
    );
    expect(css).toMatch(
      /@media \(max-width: 700px\)[\s\S]*?\.moderation-list\s*{\s*grid-template-columns:\s*1fr/,
    );
    expect(css).toMatch(
      /@media \(max-width: 700px\)[\s\S]*?\.moderation-actions[\s\S]*?flex-direction:\s*column/,
    );
  });

  it("keeps rights, rejection, status, and withdrawal copy visible", async () => {
    const source = await readFile(
      new URL("../components/pages/lesson-templates-page.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("Wyślij do weryfikacji");
    expect(source).toContain("Szablon wymaga poprawek");
    expect(source).toContain("Potwierdzam, że mam prawa");
    expect(source).toContain("Wycofać publikację?");
  });
});
