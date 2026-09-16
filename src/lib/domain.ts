export type EntityId = string;
export type ISODateTime = string;
export type Money = { amount: number; currency: "PLN" };

export type LessonStatus =
  "scheduled" | "needs_completion" | "completed" | "cancelled" | "no_show";
export type SyncStatus =
  "pending" | "synced" | "failed" | "deleted_in_google" | "disabled";
export type PaymentStatus = "unpaid" | "paid" | "cancelled";
export type AttendanceStatus =
  "unknown" | "present" | "absent" | "late" | "cancelled";
export type LessonMode = "single" | "multiple" | "recurring";

export interface Student {
  id: EntityId;
  firstName: string;
  lastName: string;
  displayName: string;
  name: string;
  email: string;
  phone: string;
  contact: string;
  subject: string;
  level: string;
  goal: string;
  notes: string;
  status: "active" | "archived";
  defaultDurationMinutes: number;
  defaultFormat: "online" | "offline";
  defaultLocation: string;
  defaultPrice: Money | null;
  timezone?: string;
  groupIds: EntityId[];
  packageRemainingLessons: number | null;
  balanceDue: Money;
  createdAt: ISODateTime;
}

export type ContactType = "parent" | "guardian" | "billing" | "other";

export interface StudentContact {
  id: EntityId;
  studentId: EntityId;
  contactId: EntityId;
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  phone: string;
  type: ContactType;
  relationship: string;
  isPrimary: boolean;
  isBillingContact: boolean;
  createdAt: ISODateTime;
}

export interface GroupMember {
  id: EntityId;
  studentId: EntityId;
  status: "active" | "suspended";
  joinedAt: ISODateTime;
  leftAt?: ISODateTime;
}

export interface StudentGroup {
  id: EntityId;
  name: string;
  subject: string;
  level: string;
  status: "active" | "archived";
  defaultDurationMinutes: number;
  defaultPrice: Money | null;
  notes: string;
  members: GroupMember[];
  createdAt: ISODateTime;
}

export interface StudentCreateInput {
  firstName: string;
  lastName: string;
  displayName?: string;
  email: string;
  phone: string;
  subject: string;
  level: string;
  goal?: string;
  notes?: string;
  defaultDurationMinutes?: number;
  defaultFormat?: "online" | "offline";
  defaultLocation?: string;
  defaultPrice?: Money | null;
  timezone?: string;
  allowDuplicate?: boolean;
}

export type StudentUpdateInput = Omit<StudentCreateInput, "allowDuplicate">;

export interface ContactCreateInput {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  type: ContactType;
  relationship: string;
  isPrimary: boolean;
  isBillingContact: boolean;
}

export type ContactUpdateInput = ContactCreateInput;

export interface GroupCreateInput {
  name: string;
  subject: string;
  level: string;
  defaultDurationMinutes: number;
  defaultPrice: Money | null;
  notes: string;
}

export type GroupUpdateInput = GroupCreateInput;

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
  groupId?: EntityId;
  participantIds: EntityId[];
  startsAt: ISODateTime;
  durationMinutes: number;
  format: "online" | "offline";
  location: string;
  price: Money | null;
  mode: LessonMode;
  seriesId?: EntityId;
  recurrenceOriginalStartsAt?: ISODateTime;
  subject?: string;
  timezone?: string;
  status: LessonStatus;
  syncStatus: SyncStatus;
  syncMessage?: string;
  topic: string;
  planItems: PlanItem[];
  homework: string;
  generalNotes: string;
  participants: LessonParticipant[];
  createdAt: ISODateTime;
  updatedAt?: ISODateTime;
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
  isAvailable?: boolean;
}

export interface AvailabilityException {
  id: EntityId;
  date: string;
  kind: "available" | "unavailable";
  startTime?: string;
  endTime?: string;
  timezone: string;
  reason: string;
}

export interface CalendarBlock {
  id: EntityId;
  title: string;
  startsAt: ISODateTime;
  endsAt: ISODateTime;
  timezone: string;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface AppData {
  teacher: Teacher;
  students: Student[];
  contacts: StudentContact[];
  groups: StudentGroup[];
  lessons: Lesson[];
  studentStatImports: StudentStatImport[];
  availability: AvailabilityRule[];
  availabilityExceptions: AvailabilityException[];
  calendarBlocks: CalendarBlock[];
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
  participantIds?: EntityId[];
  target?: { type: "student" | "group"; id: EntityId };
  mode: LessonMode;
  occurrences: LessonOccurrenceInput[];
  format: "online" | "offline";
  location: string;
  priceAmount: number | null;
  topic: string;
  subject?: string;
  plan: string[];
  recurrence?: {
    frequency?: "weekly" | "biweekly";
    count: number;
    timezone: string;
    startDate?: string;
    startTime?: string;
    intervalWeeks?: number;
    daysOfWeek?: number[];
    endDate?: string;
  };
  allowOutsideAvailability?: boolean;
  requestId?: string;
}

export type RecurrenceMutationScope = "single" | "future" | "series";

export type AppAction =
  | { type: "createStudent"; student: StudentCreateInput }
  | { type: "updateStudent"; studentId: string; patch: StudentUpdateInput }
  | { type: "setStudentStatus"; studentId: string; status: Student["status"] }
  | {
      type: "createStudentContact";
      studentId: string;
      contact: ContactCreateInput;
    }
  | {
      type: "updateStudentContact";
      relationId: string;
      contact: ContactUpdateInput;
    }
  | { type: "removeStudentContact"; relationId: string }
  | { type: "createGroup"; group: GroupCreateInput }
  | { type: "updateGroup"; groupId: string; patch: GroupUpdateInput }
  | {
      type: "setGroupStatus";
      groupId: string;
      status: StudentGroup["status"];
    }
  | { type: "addGroupMembers"; groupId: string; studentIds: string[] }
  | { type: "removeGroupMember"; groupId: string; studentId: string }
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
  | {
      type: "cancelLesson";
      lessonId: string;
      scope?: RecurrenceMutationScope;
      expectedUpdatedAt?: ISODateTime;
    }
  | {
      type: "rescheduleLesson";
      lessonId: string;
      startsAt: ISODateTime;
      durationMinutes?: number;
      scope?: RecurrenceMutationScope;
      expectedUpdatedAt?: ISODateTime;
      allowOutsideAvailability?: boolean;
    }
  | { type: "retrySync"; lessonId: string }
  | { type: "disableSync"; lessonId: string }
  | { type: "updateProfile"; name: string; timezone: string }
  | { type: "createAvailability"; rule: Omit<AvailabilityRule, "id"> }
  | { type: "deleteAvailability"; ruleId: string }
  | {
      type: "createAvailabilityException";
      exception: Omit<AvailabilityException, "id">;
    }
  | { type: "deleteAvailabilityException"; exceptionId: string }
  | {
      type: "createCalendarBlock";
      block: Omit<CalendarBlock, "id" | "createdAt" | "updatedAt">;
    }
  | {
      type: "updateCalendarBlock";
      blockId: string;
      block: Pick<CalendarBlock, "title" | "startsAt" | "endsAt" | "timezone">;
      expectedUpdatedAt?: ISODateTime;
    }
  | { type: "deleteCalendarBlock"; blockId: string }
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
