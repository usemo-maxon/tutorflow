import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("shared template preview interaction contract", () => {
  it("centers the desktop dialog and keeps a bounded mobile sheet", async () => {
    const css = await readFile(
      new URL("../app/globals.css", import.meta.url),
      "utf8",
    );
    expect(css).toMatch(
      /\.dialog-content\.shared-template-preview\s*\{[\s\S]*?top:\s*50%;[\s\S]*?left:\s*50%;[\s\S]*?transform:\s*translate\(-50%, -50%\)/,
    );
    expect(css).toMatch(
      /@media \(max-width: 700px\)[\s\S]*?\.dialog-content\.shared-template-preview\s*\{[\s\S]*?height:\s*94dvh;[\s\S]*?transform:\s*none/,
    );
    expect(css).toMatch(
      /\.shared-template-preview__scroll\s*\{[\s\S]*?min-height:\s*0;[\s\S]*?overflow-y:\s*auto/,
    );
  });

  it("keeps card activation, favorites, focus restoration and complete actions separate", async () => {
    const component = await readFile(
      new URL("../components/pages/shared-templates-page.tsx", import.meta.url),
      "utf8",
    );
    expect(component).toContain('className="shared-template-card__open"');
    expect(component).toContain("onCloseAutoFocus");
    expect(component).toContain("restoreFocusRef.current?.focus()");
    expect(component).toContain("current?.id === template.id");
    expect(component).toContain("Szablon zapisany w Twojej bibliotece!");
    expect(component).toContain("Otwórz szablon");
    expect(component).toContain("Użyj w lekcji");
    expect(component).toContain("Zgłoś szablon");
  });
});
