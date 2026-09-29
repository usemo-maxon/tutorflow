import "server-only";

import {
  buildGroupContinuity,
  GROUP_CONTINUITY_MEMORY_QUERY_MULTIPLIER,
  GROUP_CONTINUITY_RECENT_LESSON_LIMIT,
  type GroupContinuity,
  type GroupContinuityLessonSource,
} from "@/lib/group-continuity";
import {
  buildStudentMemory,
  STUDENT_MEMORY_RECENT_LESSON_LIMIT,
  type StudentMemory,
  type StudentMemoryLessonSource,
} from "@/lib/student-memory";
import type {
  AttendanceStatus,
  LessonStatus,
  StudentOutcomeDifficulty,
} from "@/lib/domain";
import { ApiFailure } from "./errors";
import { localAllowed } from "./repository";
import * as local from "./store";
import { createSupabaseServerClient } from "./supabase";

type LessonRow = {
  id: string;
  starts_at: string;
  title: string | null;
  subject?: string | null;
  status?: LessonStatus;
  lesson_participants?: Array<{ student_id: string }>;
};

type OutcomeRow = {
  lesson_id: string;
  student_id: string;
  progress_summary: string | null;
  difficulty_level: StudentOutcomeDifficulty | null;
  difficulty_note: string | null;
  next_step: string | null;
};

type AttendanceRow = {
  lesson_id: string;
  student_id: string;
  status: AttendanceStatus;
};

type HomeworkRow = {
  lesson_id: string;
  title: string;
  description: string | null;
  due_at: string | null;
};

export async function getGroupContinuity(
  teacherId: string,
  groupId: string,
  generatedAt = new Date().toISOString(),
): Promise<GroupContinuity> {
  if (localAllowed()) {
    return local.queryStore((store) => {
      const teacher = store.teachers.find((item) => item.id === teacherId);
      if (!teacher) unauthenticated();
      const group = store.groups.find(
        (item) => item.teacherId === teacherId && item.id === groupId,
      );
      if (!group) notFound();
      const currentMemberships = group.members.filter(
        (member) => member.status === "active" && !member.leftAt,
      );
      const currentMembers = currentMemberships.flatMap((membership) => {
        const student = store.students.find(
          (item) =>
            item.teacherId === teacherId && item.id === membership.studentId,
        );
        return student
          ? [
              {
                student: {
                  id: student.id,
                  name: student.displayName || student.name,
                  subject: student.subject,
                  level: student.level,
                  goal: student.goal,
                  status: student.status,
                },
                joinedAt: membership.joinedAt,
              },
            ]
          : [];
      });
      const completedGroupLessons = store.lessons
        .filter(
          (lesson) =>
            lesson.teacherId === teacherId &&
            lesson.groupId === groupId &&
            lesson.status === "completed",
        )
        .sort(newestLocalFirst)
        .slice(0, GROUP_CONTINUITY_RECENT_LESSON_LIMIT);
      const next = store.lessons
        .filter(
          (lesson) =>
            lesson.teacherId === teacherId &&
            lesson.groupId === groupId &&
            lesson.startsAt > generatedAt &&
            lesson.status !== "cancelled",
        )
        .sort(oldestLocalFirst)[0];
      const outcomes = (store.lessonStudentOutcomes ?? []).filter(
        (outcome) => outcome.teacherId === teacherId,
      );
      const recentLessons = completedGroupLessons.map(
        (lesson): GroupContinuityLessonSource => ({
          id: lesson.id,
          startsAt: lesson.startsAt,
          topic: lesson.topic,
          objective: lesson.planObjectives,
          participantIds: lesson.participants.map(
            (participant) => participant.studentId,
          ),
          attendances: lesson.participants.map((participant) => ({
            studentId: participant.studentId,
            status: participant.attendanceStatus,
          })),
          outcomes: outcomes
            .filter((outcome) => outcome.lessonId === lesson.id)
            .map((outcome) => ({
              studentId: outcome.studentId,
              progressSummary: outcome.progressSummary,
              difficultyLevel: outcome.difficultyLevel,
              difficultyNote: outcome.difficultyNote,
              nextStep: outcome.nextStep,
            })),
          homework: lesson.homework.trim()
            ? {
                title: lesson.homeworkTitle?.trim() || "Praca domowa",
                description: lesson.homework,
                dueAt: lesson.homeworkDueAt,
              }
            : undefined,
        }),
      );
      const memberMemories = currentMembers.map(({ student }) => {
        const history = store.lessons
          .filter(
            (lesson) =>
              lesson.teacherId === teacherId &&
              lesson.status === "completed" &&
              lesson.participants.some(
                (participant) => participant.studentId === student.id,
              ),
          )
          .sort(newestLocalFirst)
          .slice(0, STUDENT_MEMORY_RECENT_LESSON_LIMIT)
          .map((lesson): StudentMemoryLessonSource => ({
            id: lesson.id,
            startsAt: lesson.startsAt,
            status: lesson.status,
            topic: lesson.topic,
            subject: lesson.subject,
            outcomes: outcomes
              .filter(
                (outcome) =>
                  outcome.lessonId === lesson.id &&
                  outcome.studentId === student.id,
              )
              .map((outcome) => ({
                studentId: outcome.studentId,
                progressSummary: outcome.progressSummary,
                difficultyLevel: outcome.difficultyLevel,
                difficultyNote: outcome.difficultyNote,
                nextStep: outcome.nextStep,
              })),
          }));
        return buildStudentMemory({
          student,
          historicalLessons: history,
          attendanceLessons: [],
          generatedAt,
        });
      });
      return buildGroupContinuity({
        group,
        currentMembers,
        nextLesson: next
          ? {
              id: next.id,
              startsAt: next.startsAt,
              topic: next.topic,
              objective: next.planObjectives,
            }
          : undefined,
        recentLessons,
        memberMemories,
        generatedAt,
      });
    });
  }
  return getRelationalGroupContinuity(teacherId, groupId, generatedAt);
}

