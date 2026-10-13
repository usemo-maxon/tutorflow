import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("lesson template responsive contracts", () => {
  it("collapses the library and editor to one column below a phone-safe breakpoint", async () => {
    const css = await readFile(
      new URL("../app/globals.css", import.meta.url),
      "utf8",
    );
    expect(css).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.template-grid\s*{\s*grid-template-columns:\s*1fr/,
    );
    expect(css).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.template-editor\s*{[\s\S]*?width:\s*100%/,
    );
    expect(css).toMatch(
      /@media \(max-width: 760px\)[\s\S]*?\.lesson-template-picker__body\s*{\s*grid-template-columns:\s*1fr/,
    );
  });

  it("keeps read-only users out of template mutation controls", async () => {
    const source = await readFile(
      new URL("../components/pages/lesson-templates-page.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain("disabled={data.readOnly}");
    expect(source).toContain("!readOnly && !template.archived");
  });
});
