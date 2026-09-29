import type { AttendanceStatus, StudentOutcomeDifficulty } from "./domain";
import { hasMeaningfulOutcome } from "./lesson-completion";
import type { StudentMemory } from "./student-memory";

export const GROUP_CONTINUITY_RECENT_LESSON_LIMIT = 5;
export const GROUP_CONTINUITY_MEMORY_QUERY_MULTIPLIER = 4;
export const GROUP_CONTINUITY_ATTENTION_LIMIT = 5;

export interface GroupContinuityOutcomeSource {
  studentId: string;
  progressSummary?: string | null;
  difficultyLevel?: StudentOutcomeDifficulty | null;
  difficultyNote?: string | null;
  nextStep?: string | null;
}

export interface GroupContinuityLessonSource {
  id: string;
  startsAt: string;
  topic?: string | null;
  objective?: string | null;
  participantIds: string[];
  attendances: Array<{ studentId: string; status: AttendanceStatus }>;
  outcomes: GroupContinuityOutcomeSource[];
  homework?: {
    title: string;
    description?: string | null;
    dueAt?: string | null;
  };
}

export interface GroupContinuityMember {
  student: { id: string; name: string; level?: string };
  latestLesson?: { lessonId: string; startsAt: string };
  difficulty?: {
    level: StudentOutcomeDifficulty;
    note?: string;
    sourceLessonId: string;
    source: "same_group" | "other_lesson";
  };
  nextStep?: {
    text: string;
    sourceLessonId: string;
    source: "same_group" | "other_lesson";
  };
  hasRecentContext: boolean;
  hasGroupHistory: boolean;
  isNewToGroup: boolean;
}

export interface GroupContinuityLesson {
  id: string;
  startsAt: string;
  topic?: string;
  objective?: string;
  participantCount: number;
  attendance: { present: number; participants: number };
  outcomeCoverage: { withOutcome: number; participants: number };
  homework?: { title: string; description?: string; dueAt?: string };
}

export interface GroupContinuity {
  group: {
    id: string;
    name: string;
    subject?: string;
    level?: string;
    status: "active" | "archived";
  };
  nextLesson?: {
    id: string;
    startsAt: string;
    topic?: string;
    objective?: string;
  };
  lastLesson?: GroupContinuityLesson;
  members: GroupContinuityMember[];
  attention: Array<{
    studentId: string;
    kind: "hard" | "mixed" | "missing_context";
  }>;
  recentLessons: GroupContinuityLesson[];
  coverage: { members: number; withRecentContext: number };
  generatedAt: string;
}

export interface BuildGroupContinuityInput {
  group: {
    id: string;
    name: string;
    subject?: string | null;
    level?: string | null;
    status: "active" | "archived";
  };
  currentMembers: Array<{
    student: { id: string; name: string; level?: string | null };
    joinedAt: string;
  }>;
  nextLesson?: {
    id: string;
    startsAt: string;
    topic?: string | null;
    objective?: string | null;
  };
  recentLessons: GroupContinuityLessonSource[];
  memberMemories: StudentMemory[];
  generatedAt: string;
}

