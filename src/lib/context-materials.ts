import { z } from "zod";
import type { MaterialLibraryItem } from "./materials";

export const MaterialAssignmentInputSchema = z.object({
  materialId: z.uuid(),
});

export interface AssignedMaterial extends MaterialLibraryItem {
  assignedAt: string;
  source: "student" | "group";
  group?: { id: string; name: string };
}

export interface StudentMaterialsData {
  direct: AssignedMaterial[];
  fromGroups: AssignedMaterial[];
  readOnly: boolean;
}

export interface GroupMaterialsData {
  materials: AssignedMaterial[];
  readOnly: boolean;
}
