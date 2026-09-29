import type {
  AttendanceStatus,
  LessonStatus,
  StudentOutcomeDifficulty,
} from "./domain";

export const STUDENT_MEMORY_RECENT_LESSON_LIMIT = 5;
export const STUDENT_MEMORY_ATTENDANCE_LESSON_LIMIT = 10;

export interface StudentMemoryOutcome {
  progressSummary?: string;
  difficultyLevel?: StudentOutcomeDifficulty;
  difficultyNote?: string;
  nextStep?: string;
}

export interface StudentMemoryHomework {
  title: string;
  dueAt?: string;
  status?: "assigned" | "completed" | "cancelled";
  sourceLessonId: string;
  sourceLessonStartsAt: string;
}

export interface StudentMemoryLesson {
  lessonId: string;
  startsAt: string;
  topic?: string;
  subject?: string;
  attendance?: AttendanceStatus;
  outcome?: StudentMemoryOutcome;
  homework?: {
    title: string;
    dueAt?: string;
    status?: "assigned" | "completed" | "cancelled";
  };
}

export interface StudentMemory {
  student: {
    id: string;
    name: string;
    subject?: string;
    level?: string;
    goal?: string;
    status: "active" | "archived";
  };
  latestLesson?: StudentMemoryLesson;
  recentLessons: StudentMemoryLesson[];
  currentNextStep?: {
    text: string;
    sourceLessonId: string;
    sourceLessonStartsAt: string;
  };
  currentDifficulty?: {
    level: StudentOutcomeDifficulty;
    note?: string;
    sourceLessonId: string;
  };
  homework?: StudentMemoryHomework;
  attendance: {
    recentPresent: number;
    recentAbsent: number;
    recentNoShow: number;
    recentTotal: number;
  };
  upcomingLesson?: {
    id: string;
    startsAt: string;
    topic?: string;
  };
  metadata: {
    generatedAt: string;
    completedLessonsConsidered: number;
  };
}

export interface StudentMemoryLessonSource {
  id: string;
  startsAt: string;
  status: LessonStatus;
  topic?: string | null;
  subject?: string | null;
  attendances?: Array<{
    studentId: string;
    status: AttendanceStatus;
  }>;
  outcomes?: Array<{
    studentId: string;
    progressSummary?: string | null;
    difficultyLevel?: StudentOutcomeDifficulty | null;
    difficultyNote?: string | null;
    nextStep?: string | null;
  }>;
  homework?: {
    title: string;
    dueAt?: string | null;
    status?: "assigned" | "completed" | "cancelled";
  };
}

export interface BuildStudentMemoryInput {
  student: {
    id: string;
    name: string;
    subject?: string | null;
    level?: string | null;
    goal?: string | null;
    status: "active" | "archived";
  };
  historicalLessons: StudentMemoryLessonSource[];
  attendanceLessons: StudentMemoryLessonSource[];
  upcomingLesson?: {
    id: string;
    startsAt: string;
    topic?: string | null;
  };
  generatedAt: string;
}

