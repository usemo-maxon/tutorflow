import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { NextLessonBriefing } from "@/lib/next-lesson-briefing";
import { NextLessonBriefingView } from "./next-lesson-briefing";

describe("NextLessonBriefingView", () => {
  it("shows a concise 1:1 briefing with accessible difficulty and source navigation", () => {
    const html = renderToStaticMarkup(
      <NextLessonBriefingView briefing={briefing()} timezone="Europe/Warsaw" />,
    );
    expect(html).toContain("Przed lekcją");
    expect(html).toContain("Ostatnio");
    expect(html).toContain("Różnie");
    expect(html).toContain("Następny krok");
    expect(html).toContain("Cel na dziś");
    expect(html).toContain('href="/app/lekcje/history-1"');
  });

  it("uses tabs for groups and renders only the selected student's private detail", () => {
    const value = briefing();
    value.participants.push({
      student: { id: "zosia", name: "Zosia" },
      lastLesson: {
        lessonId: "history-2",
        startsAt: "2026-09-22T10:00:00.000Z",
        progressSummary: "ZOSIA_ONLY_CONTEXT",
      },
    });
    const html = renderToStaticMarkup(
      <NextLessonBriefingView briefing={value} timezone="Europe/Warsaw" />,
    );
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain("ANNA_ONLY_CONTEXT");
    expect(html).not.toContain("ZOSIA_ONLY_CONTEXT");
  });

  it("shows one first-lesson message instead of empty fields", () => {
    const value = briefing();
    value.participants = [{
      student: { id: "anna", name: "Anna", goal: "Rozmowa w pracy" },
      todayGoal: "Przedstawianie się",
    }];
    const html = renderToStaticMarkup(
      <NextLessonBriefingView briefing={value} timezone="Europe/Warsaw" />,
    );
    expect(html).toContain("To pierwsza lekcja z tym uczniem.");
    expect(html).toContain("Cel ucznia:");
    expect(html).not.toContain("Praca domowa");
  });
});

function briefing(): NextLessonBriefing {
  return {
    lesson: { id: "target", startsAt: "2026-10-01T10:00:00.000Z" },
    participants: [{
      student: { id: "anna", name: "Anna", level: "B1" },
      lastLesson: {
        lessonId: "history-1",
        startsAt: "2026-09-24T10:00:00.000Z",
        topic: "Present Perfect",
        progressSummary: "ANNA_ONLY_CONTEXT",
      },
      difficulty: { level: "mixed", note: "Since / for", sourceLessonId: "history-1" },
      homework: { title: "Ćwiczenia 4–6", sourceLessonId: "history-1" },
      nextStep: { text: "Krótki dialog", sourceLessonId: "history-1" },
      todayGoal: "Hotel check-in",
    }],
    generatedAt: "2026-09-29T10:00:00.000Z",
  };
}
