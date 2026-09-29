import { describe, expect, it } from "vitest";
import {
  buildDashboardData,
  dashboardRanges,
  type DashboardLessonSource,
  type DashboardSource,
} from "./dashboard";

const lesson = (
  id: string,
  startsAt: string,
  endsAt: string,
  overrides: Partial<DashboardLessonSource> = {},
): DashboardLessonSource => ({
  id,
  participantIds: ["student-a"],
  startsAt,
  endsAt,
  status: "scheduled",
  subject: "Angielski",
  topic: "Conversation",
  format: "online",
  syncStatus: "disabled",
  ...overrides,
});

function source(overrides: Partial<DashboardSource> = {}): DashboardSource {
  const now = new Date("2026-09-16T11:00:00.000Z");
  return {
    now: now.toISOString(),
    teacher: {
      name: "Anna Kowalska",
      timezone: "Europe/Warsaw",
      readOnly: false,
      onboardingCompleted: true,
      googleEntitled: true,
      googleStatus: "connected",
      googleSyncState: "idle",
    },
    ranges: dashboardRanges(now, "Europe/Warsaw"),
    students: [
      {
        id: "student-a",
        name: "Zosia",
        subject: "Angielski",
        level: "B1",
        status: "active",
      },
      {
        id: "student-b",
        name: "Hania",
        subject: "Angielski",
        level: "A2",
        status: "active",
      },
      {
        id: "student-c",
        name: "Ola",
        subject: "Angielski",
        level: "B1",
        status: "active",
      },
      {
        id: "student-d",
        name: "Ada",
        subject: "Angielski",
        level: "B1",
        status: "active",
      },
    ],
    groups: [
      { id: "group-a", name: "Grupa B1", subject: "Angielski", level: "B1" },
    ],
    todaysLessons: [],
    upcomingLessons: [],
    unfinishedLessons: [],
    recentCompletedLessons: [],
    outcomes: [],
    monthlyLessons: [],
    packageProblems: [],
    overdueCharges: [],
    ...overrides,
  };
}

describe("dashboardRanges", () => {
  it("uses the teacher timezone around midnight", () => {
    const ranges = dashboardRanges(
      new Date("2026-09-15T22:30:00.000Z"),
      "Europe/Warsaw",
    );
    expect(ranges.dateKey).toBe("2026-09-16");
    expect(ranges.todayStart).toBe("2026-09-15T22:00:00.000Z");
    expect(ranges.todayEnd).toBe("2026-09-16T22:00:00.000Z");
  });

  it("keeps the spring DST day at its real 23-hour length", () => {
    const ranges = dashboardRanges(
      new Date("2026-03-29T12:00:00.000Z"),
      "Europe/Warsaw",
    );
    expect(ranges.todayStart).toBe("2026-03-28T23:00:00.000Z");
    expect(ranges.todayEnd).toBe("2026-03-29T22:00:00.000Z");
  });

  it("centralizes the 14-day unfinished, 7-day continuity and 14-day upcoming windows", () => {
    const ranges = dashboardRanges(
      new Date("2026-09-16T12:00:00.000Z"),
      "Europe/Warsaw",
    );
    expect(ranges.unfinishedStart).toBe("2026-09-01T22:00:00.000Z");
    expect(ranges.continuityStart).toBe("2026-09-08T22:00:00.000Z");
    expect(ranges.upcomingEnd).toBe("2026-09-29T22:00:00.000Z");
  });
});

