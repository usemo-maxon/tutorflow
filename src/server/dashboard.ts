import "server-only";

import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import type {
  DashboardAttentionItem,
  DashboardData,
  DashboardLesson,
} from "@/lib/dashboard";
import type { AppData, Lesson, Student, StudentGroup } from "@/lib/domain";

export interface DashboardRanges {
  dateKey: string;
  todayStart: string;
  todayEnd: string;
  monthStart: string;
  monthEnd: string;
  upcomingEnd: string;
  attentionStart: string;
}

export interface DashboardLessonSource {
  id: string;
  groupId?: string;
  participantIds: string[];
  startsAt: string;
  endsAt: string;
  status: Lesson["status"];
  subject: string;
  topic: string;
  format: Lesson["format"];
  meetingUrl?: string;
  syncStatus: Lesson["syncStatus"];
}

export interface DashboardSource {
  teacher: DashboardData["teacher"];
  ranges: DashboardRanges;
  students: Pick<Student, "id" | "name" | "subject" | "level" | "status">[];
  groups: Pick<StudentGroup, "id" | "name" | "subject" | "level">[];
  todaysLessons: DashboardLessonSource[];
  upcomingLessons: DashboardLessonSource[];
  unfinishedLessons: DashboardLessonSource[];
  syncFailures: DashboardLessonSource[];
  monthlyLessons: DashboardLessonSource[];
  lowPackages: Array<{
    studentId: string;
    remainingLessons: number;
  }>;
  overdueCharges?: Array<{
    studentId: string;
    outstanding: number;
    currency: string;
  }>;
  partialErrors?: DashboardData["partialErrors"];
}

export function dashboardRanges(now: Date, timezone: string): DashboardRanges {
  const dateKey = formatInTimeZone(now, timezone, "yyyy-MM-dd");
  const monthKey = `${dateKey.slice(0, 8)}01`;
  const todayStart = localMidnight(dateKey, timezone);
  const todayEnd = localMidnight(addToDateKey(dateKey, 1), timezone);
  const monthStart = localMidnight(monthKey, timezone);
  const nextMonth = new Date(`${monthKey}T00:00:00.000Z`);
  nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
  const nextMonthKey = nextMonth.toISOString().slice(0, 10);

  return {
    dateKey,
    todayStart,
    todayEnd,
    monthStart,
    monthEnd: localMidnight(nextMonthKey, timezone),
    upcomingEnd: localMidnight(addToDateKey(dateKey, 14), timezone),
    attentionStart: localMidnight(addToDateKey(dateKey, -30), timezone),
  };
}

