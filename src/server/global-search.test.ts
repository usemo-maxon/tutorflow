import { describe, expect, it } from "vitest";
import type { StoreShape } from "./store";
import { GLOBAL_SEARCH_LIMITS, searchGlobalStore } from "./global-search";

const NOW = new Date("2026-09-24T12:00:00.000Z");

function fixtureStore(): StoreShape {
  const students = [
    ...Array.from({ length: 8 }, (_, index) => ({
      id: `student-${index}`,
      teacherId: "teacher-a",
      firstName: index === 0 ? "Łukasz" : "Anna",
      lastName: index === 0 ? "Żółć" : `Testowa ${index}`,
      displayName: index === 0 ? "Łukasz Żółć" : `Anna Testowa ${index}`,
      email: index === 0 ? "lukasz@example.test" : "",
      phone: "",
      subject: "Angielski",
      level: "B1",
      status: index === 1 ? "archived" : "active",
    })),
    {
      id: "student-archived-tie",
      teacherId: "teacher-a",
      firstName: "Łukasz",
      lastName: "Żółć",
      displayName: "Łukasz Żółć",
      email: "",
      phone: "",
      subject: "Angielski",
      level: "B1",
      status: "archived",
    },
    {
      id: "other-student",
      teacherId: "teacher-b",
      firstName: "Sekretny",
      lastName: "Uczeń",
      displayName: "Sekretny Uczeń",
      email: "secret@example.test",
      phone: "",
      subject: "Chemia",
      level: "C2",
      status: "active",
    },
  ];
  const groups = [
    ...Array.from({ length: 5 }, (_, index) => ({
      id: `group-${index}`,
      teacherId: "teacher-a",
      name: `Grupa B1 ${index}`,
      subject: "Angielski",
      level: "B1",
      status: index === 4 ? "archived" : "active",
    })),
    {
      id: "other-group",
      teacherId: "teacher-b",
      name: "Sekretna grupa",
      subject: "Chemia",
      level: "C2",
      status: "active",
    },
  ];
  const lessons = [
    ...Array.from({ length: 8 }, (_, index) => ({
      id: `lesson-${index}`,
      teacherId: "teacher-a",
      groupId: undefined,
      participantIds: ["student-0"],
      startsAt: new Date(
        NOW.getTime() + (index + 1) * 86_400_000,
      ).toISOString(),
      topic: `Past Simple ${index}`,
      subject: "Angielski",
      status: index === 7 ? "cancelled" : "scheduled",
    })),
    {
      id: "lesson-too-old",
      teacherId: "teacher-a",
      participantIds: ["student-0"],
      startsAt: "2026-01-01T10:00:00.000Z",
      topic: "Past Simple historyczny",
      subject: "Angielski",
      status: "completed",
    },
    {
      id: "other-lesson",
      teacherId: "teacher-b",
      participantIds: ["other-student"],
      startsAt: "2026-09-25T10:00:00.000Z",
      topic: "Sekretny temat",
      subject: "Chemia",
      status: "scheduled",
    },
  ];

  return {
    version: 1,
    teachers: [],
    students,
    contacts: [],
    groups,
    lessons,
    studentStatImports: [],
    availability: [],
    sessions: [],
  } as unknown as StoreShape;
}

describe("focused local global search", () => {
  it("returns safe empty results below the two-character threshold", () => {
    expect(searchGlobalStore(fixtureStore(), "teacher-a", "l", NOW)).toEqual({
      students: [],
      groups: [],
      lessons: [],
    });
  });

  it("matches Polish names without diacritics and prioritizes active records", () => {
    const result = searchGlobalStore(
      fixtureStore(),
      "teacher-a",
      "lukasz",
      NOW,
    );
    expect(result.students.map((student) => student.id)).toEqual([
      "student-0",
      "student-archived-tie",
    ]);
    expect(result.students[1]?.status).toBe("archived");
  });

  it("enforces tenant isolation for every entity category", () => {
    const result = searchGlobalStore(
      fixtureStore(),
      "teacher-a",
      "sekret",
      NOW,
    );
    expect(result).toEqual({ students: [], groups: [], lessons: [] });
  });

  it("caps results and excludes cancelled and out-of-window lessons", () => {
    const store = fixtureStore();
    const students = searchGlobalStore(store, "teacher-a", "anna", NOW);
    const groups = searchGlobalStore(store, "teacher-a", "b1", NOW);
    const lessons = searchGlobalStore(store, "teacher-a", "past", NOW);
    expect(students.students).toHaveLength(GLOBAL_SEARCH_LIMITS.students);
    expect(groups.groups).toHaveLength(GLOBAL_SEARCH_LIMITS.groups);
    expect(lessons.lessons).toHaveLength(GLOBAL_SEARCH_LIMITS.lessons);
    expect(lessons.lessons.map((lesson) => lesson.id)).not.toContain(
      "lesson-7",
    );
    expect(lessons.lessons.map((lesson) => lesson.id)).not.toContain(
      "lesson-too-old",
    );
  });
});
