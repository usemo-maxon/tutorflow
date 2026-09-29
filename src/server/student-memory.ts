import "server-only";

import {
  buildStudentMemory,
  STUDENT_MEMORY_ATTENDANCE_LESSON_LIMIT,
  STUDENT_MEMORY_RECENT_LESSON_LIMIT,
  type StudentMemory,
  type StudentMemoryLessonSource,
} from "@/lib/student-memory";
import type {
  AttendanceStatus,
  LessonStatus,
  StudentOutcomeDifficulty,
} from "@/lib/domain";
import { localAllowed } from "./repository";
import * as local from "./store";
import { createSupabaseServerClient } from "./supabase";
import { ApiFailure } from "./errors";

type EmbeddedLesson = {
  id: string;
  starts_at: string;
  status: LessonStatus;
  title: string | null;
  subject: string | null;
};

export async function getStudentMemory(
  teacherId: string,
  studentId: string,
  generatedAt = new Date().toISOString(),
): Promise<StudentMemory> {
  if (localAllowed()) {
    return local.queryStore((store) => {
      const teacher = store.teachers.find((item) => item.id === teacherId);
      if (!teacher) unauthenticated();
      const student = store.students.find(
        (item) => item.teacherId === teacherId && item.id === studentId,
      );
      if (!student) notFound();
      const participantLessons = store.lessons.filter(
        (lesson) =>
          lesson.teacherId === teacherId &&
          lesson.participants.some(
            (participant) => participant.studentId === studentId,
          ),
      );
      const historical = participantLessons
        .filter((lesson) => lesson.status === "completed")
        .sort(newestLocalFirst)
        .slice(0, STUDENT_MEMORY_RECENT_LESSON_LIMIT)
        .map((lesson) => ({
          id: lesson.id,
          startsAt: lesson.startsAt,
          status: lesson.status,
          topic: lesson.topic,
          subject: lesson.subject,
          attendances: lesson.participants.map((participant) => ({
            studentId: participant.studentId,
            status: participant.attendanceStatus,
          })),
          outcomes: (store.lessonStudentOutcomes ?? [])
            .filter(
              (outcome) =>
                outcome.teacherId === teacherId &&
                outcome.lessonId === lesson.id,
            )
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
                dueAt: lesson.homeworkDueAt,
                status: "assigned" as const,
              }
            : undefined,
        }));
      const attendanceLessons = participantLessons
        .filter(
          (lesson) =>
            lesson.status === "completed" || lesson.status === "no_show",
        )
        .sort(newestLocalFirst)
        .slice(0, STUDENT_MEMORY_ATTENDANCE_LESSON_LIMIT)
        .map((lesson) => ({
          id: lesson.id,
          startsAt: lesson.startsAt,
          status: lesson.status,
          attendances: lesson.participants.map((participant) => ({
            studentId: participant.studentId,
            status: participant.attendanceStatus,
          })),
        }));
      const upcoming = participantLessons
        .filter(
          (lesson) =>
            lesson.startsAt > generatedAt && lesson.status !== "cancelled",
        )
        .sort(
          (left, right) =>
            left.startsAt.localeCompare(right.startsAt) ||
            left.id.localeCompare(right.id),
        )[0];
      return buildStudentMemory({
        student: {
          id: student.id,
          name: student.displayName || student.name,
          subject: student.subject,
          level: student.level,
          goal: student.goal,
          status: student.status,
        },
        historicalLessons: historical,
        attendanceLessons,
        upcomingLesson: upcoming
          ? {
              id: upcoming.id,
              startsAt: upcoming.startsAt,
              topic: upcoming.topic,
            }
          : undefined,
        generatedAt,
      });
    });
  }
  return getRelationalStudentMemory(teacherId, studentId, generatedAt);
}

