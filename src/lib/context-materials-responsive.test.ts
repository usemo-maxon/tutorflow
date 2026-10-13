import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Student and Group materials UI", () => {
  const source = readFileSync("src/components/context-materials.tsx", "utf8");
  const css = readFileSync("src/app/globals.css", "utf8");

  it("keeps Student and inherited Group materials visually separate", () => {
    expect(source).toContain("Materiały ucznia");
    expect(source).toContain("Materiały z grup");
    expect(source).toContain("material.group");
  });

  it("reuses all Materials Library picker filters", () => {
    for (const filter of ["q", "type", "folder", "tag", "subject", "level"]) {
      expect(source).toContain(`next.set(\"${filter}\"`);
    }
  });

  it("uses compact cards and a mobile bottom-sheet picker", () => {
    expect(source).not.toContain("<table");
    expect(css).toContain("@media (max-width: 700px)");
    expect(css).toContain("max-height: 92dvh");
  });
});
