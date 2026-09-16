import "server-only";

import { fromZonedTime } from "date-fns-tz";
import type { AttendanceStatus, LessonStatus } from "@/lib/domain";

export class DomainRuleError extends Error {}

export function completeLesson(status: LessonStatus): LessonStatus {
  if (status === "cancelled") {
    throw new DomainRuleError("CANCELLED_LESSON_CANNOT_BE_COMPLETED");
  }
  return "completed";
}

export function cancelLesson(status: LessonStatus): LessonStatus {
  if (status === "completed") {
    throw new DomainRuleError("COMPLETED_LESSON_CANNOT_BE_CANCELLED");
  }
  return "cancelled";
}

export function markAttendance(
  participantStudentIds: readonly string[],
  studentId: string,
  status: AttendanceStatus,
): AttendanceStatus {
  if (!participantStudentIds.includes(studentId)) {
    throw new DomainRuleError("STUDENT_IS_NOT_A_LESSON_PARTICIPANT");
  }
  return status;
}

export interface WeeklyRecurrence {
  startDate: string;
  startTime: string;
  timezone: string;
  daysOfWeek: readonly number[];
  intervalWeeks: number;
  count: number;
  endDate?: string;
}

export function generateWeeklyOccurrences(rule: WeeklyRecurrence): string[] {
  if (
    !rule.daysOfWeek.length ||
    rule.daysOfWeek.some((day) => day < 1 || day > 7)
  ) {
    throw new DomainRuleError("INVALID_RECURRENCE_WEEKDAYS");
  }
  if (rule.intervalWeeks < 1 || rule.count < 1 || rule.count > 520) {
    throw new DomainRuleError("INVALID_RECURRENCE_LIMIT");
  }
  new Intl.DateTimeFormat("en", { timeZone: rule.timezone }).format();
  const firstDay = new Date(`${rule.startDate}T00:00:00Z`);
  const finalDay = new Date(`${rule.endDate ?? "2099-12-31"}T00:00:00Z`);
  if (
    Number.isNaN(firstDay.getTime()) ||
    Number.isNaN(finalDay.getTime()) ||
    finalDay < firstDay
  ) {
    throw new DomainRuleError("INVALID_RECURRENCE_DATE_RANGE");
  }

  const occurrences: string[] = [];
  for (let dayOffset = 0; occurrences.length < rule.count; dayOffset += 1) {
    const cursor = new Date(firstDay.getTime() + dayOffset * 86_400_000);
    if (cursor > finalDay) break;
    const isoWeekday = cursor.getUTCDay() === 0 ? 7 : cursor.getUTCDay();
    const weekOffset = Math.floor(dayOffset / 7);
    if (
      weekOffset % rule.intervalWeeks === 0 &&
      rule.daysOfWeek.includes(isoWeekday)
    ) {
      const localDateTime = `${cursor.toISOString().slice(0, 10)}T${rule.startTime}:00`;
      occurrences.push(
        fromZonedTime(localDateTime, rule.timezone).toISOString(),
      );
    }
  }
  return occurrences;
}

export interface PackageUsageEvent {
  id: string;
  lessonId: string;
  kind: "consumption" | "reversal";
  units: number;
  reversesUsageId?: string;
  idempotencyKey: string;
}

export interface PackageLedger {
  totalLessons: number;
  usages: PackageUsageEvent[];
}

export function packageBalance(ledger: PackageLedger): number {
  const used = ledger.usages.reduce(
    (sum, usage) =>
      sum + (usage.kind === "consumption" ? usage.units : -usage.units),
    0,
  );
  return ledger.totalLessons - used;
}

export function consumePackageUnit(
  ledger: PackageLedger,
  lessonId: string,
  idempotencyKey: string,
): PackageLedger {
  if (
    ledger.usages.some(
      (usage) =>
        usage.idempotencyKey === idempotencyKey ||
        (usage.lessonId === lessonId && usage.kind === "consumption"),
    )
  ) {
    return ledger;
  }
  if (packageBalance(ledger) < 1) {
    throw new DomainRuleError("PACKAGE_EXHAUSTED");
  }
  return {
    ...ledger,
    usages: [
      ...ledger.usages,
      {
        id: idempotencyKey,
        lessonId,
        kind: "consumption",
        units: 1,
        idempotencyKey,
      },
    ],
  };
}

export function reversePackageUsage(
  ledger: PackageLedger,
  lessonId: string,
  idempotencyKey: string,
): PackageLedger {
  const consumption = ledger.usages.find(
    (usage) => usage.lessonId === lessonId && usage.kind === "consumption",
  );
  if (!consumption) throw new DomainRuleError("PACKAGE_USAGE_NOT_FOUND");
  if (
    ledger.usages.some(
      (usage) =>
        usage.idempotencyKey === idempotencyKey ||
        usage.reversesUsageId === consumption.id,
    )
  ) {
    return ledger;
  }
  return {
    ...ledger,
    usages: [
      ...ledger.usages,
      {
        id: idempotencyKey,
        lessonId,
        kind: "reversal",
        units: consumption.units,
        reversesUsageId: consumption.id,
        idempotencyKey,
      },
    ],
  };
}
