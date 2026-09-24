import "server-only";

import type { LessonStatus } from "@/lib/domain";
import {
  EMPTY_GLOBAL_SEARCH_RESPONSE,
  GLOBAL_SEARCH_MAX_QUERY_LENGTH,
  GLOBAL_SEARCH_MIN_QUERY_LENGTH,
  globalSearchMatchRank,
  normalizeGlobalSearch,
  type GlobalGroupSearchResult,
  type GlobalLessonSearchResult,
  type GlobalSearchResponse,
  type GlobalStudentSearchResult,
} from "@/lib/global-search";
import { isSupabaseConfigured } from "@/server/env";
import { ApiFailure } from "@/server/errors";
import { createSupabaseServerClient } from "@/server/supabase";
import * as local from "@/server/store";
import type { StoreShape } from "@/server/store";

export const GLOBAL_SEARCH_LIMITS = {
  students: 6,
  groups: 4,
  lessons: 6,
} as const;

export const GLOBAL_SEARCH_LESSON_WINDOW = {
  pastDays: 90,
  futureDays: 180,
} as const;

interface StudentCandidate {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
  phone: string;
  subject: string;
  level: string;
  status: "active" | "archived";
}

interface GroupCandidate {
  id: string;
  name: string;
  subject: string;
  level: string;
  status: "active" | "archived";
}

interface LessonCandidate {
  id: string;
  groupId?: string;
  studentIds: string[];
  startsAt: string;
  topic: string;
  subject: string;
  status: LessonStatus;
}

interface ProductionStudentRow {
  id: string;
  first_name: string;
  last_name: string;
  display_name: string;
  email: string | null;
  phone: string | null;
  subject: string | null;
  level: string | null;
  status: "active" | "inactive" | "archived";
}

interface ProductionGroupRow {
  id: string;
  name: string;
  subject: string | null;
  level: string | null;
  status: "active" | "inactive" | "archived";
}

interface ProductionLessonRow {
  id: string;
  student_id: string | null;
  group_id: string | null;
  starts_at: string;
  title: string;
  subject: string | null;
  status: LessonStatus;
}

const localAllowed = () =>
  process.env.NODE_ENV !== "production" &&
  (Boolean(process.env.TUTORFLOW_DATA_DIR) || !isSupabaseConfigured());

function lessonWindow(now: Date) {
  return {
    start: new Date(
      now.getTime() - GLOBAL_SEARCH_LESSON_WINDOW.pastDays * 86_400_000,
    ).toISOString(),
    end: new Date(
      now.getTime() + GLOBAL_SEARCH_LESSON_WINDOW.futureDays * 86_400_000,
    ).toISOString(),
  };
}

function studentName(student: StudentCandidate) {
  return (
    student.displayName.trim() ||
    `${student.firstName} ${student.lastName}`.trim()
  );
}

function studentRank(query: string, student: StudentCandidate) {
  return globalSearchMatchRank(query, studentName(student), [
    student.firstName,
    student.lastName,
    student.email,
    student.phone,
    student.subject,
    student.level,
  ]);
}

function groupRank(query: string, group: GroupCandidate) {
  return globalSearchMatchRank(query, group.name, [group.subject, group.level]);
}

function lessonParticipantLabel(
  lesson: LessonCandidate,
  students: Map<string, StudentCandidate>,
  groups: Map<string, GroupCandidate>,
) {
  if (lesson.groupId) return groups.get(lesson.groupId)?.name ?? "Grupa";
  const labels = lesson.studentIds
    .map((id) => students.get(id))
    .filter((student): student is StudentCandidate => Boolean(student))
    .map(studentName);
  return labels.join(", ") || "Lekcja";
}

function lessonPriority(lesson: LessonCandidate, now: Date) {
  const startsAt = Date.parse(lesson.startsAt);
  if (lesson.status === "scheduled" && startsAt >= now.getTime()) return 0;
  if (startsAt < now.getTime()) return 1;
  return 2;
}

