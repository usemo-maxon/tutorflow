import { describe, expect, it } from "vitest";
import {
  appendTemplateText,
  filterLessonTemplates,
  LessonTemplateInputSchema,
  sectionPlanText,
  type LessonTemplate,
} from "./lesson-templates";

const template: LessonTemplate = {
  id: "10000000-0000-4000-8000-000000000001",
  title: "Present Perfect — B1",
  description: "Powtórka do rozmowy",
  subject: "Angielski",
  level: "B1",
  objective: "Użycie czasu w rozmowie",
  teacherNotes: "Przygotuj przykłady",
  estimatedDurationMinutes: 60,
  sections: [
    {
      id: "20000000-0000-4000-8000-000000000001",
      title: "Warm-up",
      content: "Pytania",
      estimatedMinutes: 10,
      position: 0,
    },
  ],
  materials: [],
  tags: [{ id: "30000000-0000-4000-8000-000000000001", name: "Grammar" }],
  archived: false,
  createdAt: "2026-10-11T00:00:00.000Z",
  updatedAt: "2026-10-11T00:00:00.000Z",
};

describe("lesson templates", () => {
  it("validates ordered sections and reusable relationships", () => {
    expect(
      LessonTemplateInputSchema.parse({
        title: template.title,
        sections: template.sections,
        materialIds: ["40000000-0000-4000-8000-000000000001"],
        tagIds: template.tags.map((tag) => tag.id),
      }).sections,
    ).toHaveLength(1);
  });

  it("searches title, metadata, and shared material tags", () => {
    expect(
      filterLessonTemplates([template], { search: "grammar", level: "B1" }),
    ).toEqual([template]);
    expect(filterLessonTemplates([template], { search: "matematyka" })).toEqual(
      [],
    );
  });

  it("keeps existing lesson text and appends copied template content", () => {
    expect(appendTemplateText("Istniejący cel", "Cel szablonu")).toBe(
      "Istniejący cel\n\nCel szablonu",
    );
    expect(sectionPlanText(template.sections[0]!)).toBe("Warm-up — Pytania");
  });
});
