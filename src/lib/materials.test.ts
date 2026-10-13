import { describe, expect, it } from "vitest";
import {
  filterMaterials,
  materialFiltersFromSearchParams,
  MaterialInputSchema,
  normalizeOrganizationName,
  safeStorageFilename,
  validateMaterialFile,
  type MaterialLibraryItem,
} from "./materials";

const base: MaterialLibraryItem = {
  id: "1",
  title: "Present Perfect — ćwiczenia",
  type: "file",
  description: "Powtórka gramatyki",
  subject: "Angielski",
  level: "B1",
  folder: null,
  tags: [],
  archived: false,
  createdAt: "2026-10-11T10:00:00Z",
  updatedAt: "2026-10-11T10:00:00Z",
};

describe("Materials Library", () => {
  it("accepts practical file, link and text inputs", () => {
    expect(MaterialInputSchema.safeParse({ ...fields(), type: "file" }).success).toBe(true);
    expect(MaterialInputSchema.safeParse({ ...fields(), type: "link", externalUrl: "https://example.com" }).success).toBe(true);
    expect(MaterialInputSchema.safeParse({ ...fields(), type: "text", textContent: "1. Where did you travel last?" }).success).toBe(true);
  });

  it("rejects unsafe URL schemes", () => {
    expect(MaterialInputSchema.safeParse({ ...fields(), type: "link", externalUrl: "javascript:alert(1)" }).success).toBe(false);
  });

  it("rejects oversized and unsupported files", () => {
    expect(validateMaterialFile({ name: "book.pdf", type: "application/pdf", size: 10 * 1024 * 1024 + 1 })).toContain("10 MB");
    expect(validateMaterialFile({ name: "script.html", type: "text/html", size: 100 })).toContain("Dozwolone");
  });

  it("accepts supported teaching files and sanitizes storage names", () => {
    expect(validateMaterialFile({ name: "Karta pracy.pdf", type: "application/pdf", size: 100 })).toBeNull();
    expect(safeStorageFilename("Karta pracy (B1).pdf")).toBe("Karta-pracy-B1.pdf");
  });

  it("searches title, description, subject and level", () => {
    expect(filterMaterials([base], { search: "gramatyki" })).toEqual([base]);
    expect(filterMaterials([base], { search: "angielski" })).toEqual([base]);
    expect(filterMaterials([base], { search: "c2" })).toEqual([]);
  });

  it("searches text content and tag names", () => {
    const organized = {
      ...base,
      textContent: "A discussion about negotiations",
      tags: [{ id: "tag-1", name: "Business" }],
    };
    expect(filterMaterials([organized], { search: "negotiat" })).toEqual([organized]);
    expect(filterMaterials([organized], { search: "business" })).toEqual([organized]);
  });

  it("applies type, subject and level filters", () => {
    expect(filterMaterials([base], { type: "file", subject: "Angielski", level: "B1" })).toHaveLength(1);
    expect(filterMaterials([base], { type: "link" })).toHaveLength(0);
  });

  it("combines folder and tag filters", () => {
    const organized = {
      ...base,
      folder: { id: "folder-1", name: "Grammar" },
      tags: [{ id: "tag-1", name: "Revision" }],
    };
    expect(filterMaterials([organized], { folderId: "folder-1", tagId: "tag-1", level: "B1" })).toEqual([organized]);
    expect(filterMaterials([organized], { folderId: "none" })).toEqual([]);
  });

  it("normalizes organization names and parses URL filter state", () => {
    expect(normalizeOrganizationName("  Business   English ")).toBe("Business English");
    expect(materialFiltersFromSearchParams(new URLSearchParams("q=perfect&folder=none&level=B1"))).toMatchObject({
      search: "perfect",
      withoutFolder: true,
      level: "B1",
    });
  });

  it("hides archived materials from the default active view", () => {
    const archived = { ...base, archived: true };
    expect(filterMaterials([archived], {})).toEqual([]);
    expect(filterMaterials([archived], { archived: true })).toEqual([archived]);
  });
});

function fields() {
  return { title: "Materiał", description: "", subject: "", level: "" };
}
