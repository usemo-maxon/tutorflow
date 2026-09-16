import { z } from "zod";
import type { AttendanceStatus, LessonStatus, SyncStatus } from "./domain";

export interface LessonWorkspaceParticipant {
  id: string;
  studentId: string;
  name: string;
  subject: string;
  level: string;
  status: "active" | "archived";
  attendanceStatus: AttendanceStatus;
}

export interface LessonWorkspaceMaterial {
  id: string;
  title: string;
  description: string;
  type: "link" | "file" | "note";
  url?: string;
  attached: boolean;
}

export interface LessonWorkspaceHomework {
  id: string;
  title: string;
  description: string;
  status: "assigned" | "completed" | "cancelled";
  dueAt?: string;
  updatedAt: string;
}

export interface LessonWorkspaceAdjacentLesson {
  id: string;
  startsAt: string;
  topic: string;
  homeworkTitle?: string;
}

export interface LessonWorkspaceData {
  teacher: {
    timezone: string;
    readOnly: boolean;
  };
  lesson: {
    id: string;
    studentId?: string;
    groupId?: string;
    participantLabel: string;
    subject: string;
    level: string;
    startsAt: string;
    endsAt: string;
    durationMinutes: number;
    format: "online" | "offline";
    location: string;
    meetingUrl?: string;
    status: LessonStatus;
    syncStatus: SyncStatus;
    topic: string;
    objectives: string;
    planItems: Array<{ id: string; position: number; text: string }>;
    privateNote: string;
    privateNoteUpdatedAt?: string;
    summary: string;
    summaryUpdatedAt?: string;
    createdAt: string;
    updatedAt: string;
  };
  participants: LessonWorkspaceParticipant[];
  homework?: LessonWorkspaceHomework;
  materials: LessonWorkspaceMaterial[];
  materialLibrary: LessonWorkspaceMaterial[];
  packageContext?: {
    id: string;
    name: string;
    remainingLessons: number;
    consumedByLesson: boolean;
  };
  previousLesson?: LessonWorkspaceAdjacentLesson;
  nextLesson?: LessonWorkspaceAdjacentLesson;
}

const entityId = z.string().uuid();
const optionalTimestamp = z.string().datetime().optional();
const attendanceStatus = z.enum(["present", "absent", "late"]);

export const LessonWorkspaceActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("updatePlan"),
    topic: z.string().trim().max(500),
    objectives: z.string().trim().max(5_000),
    items: z.array(
      z.object({
        id: entityId,
        position: z.number().int().nonnegative(),
        text: z.string().trim().min(1).max(2_000),
      }),
    ),
    expectedUpdatedAt: z.string().datetime(),
  }),
  z.object({
    type: z.literal("saveNote"),
    noteType: z.enum(["private", "summary"]),
    content: z.string().trim().max(20_000),
    expectedUpdatedAt: optionalTimestamp,
  }),
  z.object({
    type: z.literal("upsertHomework"),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().max(10_000),
    dueAt: z.string().datetime().nullable().optional(),
  }),
  z.object({ type: z.literal("deleteHomework") }),
  z.object({ type: z.literal("attachMaterial"), materialId: entityId }),
  z.object({
    type: z.literal("createAndAttachMaterial"),
    title: z.string().trim().min(1).max(200),
    url: z
      .string()
      .url()
      .max(2_000)
      .refine((value) => /^https?:\/\//i.test(value), {
        message: "Adres musi używać protokołu http lub https.",
      }),
  }),
  z.object({ type: z.literal("detachMaterial"), materialId: entityId }),
  z.object({
    type: z.literal("markAttendance"),
    studentId: entityId,
    status: attendanceStatus,
  }),
  z.object({ type: z.literal("markAllPresent") }),
  z.object({ type: z.literal("completeLesson") }),
  z.object({ type: z.literal("markNoShow") }),
  z.object({
    type: z.literal("cancelLesson"),
    expectedUpdatedAt: z.string().datetime(),
  }),
]);

export type LessonWorkspaceAction = z.infer<typeof LessonWorkspaceActionSchema>;
