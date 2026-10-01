import type { LessonStatus } from "./domain";
import type {
  NextLessonBriefing,
  NextLessonParticipantBriefing,
} from "./next-lesson-briefing";

export const TODAY_UNFINISHED_DAYS = 14;
export const TODAY_CONTINUITY_DAYS = 7;
export const TODAY_UPCOMING_DAYS = 14;
export const TODAY_LESSON_LIMIT = 24;
export const TODAY_ACTION_LIMIT = 5;
export const TODAY_UPCOMING_LIMIT = 7;

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

export interface DashboardBooking {
  id: string;
  startsAt: string;
  endsAt: string;
  guestName: string;
  eventTypeName: string;
  goalPreview?: string;
  status: "confirmed";
  kind: "booking";
  readOnly: true;
}

export type DashboardBriefingPreview =
  | { kind: "first_lesson"; studentName: string }
  | {
      kind: "one_to_one";
      studentName: string;
      lastProgress?: string;
      difficulty?: string;
      nextStep?: string;
    }
  | {
      kind: "group";
      participantCount: number;
      contextCount: number;
    };

interface TodayActionBase {
  id: string;
  priority: number;
  severity: "blocking" | "attention" | "neutral";
  title: string;
  detail: string;
  href: string;
  actionLabel: string;
}

export type TodayAction =
  | (TodayActionBase & {
      type: "package_problem";
      lessonId: string;
      studentId: string;
    })
  | (TodayActionBase & {
      type: "unfinished_lesson";
      lessonId: string;
    })
  | (TodayActionBase & { type: "google_reconnect" })
  | (TodayActionBase & {
      type: "overdue_finance";
      studentId: string;
      currency: string;
      amount: number;
    })
  | (TodayActionBase & {
      type: "missing_continuity";
      lessonId: string;
      missingCount: number;
      participantCount: number;
    })
  | (TodayActionBase & { type: "onboarding" });

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
  today: { dateKey: string; startsAt: string; endsAt: string };
  nextLesson?: DashboardLesson & { briefing?: DashboardBriefingPreview };
  todaysLessons: DashboardLesson[];
  todaysBookings: DashboardBooking[];
  actions: TodayAction[];
  hiddenActionCount: number;
  upcomingLessons: DashboardLesson[];
  upcomingBookings: DashboardBooking[];
  monthlySummary: DashboardMonthlySummary;
  studentCount: number;
  partialErrors: Array<"actions" | "briefing" | "monthly_summary">;
}

export function dashboardBriefingPreview(
  briefing: NextLessonBriefing,
  fallbackName: string,
): DashboardBriefingPreview {
  const participants = briefing.participants;
  if (participants.length > 1) {
    return {
      kind: "group",
      participantCount: participants.length,
      contextCount: participants.filter(hasBriefingContext).length,
    };
  }
  const participant = participants[0];
  if (!participant || !hasBriefingContext(participant)) {
    return {
      kind: "first_lesson",
      studentName: participant?.student.name ?? fallbackName,
    };
  }
  return {
    kind: "one_to_one",
    studentName: participant.student.name,
    lastProgress: participant.lastLesson?.progressSummary,
    difficulty: participant.difficulty?.note,
    nextStep: participant.nextStep?.text,
  };
}

function hasBriefingContext(participant: NextLessonParticipantBriefing) {
  return Boolean(
    participant.lastLesson ||
    participant.difficulty ||
    participant.homework ||
    participant.nextStep,
  );
}