function assembleSearchResponse(
  query: string,
  studentCandidates: StudentCandidate[],
  groupCandidates: GroupCandidate[],
  lessonCandidates: LessonCandidate[],
  now: Date,
): GlobalSearchResponse {
  const studentsById = new Map(
    studentCandidates.map((student) => [student.id, student]),
  );
  const groupsById = new Map(groupCandidates.map((group) => [group.id, group]));

  const students = studentCandidates
    .map((student) => ({ student, rank: studentRank(query, student) }))
    .filter(({ rank }) => Number.isFinite(rank))
    .sort(
      (left, right) =>
        left.rank - right.rank ||
        Number(left.student.status !== "active") -
          Number(right.student.status !== "active") ||
        studentName(left.student).localeCompare(
          studentName(right.student),
          "pl",
        ),
    )
    .slice(0, GLOBAL_SEARCH_LIMITS.students)
    .map(({ student }): GlobalStudentSearchResult => ({
      type: "student",
      id: student.id,
      name: studentName(student),
      subject: student.subject || undefined,
      level: student.level || undefined,
      status: student.status,
      href: `/app/uczniowie/${student.id}`,
    }));

  const groups = groupCandidates
    .map((group) => ({ group, rank: groupRank(query, group) }))
    .filter(({ rank }) => Number.isFinite(rank))
    .sort(
      (left, right) =>
        left.rank - right.rank ||
        Number(left.group.status !== "active") -
          Number(right.group.status !== "active") ||
        left.group.name.localeCompare(right.group.name, "pl"),
    )
    .slice(0, GLOBAL_SEARCH_LIMITS.groups)
    .map(({ group }): GlobalGroupSearchResult => ({
      type: "group",
      id: group.id,
      name: group.name,
      subject: group.subject || undefined,
      level: group.level || undefined,
      status: group.status,
      href: `/app/uczniowie/grupy/${group.id}`,
    }));

  const lessons = lessonCandidates
    .filter((lesson) => lesson.status !== "cancelled")
    .map((lesson) => {
      const participantLabel = lessonParticipantLabel(
        lesson,
        studentsById,
        groupsById,
      );
      return {
        lesson,
        participantLabel,
        rank: globalSearchMatchRank(query, participantLabel, [
          lesson.topic,
          lesson.subject,
        ]),
      };
    })
    .filter(({ rank }) => Number.isFinite(rank))
    .sort(
      (left, right) =>
        lessonPriority(left.lesson, now) - lessonPriority(right.lesson, now) ||
        left.rank - right.rank ||
        (left.lesson.startsAt >= now.toISOString()
          ? left.lesson.startsAt.localeCompare(right.lesson.startsAt)
          : right.lesson.startsAt.localeCompare(left.lesson.startsAt)),
    )
    .slice(0, GLOBAL_SEARCH_LIMITS.lessons)
    .map(({ lesson, participantLabel }): GlobalLessonSearchResult => ({
      type: "lesson",
      id: lesson.id,
      participantLabel,
      topic: lesson.topic || undefined,
      subject: lesson.subject || undefined,
      startsAt: lesson.startsAt,
      status: lesson.status,
      href: `/app/lekcje/${lesson.id}`,
    }));

  return { students, groups, lessons };
}

export function searchGlobalStore(
  store: StoreShape,
  teacherId: string,
  query: string,
  now = new Date(),
): GlobalSearchResponse {
  const normalizedQuery = normalizeGlobalSearch(query);
  if (normalizedQuery.length < GLOBAL_SEARCH_MIN_QUERY_LENGTH)
    return EMPTY_GLOBAL_SEARCH_RESPONSE;
  const window = lessonWindow(now);
  const students: StudentCandidate[] = store.students
    .filter((student) => student.teacherId === teacherId)
    .map((student) => ({
      id: student.id,
      firstName: student.firstName,
      lastName: student.lastName,
      displayName: student.displayName,
      email: student.email,
      phone: student.phone,
      subject: student.subject,
      level: student.level,
      status: student.status,
    }));
  const groups: GroupCandidate[] = (store.groups ?? [])
    .filter((group) => group.teacherId === teacherId)
    .map((group) => ({
      id: group.id,
      name: group.name,
      subject: group.subject,
      level: group.level,
      status: group.status,
    }));
  const lessons: LessonCandidate[] = store.lessons
    .filter(
      (lesson) =>
        lesson.teacherId === teacherId &&
        lesson.startsAt >= window.start &&
        lesson.startsAt <= window.end &&
        lesson.status !== "cancelled",
    )
    .map((lesson) => ({
      id: lesson.id,
      groupId: lesson.groupId,
      studentIds: lesson.participantIds,
      startsAt: lesson.startsAt,
      topic: lesson.topic,
      subject: lesson.subject ?? "",
      status: lesson.status,
    }));
  return assembleSearchResponse(
    normalizedQuery,
    students,
    groups,
    lessons,
    now,
  );
}

function escapeLikeText(value: string) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

