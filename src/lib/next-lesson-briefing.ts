import type { StudentOutcomeDifficulty } from "./domain";
import type { LessonWorkspaceData } from "./lesson-workspace";
import type { StudentMemory } from "./student-memory";
import type { HomeworkMaterial, HomeworkStatus } from "./homework";

export interface NextLessonParticipantBriefing {
  student: {
    id: string;
    name: string;
    level?: string;
    goal?: string;
  };
  lastLesson?: {
    lessonId: string;
    startsAt: string;
    topic?: string;
    progressSummary?: string;
  };
  difficulty?: {
    level: StudentOutcomeDifficulty;
    note?: string;
    sourceLessonId: string;
  };
  homework?: {
    title: string;
    dueAt?: string;
    sourceLessonId: string;
    status?: HomeworkStatus;
    feedback?: string;
    materials?: HomeworkMaterial[];
  };
  nextStep?: {
    text: string;
    sourceLessonId: string;
  };
  todayGoal?: string;
}

export interface NextLessonBriefing {
  lesson: {
    id: string;
    startsAt: string;
    topic?: string;
    objective?: string;
  };
  participants: NextLessonParticipantBriefing[];
  generatedAt: string;
}

export function composeNextLessonBriefing(
  workspace: LessonWorkspaceData,
  memories: StudentMemory[],
  generatedAt: string,
): NextLessonBriefing {
  const memoriesByStudent = new Map(
    memories.map((memory) => [memory.student.id, memory]),
  );
  const objective = optionalText(workspace.lesson.objectives);
  const topic = optionalText(workspace.lesson.topic);
  const todayGoal = objective ?? topic;

  return {
    lesson: {
      id: workspace.lesson.id,
      startsAt: workspace.lesson.startsAt,
      topic,
      objective,
    },
    participants: workspace.participants.map((participant) => {
      const memory = memoriesByStudent.get(participant.studentId);
      if (!memory) {
        return {
          student: {
            id: participant.studentId,
            name: participant.name,
            level: optionalText(participant.level),
          },
          todayGoal,
        };
      }
      const latest =
        memory.latestLesson &&
        isEarlierLesson(
          memory.latestLesson.lessonId,
          memory.latestLesson.startsAt,
          workspace.lesson.id,
          workspace.lesson.startsAt,
        )
          ? memory.latestLesson
          : undefined;
      const briefingHomework = memory.homeworks?.find(
        (homework) =>
          (homework.status === "completed" || homework.status === "assigned") &&
          isEarlierLesson(
            homework.sourceLessonId,
            homework.sourceLessonStartsAt,
            workspace.lesson.id,
            workspace.lesson.startsAt,
          ),
      );
      const fallbackHomework =
        memory.homework &&
        isEarlierLesson(
          memory.homework.sourceLessonId,
          memory.homework.sourceLessonStartsAt,
          workspace.lesson.id,
          workspace.lesson.startsAt,
        )
          ? memory.homework
          : undefined;
      const nextStep =
        memory.currentNextStep &&
        isEarlierLesson(
          memory.currentNextStep.sourceLessonId,
          memory.currentNextStep.sourceLessonStartsAt,
          workspace.lesson.id,
          workspace.lesson.startsAt,
        )
          ? memory.currentNextStep
          : undefined;
      const difficulty =
        memory.currentDifficulty &&
        memory.currentDifficulty.sourceLessonId !== workspace.lesson.id
          ? memory.currentDifficulty
          : undefined;
      return {
        student: {
          id: memory.student.id,
          name: memory.student.name,
          level: memory.student.level,
          goal: memory.student.goal,
        },
        lastLesson: latest
          ? {
              lessonId: latest.lessonId,
              startsAt: latest.startsAt,
              topic: latest.topic,
              progressSummary: latest.outcome?.progressSummary,
            }
          : undefined,
        difficulty: difficulty
          ? {
              level: difficulty.level,
              note: difficulty.note,
              sourceLessonId: difficulty.sourceLessonId,
            }
          : undefined,
        homework: briefingHomework
          ? {
              title: briefingHomework.title,
              dueAt: briefingHomework.dueAt,
              sourceLessonId: briefingHomework.sourceLessonId,
              status: briefingHomework.status,
              feedback: briefingHomework.feedback,
              materials: briefingHomework.materials,
            }
          : fallbackHomework
            ? {
                title: fallbackHomework.title,
                dueAt: fallbackHomework.dueAt,
                sourceLessonId: fallbackHomework.sourceLessonId,
                status:
                  fallbackHomework.status === "completed"
                    ? "completed"
                    : "assigned",
                materials: [],
              }
            : undefined,
        nextStep: nextStep
          ? {
              text: nextStep.text,
              sourceLessonId: nextStep.sourceLessonId,
            }
          : undefined,
        todayGoal,
      };
    }),
    generatedAt,
  };
}

function isEarlierLesson(
  sourceLessonId: string,
  sourceStartsAt: string,
  targetLessonId: string,
  targetStartsAt: string,
) {
  return sourceLessonId !== targetLessonId && sourceStartsAt < targetStartsAt;
}

function optionalText(value: string | null | undefined) {
  return value?.trim() || undefined;
}
