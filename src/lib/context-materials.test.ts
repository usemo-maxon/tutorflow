import { describe, expect, it } from "vitest";
import { MaterialAssignmentInputSchema } from "./context-materials";

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
});