async function searchProduction(
  teacherId: string,
  query: string,
  now: Date,
): Promise<GlobalSearchResponse> {
  const supabase = await createSupabaseServerClient();
  const [{ data: authData, error: authError }, tutorResult] = await Promise.all(
    [
      supabase.auth.getUser(),
      supabase
        .from("tutor_profiles")
        .select("workspace_id")
        .eq("user_id", teacherId)
        .single(),
    ],
  );
  if (authError || authData.user?.id !== teacherId) {
    throw new ApiFailure(401, {
      code: "UNAUTHENTICATED",
      message: "Sesja wygasła. Zaloguj się ponownie.",
    });
  }
  if (tutorResult.error) throw tutorResult.error;
  const workspaceId = tutorResult.data.workspace_id as string;
  const window = lessonWindow(now);
  const pattern = `%${escapeLikeText(query.trim())}%`;

  const studentQuery = supabase
    .from("students")
    .select(
      "id,first_name,last_name,display_name,email,phone,subject,level,status",
    )
    .eq("workspace_id", workspaceId)
    .order("status")
    .order("display_name")
    .limit(80);
  const groupQuery = supabase
    .from("groups")
    .select("id,name,subject,level,status")
    .eq("workspace_id", workspaceId)
    .order("status")
    .order("name")
    .limit(40);
  const lessonTitleQuery = supabase
    .from("lessons")
    .select("id,student_id,group_id,starts_at,title,subject,status")
    .eq("workspace_id", workspaceId)
    .eq("tutor_id", teacherId)
    .gte("starts_at", window.start)
    .lte("starts_at", window.end)
    .neq("status", "cancelled")
    .ilike("title", pattern)
    .limit(24);
  const lessonSubjectQuery = supabase
    .from("lessons")
    .select("id,student_id,group_id,starts_at,title,subject,status")
    .eq("workspace_id", workspaceId)
    .eq("tutor_id", teacherId)
    .gte("starts_at", window.start)
    .lte("starts_at", window.end)
    .neq("status", "cancelled")
    .ilike("subject", pattern)
    .limit(24);

  const [studentResult, groupResult, titleResult, subjectResult] =
    await Promise.all([
      studentQuery,
      groupQuery,
      lessonTitleQuery,
      lessonSubjectQuery,
    ]);
  const failure = [studentResult, groupResult, titleResult, subjectResult].find(
    (result) => result.error,
  );
  if (failure?.error) throw failure.error;

  const students: StudentCandidate[] = (
    (studentResult.data ?? []) as ProductionStudentRow[]
  ).map((student) => ({
    id: student.id,
    firstName: student.first_name,
    lastName: student.last_name,
    displayName: student.display_name,
    email: student.email ?? "",
    phone: student.phone ?? "",
    subject: student.subject ?? "",
    level: student.level ?? "",
    status: student.status === "active" ? "active" : "archived",
  }));
  const groups: GroupCandidate[] = (
    (groupResult.data ?? []) as ProductionGroupRow[]
  ).map((group) => ({
    id: group.id,
    name: group.name,
    subject: group.subject ?? "",
    level: group.level ?? "",
    status: group.status === "active" ? "active" : "archived",
  }));

  const matchingStudentIds = students
    .filter((student) => Number.isFinite(studentRank(query, student)))
    .slice(0, 24)
    .map((student) => student.id);
  const matchingGroupIds = groups
    .filter((group) => Number.isFinite(groupRank(query, group)))
    .slice(0, 16)
    .map((group) => group.id);
  const participantQueries = [];
  if (matchingStudentIds.length) {
    participantQueries.push(
      supabase
        .from("lessons")
        .select("id,student_id,group_id,starts_at,title,subject,status")
        .eq("workspace_id", workspaceId)
        .eq("tutor_id", teacherId)
        .gte("starts_at", window.start)
        .lte("starts_at", window.end)
        .neq("status", "cancelled")
        .in("student_id", matchingStudentIds)
        .limit(30),
    );
  }
  if (matchingGroupIds.length) {
    participantQueries.push(
      supabase
        .from("lessons")
        .select("id,student_id,group_id,starts_at,title,subject,status")
        .eq("workspace_id", workspaceId)
        .eq("tutor_id", teacherId)
        .gte("starts_at", window.start)
        .lte("starts_at", window.end)
        .neq("status", "cancelled")
        .in("group_id", matchingGroupIds)
        .limit(30),
    );
  }
  const participantResults = await Promise.all(participantQueries);
  const participantFailure = participantResults.find((result) => result.error);
  if (participantFailure?.error) throw participantFailure.error;

  const lessonRows = [
    ...((titleResult.data ?? []) as ProductionLessonRow[]),
    ...((subjectResult.data ?? []) as ProductionLessonRow[]),
    ...participantResults.flatMap(
      (result) => (result.data ?? []) as ProductionLessonRow[],
    ),
  ];
  const lessonsById = new Map<string, LessonCandidate>();
  for (const lesson of lessonRows) {
    lessonsById.set(lesson.id, {
      id: lesson.id,
      groupId: lesson.group_id ?? undefined,
      studentIds: lesson.student_id ? [lesson.student_id] : [],
      startsAt: lesson.starts_at,
      topic: lesson.title,
      subject: lesson.subject ?? "",
      status: lesson.status,
    });
  }
  return assembleSearchResponse(
    query,
    students,
    groups,
    [...lessonsById.values()],
    now,
  );
}

export async function searchGlobal(
  teacherId: string,
  query: string,
  now = new Date(),
): Promise<GlobalSearchResponse> {
  const normalizedQuery = normalizeGlobalSearch(query);
  if (normalizedQuery.length < GLOBAL_SEARCH_MIN_QUERY_LENGTH)
    return EMPTY_GLOBAL_SEARCH_RESPONSE;
  if (query.trim().length > GLOBAL_SEARCH_MAX_QUERY_LENGTH) {
    throw new ApiFailure(422, {
      code: "INVALID_SEARCH_QUERY",
      message: "Wyszukiwana fraza jest zbyt długa.",
    });
  }
  if (localAllowed()) {
    return local.queryStore((store) =>
      searchGlobalStore(store, teacherId, normalizedQuery, now),
    );
  }
  return searchProduction(teacherId, normalizedQuery, now);
}
