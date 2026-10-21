import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("launch responsive contracts", () => {
  it("collapses the lesson color controls before the tablet breakpoint", async () => {
    const css = await readFile(
      new URL("../app/globals.css", import.meta.url),
      "utf8",
    );

    expect(css).toMatch(
      /@media \(max-width: 980px\)[\s\S]*?\.lesson-color-panel\s*{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/,
    );
  });

  it("keeps the empty lesson-plan copy from being crushed by its actions", async () => {
    const css = await readFile(
      new URL("../app/globals.css", import.meta.url),
      "utf8",
    );

    expect(css).toMatch(
      /\.lesson-plan-empty\s*{[^}]*align-items:\s*stretch;[^}]*flex-direction:\s*column;/s,
    );
    expect(css).toMatch(
      /\.lesson-plan-empty\s*>\s*div:last-child\s*{[^}]*flex-wrap:\s*wrap;/s,
    );
  });
});
