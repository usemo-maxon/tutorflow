import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { StudentMemory } from "@/lib/student-memory";
import {
  AttendanceSection,
  ContinuitySection,
  MemoryErrorState,
  NextLessonSection,
  RecentLessonsSection,
} from "./student-memory-sections";

const timezone = "Europe/Warsaw";

function memory(overrides: Partial<StudentMemory> = {}): StudentMemory {
  return {
    student: {
      id: "student-1",
      name: "Anna Kowalska",
      subject: "Angielski",
      level: "B1",
      goal: "Swobodna rozmowa",
      status: "active",
    },
    latestLesson: {
      lessonId: "lesson-1",
      startsAt: "2026-09-24T15:30:00.000Z",
      topic: "Present Perfect vs Past Simple",
      attendance: "present",
      outcome: {
        progressSummary: "Przećwiczyliśmy pytania i krótkie dialogi.",
        difficultyLevel: "mixed",
        difficultyNote: "Nadal myli since i for.",
        nextStep: "Powtórzyć since/for i przejść do dialogów.",
      },
    },
    recentLessons: [
      {
        lessonId: "lesson-1",
        startsAt: "2026-09-24T15:30:00.000Z",
        topic: "Present Perfect vs Past Simple",
        attendance: "present",
        outcome: {
          progressSummary: "Przećwiczyliśmy pytania i krótkie dialogi.",
          difficultyLevel: "mixed",
          difficultyNote: "Nadal myli since i for.",
          nextStep: "Powtórzyć since/for i przejść do dialogów.",
        },
      },
    ],
    currentNextStep: {
      text: "Powtórzyć since/for i przejść do dialogów.",
      sourceLessonId: "lesson-1",
      sourceLessonStartsAt: "2026-09-24T15:30:00.000Z",
    },
    currentDifficulty: {
      level: "mixed",
      note: "Nadal myli since i for.",
      sourceLessonId: "lesson-1",
    },
    homework: {
      title: "Ćwiczenia 4–6, str. 38",
      dueAt: "2026-10-02T18:00:00.000Z",
      sourceLessonId: "lesson-1",
      sourceLessonStartsAt: "2026-09-24T15:30:00.000Z",
    },
    attendance: {
      recentPresent: 4,
      recentAbsent: 1,
      recentNoShow: 0,
      recentTotal: 5,
    },
    upcomingLesson: {
      id: "lesson-2",
      startsAt: "2026-10-01T15:30:00.000Z",
      topic: "Present Perfect — speaking",
    },
    metadata: {
      generatedAt: "2026-09-29T10:00:00.000Z",
      completedLessonsConsidered: 1,
    },
    ...overrides,
  };
}

