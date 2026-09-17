import { describe, expect, it } from "vitest";
import {
  buildDashboardData,
  dashboardRanges,
  type DashboardLessonSource,
  type DashboardSource,
} from "./dashboard";

const scheduled = (
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
  return {
    teacher: {
      name: "Anna Kowalska",
      timezone: "Europe/Warsaw",
      readOnly: false,
    },
    ranges: dashboardRanges(
      new Date("2026-09-16T10:00:00.000Z"),
      "Europe/Warsaw",
    ),
    students: [
      {
        id: "student-a",
        name: "Zosia Kowalska",
        subject: "Angielski",
        level: "B1",
        status: "active",
      },
      {
        id: "student-b",
        name: "Hania Nowak",
        subject: "Angielski",
        level: "A2",
        status: "archived",
      },
    ],
    groups: [
      { id: "group-a", name: "Grupa B1", subject: "Angielski", level: "B1" },
    ],
    todaysLessons: [],
    upcomingLessons: [],
    unfinishedLessons: [],
    syncFailures: [],
    monthlyLessons: [],
    lowPackages: [],
    ...overrides,
  };
}

describe("dashboardRanges", () => {
  it("uses Warsaw CET local-day boundaries", () => {
    const ranges = dashboardRanges(
      new Date("2026-01-15T12:00:00.000Z"),
      "Europe/Warsaw",
    );
    expect(ranges.dateKey).toBe("2026-01-15");
    expect(ranges.todayStart).toBe("2026-01-14T23:00:00.000Z");
    expect(ranges.todayEnd).toBe("2026-01-15T23:00:00.000Z");
  });

  it("uses Warsaw CEST local-day and month boundaries", () => {
    const ranges = dashboardRanges(
      new Date("2026-09-16T12:00:00.000Z"),
      "Europe/Warsaw",
    );
    expect(ranges.todayStart).toBe("2026-09-15T22:00:00.000Z");
    expect(ranges.todayEnd).toBe("2026-09-16T22:00:00.000Z");
    expect(ranges.monthStart).toBe("2026-08-31T22:00:00.000Z");
    expect(ranges.monthEnd).toBe("2026-09-30T22:00:00.000Z");
  });

  it("keeps the DST transition day at its real 23-hour length", () => {
    const ranges = dashboardRanges(
      new Date("2026-03-29T12:00:00.000Z"),
      "Europe/Warsaw",
    );
    expect(ranges.todayStart).toBe("2026-03-28T23:00:00.000Z");
    expect(ranges.todayEnd).toBe("2026-03-29T22:00:00.000Z");
  });
});

describe("buildDashboardData", () => {
  it("orders today chronologically and hides cancelled lessons", () => {
    const data = buildDashboardData(
      source({
        todaysLessons: [
          scheduled(
            "late",
            "2026-09-16T16:00:00.000Z",
            "2026-09-16T17:00:00.000Z",
          ),
          scheduled(
            "cancelled",
            "2026-09-16T13:00:00.000Z",
            "2026-09-16T14:00:00.000Z",
            {
              status: "cancelled",
            },
          ),
          scheduled(
            "early",
            "2026-09-16T12:00:00.000Z",
            "2026-09-16T13:00:00.000Z",
          ),
        ],
      }),
    );
    expect(data.todaysLessons.map((lesson) => lesson.id)).toEqual([
      "early",
      "late",
    ]);
  });

  it("uses the group identity and participant count for a group lesson", () => {
    const data = buildDashboardData(
      source({
        todaysLessons: [
          scheduled(
            "group",
            "2026-09-16T16:00:00.000Z",
            "2026-09-16T17:00:00.000Z",
            {
              groupId: "group-a",
              participantIds: ["student-a", "student-b"],
            },
          ),
        ],
      }),
    );
    expect(data.todaysLessons[0]).toMatchObject({
      participantLabel: "Grupa B1",
      participantCount: 2,
      level: "B1",
    });
  });

  it("aggregates unfinished lessons and deduplicates package warnings per student", () => {
    const unfinishedA = scheduled(
      "unfinished-a",
      "2026-09-14T12:00:00.000Z",
      "2026-09-14T13:00:00.000Z",
      { status: "needs_completion" },
    );
    const unfinishedB = scheduled(
      "unfinished-b",
      "2026-09-15T12:00:00.000Z",
      "2026-09-15T13:00:00.000Z",
      { status: "needs_completion" },
    );
    const data = buildDashboardData(
      source({
        unfinishedLessons: [unfinishedB, unfinishedA],
        lowPackages: [
          { studentId: "student-a", remainingLessons: 2 },
          { studentId: "student-a", remainingLessons: 1 },
        ],
      }),
    );
    expect(data.attentionItems).toHaveLength(2);
    expect(data.attentionItems[0]).toMatchObject({
      type: "unfinished_lessons",
      count: 2,
      href: "/app/lekcje/unfinished-a",
    });
    expect(data.attentionItems[1].title).toContain("została 1 lekcja");
  });

  it("removes resolved attention conditions", () => {
    expect(buildDashboardData(source()).attentionItems).toEqual([]);
  });

  it("surfaces outstanding overdue charges without mixing currencies", () => {
    const data = buildDashboardData(
      source({
        overdueCharges: [
          { studentId: "student-a", outstanding: 7_500, currency: "PLN" },
          { studentId: "student-b", outstanding: 2_500, currency: "PLN" },
          { studentId: "student-a", outstanding: 1_000, currency: "EUR" },
        ],
      }),
    );

    expect(data.attentionItems[0]).toMatchObject({
      id: "overdue-payments",
      type: "overdue_payment",
      count: 3,
      href: "/app/platnosci?filter=overdue",
    });
    expect(data.attentionItems[0].detail).toContain("100,00");
    expect(data.attentionItems[0].detail).toContain("zł");
  });

  it("counts non-cancelled monthly lessons but teaching time only from completed lessons", () => {
    const data = buildDashboardData(
      source({
        monthlyLessons: [
          scheduled(
            "completed",
            "2026-09-10T12:00:00.000Z",
            "2026-09-10T13:30:00.000Z",
            {
              status: "completed",
            },
          ),
          scheduled(
            "future",
            "2026-09-20T12:00:00.000Z",
            "2026-09-20T13:00:00.000Z",
          ),
          scheduled(
            "cancelled",
            "2026-09-21T12:00:00.000Z",
            "2026-09-21T13:00:00.000Z",
            {
              status: "cancelled",
            },
          ),
        ],
      }),
    );
    expect(data.monthlySummary).toEqual({
      lessonCount: 2,
      completedLessonCount: 1,
      teachingMinutes: 90,
      activeStudents: 1,
    });
  });
});