export function buildDashboardData(source: DashboardSource): DashboardData {
  const students = new Map(
    source.students.map((student) => [student.id, student]),
  );
  const groups = new Map(source.groups.map((group) => [group.id, group]));
  const toLesson = (lesson: DashboardLessonSource): DashboardLesson => {
    const group = lesson.groupId ? groups.get(lesson.groupId) : undefined;
    const participants = lesson.participantIds
      .map((id) => students.get(id))
      .filter((student): student is NonNullable<typeof student> =>
        Boolean(student),
      );
    const first = participants[0];
    const participantLabel =
      group?.name ??
      participants.map((student) => student.name).join(", ") ??
      "Lekcja";
    const starts = Date.parse(lesson.startsAt);
    const ends = Date.parse(lesson.endsAt);

    return {
      id: lesson.id,
      startsAt: lesson.startsAt,
      endsAt: lesson.endsAt,
      durationMinutes: Math.max(0, Math.round((ends - starts) / 60_000)),
      status: lesson.status,
      participantLabel: participantLabel || "Lekcja",
      participantCount: lesson.participantIds.length,
      primaryStudentId:
        !group && lesson.participantIds.length === 1 ? first?.id : undefined,
      groupId: lesson.groupId,
      subject: lesson.subject || group?.subject || first?.subject || "",
      level: group?.level || first?.level || "",
      topic: lesson.topic,
      format: lesson.format,
      meetingUrl: lesson.meetingUrl,
    };
  };

  const unfinished = [...source.unfinishedLessons].sort((a, b) =>
    a.startsAt.localeCompare(b.startsAt),
  );
  const attentionItems: DashboardAttentionItem[] = [];

  if (source.syncFailures.length) {
    attentionItems.push({
      id: "sync-failure",
      type: "sync_failure",
      priority: 0,
      title: syncFailureLabel(source.syncFailures.length),
      detail: "Sprawdź połączenie z Google Calendar i ponów synchronizację.",
      href: "/app/ustawienia/integracje",
      actionLabel: "Sprawdź integrację",
      count: source.syncFailures.length,
    });
  }

  if (unfinished.length) {
    attentionItems.push({
      id: "unfinished-lessons",
      type: "unfinished_lessons",
      priority: 1,
      title: unfinishedLessonLabel(unfinished.length),
      detail: "Uzupełnij temat, obecność i wynik po zajęciach.",
      href: `/app/lekcje/${unfinished[0].id}`,
      actionLabel:
        unfinished.length === 1 ? "Otwórz lekcję" : "Otwórz najstarszą",
      count: unfinished.length,
    });
  }

  const overdue = source.overdueCharges ?? [];
  if (overdue.length) {
    const currency = overdue[0].currency;
    const sameCurrency = overdue.filter((item) => item.currency === currency);
    const total = sameCurrency.reduce((sum, item) => sum + item.outstanding, 0);
    attentionItems.push({
      id: "overdue-payments",
      type: "overdue_payment",
      priority: 2,
      title:
        overdue.length === 1
          ? `${students.get(overdue[0].studentId)?.name ?? "Uczeń"} — płatność po terminie`
          : `${overdue.length} płatności po terminie`,
      detail: `${new Intl.NumberFormat("pl-PL", { style: "currency", currency }).format(total / 100)} wymaga rozliczenia.`,
      href: "/app/platnosci?filter=overdue",
      actionLabel: "Zobacz należności",
      count: overdue.length,
    });
  }

  const lowByStudent = new Map<string, number>();
  for (const item of source.lowPackages) {
    const current = lowByStudent.get(item.studentId);
    if (current === undefined || item.remainingLessons < current) {
      lowByStudent.set(item.studentId, item.remainingLessons);
    }
  }
  [...lowByStudent.entries()]
    .map(([studentId, remainingLessons]) => ({
      student: students.get(studentId),
      remainingLessons,
    }))
    .filter(
      (
        item,
      ): item is {
        student: NonNullable<typeof item.student>;
        remainingLessons: number;
      } => Boolean(item.student),
    )
    .sort(
      (a, b) =>
        a.remainingLessons - b.remainingLessons ||
        a.student.name.localeCompare(b.student.name, "pl"),
    )
    .slice(0, 3)
    .forEach(({ student, remainingLessons }) => {
      attentionItems.push({
        id: `low-package-${student.id}`,
        type: "low_package",
        priority: 3,
        title: `${student.name}: ${packageBalanceLabel(remainingLessons)}`,
        detail: "Warto ustalić kolejny pakiet przed następną lekcją.",
        href: `/app/uczniowie/${student.id}`,
        actionLabel: "Zobacz ucznia",
        count: 1,
      });
    });

  const monthLessons = source.monthlyLessons.filter(
    (lesson) => lesson.status !== "cancelled",
  );
  const completedLessons = monthLessons.filter(
    (lesson) => lesson.status === "completed",
  );

  return {
    teacher: source.teacher,
    today: {
      dateKey: source.ranges.dateKey,
      startsAt: source.ranges.todayStart,
      endsAt: source.ranges.todayEnd,
    },
    todaysLessons: source.todaysLessons
      .filter((lesson) => lesson.status !== "cancelled")
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .map(toLesson),
    attentionItems: attentionItems.sort(
      (a, b) => a.priority - b.priority || a.title.localeCompare(b.title, "pl"),
    ),
    upcomingLessons: source.upcomingLessons
      .filter((lesson) => lesson.status !== "cancelled")
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .slice(0, 7)
      .map(toLesson),
    monthlySummary: {
      lessonCount: monthLessons.length,
      completedLessonCount: completedLessons.length,
      teachingMinutes: completedLessons.reduce(
        (total, lesson) =>
          total +
          Math.max(
            0,
            Math.round(
              (Date.parse(lesson.endsAt) - Date.parse(lesson.startsAt)) /
                60_000,
            ),
          ),
        0,
      ),
      activeStudents: source.students.filter(
        (student) => student.status === "active",
      ).length,
    },
    studentCount: source.students.length,
    partialErrors: source.partialErrors ?? [],
  };
}

