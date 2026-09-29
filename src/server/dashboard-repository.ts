import "server-only";

import type { Lesson, Student } from "@/lib/domain";
import { hasEntitlement } from "@/lib/entitlements";
import {
  dashboardRanges,
  dashboardSourceFromAppData,
  type DashboardLessonSource,
  type DashboardSource,
} from "./dashboard";
import { createSupabaseServerClient } from "./supabase";
import { getAppData, localAllowed } from "./repository";
import * as local from "./store";

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
  billing_type: "per_lesson" | "per_student" | "package" | "trial";
}

export async function queryTodayDashboardSource(
  teacherId: string,
  now = new Date(),
): Promise<DashboardSource> {
  if (localAllowed()) {
    const source = dashboardSourceFromAppData(await getAppData(teacherId), now);
    const recentIds = new Set(
      source.recentCompletedLessons.map((lesson) => lesson.id),
    );
    const outcomes = await local.queryStore((store) =>
      (store.lessonStudentOutcomes ?? [])
        .filter(
          (outcome) =>
            outcome.teacherId === teacherId && recentIds.has(outcome.lessonId),
        )
        .map((outcome) => ({
          lessonId: outcome.lessonId,
          studentId: outcome.studentId,
          progressSummary: outcome.progressSummary,
          difficultyLevel: outcome.difficultyLevel,
          difficultyNote: outcome.difficultyNote,
          nextStep: outcome.nextStep,
        })),
    );
    return { ...source, outcomes };
  }

  const supabase = await createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || authData.user?.id !== teacherId) {
    throw new Error("UNAUTHENTICATED");
  }

  const [profileResult, tutorResult, subscriptionResult, googleResult] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("full_name,timezone,onboarding_completed_at")
        .eq("id", teacherId)
        .single(),
      supabase
        .from("tutor_profiles")
        .select("workspace_id,display_name,timezone")
        .eq("user_id", teacherId)
        .single(),
      supabase
        .from("subscriptions")
        .select("read_only,status,tier")
        .eq("teacher_id", teacherId)
        .single(),
      supabase
        .from("integration_connections")
        .select("status,sync_state")
        .eq("teacher_id", teacherId)
        .eq("provider", "google")
        .maybeSingle(),
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
    "id,group_id,student_id,starts_at,ends_at,status,subject,title,format,meeting_url,sync_status,billing_type";

  const [
    studentsResult,
    todayResult,
    upcomingResult,
    unfinishedResult,
    completedResult,
    monthResult,
    packagesResult,
    balancesResult,
    overdueResult,
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
      .order("starts_at")
      .limit(24),
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
      .gte("starts_at", ranges.unfinishedStart)
      .lt("ends_at", now.toISOString())
      .order("starts_at")
      .limit(50),
    supabase
      .from("lessons")
      .select(lessonColumns)
      .eq("workspace_id", workspaceId)
      .eq("status", "completed")
      .gte("starts_at", ranges.continuityStart)
      .lt("starts_at", now.toISOString())
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
      .select("id,student_id,purchased_at,expires_at")
      .eq("workspace_id", workspaceId)
      .eq("status", "active")
      .limit(1000),
    supabase
      .from("package_balances")
      .select("package_id,student_id,remaining_lessons")
      .eq("workspace_id", workspaceId)
      .limit(1000),
    supabase
      .from("charge_balances")
      .select("student_id,outstanding_grosz,currency")
      .eq("workspace_id", workspaceId)
      .eq("is_overdue", true)
      .gt("outstanding_grosz", 0)
      .limit(100),
  ]);

  const coreFailure = [studentsResult, todayResult, upcomingResult].find(
    (result) => result.error,
  );
  if (coreFailure?.error) throw coreFailure.error;

  const allRows = uniqueLessonRows([
    ...((todayResult.data ?? []) as DashboardLessonRow[]),
    ...((upcomingResult.data ?? []) as DashboardLessonRow[]),
    ...((unfinishedResult.data ?? []) as DashboardLessonRow[]),
    ...((completedResult.data ?? []) as DashboardLessonRow[]),
  ]);
  const lessonIds = allRows.map((lesson) => lesson.id);
  const groupIds = [
    ...new Set(
      allRows
        .map((lesson) => lesson.group_id)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const [participantsResult, groupsResult, outcomesResult] = await Promise.all([
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
    lessonIds.length
      ? supabase
          .from("lesson_student_outcomes")
          .select(
            "lesson_id,student_id,progress_summary,difficulty_level,difficulty_note,next_step",
          )
          .eq("workspace_id", workspaceId)
          .in("lesson_id", lessonIds)
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
    billingType: row.billing_type,
  });
  const optionalAttentionFailed =
    Boolean(unfinishedResult.error) ||
    Boolean(completedResult.error) ||
    Boolean(outcomesResult.error) ||
    Boolean(googleResult.error) ||
    Boolean(packagesResult.error) ||
    Boolean(balancesResult.error) ||
    Boolean(overdueResult.error);

  const balanceByPackage = new Map(
    balancesResult.error
      ? []
      : (balancesResult.data ?? []).map((row) => [
          row.package_id as string,
          Number(row.remaining_lessons),
        ]),
  );
  const packageLessons = [
    ...((todayResult.data ?? []) as DashboardLessonRow[]),
    ...((upcomingResult.data ?? []) as DashboardLessonRow[]),
  ].filter(
    (row) =>
      row.billing_type === "package" &&
      row.starts_at >= now.toISOString() &&
      row.status === "scheduled",
  );
  const packageProblems = packageLessons.flatMap((lesson) => {
    const studentIds =
      participantIdsByLesson.get(lesson.id) ??
      (lesson.student_id ? [lesson.student_id] : []);
    return studentIds
      .filter((studentId) =>
        packagesResult.error || balancesResult.error
          ? false
          : !(packagesResult.data ?? []).some(
              (pkg) =>
                pkg.student_id === studentId &&
                (pkg.purchased_at as string) <= lesson.starts_at &&
                (!pkg.expires_at ||
                  (pkg.expires_at as string) >= lesson.starts_at) &&
                (balanceByPackage.get(pkg.id as string) ?? 0) > 0,
            ),
      )
      .map((studentId) => ({ lessonId: lesson.id, studentId }));
  });

  return {
    now: now.toISOString(),
    teacher: {
      name:
        (tutorResult.data!.display_name as string | null) ||
        (profileResult.data!.full_name as string) ||
        "",
      timezone,
      readOnly: Boolean(subscriptionResult.data!.read_only),
      onboardingCompleted: Boolean(profileResult.data!.onboarding_completed_at),
      googleEntitled: hasEntitlement(
        {
          status: subscriptionResult.data!.status,
          tier: subscriptionResult.data!.tier,
        },
        "googleCalendar",
      ),
      googleStatus: googleResult.data?.status ?? "not_connected",
      googleSyncState: googleResult.data?.sync_state ?? undefined,
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
    recentCompletedLessons: completedResult.error
      ? []
      : ((completedResult.data ?? []) as DashboardLessonRow[]).map(mapLesson),
    outcomes: outcomesResult.error
      ? []
      : (outcomesResult.data ?? []).map((row) => ({
          lessonId: row.lesson_id as string,
          studentId: row.student_id as string,
          progressSummary: row.progress_summary as string | null,
          difficultyLevel: row.difficulty_level as
            "easy" | "mixed" | "hard" | null,
          difficultyNote: row.difficulty_note as string | null,
          nextStep: row.next_step as string | null,
        })),
    monthlyLessons: monthResult.error
      ? []
      : ((monthResult.data ?? []) as DashboardLessonRow[]).map(mapLesson),
    packageProblems,
    overdueCharges: overdueResult.error
      ? []
      : (overdueResult.data ?? []).map((row) => ({
          studentId: row.student_id as string,
          outstanding: Number(row.outstanding_grosz),
          currency: row.currency as string,
        })),
    partialErrors: [
      ...(optionalAttentionFailed ? (["actions"] as const) : []),
      ...(monthResult.error ? (["monthly_summary"] as const) : []),
    ],
  };
}

function uniqueLessonRows(rows: DashboardLessonRow[]) {
  return [...new Map(rows.map((row) => [row.id, row])).values()];
}