describe("Student 360 memory sections", () => {
  it("renders the full deterministic memory and the upcoming lesson link", () => {
    const value = memory();
    const html = renderToStaticMarkup(
      <>
        <NextLessonSection
          memory={value}
          timezone={timezone}
          canSchedule
          onSchedule={() => undefined}
        />
        <ContinuitySection
          memory={value}
          timezone={timezone}
          canSchedule
          onSchedule={() => undefined}
        />
        <RecentLessonsSection memory={value} timezone={timezone} />
        <AttendanceSection memory={value} />
      </>,
    );

    expect(html).toContain("Następna lekcja");
    expect(html).toContain("Present Perfect — speaking");
    expect(html).toContain('href="/app/lekcje/lesson-2"');
    expect(html).toContain("Przećwiczyliśmy pytania i krótkie dialogi.");
    expect(html).toContain("Różnie");
    expect(html).toContain("Nadal myli since i for.");
    expect(html).toContain("Powtórzyć since/for i przejść do dialogów.");
    expect(html).toContain("Ćwiczenia 4–6, str. 38");
    expect(html).toContain("Obecny");
    expect(html).toContain(">4<");
  });

  it("uses one useful first-lesson state when memory is empty", () => {
    const value = memory({
      latestLesson: undefined,
      recentLessons: [],
      currentNextStep: undefined,
      currentDifficulty: undefined,
      homework: undefined,
      upcomingLesson: undefined,
      attendance: {
        recentPresent: 0,
        recentAbsent: 0,
        recentNoShow: 0,
        recentTotal: 0,
      },
    });
    const html = renderToStaticMarkup(
      <>
        <NextLessonSection
          memory={value}
          timezone={timezone}
          canSchedule
          onSchedule={() => undefined}
        />
        <ContinuitySection
          memory={value}
          timezone={timezone}
          canSchedule
          onSchedule={() => undefined}
        />
      </>,
    );

    expect(html).toContain("Brak zaplanowanej kolejnej lekcji.");
    expect(html).toContain("Nie było jeszcze żadnej lekcji.");
    expect(html).toContain("Zaplanuj pierwszą lekcję");
    expect(html).not.toContain("Brak zapisanej trudności");
  });

  it("keeps a legacy lesson visible without fabricating an outcome", () => {
    const legacy = memory({
      recentLessons: [
        {
          lessonId: "legacy-lesson",
          startsAt: "2026-08-20T14:00:00.000Z",
          topic: "Past Simple",
          attendance: "present",
        },
      ],
    });
    const html = renderToStaticMarkup(
      <RecentLessonsSection memory={legacy} timezone={timezone} />,
    );

    expect(html).toContain("Past Simple");
    expect(html).toContain("Brak podsumowania ucznia.");
    expect(html).toContain('href="/app/lekcje/legacy-lesson"');
  });

  it("shows explicit empty copy for a missing next step and homework", () => {
    const value = memory({ currentNextStep: undefined, homework: undefined });
    const html = renderToStaticMarkup(
      <ContinuitySection
        memory={value}
        timezone={timezone}
        canSchedule
        onSchedule={() => undefined}
      />,
    );

    expect(html).toContain("Brak zapisanego następnego kroku.");
    expect(html).toContain("Brak zapisanej pracy domowej.");
    expect(html).not.toContain("undefined");
    expect(html).not.toContain("null");
  });

  it("renders only outcome fields present in the returned student memory", () => {
    const returnedLesson = {
      lessonId: "group-lesson",
      startsAt: "2026-09-23T15:00:00.000Z",
      topic: "Group speaking",
      attendance: "present" as const,
      outcome: { progressSummary: "Anna przećwiczyła dialog." },
      otherParticipantOutcome: "OTHER_STUDENT_SECRET",
    };
    const html = renderToStaticMarkup(
      <RecentLessonsSection
        memory={memory({ recentLessons: [returnedLesson] })}
        timezone={timezone}
      />,
    );

    expect(html).toContain("Anna przećwiczyła dialog.");
    expect(html).not.toContain("OTHER_STUDENT_SECRET");
  });

  it("keeps the failure local and exposes a retry button", () => {
    const html = renderToStaticMarkup(
      <MemoryErrorState onRetry={() => undefined} />,
    );

    expect(html).toContain("Nie udało się wczytać historii ucznia.");
    expect(html).toContain("Spróbuj ponownie");
    expect(html).toContain("<button");
  });

  it("keeps archived history readable without exposing scheduling actions", () => {
    const archived = memory({
      student: { ...memory().student, status: "archived" },
      upcomingLesson: undefined,
    });
    const html = renderToStaticMarkup(
      <>
        <NextLessonSection
          memory={archived}
          timezone={timezone}
          canSchedule={false}
          onSchedule={() => undefined}
        />
        <RecentLessonsSection memory={archived} timezone={timezone} />
      </>,
    );

    expect(html).toContain("Brak zaplanowanej kolejnej lekcji.");
    expect(html).toContain("Present Perfect vs Past Simple");
    expect(html).not.toContain("Zaplanuj lekcję");
  });

  it("uses the same read-only presentation without mutation CTAs", () => {
    const value = memory({ upcomingLesson: undefined });
    const html = renderToStaticMarkup(
      <ContinuitySection
        memory={value}
        timezone={timezone}
        canSchedule={false}
        onSchedule={() => undefined}
      />,
    );

    expect(html).toContain("Na teraz");
    expect(html).toContain("Następny krok");
    expect(html).not.toContain("Zaplanuj pierwszą lekcję");
  });

  it("clamps very long outcome text behind an accessible disclosure", () => {
    const longText = "Bardzo długie podsumowanie. ".repeat(100);
    const value = memory({
      latestLesson: {
        ...memory().latestLesson!,
        outcome: { progressSummary: longText },
      },
    });
    const html = renderToStaticMarkup(
      <ContinuitySection
        memory={value}
        timezone={timezone}
        canSchedule
        onSchedule={() => undefined}
      />,
    );

    expect(html).toContain("Pokaż więcej");
    expect(html).toContain("<details>");
  });
});
