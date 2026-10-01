import "server-only";

import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import {
  TODAY_ACTION_LIMIT,
  TODAY_CONTINUITY_DAYS,
  TODAY_LESSON_LIMIT,
  TODAY_UNFINISHED_DAYS,
  TODAY_UPCOMING_DAYS,
  TODAY_UPCOMING_LIMIT,
  type DashboardData,
  type DashboardLesson,
  type DashboardBooking,
  type TodayAction,
} from "@/lib/dashboard";
import { hasEntitlement } from "@/lib/entitlements";
import { hasMeaningfulOutcome } from "@/lib/lesson-completion";
import type {
  AppData,
  IntegrationState,
  Lesson,
  Student,
  StudentGroup,
  StudentOutcomeDifficulty,
} from "@/lib/domain";

export interface DashboardRanges {
  dateKey: string;
  todayStart: string;
  todayEnd: string;
  monthStart: string;
  monthEnd: string;
  upcomingEnd: string;
  unfinishedStart: string;
  continuityStart: string;
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
  billingType?: "per_lesson" | "per_student" | "package" | "trial";
}

export interface DashboardOutcomeSource {
  lessonId: string;
  studentId: string;
  progressSummary?: string | null;
  difficultyLevel?: StudentOutcomeDifficulty | null;
  difficultyNote?: string | null;
  nextStep?: string | null;
}

export interface DashboardBookingSource {
  id: string;
  startsAt: string;
  endsAt: string;
  guestName: string;
  eventTypeName: string;
  goalPreview?: string;
  status: "confirmed" | "cancelled" | "converted";
}

export interface DashboardSource {
  now: string;
  teacher: DashboardData["teacher"] & {
    onboardingCompleted: boolean;
    googleEntitled: boolean;
    googleStatus: IntegrationState["status"];
    googleSyncState?: IntegrationState["syncState"];
  };
  ranges: DashboardRanges;
  students: Pick<Student, "id" | "name" | "subject" | "level" | "status">[];
  groups: Pick<StudentGroup, "id" | "name" | "subject" | "level">[];
  todaysLessons: DashboardLessonSource[];
  todaysBookings: DashboardBookingSource[];
  upcomingLessons: DashboardLessonSource[];
  upcomingBookings: DashboardBookingSource[];
  unfinishedLessons: DashboardLessonSource[];
  recentCompletedLessons: DashboardLessonSource[];
  outcomes: DashboardOutcomeSource[];
  monthlyLessons: DashboardLessonSource[];
  packageProblems: Array<{ lessonId: string; studentId: string }>;
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

  return {
    dateKey,
    todayStart,
    todayEnd,
    monthStart,
    monthEnd: localMidnight(nextMonth.toISOString().slice(0, 10), timezone),
    upcomingEnd: localMidnight(
      addToDateKey(dateKey, TODAY_UPCOMING_DAYS),
      timezone,
    ),
    unfinishedStart: localMidnight(
      addToDateKey(dateKey, -TODAY_UNFINISHED_DAYS),
      timezone,
    ),
    continuityStart: localMidnight(
      addToDateKey(dateKey, -TODAY_CONTINUITY_DAYS),
      timezone,
    ),
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
      (participants.map((item) => item.name).join(", ") || "Lekcja");
    return {
      id: lesson.id,
      startsAt: lesson.startsAt,
      endsAt: lesson.endsAt,
      durationMinutes: Math.max(
        0,
        Math.round(
          (Date.parse(lesson.endsAt) - Date.parse(lesson.startsAt)) / 60_000,
        ),
      ),
      status: lesson.status,
      participantLabel,
      participantCount: lesson.participantIds.length,
      primaryStudentId:
        !group && lesson.participantIds.length === 1 ? first?.id : undefined,
      groupId: lesson.groupId,
      subject: lesson.subject || group?.subject || first?.subject || "",
      level: group?.level || first?.level || "",
      topic: lesson.topic.trim() || "Lekcja",
      format: lesson.format,
      meetingUrl: lesson.meetingUrl,
    };
  };

  const todaysLessons = source.todaysLessons
    .filter((lesson) => lesson.status !== "cancelled")
    .sort(byStartsAt)
    .slice(0, TODAY_LESSON_LIMIT)
    .map(toLesson);
  const toBooking = (booking: DashboardBookingSource): DashboardBooking => ({
    id: booking.id,
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    guestName: booking.guestName,
    eventTypeName: booking.eventTypeName,
    goalPreview: booking.goalPreview,
    status: "confirmed",
    kind: "booking",
    readOnly: true,
  });
  const todaysBookings = source.todaysBookings
    .filter((booking) => booking.status === "confirmed")
    .sort(byStartsAt)
    .slice(0, TODAY_LESSON_LIMIT)
    .map(toBooking);
  const now = Date.parse(source.now);
  const current = todaysLessons.find(
    (lesson) =>
      !["completed", "cancelled", "no_show"].includes(lesson.status) &&
      Date.parse(lesson.startsAt) <= now &&
      now < Date.parse(lesson.endsAt),
  );
  const next = todaysLessons.find(
    (lesson) =>
      lesson.status === "scheduled" && Date.parse(lesson.startsAt) > now,
  );
  const allActions = buildActions(source, students, groups);
  const visibleActions = allActions.slice(0, TODAY_ACTION_LIMIT);
  const monthLessons = source.monthlyLessons.filter(
    (lesson) => lesson.status !== "cancelled",
  );
  const completedLessons = monthLessons.filter(
    (lesson) => lesson.status === "completed",
  );

