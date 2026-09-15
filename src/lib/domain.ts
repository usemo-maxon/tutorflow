export type EntityId = string;
export type ISODateTime = string;
export type Money = { amount: number; currency: "PLN" };

export type LessonStatus =
  "scheduled" | "needs_completion" | "completed" | "cancelled";
export type SyncStatus =
  "pending" | "synced" | "failed" | "deleted_in_google" | "disabled";
export type PaymentStatus = "unpaid" | "paid" | "cancelled";
export type AttendanceStatus = "unknown" | "present" | "absent" | "cancelled";
export type LessonMode = "single" | "multiple" | "recurring";

export interface Student {
  id: EntityId;
  name: string;
  contact: string;
  level: string;
  goal: string;
  notes: string;
  status: "active" | "archived";
  defaultDurationMinutes: number;
  defaultFormat: "online" | "offline";
  defaultLocation: string;
  defaultPrice: Money | null;
  createdAt: ISODateTime;
}

export interface StudentStatImport {
  id: EntityId;
  studentId: EntityId;
  occurredAt: ISODateTime;
  topic: string;
  skill: string;
  score?: number;
  durationMinutes: number;
  attendanceStatus: Exclude<AttendanceStatus, "unknown" | "cancelled">;
  sourceFile: string;
  importedAt: ISODateTime;
}

export interface PlanItem {
  id: EntityId;
  position: number;
  text: string;
}

export interface PlanItemResult {
  planItemId: EntityId;
  completed: boolean;
  score?: number;
  note?: string;
}

export interface LessonParticipant {
  studentId: EntityId;
  attendanceStatus: AttendanceStatus;
  paymentStatus: PaymentStatus;
  results: PlanItemResult[];
}

export interface Lesson {
  id: EntityId;
  participantIds: EntityId[];
  startsAt: ISODateTime;
  durationMinutes: number;
  format: "online" | "offline";
  location: string;
  price: Money | null;
  mode: LessonMode;
  seriesId?: EntityId;
  status: LessonStatus;
  syncStatus: SyncStatus;
  syncMessage?: string;
  topic: string;
  planItems: PlanItem[];
  homework: string;
  generalNotes: string;
  participants: LessonParticipant[];
  createdAt: ISODateTime;
}

export interface Teacher {
  id: EntityId;
  name: string;
  email: string;
  timezone: string;
  subscription: {
    status: "trial" | "active" | "past_due" | "read_only" | "cancelled";
    plan: "trial" | "monthly" | "annual" | "founder";
    readOnly: boolean;
    trialEndsAt?: ISODateTime;
    renewsAt?: ISODateTime;
  };
}

export interface IntegrationState {
  status: "connected" | "not_connected" | "not_configured" | "error";
  label?: string;
  lastError?: string;
}

export interface AvailabilityRule {
  id: EntityId;
  kind: "single" | "recurring";
  allDay?: boolean;
  label: string;
  start: ISODateTime;
  end: ISODateTime;
  weekday?: number;
}

export interface AppData {
  teacher: Teacher;
  students: Student[];
  lessons: Lesson[];
  studentStatImports: StudentStatImport[];
  availability: AvailabilityRule[];
  integrations: {
    google: IntegrationState;
    telegram: IntegrationState;
    payu: IntegrationState;
  };
  financials: Record<"week" | "month" | "year", FinancialSummary>;
}

export interface FinancialSummary {
  lessonCount: number;
  hours: number;
  plannedAmount: number;
  receivableAmount: number;
  receivedAmount: number;
  activeStudents: number;
}

export interface AppError {
  code: string;
  message: string;
  fieldErrors?: Record<string, string>;
  retryable?: boolean;
  correlationId?: string;
  details?: unknown;
}

export interface LessonOccurrenceInput {
  startsAt: ISODateTime;
  durationMinutes: number;
}

export interface CreateLessonInput {
  participantIds: EntityId[];
  mode: LessonMode;
  occurrences: LessonOccurrenceInput[];
  format: "online" | "offline";
  location: string;
  priceAmount: number | null;
  topic: string;
  plan: string[];
  recurrence?: {
    frequency: "weekly" | "biweekly";
    count: number;
    timezone: string;
  };
}

export type AppAction =
  | { type: "createStudent"; student: Omit<Student, "id" | "createdAt"> }
  | { type: "updateStudent"; studentId: string; patch: Partial<Student> }
  | { type: "setStudentStatus"; studentId: string; status: Student["status"] }
  | { type: "createLesson"; lesson: CreateLessonInput }
  | {
      type: "mergeLesson";
      conflictingLessonId: string;
      participantIds: string[];
    }
  | {
      type: "saveLesson";
      lessonId: string;
      topic: string;
      planItems: PlanItem[];
      homework: string;
      generalNotes: string;
      participants: LessonParticipant[];
      complete: boolean;
    }
  | {
      type: "setPayment";
      lessonId: string;
      studentId: string;
      status: PaymentStatus;
    }
  | { type: "cancelLesson"; lessonId: string; scope?: "single" | "future" }
  | {
      type: "rescheduleLesson";
      lessonId: string;
      startsAt: ISODateTime;
      scope?: "single" | "future";
    }
  | { type: "retrySync"; lessonId: string }
  | { type: "disableSync"; lessonId: string }
  | { type: "updateProfile"; name: string; timezone: string }
  | { type: "createAvailability"; rule: Omit<AvailabilityRule, "id"> }
  | { type: "deleteAvailability"; ruleId: string }
  | {
      type: "importStudentStats";
      studentId: string;
      sourceFile: string;
      records: Array<
        Pick<
          StudentStatImport,
          | "occurredAt"
          | "topic"
          | "skill"
          | "score"
          | "durationMinutes"
          | "attendanceStatus"
        >
      >;
    };

export interface MutationResponse {
  data: AppData;
  result?: { id?: string; ids?: string[] };
}
