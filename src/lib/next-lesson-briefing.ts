import type { StudentOutcomeDifficulty } from "./domain";
import type { LessonWorkspaceData } from "./lesson-workspace";
import type { StudentMemory } from "./student-memory";

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
      const latest = memory.latestLesson;
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
        difficulty: memory.currentDifficulty
          ? {
              level: memory.currentDifficulty.level,
              note: memory.currentDifficulty.note,
              sourceLessonId: memory.currentDifficulty.sourceLessonId,
            }
          : undefined,
        homework: memory.homework
          ? {
              title: memory.homework.title,
              dueAt: memory.homework.dueAt,
              sourceLessonId: memory.homework.sourceLessonId,
            }
          : undefined,
        nextStep: memory.currentNextStep
          ? {
              text: memory.currentNextStep.text,
              sourceLessonId: memory.currentNextStep.sourceLessonId,
            }
          : undefined,
        todayGoal,
      };
    }),
    generatedAt,
  };
}

function optionalText(value: string | null | undefined) {
  return value?.trim() || undefined;
}
