import { describe, expect, it } from "vitest";
import {
  composeStudentResourceContext,
  MaterialAssignmentInputSchema,
  type StudentMaterialsData,
} from "./context-materials";

describe("MaterialAssignmentInputSchema", () => {
  it("accepts only a canonical Material id", () => {
    expect(
      MaterialAssignmentInputSchema.parse({
        materialId: "94000000-0000-4000-8000-000000000001",
      }),
    ).toEqual({ materialId: "94000000-0000-4000-8000-000000000001" });
    expect(
      MaterialAssignmentInputSchema.safeParse({ materialId: "file.pdf" })
        .success,
    ).toBe(false);
  });

  it("does not accept copied material metadata in place of an id", () => {
    expect(
      MaterialAssignmentInputSchema.safeParse({ title: "Worksheet" }).success,
    ).toBe(false);
  });

  it("deduplicates Student 360 materials without losing lesson and group provenance", () => {
    const item = {
      id: "94000000-0000-4000-8000-000000000001",
      title: "Speaking B1",
      type: "file" as const,
      description: "",
      subject: "Angielski",
      level: "B1",
      folder: null,
      tags: [],
      archived: false,
      createdAt: "2026-10-01T10:00:00.000Z",
      updatedAt: "2026-10-01T10:00:00.000Z",
    };
    const data: StudentMaterialsData = {
      direct: [{ ...item, assignedAt: item.createdAt, source: "student" }],
      fromGroups: [
        {
          ...item,
          assignedAt: item.createdAt,
          source: "group",
          group: { id: "group-1", name: "B1" },
        },
      ],
      recentLessons: [
        {
          ...item,
          lessons: [
            {
              id: "lesson-1",
              startsAt: "2026-10-10T10:00:00.000Z",
              topic: "Speaking",
            },
          ],
        },
      ],
      readOnly: false,
    };
    const result = composeStudentResourceContext(data);
    expect(result).toHaveLength(1);
    expect(result[0].sources).toEqual([
      { kind: "student" },
      { kind: "group", group: { id: "group-1", name: "B1" } },
      {
        kind: "lesson",
        lesson: {
          id: "lesson-1",
          startsAt: "2026-10-10T10:00:00.000Z",
          topic: "Speaking",
        },
      },
    ]);
  });
});
