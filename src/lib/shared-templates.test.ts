import { describe, expect, it } from "vitest";
import {
  discoverSharedTemplates,
  filterSharedTemplates,
  sharedTemplateFiltersFromSearchParams,
  type SharedTemplate,
} from "./shared-templates";

const template: SharedTemplate = {
  id: "11000000-0000-4000-8000-000000000001",
  title: "Present Perfect — doświadczenia",
  description: "Rozmowa o doświadczeniach życiowych",
  subject: "Język angielski",
  level: "B1",
  objective: "Uczeń rozróżnia Present Perfect od Past Simple.",
  estimatedDurationMinutes: 60,
  sourceKind: "official",
  authorName: "Zespół Easy4Tutor",
  sourceAttribution: "Oficjalny szablon Easy4Tutor",
  excludedPrivateAttachments: false,
  publishedAt: "2026-10-13T10:00:00.000Z",
  isFeatured: true,
  featuredOrder: 2,
  adoptionCount: 4,
  isFavorite: false,
  sections: [
    {
      id: "12000000-0000-4000-8000-000000000001",
      title: "Łańcuch pytań",
      content: "Partner dopytuje: When? Where?",
      estimatedMinutes: 20,
      position: 0,
    },
  ],
};

describe("shared template catalog filters", () => {
  it("searches safe preview content as well as metadata", () => {
    expect(filterSharedTemplates([template], { search: "łańcuch" })).toEqual([
      template,
    ]);
    expect(filterSharedTemplates([template], { search: "matematyka" })).toEqual(
      [],
    );
  });

  it("combines subject, level, and maximum duration", () => {
    expect(
      filterSharedTemplates([template], {
        subject: "Język angielski",
        level: "B1",
        duration: "60",
      }),
    ).toEqual([template]);
    expect(filterSharedTemplates([template], { duration: "45" })).toEqual([]);
  });

  it("ignores unsupported URL filter values", () => {
    const filters = sharedTemplateFiltersFromSearchParams(
      new URLSearchParams("duration=999&q=test"),
    );
    expect(filters).toEqual({
      search: "",
      subject: "",
      level: "",
      duration: "",
      view: "recommended",
      sort: "popular",
    });
  });

  it("uses genuine adoption counts and publication dates for discovery sorting", () => {
    const newer = {
      ...template,
      id: "22000000-0000-4000-8000-000000000001",
      publishedAt: "2026-10-14T10:00:00.000Z",
      adoptionCount: 1,
      featuredOrder: 1,
    };
    expect(
      discoverSharedTemplates([template, newer], "popular", "popular").map(
        (item) => item.id,
      ),
    ).toEqual([template.id, newer.id]);
    expect(
      discoverSharedTemplates([template, newer], "newest", "newest").map(
        (item) => item.id,
      ),
    ).toEqual([newer.id, template.id]);
    expect(
      discoverSharedTemplates([template, newer], "recommended", "popular").map(
        (item) => item.id,
      ),
    ).toEqual([newer.id, template.id]);
  });

  it("keeps favorites distinct from private copies", () => {
    const favorite = { ...template, isFavorite: true };
    expect(
      discoverSharedTemplates([favorite, template], "saved", "newest"),
    ).toEqual([favorite]);
  });
});
