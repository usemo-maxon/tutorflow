import { z } from "zod";
import type { AppAction } from "./domain";

const EntityIdSchema = z.uuid();
const CurrencySchema = z.string().regex(/^[A-Z]{3}$/);
const MinorUnitsSchema = z.number().int().safe().nonnegative();
const ISODateTimeSchema = z.iso.datetime({ offset: true });
const TimezoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine((timezone) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: timezone }).format();
      return true;
    } catch {
      return false;
    }
  }, "Wybierz poprawną strefę czasową.");
const LocalTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

export const MoneySchema = z.object({
  amount: MinorUnitsSchema,
  currency: z.literal("PLN"),
});

export const StudentCreateSchema = z
  .object({
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().max(100),
    displayName: z.string().trim().min(1).max(180).optional(),
    email: z.union([z.literal(""), z.email().max(255)]),
    phone: z.string().trim().max(50),
    subject: z.string().trim().max(120),
    level: z.string().trim().max(80),
    goal: z.string().trim().max(500).optional(),
    notes: z.string().trim().max(10_000).optional(),
    defaultDurationMinutes: z.number().int().min(15).max(480).optional(),
    defaultFormat: z.enum(["online", "offline"]).optional(),
    defaultLocation: z.string().trim().max(500).optional(),
    defaultPrice: MoneySchema.nullable().optional(),
    timezone: z.string().trim().max(100).optional(),
    allowDuplicate: z.boolean().optional(),
  })
  .strict();

export const StudentUpdateSchema = StudentCreateSchema.omit({
  allowDuplicate: true,
}).strict();

export const ContactCreateSchema = z
  .object({
    firstName: z.string().trim().min(1).max(100),
    lastName: z.string().trim().max(100),
    email: z.union([z.literal(""), z.email().max(255)]),
    phone: z.string().trim().max(50),
    type: z.enum(["parent", "guardian", "billing", "other"]),
    relationship: z.string().trim().max(80),
    isPrimary: z.boolean(),
    isBillingContact: z.boolean(),
  })
  .strict();

export const ContactUpdateSchema = ContactCreateSchema;

export const GroupCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(180),
    subject: z.string().trim().max(120),
    level: z.string().trim().max(80),
    defaultDurationMinutes: z.number().int().min(15).max(480),
    defaultPrice: MoneySchema.nullable(),
    notes: z.string().trim().max(10_000),
  })
  .strict();

export const GroupUpdateSchema = GroupCreateSchema;

export const GroupMemberCreateSchema = z
  .object({
    groupId: EntityIdSchema,
    studentIds: z.array(EntityIdSchema).min(1).max(50),
  })
  .strict();

const LessonOccurrenceSchema = z.object({
  startsAt: ISODateTimeSchema,
  durationMinutes: z.number().int().min(15).max(360),
});

export const LessonCreateSchema = z
  .object({
    participantIds: z.array(EntityIdSchema).min(1).max(50).optional(),
    target: z
      .object({ type: z.enum(["student", "group"]), id: EntityIdSchema })
      .optional(),
    mode: z.enum(["single", "multiple", "recurring"]),
    occurrences: z.array(LessonOccurrenceSchema).min(1).max(52),
    format: z.enum(["online", "offline"]),
    location: z.string().trim().max(500),
    priceAmount: MinorUnitsSchema.nullable(),
    topic: z.string().trim().max(500),
    subject: z.string().trim().max(120).optional(),
    plan: z.array(z.string().trim().max(2_000)).max(100),
    recurrence: z
      .object({
        frequency: z.enum(["weekly", "biweekly"]),
        count: z.number().int().min(1).max(52),
        timezone: TimezoneSchema,
        startDate: z.iso.date().optional(),
        startTime: LocalTimeSchema.optional(),
        intervalWeeks: z.number().int().min(1).max(52).optional(),
        daysOfWeek: z
          .array(z.number().int().min(1).max(7))
          .min(1)
          .max(7)
          .optional(),
        endDate: z.iso.date().optional(),
      })
      .optional(),
    allowOutsideAvailability: z.boolean().optional(),
    requestId: EntityIdSchema.optional(),
  })
  .superRefine((value, context) => {
    if (!value.target && !value.participantIds?.length) {
      context.addIssue({
        code: "custom",
        path: ["target"],
        message: "Wybierz ucznia lub grupę.",
      });
    }
    if (value.mode === "recurring" && !value.recurrence) {
      context.addIssue({
        code: "custom",
        path: ["recurrence"],
        message: "Reguła cyklu jest wymagana.",
      });
    }
    if (value.mode !== "recurring" && value.recurrence) {
      context.addIssue({
        code: "custom",
        path: ["recurrence"],
        message: "Reguła cyklu dotyczy tylko lekcji cyklicznych.",
      });
    }
    if (
      value.recurrence?.endDate &&
      value.recurrence.startDate &&
      value.recurrence.endDate < value.recurrence.startDate
    ) {
      context.addIssue({
        code: "custom",
        path: ["recurrence", "endDate"],
        message: "Data zakończenia nie może być wcześniejsza niż początek.",
      });
    }
  });

