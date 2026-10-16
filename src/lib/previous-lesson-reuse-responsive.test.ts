import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("previous lesson reuse UI contracts", () => {
  it("keeps the selection and preview flow usable on a 390px viewport", async () => {
    const css = await readFile(
      new URL("../app/globals.css", import.meta.url),
      "utf8",
    );
    expect(css).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.lesson-reuse-picker__body\s*{[\s\S]*?grid-template-columns:\s*1fr/,
    );
  });

  it("keeps reuse out of completed and read-only lesson actions", async () => {
    const source = await readFile(
      new URL("../components/pages/lesson-page.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain('lesson.status !== "completed"');
    expect(source).toContain("!data.teacher.readOnly");
    expect(source).toContain("Dodaj do istniejącego planu");
    expect(source).toContain("Niedostępny — zostanie pominięty");
  });
});
