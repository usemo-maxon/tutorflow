import { describe, expect, it } from "vitest";
import {
  normalizeProfileAccentColor,
  normalizePublicSlug,
  publicProfileDescription,
  profileCompletion,
  publicSlugError,
  youtubeVideoId,
} from "./public-profile";

describe("public profile accent color", () => {
  it("accepts and normalizes arbitrary six-digit hex colors", () => {
    expect(normalizeProfileAccentColor(" #A1B2C3 ")).toBe("#a1b2c3");
  });

  it("rejects values that cannot safely be used as profile colors", () => {
    expect(normalizeProfileAccentColor("red")).toBeUndefined();
    expect(normalizeProfileAccentColor("#123")).toBeUndefined();
    expect(normalizeProfileAccentColor("#123456; color: red")).toBeUndefined();
  });
});

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
  it("accepts only supported YouTube watch and short URLs", () => {
    expect(youtubeVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeVideoId("https://example.com/watch?v=dQw4w9WgXcQ")).toBeUndefined();
  });
  it("calculates completion only from real profile inputs", () => {
    expect(profileCompletion({
      enabled: false, slug: "ania", publicName: "Ania", headline: "Angielski bez stresu", about: "Pomagam mówić swobodnie.", photoUrl: "https://example.com/a.jpg", subjects: ["Angielski"], levels: [], lessonFormats: [], contactLinks: [], certificates: [],
    }, true)).toBe(63);
  });
});