export const CalendarBlockCreateSchema = z
  .object({
    title: z.string().trim().min(1).max(180),
    startsAt: ISODateTimeSchema,
    endsAt: ISODateTimeSchema,
    timezone: TimezoneSchema,
  })
  .refine((value) => value.startsAt < value.endsAt, {
    path: ["endsAt"],
    message: "Zakończenie musi być późniejsze niż rozpoczęcie.",
  });

export const CalendarBlockUpdateSchema = CalendarBlockCreateSchema;

export const AvailabilityExceptionSchema = z
  .object({
    date: z.iso.date(),
    kind: z.enum(["available", "unavailable"]),
    startTime: LocalTimeSchema.optional(),
    endTime: LocalTimeSchema.optional(),
    timezone: TimezoneSchema,
    reason: z.string().trim().max(500),
  })
  .superRefine((value, context) => {
    if (Boolean(value.startTime) !== Boolean(value.endTime)) {
      context.addIssue({
        code: "custom",
        path: ["endTime"],
        message: "Podaj początek i koniec zakresu.",
      });
    }
    if (value.startTime && value.endTime && value.startTime >= value.endTime) {
      context.addIssue({
        code: "custom",
        path: ["endTime"],
        message: "Zakończenie musi być późniejsze niż rozpoczęcie.",
      });
    }
  });

export const LessonUpdateSchema = z.object({
  lessonId: EntityIdSchema,
  topic: z.string().trim().max(500),
  planItems: z.array(
    z.object({
      id: EntityIdSchema,
      position: z.number().int().nonnegative(),
      text: z.string().trim().max(2_000),
    }),
  ),
  homework: z.string().trim().max(10_000),
  generalNotes: z.string().trim().max(20_000),
  participants: z.array(
    z.object({
      studentId: EntityIdSchema,
      attendanceStatus: z.enum([
        "unknown",
        "present",
        "absent",
        "late",
        "cancelled",
      ]),
      paymentStatus: z.enum(["unpaid", "paid", "cancelled"]),
      results: z.array(
        z.object({
          planItemId: EntityIdSchema,
          completed: z.boolean(),
          score: z.number().int().min(1).max(10).optional(),
          note: z.string().max(10_000).optional(),
        }),
      ),
    }),
  ),
  complete: z.boolean(),
});

export const PaymentCreateSchema = z.object({
  workspaceId: EntityIdSchema,
  studentId: EntityIdSchema,
  payerContactId: EntityIdSchema.nullable().optional(),
  amountGrosz: MinorUnitsSchema.positive(),
  currency: CurrencySchema,
  paymentMethod: z.string().trim().max(80).optional(),
});

export const PackageCreateSchema = z.object({
  workspaceId: EntityIdSchema,
  studentId: EntityIdSchema,
  name: z.string().trim().min(1).max(180),
  totalLessons: z.number().int().positive().max(1_000),
  priceGrosz: MinorUnitsSchema,
  currency: CurrencySchema,
  purchasedAt: ISODateTimeSchema,
  expiresAt: ISODateTimeSchema.nullable().optional(),
});

const ActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("createStudent"), student: StudentCreateSchema }),
  z.object({
    type: z.literal("updateStudent"),
    studentId: EntityIdSchema,
    patch: StudentUpdateSchema,
  }),
  z.object({
    type: z.literal("setStudentStatus"),
    studentId: EntityIdSchema,
    status: z.enum(["active", "archived"]),
  }),
  z.object({
    type: z.literal("createStudentContact"),
    studentId: EntityIdSchema,
    contact: ContactCreateSchema,
  }),
  z.object({
    type: z.literal("updateStudentContact"),
    relationId: EntityIdSchema,
    contact: ContactUpdateSchema,
  }),
  z.object({
    type: z.literal("removeStudentContact"),
    relationId: EntityIdSchema,
  }),
  z.object({ type: z.literal("createGroup"), group: GroupCreateSchema }),
  z.object({
    type: z.literal("updateGroup"),
    groupId: EntityIdSchema,
    patch: GroupUpdateSchema,
  }),
  z.object({
    type: z.literal("setGroupStatus"),
    groupId: EntityIdSchema,
    status: z.enum(["active", "archived"]),
  }),
  GroupMemberCreateSchema.extend({ type: z.literal("addGroupMembers") }),
  z.object({
    type: z.literal("removeGroupMember"),
    groupId: EntityIdSchema,
    studentId: EntityIdSchema,
  }),
  z.object({ type: z.literal("createLesson"), lesson: LessonCreateSchema }),
  z.object({
    type: z.literal("mergeLesson"),
    conflictingLessonId: EntityIdSchema,
    participantIds: z.array(EntityIdSchema).min(1).max(50),
  }),
  LessonUpdateSchema.extend({ type: z.literal("saveLesson") }),
  z.object({
    type: z.literal("setPayment"),
    lessonId: EntityIdSchema,
    studentId: EntityIdSchema,
    status: z.enum(["unpaid", "paid", "cancelled"]),
  }),
  z.object({
    type: z.literal("cancelLesson"),
    lessonId: EntityIdSchema,
    scope: z.enum(["single", "future", "series"]).optional(),
    expectedUpdatedAt: ISODateTimeSchema.optional(),
  }),
  z.object({
    type: z.literal("rescheduleLesson"),
    lessonId: EntityIdSchema,
    startsAt: ISODateTimeSchema,
    durationMinutes: z.number().int().min(15).max(480).optional(),
    scope: z.enum(["single", "future", "series"]).optional(),
    expectedUpdatedAt: ISODateTimeSchema.optional(),
    allowOutsideAvailability: z.boolean().optional(),
  }),
  z.object({ type: z.literal("retrySync"), lessonId: EntityIdSchema }),
  z.object({ type: z.literal("disableSync"), lessonId: EntityIdSchema }),
  z.object({
    type: z.literal("updateProfile"),
    name: z.string().trim().min(1).max(180),
    timezone: z.string().trim().min(1).max(100),
  }),
  z.object({
    type: z.literal("createAvailability"),
    rule: z.object({
      kind: z.enum(["single", "recurring"]),
      allDay: z.boolean().optional(),
      label: z.string().trim().min(1).max(180),
      start: ISODateTimeSchema,
      end: ISODateTimeSchema,
      weekday: z.number().int().min(1).max(7).optional(),
      isAvailable: z.boolean().optional(),
    }),
  }),
  z.object({ type: z.literal("deleteAvailability"), ruleId: EntityIdSchema }),
  z.object({
    type: z.literal("createAvailabilityException"),
    exception: AvailabilityExceptionSchema,
  }),
  z.object({
    type: z.literal("deleteAvailabilityException"),
    exceptionId: EntityIdSchema,
  }),
  z.object({
    type: z.literal("createCalendarBlock"),
    block: CalendarBlockCreateSchema,
  }),
  z.object({
    type: z.literal("updateCalendarBlock"),
    blockId: EntityIdSchema,
    block: CalendarBlockUpdateSchema,
    expectedUpdatedAt: ISODateTimeSchema.optional(),
  }),
  z.object({ type: z.literal("deleteCalendarBlock"), blockId: EntityIdSchema }),
  z.object({
    type: z.literal("importStudentStats"),
    studentId: EntityIdSchema,
    sourceFile: z.string().trim().min(1).max(180),
    records: z
      .array(
        z.object({
          occurredAt: ISODateTimeSchema,
          topic: z.string().trim().max(180),
          skill: z.string().trim().max(120),
          score: z.number().min(0).max(10).optional(),
          durationMinutes: z.number().int().min(0).max(600),
          attendanceStatus: z.enum(["present", "absent"]),
        }),
      )
      .min(1)
      .max(1_000),
  }),
]);

export const AppActionSchema: z.ZodType<AppAction> = ActionSchema;

export function fieldErrors(error: z.ZodError): Record<string, string> {
  return Object.fromEntries(
    error.issues.map((issue) => [
      issue.path.join(".") || "request",
      issue.message,
    ]),
  );
}
