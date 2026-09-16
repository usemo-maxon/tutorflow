import "server-only";

import type { Lesson, Student } from "@/lib/domain";
import {
  dashboardRanges,
  dashboardSourceFromAppData,
  type DashboardLessonSource,
  type DashboardSource,
} from "./dashboard";
import { createSupabaseServerClient } from "./supabase";
import { getAppData, localAllowed } from "./repository";

interface DashboardLessonRow {
  id: string;
  group_id: string | null;
  student_id: string | null;
  starts_at: string;
  ends_at: string;
  status: Lesson["status"];
  subject: string | null;
  title: string;
  format: Lesson["format"];
  meeting_url: string | null;
  sync_status: Lesson["syncStatus"];
}

export async function queryTodayDashboardSource(
  teacherId: string,
  now = new Date(),
): Promise<DashboardSource> {
  if (localAllowed()) {
    return dashboardSourceFromAppData(await getAppData(teacherId), now);
  }

  const supabase = await createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || authData.user?.id !== teacherId) {
    throw new Error("UNAUTHENTICATED");
  }

  const [profileResult, tutorResult, subscriptionResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name,timezone")
      .eq("id", teacherId)
      .single(),
    supabase
      .from("tutor_profiles")
      .select("workspace_id,display_name,timezone")
      .eq("user_id", teacherId)
      .single(),
    supabase
      .from("subscriptions")
      .select("read_only")
      .eq("teacher_id", teacherId)
      .single(),
  ]);
  const contextFailure = [profileResult, tutorResult, subscriptionResult].find(
    (result) => result.error,
  );
  if (contextFailure?.error) throw contextFailure.error;

  const workspaceId = tutorResult.data!.workspace_id as string;
  const timezone =
    (tutorResult.data!.timezone as string | null) ||
    (profileResult.data!.timezone as string);
  const ranges = dashboardRanges(now, timezone);
  const lessonColumns =
    "id,group_id,student_id,starts_at,ends_at,status,subject,title,format,meeting_url,sync_status";

  const [
    studentsResult,
    todayResult,
    upcomingResult,
    unfinishedResult,
    syncResult,
    monthResult,
    packagesResult,
    balancesResult,
  ] = await Promise.all([
    supabase
      .from("students")
      .select("id,display_name,subject,level,status")
      .eq("workspace_id", workspaceId)
      .order("display_name")
      .limit(1000),
    supabase
      .from("lessons")
      .select(lessonColumns)
      .eq("workspace_id", workspaceId)
      .gte("starts_at", ranges.todayStart)
      .lt("starts_at", ranges.todayEnd)
      .neq("status", "cancelled")
      .order("starts_at"),
    supabase
      .from("lessons")
      .select(lessonColumns)
      .eq("workspace_id", workspaceId)
      .gte("starts_at", ranges.todayEnd)
      .lt("starts_at", ranges.upcomingEnd)
      .neq("status", "cancelled")
      .order("starts_at")
      .limit(7),
    supabase
      .from("lessons")
      .select(lessonColumns)
      .eq("workspace_id", workspaceId)
      .eq("status", "needs_completion")
      .gte("starts_at", ranges.attentionStart)
      .lt("ends_at", now.toISOString())
      .order("starts_at")
      .limit(50),
    supabase
      .from("lessons")
      .select(lessonColumns)
      .eq("workspace_id", workspaceId)
      .in("sync_status", ["failed", "deleted_in_google"])
      .gte("starts_at", ranges.attentionStart)
      .lt("starts_at", ranges.upcomingEnd)
      .neq("status", "cancelled")
      .order("starts_at")
      .limit(50),
    supabase
      .from("lessons")
      .select(lessonColumns)
      .eq("workspace_id", workspaceId)
      .gte("starts_at", ranges.monthStart)
      .lt("starts_at", ranges.monthEnd)
      .neq("status", "cancelled")
      .order("starts_at")
      .limit(1000),
    supabase
      .from("packages")
      .select("id,student_id")
      .eq("workspace_id", workspaceId)
      .eq("status", "active")
      .limit(1000),
    supabase
      .from("package_balances")
      .select("package_id,student_id,remaining_lessons")
      .eq("workspace_id", workspaceId)
      .lte("remaining_lessons", 2)
      .limit(1000),
  ]);

  const coreFailure = [studentsResult, todayResult, upcomingResult].find(
    (result) => result.error,
  );
  if (coreFailure?.error) throw coreFailure.error;

  const allRows = uniqueLessonRows([
    ...((todayResult.data ?? []) as DashboardLessonRow[]),
    ...((upcomingResult.data ?? []) as DashboardLessonRow[]),
    ...((unfinishedResult.data ?? []) as DashboardLessonRow[]),
    ...((syncResult.data ?? []) as DashboardLessonRow[]),
  ]);
  const lessonIds = allRows.map((lesson) => lesson.id);
  const groupIds = [
    ...new Set(
      allRows
        .map((lesson) => lesson.group_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const [participantsResult, groupsResult] = await Promise.all([
    lessonIds.length
      ? supabase
          .from("lesson_participants")
          .select("lesson_id,student_id")
          .eq("workspace_id", workspaceId)
          .in("lesson_id", lessonIds)
      : Promise.resolve({ data: [], error: null }),
    groupIds.length
      ? supabase
          .from("groups")
          .select("id,name,subject,level")
          .eq("workspace_id", workspaceId)
          .in("id", groupIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (participantsResult.error) throw participantsResult.error;
  if (groupsResult.error) throw groupsResult.error;

  const participantIdsByLesson = new Map<string, string[]>();
  for (const row of participantsResult.data ?? []) {
    const ids = participantIdsByLesson.get(row.lesson_id as string) ?? [];
    ids.push(row.student_id as string);
    participantIdsByLesson.set(row.lesson_id as string, ids);
  }
  const mapLesson = (row: DashboardLessonRow): DashboardLessonSource => ({
    id: row.id,
    groupId: row.group_id ?? undefined,
    participantIds:
      participantIdsByLesson.get(row.id) ??
      (row.student_id ? [row.student_id] : []),
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.status,
    subject: row.subject ?? "",
    topic: row.title,
    format: row.format,
    meetingUrl: row.meeting_url ?? undefined,
    syncStatus: row.sync_status,
  });
  const optionalAttentionFailed =
    Boolean(unfinishedResult.error) ||
    Boolean(syncResult.error) ||
    Boolean(packagesResult.error) ||
    Boolean(balancesResult.error);
  const activePackageIds = new Set(
    packagesResult.error
      ? []
      : (packagesResult.data ?? []).map((row) => row.id as string),
  );

  return {
    teacher: {
      name:
        (tutorResult.data!.display_name as string | null) ||
        (profileResult.data!.full_name as string) ||
        "",
      timezone,
      readOnly: Boolean(subscriptionResult.data!.read_only),
    },
    ranges,
    students: (studentsResult.data ?? []).map((row) => ({
      id: row.id as string,
      name: row.display_name as string,
      subject: (row.subject as string | null) ?? "",
      level: (row.level as string | null) ?? "",
      status: (row.status === "active"
        ? "active"
        : "archived") as Student["status"],
    })),
    groups: (groupsResult.data ?? []).map((row) => ({
      id: row.id as string,
      name: row.name as string,
      subject: (row.subject as string | null) ?? "",
      level: (row.level as string | null) ?? "",
    })),
    todaysLessons: ((todayResult.data ?? []) as DashboardLessonRow[]).map(
      mapLesson,
    ),
    upcomingLessons: ((upcomingResult.data ?? []) as DashboardLessonRow[]).map(
      mapLesson,
    ),
    unfinishedLessons: unfinishedResult.error
      ? []
      : ((unfinishedResult.data ?? []) as DashboardLessonRow[]).map(mapLesson),
    syncFailures: syncResult.error
      ? []
      : ((syncResult.data ?? []) as DashboardLessonRow[]).map(mapLesson),
    monthlyLessons: monthResult.error
      ? []
      : ((monthResult.data ?? []) as DashboardLessonRow[]).map(mapLesson),
    lowPackages:
      packagesResult.error || balancesResult.error
        ? []
        : (balancesResult.data ?? [])
            .filter((row) => activePackageIds.has(row.package_id as string))
            .map((row) => ({
              studentId: row.student_id as string,
              remainingLessons: Number(row.remaining_lessons),
            })),
    partialErrors: [
      ...(optionalAttentionFailed ? (["attention"] as const) : []),
      ...(monthResult.error ? (["monthly_summary"] as const) : []),
    ],
  };
}

function uniqueLessonRows(rows: DashboardLessonRow[]) {
  return [...new Map(rows.map((row) => [row.id, row])).values()];
}
