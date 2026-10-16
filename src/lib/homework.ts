import { z } from "zod";

export const homeworkStatuses = [
  "assigned",
  "completed",
  "reviewed",
  "not_completed",
] as const;

export type HomeworkStatus = (typeof homeworkStatuses)[number];

export interface HomeworkMaterial {
  id: string;
  title: string;
  type: "link" | "file" | "note";
  url?: string;
  archived?: boolean;
}

export interface HomeworkRecipient {
  id: string;
  studentId: string;
  studentName: string;
  status: HomeworkStatus;
  feedback?: string;
  completedAt?: string;
  reviewedAt?: string;
  updatedAt: string;
}

export interface StudentHomeworkItem extends HomeworkRecipient {
  homeworkId: string;
  title: string;
  description: string;
  dueAt?: string;
  sourceLessonId: string;
  sourceLessonStartsAt: string;
  sourceLessonTopic?: string;
  materials: HomeworkMaterial[];
  overdue: boolean;
}

export type HomeworkFilter = "todo" | "overdue" | "finished";

export function isHomeworkOverdue(
  dueAt: string | undefined,
  status: HomeworkStatus,
  now: string,
) {
  return (
    Boolean(dueAt) &&
    Date.parse(dueAt!) < Date.parse(now) &&
    status === "assigned"
  );
}

export function homeworkFilter(
  item: Pick<StudentHomeworkItem, "status" | "overdue">,
): HomeworkFilter {
  if (item.overdue) return "overdue";
  return ["completed", "reviewed", "not_completed"].includes(item.status)
    ? "finished"
    : "todo";
}

export const HomeworkRecipientUpdateSchema = z.object({
  type: z.literal("updateHomeworkRecipient"),
  studentId: z.string().uuid(),
  status: z.enum(homeworkStatuses),
  feedback: z
    .string()
    .trim()
    .max(2_000)
    .transform((value) => value || undefined)
    .optional(),
});

export type HomeworkRecipientUpdate = z.infer<
  typeof HomeworkRecipientUpdateSchema
>;

export const StudentHomeworkUpdateSchema = z.object({
  homeworkId: z
    .string()
    .refine(
      (value) =>
        z.string().uuid().safeParse(value).success ||
        /^[0-9a-f-]{36}:homework$/i.test(value),
      "Nieprawidłowy identyfikator pracy domowej.",
    ),
  status: z.enum(homeworkStatuses),
  feedback: z
    .string()
    .trim()
    .max(2_000)
    .transform((value) => value || undefined)
    .optional(),
});

export type StudentHomeworkUpdate = z.infer<typeof StudentHomeworkUpdateSchema>;

export const homeworkStatusLabels: Record<HomeworkStatus, string> = {
  assigned: "Zadane",
  completed: "Wykonane",
  reviewed: "Sprawdzone",
  not_completed: "Niewykonane",
};
