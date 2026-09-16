import type { LessonStatus } from "./domain";

export type DashboardAttentionType =
  "sync_failure" | "unfinished_lessons" | "low_package";

export interface DashboardLesson {
  id: string;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  status: LessonStatus;
  participantLabel: string;
  participantCount: number;
  primaryStudentId?: string;
  groupId?: string;
  subject: string;
  level: string;
  topic: string;
  format: "online" | "offline";
  meetingUrl?: string;
}

export interface DashboardAttentionItem {
  id: string;
  type: DashboardAttentionType;
  priority: number;
  title: string;
  detail: string;
  href: string;
  actionLabel: string;
  count: number;
}

export interface DashboardMonthlySummary {
  lessonCount: number;
  completedLessonCount: number;
  teachingMinutes: number;
  activeStudents: number;
}

export interface DashboardData {
  teacher: {
    name: string;
    timezone: string;
    readOnly: boolean;
  };
  today: {
    dateKey: string;
    startsAt: string;
    endsAt: string;
  };
  todaysLessons: DashboardLesson[];
  attentionItems: DashboardAttentionItem[];
  upcomingLessons: DashboardLesson[];
  monthlySummary: DashboardMonthlySummary;
  studentCount: number;
  partialErrors: Array<"attention" | "monthly_summary">;
}