  return {
    teacher: {
      name: source.teacher.name,
      timezone: source.teacher.timezone,
      readOnly: source.teacher.readOnly,
    },
    today: {
      dateKey: source.ranges.dateKey,
      startsAt: source.ranges.todayStart,
      endsAt: source.ranges.todayEnd,
    },
    nextLesson: current ?? next,
    todaysLessons,
    todaysBookings,
    actions: visibleActions,
    hiddenActionCount: Math.max(0, allActions.length - visibleActions.length),
    upcomingLessons: source.upcomingLessons
      .filter((lesson) => lesson.status !== "cancelled")
      .sort(byStartsAt)
      .slice(0, TODAY_UPCOMING_LIMIT)
      .map(toLesson),
    upcomingBookings: source.upcomingBookings
      .filter((booking) => booking.status === "confirmed")
      .sort(byStartsAt)
      .slice(0, TODAY_UPCOMING_LIMIT)
      .map(toBooking),
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

function buildActions(
  source: DashboardSource,
  students: Map<string, DashboardSource["students"][number]>,
  groups: Map<string, DashboardSource["groups"][number]>,
): TodayAction[] {
  const actions: TodayAction[] = [];
  const lessons = new Map(
    [
      ...source.todaysLessons,
      ...source.upcomingLessons,
      ...source.unfinishedLessons,
      ...source.recentCompletedLessons,
    ].map((lesson) => [lesson.id, lesson]),
  );

  for (const problem of source.packageProblems) {
    const lesson = lessons.get(problem.lessonId);
    const student = students.get(problem.studentId);
    if (!lesson || !student) continue;
    actions.push({
      id: `package:${lesson.id}:${student.id}`,
      type: "package_problem",
      priority: 0,
      severity: "blocking",
      title: `Brak aktywnego pakietu przed lekcją z ${student.name}.`,
      detail: "Pakiet jest wymagany do rozliczenia tej lekcji.",
      href: `/app/platnosci?studentId=${encodeURIComponent(student.id)}`,
      actionLabel: "Zobacz rozliczenia",
      lessonId: lesson.id,
      studentId: student.id,
    });
  }

  for (const lesson of [...source.unfinishedLessons].sort(byStartsAt)) {
    const label = lessonLabel(lesson, students, groups);
    actions.push({
      id: `unfinished:${lesson.id}`,
      type: "unfinished_lesson",
      priority: 1,
      severity: "attention",
      title: `Lekcja z ${label} nie została zakończona.`,
      detail: "Uzupełnij przebieg i wynik zajęć.",
      href: `/app/lekcje/${lesson.id}`,
      actionLabel: "Zakończ lekcję",
      lessonId: lesson.id,
    });
  }

  if (
    source.teacher.googleEntitled &&
    (source.teacher.googleStatus === "reconnect_required" ||
      source.teacher.googleSyncState === "reconnect_required" ||
      source.teacher.googleSyncState === "error")
  ) {
    actions.push({
      id: "google:reconnect",
      type: "google_reconnect",
      priority: 2,
      severity: "attention",
      title: "Google Calendar wymaga ponownego połączenia.",
      detail: "Połącz kalendarz ponownie, aby przywrócić synchronizację.",
      href: "/app/ustawienia/integracje",
      actionLabel: "Połącz ponownie",
    });
  }

  const overdue = new Map<
    string,
    { studentId: string; currency: string; amount: number }
  >();
  for (const charge of source.overdueCharges ?? []) {
    const key = `${charge.studentId}:${charge.currency}`;
    const current = overdue.get(key);
    overdue.set(key, {
      studentId: charge.studentId,
      currency: charge.currency,
      amount: (current?.amount ?? 0) + charge.outstanding,
    });
  }
  for (const item of overdue.values()) {
    const student = students.get(item.studentId);
    if (!student) continue;
    const formatted = new Intl.NumberFormat("pl-PL", {
      style: "currency",
      currency: item.currency,
    }).format(item.amount / 100);
    actions.push({
      id: `overdue:${item.studentId}:${item.currency}`,
      type: "overdue_finance",
      priority: 3,
      severity: "attention",
      title: `${student.name} · ${formatted} po terminie`,
      detail: "Kwota wynika wyłącznie z należności po terminie.",
      href: `/app/platnosci?studentId=${encodeURIComponent(student.id)}`,
      actionLabel: "Zobacz rozliczenia",
      studentId: student.id,
      currency: item.currency,
      amount: item.amount,
    });
  }

  const outcomes = new Map(
    source.outcomes.map((outcome) => [
      `${outcome.lessonId}:${outcome.studentId}`,
      outcome,
    ]),
  );
  for (const lesson of [...source.recentCompletedLessons].sort(byStartsAt)) {
    const missingCount = lesson.participantIds.filter(
      (studentId) =>
        !hasMeaningfulOutcome(outcomes.get(`${lesson.id}:${studentId}`)),
    ).length;
    if (!missingCount) continue;
    const label = lessonLabel(lesson, students, groups);
    const grouped = lesson.participantIds.length > 1;
    actions.push({
      id: `continuity:${lesson.id}`,
      type: "missing_continuity",
      priority: 4,
      severity: "neutral",
      title: grouped
        ? `Uzupełnij podsumowanie: ${label}`
        : `Brakuje podsumowania po lekcji z ${label}.`,
      detail: grouped
        ? `${missingCount} z ${lesson.participantIds.length} uczniów bez kontekstu.`
        : "Krótka notatka ułatwi przygotowanie kolejnej lekcji.",
      href: `/app/lekcje/${lesson.id}`,
      actionLabel: "Dodaj podsumowanie",
      lessonId: lesson.id,
      missingCount,
      participantCount: lesson.participantIds.length,
    });
  }

  if (!source.teacher.onboardingCompleted) {
    actions.push({
      id: "onboarding:complete",
      type: "onboarding",
      priority: 5,
      severity: "neutral",
      title: "Dokończ konfigurację easy4tutor.",
      detail: "Uzupełnij pierwsze kroki, kiedy będziesz mieć chwilę.",
      href: "/app/start",
      actionLabel: "Dokończ konfigurację",
    });
  }

  return actions.sort(
    (a, b) => a.priority - b.priority || a.id.localeCompare(b.id),
  );
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
    now: now.toISOString(),
    teacher: {
      name: data.teacher.name,
      timezone: data.teacher.timezone,
      readOnly: data.teacher.subscription.readOnly,
      onboardingCompleted: Boolean(data.teacher.onboardingCompletedAt),
      googleEntitled: hasEntitlement(
        data.teacher.subscription,
        "googleCalendar",
      ),
      googleStatus: data.integrations.google.status,
      googleSyncState: data.integrations.google.syncState,
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
    todaysBookings: data.calendarBookings
      .filter(
        (booking) =>
          booking.startsAt >= ranges.todayStart &&
          booking.startsAt < ranges.todayEnd,
      )
      .map((booking) => ({
        id: booking.id,
        startsAt: booking.startsAt,
        endsAt: booking.endsAt,
        guestName: booking.guestName,
        eventTypeName: booking.eventTypeName,
        status: booking.status,
      })),
    upcomingLessons: lessons.filter(
      (lesson) =>
        lesson.startsAt >= ranges.todayEnd &&
        lesson.startsAt < ranges.upcomingEnd,
    ),
    upcomingBookings: data.calendarBookings
      .filter(
        (booking) =>
          booking.startsAt >= ranges.todayEnd &&
          booking.startsAt < ranges.upcomingEnd,
      )
      .map((booking) => ({
        id: booking.id,
        startsAt: booking.startsAt,
        endsAt: booking.endsAt,
        guestName: booking.guestName,
        eventTypeName: booking.eventTypeName,
        status: booking.status,
      })),
    unfinishedLessons: lessons.filter(
      (lesson) =>
        lesson.status === "needs_completion" &&
        lesson.endsAt < now.toISOString() &&
        lesson.startsAt >= ranges.unfinishedStart,
    ),
    recentCompletedLessons: lessons.filter(
      (lesson) =>
        lesson.status === "completed" &&
        lesson.startsAt >= ranges.continuityStart &&
        lesson.startsAt < now.toISOString(),
    ),
    outcomes: [],
    monthlyLessons: lessons.filter((lesson) =>
      between(lesson, ranges.monthStart, ranges.monthEnd),
    ),
    packageProblems: [],
    overdueCharges: [],
  };
}

function lessonLabel(
  lesson: DashboardLessonSource,
  students: Map<string, DashboardSource["students"][number]>,
  groups: Map<string, DashboardSource["groups"][number]>,
) {
  if (lesson.groupId) return groups.get(lesson.groupId)?.name ?? "grupą";
  return students.get(lesson.participantIds[0])?.name ?? "uczniem";
}

function byStartsAt(
  left: { startsAt: string; id: string },
  right: { startsAt: string; id: string },
) {
  return (
    left.startsAt.localeCompare(right.startsAt) ||
    left.id.localeCompare(right.id)
  );
}

function localMidnight(dateKey: string, timezone: string) {
  return fromZonedTime(`${dateKey}T00:00:00`, timezone).toISOString();
}

function addToDateKey(dateKey: string, amount: number) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}