export function dashboardSourceFromAppData(
  data: AppData,
  now = new Date(),
): DashboardSource {
  const ranges = dashboardRanges(now, data.teacher.timezone);
  const lessonSource = (lesson: Lesson): DashboardLessonSource => ({
    id: lesson.id,
    groupId: lesson.groupId,
    participantIds: lesson.participantIds,
    startsAt: lesson.startsAt,
    endsAt: new Date(
      Date.parse(lesson.startsAt) + lesson.durationMinutes * 60_000,
    ).toISOString(),
    status: lesson.status,
    subject: lesson.subject ?? "",
    topic: lesson.topic,
    format: lesson.format,
    meetingUrl:
      lesson.format === "online" ? lesson.location || undefined : undefined,
    syncStatus: lesson.syncStatus,
  });
  const lessons = data.lessons.map(lessonSource);
  const between = (lesson: DashboardLessonSource, start: string, end: string) =>
    lesson.startsAt >= start && lesson.startsAt < end;

  return {
    teacher: {
      name: data.teacher.name,
      timezone: data.teacher.timezone,
      readOnly: data.teacher.subscription.readOnly,
    },
    ranges,
    students: data.students.map(({ id, name, subject, level, status }) => ({
      id,
      name,
      subject,
      level,
      status,
    })),
    groups: data.groups.map(({ id, name, subject, level }) => ({
      id,
      name,
      subject,
      level,
    })),
    todaysLessons: lessons.filter((lesson) =>
      between(lesson, ranges.todayStart, ranges.todayEnd),
    ),
    upcomingLessons: lessons.filter(
      (lesson) =>
        lesson.startsAt >= ranges.todayEnd &&
        lesson.startsAt < ranges.upcomingEnd,
    ),
    unfinishedLessons: lessons.filter(
      (lesson) =>
        lesson.status === "needs_completion" &&
        lesson.endsAt < now.toISOString() &&
        lesson.startsAt >= ranges.attentionStart,
    ),
    syncFailures: lessons.filter((lesson) =>
      ["failed", "deleted_in_google"].includes(lesson.syncStatus),
    ),
    monthlyLessons: lessons.filter((lesson) =>
      between(lesson, ranges.monthStart, ranges.monthEnd),
    ),
    lowPackages: data.students
      .filter(
        (student) =>
          student.status === "active" &&
          student.packageRemainingLessons !== null &&
          student.packageRemainingLessons <= 2,
      )
      .map((student) => ({
        studentId: student.id,
        remainingLessons: student.packageRemainingLessons!,
      })),
    overdueCharges: [],
  };
}

function localMidnight(dateKey: string, timezone: string) {
  return fromZonedTime(`${dateKey}T00:00:00`, timezone).toISOString();
}

function addToDateKey(dateKey: string, amount: number) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function unfinishedLessonLabel(count: number) {
  if (count === 1) return "1 lekcja wymaga uzupełnienia";
  const last = count % 10;
  const lastTwo = count % 100;
  const noun =
    last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14)
      ? "lekcje wymagają"
      : "lekcji wymaga";
  return `${count} ${noun} uzupełnienia`;
}

function packageBalanceLabel(count: number) {
  if (count === 0) return "nie ma już lekcji w pakiecie";
  if (count === 1) return "została 1 lekcja w pakiecie";
  return `zostały ${count} lekcje w pakiecie`;
}

function syncFailureLabel(count: number) {
  if (count === 1) return "1 lekcja ma problem z synchronizacją";
  const last = count % 10;
  const lastTwo = count % 100;
  return `${count} ${
    last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14)
      ? "lekcje mają"
      : "lekcji ma"
  } problem z synchronizacją`;
}