export function buildStudentMemory({
  student,
  historicalLessons,
  attendanceLessons,
  upcomingLesson,
  generatedAt,
}: BuildStudentMemoryInput): StudentMemory {
  const recentLessons = historicalLessons
    .filter((lesson) => lesson.status === "completed")
    .sort(newestFirst)
    .slice(0, STUDENT_MEMORY_RECENT_LESSON_LIMIT)
    .map((lesson) => toMemoryLesson(lesson, student.id));

  const nextStepLesson = recentLessons.find((lesson) =>
    nonEmpty(lesson.outcome?.nextStep),
  );
  const difficultyLesson = recentLessons.find(
    (lesson) => lesson.outcome?.difficultyLevel,
  );
  const homeworkLesson = recentLessons.find((lesson) => lesson.homework);

  const attendance = attendanceLessons
    .filter(
      (lesson) => lesson.status === "completed" || lesson.status === "no_show",
    )
    .sort(newestFirst)
    .slice(0, STUDENT_MEMORY_ATTENDANCE_LESSON_LIMIT)
    .reduce(
      (summary, lesson) => {
        if (lesson.status === "no_show") {
          summary.recentNoShow += 1;
          summary.recentTotal += 1;
          return summary;
        }
        const status = lesson.attendances?.find(
          (item) => item.studentId === student.id,
        )?.status;
        if (status === "present" || status === "late") {
          summary.recentPresent += 1;
          summary.recentTotal += 1;
        } else if (status === "absent") {
          summary.recentAbsent += 1;
          summary.recentTotal += 1;
        }
        return summary;
      },
      {
        recentPresent: 0,
        recentAbsent: 0,
        recentNoShow: 0,
        recentTotal: 0,
      },
    );

  return {
    student: {
      id: student.id,
      name: student.name,
      subject: optionalText(student.subject),
      level: optionalText(student.level),
      goal: optionalText(student.goal),
      status: student.status,
    },
    latestLesson: recentLessons[0],
    recentLessons,
    currentNextStep:
      nextStepLesson && nextStepLesson.outcome?.nextStep
        ? {
            text: nextStepLesson.outcome.nextStep,
            sourceLessonId: nextStepLesson.lessonId,
            sourceLessonStartsAt: nextStepLesson.startsAt,
          }
        : undefined,
    currentDifficulty:
      difficultyLesson && difficultyLesson.outcome?.difficultyLevel
        ? {
            level: difficultyLesson.outcome.difficultyLevel,
            note: optionalText(difficultyLesson.outcome.difficultyNote),
            sourceLessonId: difficultyLesson.lessonId,
          }
        : undefined,
    homework: homeworkLesson?.homework && {
      ...homeworkLesson.homework,
      sourceLessonId: homeworkLesson.lessonId,
      sourceLessonStartsAt: homeworkLesson.startsAt,
    },
    attendance,
    upcomingLesson: upcomingLesson
      ? {
          id: upcomingLesson.id,
          startsAt: upcomingLesson.startsAt,
          topic: optionalText(upcomingLesson.topic),
        }
      : undefined,
    metadata: {
      generatedAt,
      completedLessonsConsidered: recentLessons.length,
    },
  };
}

function toMemoryLesson(
  lesson: StudentMemoryLessonSource,
  studentId: string,
): StudentMemoryLesson {
  const attendance = lesson.attendances?.find(
    (item) => item.studentId === studentId,
  )?.status;
  const sourceOutcome = lesson.outcomes?.find(
    (item) => item.studentId === studentId,
  );
  const outcome = sourceOutcome ? compactOutcome(sourceOutcome) : undefined;
  return {
    lessonId: lesson.id,
    startsAt: lesson.startsAt,
    topic: optionalText(lesson.topic),
    subject: optionalText(lesson.subject),
    attendance: attendance === "unknown" ? undefined : attendance,
    outcome,
    homework: lesson.homework
      ? {
          title: lesson.homework.title,
          dueAt: optionalText(lesson.homework.dueAt),
          status: lesson.homework.status,
        }
      : undefined,
  };
}

function compactOutcome(
  outcome: NonNullable<StudentMemoryLessonSource["outcomes"]>[number],
): StudentMemoryOutcome | undefined {
  const compact = {
    progressSummary: optionalText(outcome.progressSummary),
    difficultyLevel: outcome.difficultyLevel ?? undefined,
    difficultyNote: optionalText(outcome.difficultyNote),
    nextStep: optionalText(outcome.nextStep),
  };
  return Object.values(compact).some(Boolean) ? compact : undefined;
}

function optionalText(value: string | null | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}

function nonEmpty(value: string | undefined): boolean {
  return Boolean(value?.trim());
}

function newestFirst(
  left: StudentMemoryLessonSource,
  right: StudentMemoryLessonSource,
): number {
  return (
    right.startsAt.localeCompare(left.startsAt) ||
    right.id.localeCompare(left.id)
  );
}