export function buildGroupContinuity({
  group,
  currentMembers,
  nextLesson,
  recentLessons,
  memberMemories,
  generatedAt,
}: BuildGroupContinuityInput): GroupContinuity {
  const boundedLessons = [...recentLessons]
    .sort(newestFirst)
    .slice(0, GROUP_CONTINUITY_RECENT_LESSON_LIMIT);
  const groupLessonIds = new Set(boundedLessons.map((lesson) => lesson.id));
  const memoryByStudent = new Map(
    memberMemories.map((memory) => [memory.student.id, memory]),
  );
  const lastLesson = boundedLessons[0];

  const members = currentMembers
    .map(({ student, joinedAt }): GroupContinuityMember => {
      const memory = memoryByStudent.get(student.id);
      const groupHistory = boundedLessons.find((lesson) =>
        lesson.participantIds.includes(student.id),
      );
      const hasRecentContext = Boolean(
        memory?.recentLessons.some((lesson) =>
          hasMeaningfulOutcome(lesson.outcome),
        ),
      );
      const difficulty = memory?.currentDifficulty;
      const nextStep = memory?.currentNextStep;
      return {
        student: {
          id: student.id,
          name: student.name,
          level: optionalText(student.level),
        },
        latestLesson: memory?.latestLesson
          ? {
              lessonId: memory.latestLesson.lessonId,
              startsAt: memory.latestLesson.startsAt,
            }
          : undefined,
        difficulty: difficulty
          ? {
              level: difficulty.level,
              note: optionalText(difficulty.note),
              sourceLessonId: difficulty.sourceLessonId,
              source: groupLessonIds.has(difficulty.sourceLessonId)
                ? "same_group"
                : "other_lesson",
            }
          : undefined,
        nextStep: nextStep
          ? {
              text: nextStep.text,
              sourceLessonId: nextStep.sourceLessonId,
              source: groupLessonIds.has(nextStep.sourceLessonId)
                ? "same_group"
                : "other_lesson",
            }
          : undefined,
        hasRecentContext,
        hasGroupHistory: Boolean(groupHistory),
        isNewToGroup: Boolean(
          !groupHistory && lastLesson && joinedAt > lastLesson.startsAt,
        ),
      };
    })
    .sort((left, right) =>
      left.student.name.localeCompare(right.student.name, "pl", {
        sensitivity: "base",
      }),
    );

  const hasAnyRecentContext = members.some((member) => member.hasRecentContext);
  const attention = members
    .reduce<GroupContinuity["attention"]>((items, member) => {
      if (member.difficulty?.level === "hard") {
        items.push({ studentId: member.student.id, kind: "hard" });
        return items;
      }
      if (member.difficulty?.level === "mixed" && member.difficulty.note) {
        items.push({ studentId: member.student.id, kind: "mixed" });
        return items;
      }
      if (
        hasAnyRecentContext &&
        !member.hasRecentContext &&
        !member.isNewToGroup
      ) {
        items.push({
          studentId: member.student.id,
          kind: "missing_context",
        });
      }
      return items;
    }, [])
    .sort(
      (left, right) =>
        attentionRank(left.kind) - attentionRank(right.kind) ||
        (
          members.find((member) => member.student.id === left.studentId)
            ?.student.name ?? left.studentId
        ).localeCompare(
          members.find((member) => member.student.id === right.studentId)
            ?.student.name ?? right.studentId,
          "pl",
          { sensitivity: "base" },
        ) ||
        left.studentId.localeCompare(right.studentId),
    )
    .slice(0, GROUP_CONTINUITY_ATTENTION_LIMIT);

  const composedLessons = boundedLessons.map(composeLesson);
  return {
    group: {
      id: group.id,
      name: group.name,
      subject: optionalText(group.subject),
      level: optionalText(group.level),
      status: group.status,
    },
    nextLesson: nextLesson
      ? {
          id: nextLesson.id,
          startsAt: nextLesson.startsAt,
          topic: optionalText(nextLesson.topic),
          objective: optionalText(nextLesson.objective),
        }
      : undefined,
    lastLesson: composedLessons[0],
    members,
    attention,
    recentLessons: composedLessons,
    coverage: {
      members: members.length,
      withRecentContext: members.filter((member) => member.hasRecentContext)
        .length,
    },
    generatedAt,
  };
}

function composeLesson(
  lesson: GroupContinuityLessonSource,
): GroupContinuityLesson {
  const participants = new Set(lesson.participantIds);
  const present = new Set(
    lesson.attendances
      .filter(
        (attendance) =>
          participants.has(attendance.studentId) &&
          (attendance.status === "present" || attendance.status === "late"),
      )
      .map((attendance) => attendance.studentId),
  ).size;
  const withOutcome = new Set(
    lesson.outcomes
      .filter(
        (outcome) =>
          participants.has(outcome.studentId) && hasMeaningfulOutcome(outcome),
      )
      .map((outcome) => outcome.studentId),
  ).size;
  return {
    id: lesson.id,
    startsAt: lesson.startsAt,
    topic: optionalText(lesson.topic),
    objective: optionalText(lesson.objective),
    participantCount: participants.size,
    attendance: { present, participants: participants.size },
    outcomeCoverage: { withOutcome, participants: participants.size },
    homework: lesson.homework
      ? {
          title: lesson.homework.title,
          description: optionalText(lesson.homework.description),
          dueAt: optionalText(lesson.homework.dueAt),
        }
      : undefined,
  };
}

function attentionRank(kind: GroupContinuity["attention"][number]["kind"]) {
  return kind === "hard" ? 0 : kind === "mixed" ? 1 : 2;
}

function optionalText(value: string | null | undefined) {
  return value?.trim() || undefined;
}

function newestFirst(
  left: Pick<GroupContinuityLessonSource, "id" | "startsAt">,
  right: Pick<GroupContinuityLessonSource, "id" | "startsAt">,
) {
  return (
    right.startsAt.localeCompare(left.startsAt) ||
    right.id.localeCompare(left.id)
  );
}
