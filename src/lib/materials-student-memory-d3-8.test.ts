import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LessonWorkspaceActionSchema } from "./lesson-workspace";

describe("D3.8 integration boundaries", () => {
  const contextServer = readFileSync("src/server/context-materials.ts", "utf8");
  const workspaceServer = readFileSync(
    "src/server/lesson-workspace.ts",
    "utf8",
  );
  const briefingSource = readFileSync(
    "src/components/next-lesson-briefing.tsx",
    "utf8",
  );
  const css = readFileSync("src/app/globals.css", "utf8");

  it("attaches an existing canonical material id without a copy payload", () => {
    expect(
      LessonWorkspaceActionSchema.parse({
        type: "attachMaterial",
        materialId: "94000000-0000-4000-8000-000000000001",
      }),
    ).toEqual({
      type: "attachMaterial",
      materialId: "94000000-0000-4000-8000-000000000001",
    });
    expect(
      LessonWorkspaceActionSchema.safeParse({
        type: "attachMaterial",
        materialId: "historical-file.pdf",
      }).success,
    ).toBe(false);
  });

  it("keeps student history bounded and workspace scoped", () => {
    expect(contextServer).toContain('.eq("workspace_id", workspaceId)');
    expect(contextServer).toMatch(
      /lesson_participants!inner\(student_id\)[\s\S]*?\.limit\(5\)/,
    );
    expect(contextServer).toMatch(
      /from\("lesson_materials"\)[\s\S]*?\.eq\("workspace_id", workspaceId\)[\s\S]*?\.in\("lesson_id", recentLessonIds\)/,
    );
  });

  it("keeps attach mutations workspace scoped and read-only controls disabled", () => {
    expect(workspaceServer).toMatch(
      /type === "attachMaterial"[\s\S]*?workspace_id: workspaceId[\s\S]*?material_id: action\.materialId/,
    );
    expect(briefingSource).toContain("readOnly ||");
    expect(briefingSource).toMatch(/Dodaj do planu\s+lekcji/);
  });

  it("keeps the preparation actions usable at 390px", () => {
    expect(css).toMatch(
      /@media \(max-width: 480px\)[\s\S]*?\.lesson-preparation-resource-actions \.button\s*{[\s\S]*?width:\s*100%/,
    );
  });
});
