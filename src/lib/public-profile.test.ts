import { describe, expect, it } from "vitest";
import {
  normalizePublicSlug,
  publicProfileDescription,
  publicSlugError,
} from "./public-profile";

describe("public tutor profile slug", () => {
  it("normalizes Polish names into a stable URL", () =>
    expect(normalizePublicSlug("  Łucja & Żółw! ")).toBe("lucja-zolw"));
  it("rejects system routes and invalid lengths", () => {
    expect(publicSlugError("app")).toBeTruthy();
    expect(publicSlugError("aa")).toBeTruthy();
  });
  it("uses deliberate public content for a description", () =>
    expect(
      publicProfileDescription({
        slug: "ania",
        publicName: "Ania",
        headline: "Angielski bez stresu",
        subjects: [],
        levels: [],
        lessonFormats: [],
        contactLinks: [],
        eventTypes: [],
      }),
    ).toBe("Angielski bez stresu"));
});
