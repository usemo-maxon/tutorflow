import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");
describe("legal compliance surfaces", () => {
  it("requires terms without treating privacy information as consent", () => {
    const form = read("../../components/auth-form.tsx");
    expect(form).toContain("Akceptuję");
    expect(form).toContain("Regulamin Easy4Tutor");
    expect(form).not.toContain("Wyrażam zgodę na Politykę prywatności");
  });
  it("shows the booking privacy notice", () =>
    expect(read("../../components/public-tutor-page.tsx")).toContain(
      "Administratorem danych podanych w związku z rezerwacją",
    ));
  it("requires explicit Calendar authorization", () => {
    const ui = read("../../components/pages/integrations-settings.tsx");
    expect(ui).toContain("Połącz Google Calendar");
    expect(ui).toContain("googleDisclosure");
  });
  it("uses payment-obligation wording", () =>
    expect(read("../../components/pages/subscription-settings.tsx")).toContain(
      "Kupuję i płacę",
    ));
  it("keeps all public legal links in the footer", () => {
    const page = read("../../app/page.tsx");
    for (const route of [
      "/regulamin",
      "/polityka-prywatnosci",
      "/powierzenie-danych",
      "/podprocesorzy",
      "/dane-uslugodawcy",
      "/zglos-nielegalna-tresc",
    ])
      expect(page).toContain(route);
  });
});
