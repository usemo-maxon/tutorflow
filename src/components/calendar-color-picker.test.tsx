import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CalendarColorPicker } from "./calendar-color-picker";

describe("CalendarColorPicker", () => {
  it("offers the custom in-app picker without a native color input", () => {
    const html = renderToStaticMarkup(
      <CalendarColorPicker value="#6F8FEF" onChange={() => undefined} />,
    );

    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain("Własny kolor");
    expect(html).not.toContain('type="color"');
  });
});
