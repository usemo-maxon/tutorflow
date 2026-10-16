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
import {
  isHomeworkOverdue,
  type HomeworkMaterial,
  type HomeworkStatus,
  type StudentHomeworkItem,
  type StudentHomeworkUpdate,
} from "@/lib/homework";

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
      const homeworkItems: StudentHomeworkItem[] = participantLessons
        .filter((lesson) => lesson.homework.trim())
        .flatMap((lesson) => {
          const recipient = (
            lesson.homeworkRecipients?.length
              ? lesson.homeworkRecipients
              : lesson.participantIds.map((id) => ({
                  studentId: id,
                  status: "assigned" as const,
                  feedback: undefined,
                  completedAt: undefined,
                  reviewedAt: undefined,
                  updatedAt: undefined,
                }))
          ).find((item) => item.studentId === studentId);
          if (!recipient) return [];
          const status = recipient.status;
          return [
            {
              id: `${lesson.id}:homework:${studentId}`,
              homeworkId: `${lesson.id}:homework`,
              studentId,
              studentName: student.displayName || student.name,
              status,
              feedback: recipient.feedback,
              completedAt: recipient.completedAt,
              reviewedAt: recipient.reviewedAt,
              updatedAt:
                recipient.updatedAt ?? lesson.updatedAt ?? lesson.createdAt,
              title: lesson.homeworkTitle?.trim() || "Praca domowa",
              description: lesson.homework,
              dueAt: lesson.homeworkDueAt,
              sourceLessonId: lesson.id,
              sourceLessonStartsAt: lesson.startsAt,
              sourceLessonTopic: lesson.topic,
              materials: (lesson.workspaceMaterials ?? [])
                .filter((material) =>
                  (lesson.homeworkMaterialIds ?? []).includes(material.id),
                )
                .map((material) => ({
                  id: material.id,
                  title: material.title,
                  type: material.type,
                  url: material.url,
                })),
              overdue: isHomeworkOverdue(
                lesson.homeworkDueAt,
                status,
                generatedAt,
              ),
            },
          ];
        })
        .sort(
          (left, right) =>
            right.sourceLessonStartsAt.localeCompare(
              left.sourceLessonStartsAt,
            ) || right.id.localeCompare(left.id),
        );
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
        homeworks: homeworkItems,
      });
    });
  }
  return getRelationalStudentMemory(teacherId, studentId, generatedAt);
}

