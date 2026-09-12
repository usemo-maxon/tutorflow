import type { Lesson } from "./domain";

export function progressContext(
  lessons: Lesson[],
  studentId: string,
  currentLessonId?: string,
) {
  const related = lessons
    .filter(
      (lesson) =>
        lesson.participantIds.includes(studentId) &&
        lesson.status !== "cancelled",
    )
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const current =
    related.find((lesson) => lesson.id === currentLessonId) ??
    related.find((lesson) => lesson.status === "scheduled");
  const previous = related
    .filter(
      (lesson) =>
        lesson.status === "completed" &&
        (!current || lesson.startsAt < current.startsAt),
    )
    .at(-1);
  const next = current
    ? related.find(
        (lesson) =>
          lesson.status === "scheduled" && lesson.startsAt > current.startsAt,
      )
    : undefined;
  return { previous, current, next };
}