async function getRelationalStudentMemory(
  teacherId: string,
  studentId: string,
  generatedAt: string,
): Promise<StudentMemory> {
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
  const studentResult = await supabase
    .from("students")
    .select("id,display_name,subject,level,goal,status")
    .eq("workspace_id", workspaceId)
    .eq("id", studentId)
    .maybeSingle();
  if (studentResult.error) databaseFailure(studentResult.error);
  if (!studentResult.data) notFound();

  const lessonSelection =
    "id,starts_at,status,title,subject,lesson_participants!inner(student_id)";
  const [historyResult, attendanceHistoryResult, upcomingResult] =
    await Promise.all([
      supabase
        .from("lessons")
        .select(lessonSelection)
        .eq("workspace_id", workspaceId)
        .eq("lesson_participants.student_id", studentId)
        .eq("status", "completed")
        .order("starts_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(STUDENT_MEMORY_RECENT_LESSON_LIMIT),
      supabase
        .from("lessons")
        .select(lessonSelection)
        .eq("workspace_id", workspaceId)
        .eq("lesson_participants.student_id", studentId)
        .in("status", ["completed", "no_show"])
        .order("starts_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(STUDENT_MEMORY_ATTENDANCE_LESSON_LIMIT),
      supabase
        .from("lessons")
        .select(lessonSelection)
        .eq("workspace_id", workspaceId)
        .eq("lesson_participants.student_id", studentId)
        .gt("starts_at", generatedAt)
        .neq("status", "cancelled")
        .order("starts_at")
        .order("id")
        .limit(1)
        .maybeSingle(),
    ]);
  const participationFailure = [
    historyResult,
    attendanceHistoryResult,
    upcomingResult,
  ].find((result) => result.error);
  if (participationFailure?.error) databaseFailure(participationFailure.error);

  const historicalLessons = (historyResult.data ??
    []) as unknown as EmbeddedLesson[];
  const attendanceLessons = (attendanceHistoryResult.data ??
    []) as unknown as EmbeddedLesson[];
  const historyIds = historicalLessons.map((lesson) => lesson.id);
  const attendanceIds = attendanceLessons.map((lesson) => lesson.id);
  const allAttendanceIds = [...new Set([...historyIds, ...attendanceIds])];

  const [outcomesResult, attendancesResult, homeworkResult] = await Promise.all(
    [
      historyIds.length
        ? supabase
            .from("lesson_student_outcomes")
            .select(
              "lesson_id,student_id,progress_summary,difficulty_level,difficulty_note,next_step",
            )
            .eq("workspace_id", workspaceId)
            .eq("student_id", studentId)
            .in("lesson_id", historyIds)
        : Promise.resolve({ data: [], error: null }),
      allAttendanceIds.length
        ? supabase
            .from("attendances")
            .select("lesson_id,student_id,status")
            .eq("workspace_id", workspaceId)
            .eq("student_id", studentId)
            .in("lesson_id", allAttendanceIds)
        : Promise.resolve({ data: [], error: null }),
      historyIds.length
        ? supabase
            .from("homeworks")
            .select("lesson_id,title,due_at,status")
            .eq("workspace_id", workspaceId)
            .in("lesson_id", historyIds)
        : Promise.resolve({ data: [], error: null }),
    ],
  );
  const detailFailure = [
    outcomesResult,
    attendancesResult,
    homeworkResult,
  ].find((result) => result.error);
  if (detailFailure?.error) databaseFailure(detailFailure.error);

  const sources = historicalLessons.map((lesson) =>
    relationalLessonSource(
      lesson,
      outcomesResult.data ?? [],
      attendancesResult.data ?? [],
      homeworkResult.data ?? [],
    ),
  );
  const attendanceSources = attendanceLessons.map((lesson) =>
    relationalLessonSource(lesson, [], attendancesResult.data ?? [], []),
  );
  const upcoming = upcomingResult.data as unknown as EmbeddedLesson | null;
  const student = studentResult.data;
  return buildStudentMemory({
    student: {
      id: student.id as string,
      name: student.display_name as string,
      subject: student.subject as string | null,
      level: student.level as string | null,
      goal: student.goal as string | null,
      status: student.status === "active" ? "active" : "archived",
    },
    historicalLessons: sources,
    attendanceLessons: attendanceSources,
    upcomingLesson: upcoming
      ? { id: upcoming.id, startsAt: upcoming.starts_at, topic: upcoming.title }
      : undefined,
    generatedAt,
  });
}

function relationalLessonSource(
  lesson: EmbeddedLesson,
  outcomes: Array<Record<string, unknown>>,
  attendances: Array<Record<string, unknown>>,
  homeworks: Array<Record<string, unknown>>,
): StudentMemoryLessonSource {
  const homework = homeworks.find((row) => row.lesson_id === lesson.id);
  return {
    id: lesson.id,
    startsAt: lesson.starts_at,
    status: lesson.status,
    topic: lesson.title,
    subject: lesson.subject,
    attendances: attendances
      .filter((row) => row.lesson_id === lesson.id)
      .map((row) => ({
        studentId: row.student_id as string,
        status: row.status as AttendanceStatus,
      })),
    outcomes: outcomes
      .filter((row) => row.lesson_id === lesson.id)
      .map((row) => ({
        studentId: row.student_id as string,
        progressSummary: row.progress_summary as string | null,
        difficultyLevel:
          row.difficulty_level as StudentOutcomeDifficulty | null,
        difficultyNote: row.difficulty_note as string | null,
        nextStep: row.next_step as string | null,
      })),
    homework: homework
      ? {
          title: homework.title as string,
          dueAt: homework.due_at as string | null,
          status: homework.status as "assigned" | "completed" | "cancelled",
        }
      : undefined,
  };
}

function newestLocalFirst(
  left: { startsAt: string; id: string },
  right: { startsAt: string; id: string },
) {
  return (
    right.startsAt.localeCompare(left.startsAt) ||
    right.id.localeCompare(left.id)
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
    code: "STUDENT_NOT_FOUND",
    message: "Nie znaleziono tego ucznia.",
  });
}