async function getRelationalGroupContinuity(
  teacherId: string,
  groupId: string,
  generatedAt: string,
): Promise<GroupContinuity> {
  const supabase = await createSupabaseServerClient();
  const [{ data: auth }, tutorResult] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("tutor_profiles")
      .select("workspace_id")
      .eq("user_id", teacherId)
      .maybeSingle(),
  ]);
  if (auth.user?.id !== teacherId) unauthenticated();
  if (tutorResult.error || !tutorResult.data) notFound();
  const workspaceId = tutorResult.data.workspace_id as string;

  const groupResult = await supabase
    .from("groups")
    .select("id,name,subject,level,status")
    .eq("workspace_id", workspaceId)
    .eq("id", groupId)
    .maybeSingle();
  if (groupResult.error) databaseFailure(groupResult.error);
  if (!groupResult.data) notFound();

  const [membershipsResult, historyResult, nextResult] = await Promise.all([
    supabase
      .from("group_members")
      .select("student_id,joined_at")
      .eq("workspace_id", workspaceId)
      .eq("group_id", groupId)
      .eq("status", "active")
      .is("left_at", null)
      .order("joined_at"),
    supabase
      .from("lessons")
      .select("id,starts_at,title,subject,status")
      .eq("workspace_id", workspaceId)
      .eq("group_id", groupId)
      .eq("status", "completed")
      .order("starts_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(GROUP_CONTINUITY_RECENT_LESSON_LIMIT),
    supabase
      .from("lessons")
      .select("id,starts_at,title,subject,status")
      .eq("workspace_id", workspaceId)
      .eq("group_id", groupId)
      .gt("starts_at", generatedAt)
      .neq("status", "cancelled")
      .order("starts_at")
      .order("id")
      .limit(1)
      .maybeSingle(),
  ]);
  const coreFailure = [membershipsResult, historyResult, nextResult].find(
    (result) => result.error,
  );
  if (coreFailure?.error) databaseFailure(coreFailure.error);

  const memberships = membershipsResult.data ?? [];
  const memberIds = memberships.map((row) => row.student_id as string);
  const groupLessons = (historyResult.data ?? []) as LessonRow[];
  const nextLesson = nextResult.data as LessonRow | null;
  const groupLessonIds = groupLessons.map((lesson) => lesson.id);
  const objectiveLessonIds = [
    ...groupLessonIds,
    ...(nextLesson ? [nextLesson.id] : []),
  ];

  const [
    studentsResult,
    participantsResult,
    outcomesResult,
    attendanceResult,
    homeworkResult,
    objectiveResult,
    memoryLessonsResult,
  ] = await Promise.all([
    memberIds.length
      ? supabase
          .from("students")
          .select("id,display_name,level,status,subject,goal")
          .eq("workspace_id", workspaceId)
          .in("id", memberIds)
      : Promise.resolve({ data: [], error: null }),
    groupLessonIds.length
      ? supabase
          .from("lesson_participants")
          .select("lesson_id,student_id")
          .eq("workspace_id", workspaceId)
          .in("lesson_id", groupLessonIds)
      : Promise.resolve({ data: [], error: null }),
    groupLessonIds.length
      ? supabase
          .from("lesson_student_outcomes")
          .select(
            "lesson_id,student_id,progress_summary,difficulty_level,difficulty_note,next_step",
          )
          .eq("workspace_id", workspaceId)
          .in("lesson_id", groupLessonIds)
      : Promise.resolve({ data: [], error: null }),
    groupLessonIds.length
      ? supabase
          .from("attendances")
          .select("lesson_id,student_id,status")
          .eq("workspace_id", workspaceId)
          .in("lesson_id", groupLessonIds)
      : Promise.resolve({ data: [], error: null }),
    groupLessonIds.length
      ? supabase
          .from("homeworks")
          .select("lesson_id,title,description,due_at")
          .eq("workspace_id", workspaceId)
          .in("lesson_id", groupLessonIds)
          .neq("status", "cancelled")
      : Promise.resolve({ data: [], error: null }),
    objectiveLessonIds.length
      ? supabase
          .from("lesson_notes")
          .select("lesson_id,content")
          .eq("workspace_id", workspaceId)
          .eq("note_type", "objectives")
          .in("lesson_id", objectiveLessonIds)
      : Promise.resolve({ data: [], error: null }),
    memberIds.length
      ? supabase
          .from("lessons")
          .select(
            "id,starts_at,title,subject,status,lesson_participants!inner(student_id)",
          )
          .eq("workspace_id", workspaceId)
          .eq("status", "completed")
          .in("lesson_participants.student_id", memberIds)
          .order("starts_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(
            Math.max(
              20,
              memberIds.length *
                STUDENT_MEMORY_RECENT_LESSON_LIMIT *
                GROUP_CONTINUITY_MEMORY_QUERY_MULTIPLIER,
            ),
          )
      : Promise.resolve({ data: [], error: null }),
  ]);
  const detailFailure = [
    studentsResult,
    participantsResult,
    outcomesResult,
    attendanceResult,
    homeworkResult,
    objectiveResult,
    memoryLessonsResult,
  ].find((result) => result.error);
  if (detailFailure?.error) databaseFailure(detailFailure.error);

  const memoryLessons = (memoryLessonsResult.data ??
    []) as unknown as LessonRow[];
  const memoryLessonIds = memoryLessons.map((lesson) => lesson.id);
  const memoryOutcomesResult =
    memoryLessonIds.length && memberIds.length
      ? await supabase
          .from("lesson_student_outcomes")
          .select(
            "lesson_id,student_id,progress_summary,difficulty_level,difficulty_note,next_step",
          )
          .eq("workspace_id", workspaceId)
          .in("lesson_id", memoryLessonIds)
          .in("student_id", memberIds)
      : { data: [], error: null };
  if (memoryOutcomesResult.error) databaseFailure(memoryOutcomesResult.error);

  const students = new Map(
    (studentsResult.data ?? []).map((student) => [
      student.id as string,
      student,
    ]),
  );
  const objectives = new Map(
    (objectiveResult.data ?? []).map((row) => [
      row.lesson_id as string,
      row.content as string,
    ]),
  );
  const participantRows = participantsResult.data ?? [];
  const groupOutcomes = (outcomesResult.data ?? []) as OutcomeRow[];
  const attendances = (attendanceResult.data ?? []) as AttendanceRow[];
  const homeworks = (homeworkResult.data ?? []) as HomeworkRow[];
  const recentLessons: GroupContinuityLessonSource[] = groupLessons.map(
    (lesson) => ({
      id: lesson.id,
      startsAt: lesson.starts_at,
      topic: lesson.title,
      objective: objectives.get(lesson.id),
      participantIds: participantRows
        .filter((row) => row.lesson_id === lesson.id)
        .map((row) => row.student_id as string),
      attendances: attendances
        .filter((row) => row.lesson_id === lesson.id)
        .map((row) => ({ studentId: row.student_id, status: row.status })),
      outcomes: groupOutcomes
        .filter((row) => row.lesson_id === lesson.id)
        .map(toOutcomeSource),
      homework: (() => {
        const homework = homeworks.find((row) => row.lesson_id === lesson.id);
        return homework
          ? {
              title: homework.title,
              description: homework.description,
              dueAt: homework.due_at,
            }
          : undefined;
      })(),
    }),
  );

  const memoryOutcomes = (memoryOutcomesResult.data ?? []) as OutcomeRow[];
  const memberMemories: StudentMemory[] = memberIds.flatMap((studentId) => {
    const student = students.get(studentId);
    if (!student) return [];
    const history: StudentMemoryLessonSource[] = memoryLessons
      .filter((lesson) =>
        lesson.lesson_participants?.some(
          (participant) => participant.student_id === studentId,
        ),
      )
      .slice(0, STUDENT_MEMORY_RECENT_LESSON_LIMIT)
      .map((lesson) => ({
        id: lesson.id,
        startsAt: lesson.starts_at,
        status: "completed",
        topic: lesson.title,
        subject: lesson.subject,
        outcomes: memoryOutcomes
          .filter(
            (outcome) =>
              outcome.lesson_id === lesson.id &&
              outcome.student_id === studentId,
          )
          .map(toOutcomeSource),
      }));
    return [
      buildStudentMemory({
        student: {
          id: studentId,
          name: student.display_name as string,
          level: student.level as string | null,
          subject: student.subject as string | null,
          goal: student.goal as string | null,
          status: student.status === "active" ? "active" : "archived",
        },
        historicalLessons: history,
        attendanceLessons: [],
        generatedAt,
      }),
    ];
  });
  const currentMembers = memberships.flatMap((membership) => {
    const student = students.get(membership.student_id as string);
    return student
      ? [
          {
            student: {
              id: student.id as string,
              name: student.display_name as string,
              level: student.level as string | null,
            },
            joinedAt: membership.joined_at as string,
          },
        ]
      : [];
  });
  const group = groupResult.data;
  return buildGroupContinuity({
    group: {
      id: group.id,
      name: group.name,
      subject: group.subject,
      level: group.level,
      status: group.status === "active" ? "active" : "archived",
    },
    currentMembers,
    nextLesson: nextLesson
      ? {
          id: nextLesson.id,
          startsAt: nextLesson.starts_at,
          topic: nextLesson.title,
          objective: objectives.get(nextLesson.id),
        }
      : undefined,
    recentLessons,
    memberMemories,
    generatedAt,
  });
}

function toOutcomeSource(row: OutcomeRow) {
  return {
    studentId: row.student_id,
    progressSummary: row.progress_summary,
    difficultyLevel: row.difficulty_level,
    difficultyNote: row.difficulty_note,
    nextStep: row.next_step,
  };
}

function newestLocalFirst(
  left: { id: string; startsAt: string },
  right: { id: string; startsAt: string },
) {
  return (
    right.startsAt.localeCompare(left.startsAt) ||
    right.id.localeCompare(left.id)
  );
}

function oldestLocalFirst(
  left: { id: string; startsAt: string },
  right: { id: string; startsAt: string },
) {
  return (
    left.startsAt.localeCompare(right.startsAt) ||
    left.id.localeCompare(right.id)
  );
}

function databaseFailure(error: unknown): never {
  throw error;
}

function unauthenticated(): never {
  throw new ApiFailure(401, {
    code: "UNAUTHENTICATED",
    message: "Sesja wygasła. Zaloguj się ponownie.",
  });
}

function notFound(): never {
  throw new ApiFailure(404, {
    code: "GROUP_NOT_FOUND",
    message: "Nie znaleziono tej grupy.",
  });
}