describe("buildDashboardData", () => {
  it("selects the nearest future lesson after completed chronology", () => {
    const data = buildDashboardData(
      source({
        todaysLessons: [
          lesson(
            "completed",
            "2026-09-16T07:00:00.000Z",
            "2026-09-16T08:00:00.000Z",
            { status: "completed" },
          ),
          lesson(
            "next",
            "2026-09-16T12:00:00.000Z",
            "2026-09-16T13:00:00.000Z",
          ),
          lesson(
            "later",
            "2026-09-16T16:00:00.000Z",
            "2026-09-16T17:00:00.000Z",
          ),
        ],
      }),
    );
    expect(data.nextLesson?.id).toBe("next");
  });

  it("prefers a lesson happening now without persisting another status", () => {
    const data = buildDashboardData(
      source({
        now: "2026-09-16T12:30:00.000Z",
        todaysLessons: [
          lesson(
            "current",
            "2026-09-16T12:00:00.000Z",
            "2026-09-16T13:00:00.000Z",
          ),
          lesson(
            "later",
            "2026-09-16T16:00:00.000Z",
            "2026-09-16T17:00:00.000Z",
          ),
        ],
      }),
    );
    expect(data.nextLesson).toMatchObject({
      id: "current",
      status: "scheduled",
    });
  });

  it("does not promote tomorrow when today's lessons are over", () => {
    const data = buildDashboardData(
      source({
        todaysLessons: [
          lesson(
            "done",
            "2026-09-16T07:00:00.000Z",
            "2026-09-16T08:00:00.000Z",
            { status: "completed" },
          ),
        ],
        upcomingLessons: [
          lesson(
            "tomorrow",
            "2026-09-17T12:00:00.000Z",
            "2026-09-17T13:00:00.000Z",
          ),
        ],
      }),
    );
    expect(data.nextLesson).toBeUndefined();
    expect(data.upcomingLessons[0].id).toBe("tomorrow");
  });

  it("derives one unfinished action per recent lesson and removes it after completion", () => {
    const unfinished = lesson(
      "unfinished",
      "2026-09-15T12:00:00.000Z",
      "2026-09-15T13:00:00.000Z",
      { status: "needs_completion" },
    );
    expect(
      buildDashboardData(source({ unfinishedLessons: [unfinished] }))
        .actions[0],
    ).toMatchObject({ id: "unfinished:unfinished", type: "unfinished_lesson" });
    expect(buildDashboardData(source()).actions).toEqual([]);
  });

  it("creates one grouped continuity action and accepts any meaningful outcome field", () => {
    const completed = lesson(
      "group",
      "2026-09-15T12:00:00.000Z",
      "2026-09-15T13:00:00.000Z",
      {
        status: "completed",
        groupId: "group-a",
        participantIds: ["student-a", "student-b", "student-c", "student-d"],
      },
    );
    const data = buildDashboardData(
      source({
        recentCompletedLessons: [completed],
        outcomes: [
          {
            lessonId: "group",
            studentId: "student-a",
            progressSummary: "Postęp",
          },
          {
            lessonId: "group",
            studentId: "student-b",
            difficultyLevel: "mixed",
          },
        ],
      }),
    );
    expect(data.actions).toHaveLength(1);
    expect(data.actions[0]).toMatchObject({
      type: "missing_continuity",
      missingCount: 2,
      participantCount: 4,
    });
    expect(data.actions[0].detail).toContain("2 z 4");
  });

  it("does not create continuity backlog outside the repository-provided recent window", () => {
    expect(
      buildDashboardData(source({ recentCompletedLessons: [] })).actions,
    ).toEqual([]);
  });

  it("aggregates overdue amounts per student and currency without FX mixing", () => {
    const data = buildDashboardData(
      source({
        overdueCharges: [
          { studentId: "student-a", outstanding: 7_500, currency: "PLN" },
          { studentId: "student-a", outstanding: 2_500, currency: "PLN" },
          { studentId: "student-a", outstanding: 2_000, currency: "EUR" },
        ],
      }),
    );
    expect(data.actions.map((action) => action.id)).toEqual([
      "overdue:student-a:EUR",
      "overdue:student-a:PLN",
    ]);
    expect(data.actions.map((action) => action.title).join(" ")).toContain(
      "100,00",
    );
    expect(data.actions.map((action) => action.title).join(" ")).toContain(
      "20,00",
    );
  });

  it("surfaces package exhaustion before financial and continuity attention", () => {
    const upcoming = lesson(
      "package-lesson",
      "2026-09-16T15:00:00.000Z",
      "2026-09-16T16:00:00.000Z",
      { billingType: "package" },
    );
    const data = buildDashboardData(
      source({
        upcomingLessons: [upcoming],
        packageProblems: [{ lessonId: upcoming.id, studentId: "student-a" }],
        overdueCharges: [
          { studentId: "student-a", outstanding: 10_000, currency: "PLN" },
        ],
      }),
    );
    expect(data.actions.map((action) => action.type)).toEqual([
      "package_problem",
      "overdue_finance",
    ]);
  });

  it("shows Google reconnect only when the teacher is entitled", () => {
    const reconnect = source({
      teacher: { ...source().teacher, googleStatus: "reconnect_required" },
    });
    expect(buildDashboardData(reconnect).actions[0].type).toBe(
      "google_reconnect",
    );
    expect(
      buildDashboardData({
        ...reconnect,
        teacher: { ...reconnect.teacher, googleEntitled: false },
      }).actions,
    ).toEqual([]);
  });

  it("caps the first view while preserving a visible hidden count", () => {
    const unfinishedLessons = Array.from({ length: 8 }, (_, index) =>
      lesson(
        `unfinished-${index}`,
        `2026-09-${String(8 + index).padStart(2, "0")}T10:00:00.000Z`,
        `2026-09-${String(8 + index).padStart(2, "0")}T11:00:00.000Z`,
        { status: "needs_completion" },
      ),
    );
    const data = buildDashboardData(source({ unfinishedLessons }));
    expect(data.actions).toHaveLength(5);
    expect(data.hiddenActionCount).toBe(3);
  });
});