export async function updateStudentHomework(
  teacherId: string,
  studentId: string,
  input: StudentHomeworkUpdate,
): Promise<StudentMemory> {
  const now = new Date().toISOString();
  if (localAllowed()) {
    await local.mutateStore((store) => {
      const teacher = store.teachers.find((item) => item.id === teacherId);
      if (!teacher) unauthenticated();
      if (teacher.subscription.readOnly) readOnly();
      const lesson = store.lessons.find(
        (item) =>
          item.teacherId === teacherId &&
          `${item.id}:homework` === input.homeworkId &&
          item.homework.trim(),
      );
      if (!lesson) notFound();
      const recipients =
        lesson.homeworkRecipients ??
        lesson.participantIds.map((id) => ({
          studentId: id,
          status: "assigned" as const,
          feedback: undefined,
          completedAt: undefined,
          reviewedAt: undefined,
          updatedAt: undefined,
        }));
      const recipient = recipients.find((item) => item.studentId === studentId);
      if (!recipient) notFound();
      recipient.status = input.status;
      recipient.feedback = input.feedback;
      recipient.completedAt = ["completed", "reviewed"].includes(input.status)
        ? now
        : undefined;
      recipient.reviewedAt = input.status === "reviewed" ? now : undefined;
      recipient.updatedAt = now;
      lesson.homeworkRecipients = recipients;
      lesson.updatedAt = now;
    });
    return getStudentMemory(teacherId, studentId, now);
  }

  const supabase = await createSupabaseServerClient();
  const [{ data: auth }, tutorResult, subscriptionResult] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("tutor_profiles")
      .select("workspace_id")
      .eq("user_id", teacherId)
      .maybeSingle(),
    supabase
      .from("subscriptions")
      .select("read_only")
      .eq("teacher_id", teacherId)
      .maybeSingle(),
  ]);
  if (auth.user?.id !== teacherId) unauthenticated();
  if (!tutorResult.data || !subscriptionResult.data) notFound();
  if (subscriptionResult.data.read_only) readOnly();
  const workspaceId = tutorResult.data.workspace_id as string;
  const { data: updated, error } = await supabase
    .from("homework_assignments")
    .update({
      status: input.status,
      feedback: input.feedback ?? null,
      completed_at: ["completed", "reviewed"].includes(input.status)
        ? now
        : null,
      reviewed_at: input.status === "reviewed" ? now : null,
    })
    .eq("workspace_id", workspaceId)
    .eq("homework_id", input.homeworkId)
    .eq("student_id", studentId)
    .select("id")
    .maybeSingle();
  if (error) databaseFailure(error);
  if (!updated) notFound();
  return getStudentMemory(teacherId, studentId, now);
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
  const [
    historyResult,
    attendanceHistoryResult,
    upcomingResult,
    homeworkAssignmentsResult,
  ] = await Promise.all([
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
    supabase
      .from("homework_assignments")
      .select(
        "id,homework_id,student_id,status,feedback,completed_at,reviewed_at,updated_at",
      )
      .eq("workspace_id", workspaceId)
      .eq("student_id", studentId)
      .order("updated_at", { ascending: false })
      .limit(100),
  ]);
  const participationFailure = [
    historyResult,
    attendanceHistoryResult,
    upcomingResult,
    homeworkAssignmentsResult,
  ].find((result) => result.error);
  if (participationFailure?.error) databaseFailure(participationFailure.error);

  const historicalLessons = (historyResult.data ??
    []) as unknown as EmbeddedLesson[];
  const attendanceLessons = (attendanceHistoryResult.data ??
    []) as unknown as EmbeddedLesson[];
  const historyIds = historicalLessons.map((lesson) => lesson.id);
  const attendanceIds = attendanceLessons.map((lesson) => lesson.id);
  const allAttendanceIds = [...new Set([...historyIds, ...attendanceIds])];
  const homeworkIds = (homeworkAssignmentsResult.data ?? []).map((row) =>
    String(row.homework_id),
  );

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

  const homeworkRowsResult = homeworkIds.length
    ? await supabase
        .from("homeworks")
        .select("id,lesson_id,title,description,due_at")
        .eq("workspace_id", workspaceId)
        .in("id", homeworkIds)
    : { data: [], error: null };
  if (homeworkRowsResult.error) databaseFailure(homeworkRowsResult.error);
  const homeworkLessonIds = (homeworkRowsResult.data ?? []).map((row) =>
    String(row.lesson_id),
  );
  const [homeworkLessonsResult, homeworkLinksResult] = await Promise.all([
    homeworkLessonIds.length
      ? supabase
          .from("lessons")
          .select("id,starts_at,title")
          .eq("workspace_id", workspaceId)
          .in("id", homeworkLessonIds)
      : Promise.resolve({ data: [], error: null }),
    homeworkIds.length
      ? supabase
          .from("homework_materials")
          .select("homework_id,material_id")
          .eq("workspace_id", workspaceId)
          .in("homework_id", homeworkIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (homeworkLessonsResult.error || homeworkLinksResult.error) {
    databaseFailure(homeworkLessonsResult.error ?? homeworkLinksResult.error);
  }
  const homeworkMaterialIds = [
    ...new Set(
      (homeworkLinksResult.data ?? []).map((row) => String(row.material_id)),
    ),
  ];
  const homeworkMaterialsResult = homeworkMaterialIds.length
    ? await supabase
        .from("materials")
        .select("id,title,type,external_url,archived_at")
        .eq("workspace_id", workspaceId)
        .in("id", homeworkMaterialIds)
    : { data: [], error: null };
  if (homeworkMaterialsResult.error)
    databaseFailure(homeworkMaterialsResult.error);

  const homeworkRows = new Map(
    (homeworkRowsResult.data ?? []).map((row) => [row.id as string, row]),
  );
  const homeworkLessons = new Map(
    (homeworkLessonsResult.data ?? []).map((row) => [row.id as string, row]),
  );
  const materialRows = new Map(
    (homeworkMaterialsResult.data ?? []).map((row) => [row.id as string, row]),
  );
  const studentHomework: StudentHomeworkItem[] = (
    homeworkAssignmentsResult.data ?? []
  )
    .flatMap((assignment) => {
      const homework = homeworkRows.get(assignment.homework_id as string);
      if (!homework) return [];
      const sourceLesson = homeworkLessons.get(homework.lesson_id as string);
      if (!sourceLesson) return [];
      const status = assignment.status as HomeworkStatus;
      const materials: HomeworkMaterial[] = (homeworkLinksResult.data ?? [])
        .filter((link) => link.homework_id === homework.id)
        .flatMap((link) => {
          const material = materialRows.get(link.material_id as string);
          return material
            ? [
                {
                  id: material.id as string,
                  title: material.title as string,
                  type: material.type as HomeworkMaterial["type"],
                  url:
                    material.type === "file"
                      ? `/api/materials/${material.id}/open`
                      : ((material.external_url as string | null) ?? undefined),
                  archived: Boolean(material.archived_at),
                },
              ]
            : [];
        });
      return [
        {
          id: assignment.id as string,
          homeworkId: homework.id as string,
          studentId,
          studentName: studentResult.data!.display_name as string,
          status,
          feedback: (assignment.feedback as string | null) ?? undefined,
          completedAt: (assignment.completed_at as string | null) ?? undefined,
          reviewedAt: (assignment.reviewed_at as string | null) ?? undefined,
          updatedAt: assignment.updated_at as string,
          title: homework.title as string,
          description: (homework.description as string | null) ?? "",
          dueAt: (homework.due_at as string | null) ?? undefined,
          sourceLessonId: sourceLesson.id as string,
          sourceLessonStartsAt: sourceLesson.starts_at as string,
          sourceLessonTopic: (sourceLesson.title as string | null) ?? undefined,
          materials,
          overdue: isHomeworkOverdue(
            (homework.due_at as string | null) ?? undefined,
            status,
            generatedAt,
          ),
        },
      ];
    })
    .sort(
      (left, right) =>
        right.sourceLessonStartsAt.localeCompare(left.sourceLessonStartsAt) ||
        right.id.localeCompare(left.id),
    );

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
    homeworks: studentHomework,
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

function readOnly(): never {
  throw new ApiFailure(403, {
    code: "READ_ONLY",
    message: "W trybie tylko do odczytu nie można zmieniać pracy domowej.",
  });
}
