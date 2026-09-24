import "server-only";

import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import type {
  AppAction,
  AppData,
  IntegrationState,
  MutationResponse,
} from "@/lib/domain";
import { isSupabaseConfigured } from "./env";
import * as local from "./store";
import type { StoreShape, TeacherRecord } from "./store";
import { createSupabaseServerClient } from "./supabase";
import { mapSubscriptionRow } from "./subscription";
import { assertActiveStudentCapacity } from "./entitlements";
import { ApiFailure } from "./errors";
import { findProbableDuplicateIds, studentDisplayName } from "./domain/student";
import { DEFAULT_CALENDAR_COLOR } from "@/lib/calendar-colors";
import { googleEventIdForLesson } from "./google-calendar-sync";

interface StudentRow {
  id: string;
  first_name: string;
  last_name: string;
  display_name: string;
  email: string | null;
  phone: string | null;
  legacy_contact: string | null;
  subject: string | null;
  level: string | null;
  goal: string | null;
  notes: string | null;
  status: "active" | "inactive" | "archived";
  default_lesson_duration_minutes: number;
  default_format: "online" | "offline";
  default_location: string | null;
  default_lesson_price_grosz: number | string | null;
  currency: string;
  timezone: string | null;
  created_at: string;
}

interface ContactRow {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  type: "parent" | "guardian" | "billing" | "other";
}

interface StudentContactRow {
  id: string;
  student_id: string;
  contact_id: string;
  relationship: string | null;
  is_primary: boolean;
  is_billing_contact: boolean;
  created_at: string;
}

interface GroupRow {
  id: string;
  name: string;
  subject: string | null;
  level: string | null;
  status: "active" | "inactive" | "archived";
  default_duration_minutes: number;
  default_price_grosz: number | string | null;
  currency: string;
  notes: string | null;
  created_at: string;
}

interface GroupMemberRow {
  id: string;
  group_id: string;
  student_id: string;
  status: "active" | "invited" | "suspended";
  joined_at: string;
  left_at: string | null;
}

interface LessonRow {
  id: string;
  color: string;
  group_id: string | null;
  starts_at: string;
  ends_at: string;
  format: "online" | "offline";
  location: string | null;
  meeting_url: string | null;
  price_grosz: number | string | null;
  currency: string;
  creation_mode: "single" | "multiple" | "recurring";
  recurring_series_id: string | null;
  status:
    "scheduled" | "needs_completion" | "completed" | "cancelled" | "no_show";
  sync_status:
    "pending" | "synced" | "failed" | "deleted_in_google" | "disabled";
  sync_message: string | null;
  title: string;
  subject: string | null;
  timezone: string;
  recurrence_original_starts_at: string | null;
  created_at: string;
  updated_at: string;
}

interface LessonParticipantRow {
  id: string;
  lesson_id: string;
  student_id: string;
  payment_status: "unpaid" | "paid" | "cancelled";
}

interface AttendanceRow {
  lesson_id: string;
  student_id: string;
  status: "unknown" | "present" | "absent" | "late" | "cancelled";
}

interface PlanItemRow {
  id: string;
  lesson_id: string;
  position: number;
  content: string;
}

interface PlanResultRow {
  lesson_participant_id: string;
  plan_item_id: string;
  completed: boolean;
  score: number | null;
  note: string | null;
}

const localAllowed = () =>
  process.env.NODE_ENV !== "production" &&
  (Boolean(process.env.TUTORFLOW_DATA_DIR) || !isSupabaseConfigured());

function configured(provider: "telegram" | "payu"): boolean {
  if (provider === "telegram") return Boolean(process.env.TELEGRAM_BOT_TOKEN);
  return Boolean(
    process.env.PAYU_POS_ID &&
    process.env.PAYU_CLIENT_SECRET &&
    process.env.PAYU_SECOND_KEY,
  );
}

function defaultIntegration(
  provider: "google" | "telegram" | "payu",
): IntegrationState {
  // Google Calendar is a supported integration even before the teacher has a
  // connection row. OAuth configuration is still validated by the route that
  // starts the authenticated connection flow.
  if (provider === "google") return { status: "not_connected" };
  return { status: configured(provider) ? "not_connected" : "not_configured" };
}

function safeIntegrationError(
  provider: string,
  status: string,
  value: string | null,
): string | undefined {
  if (!value) return undefined;
  if (provider !== "google") return value;
  if (status === "reconnect_required")
    return "Google Calendar wymaga ponownego połączenia.";
  return "Nie udało się zsynchronizować Google Calendar. Spróbuj ponownie.";
}

async function loadTenantStore(
  teacherId: string,
  range?: { start: string; end: string },
) {
  const supabase = await createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || authData.user?.id !== teacherId)
    throw new Error("UNAUTHENTICATED");

  const [profileResult, tutorResult, subscriptionResult, integrationsResult] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id,email,full_name,timezone,onboarding_completed_at")
        .eq("id", teacherId)
        .single(),
      supabase
        .from("tutor_profiles")
        .select("workspace_id")
        .eq("user_id", teacherId)
        .single(),
      supabase
        .from("subscriptions")
        .select(
          "status,tier,billing_interval,read_only,trial_ends_at,renews_at",
        )
        .eq("teacher_id", teacherId)
        .single(),
      supabase
        .from("integration_connections")
        .select(
          "provider,status,label,last_error,sync_state,last_attempted_sync_at,last_successful_sync_at",
        )
        .eq("teacher_id", teacherId),
    ]);
  const failure = [profileResult, tutorResult, subscriptionResult].find(
    (result) => result.error,
  );
  if (failure?.error) throw failure.error;
  const profile = profileResult.data!;
  const subscription = subscriptionResult.data!;
  const workspaceId = tutorResult.data!.workspace_id;
  let lessonsQuery = supabase
    .from("lessons")
    .select(
      "id,color,group_id,starts_at,ends_at,format,location,meeting_url,price_grosz,currency,creation_mode,recurring_series_id,recurrence_original_starts_at,status,sync_status,sync_message,title,subject,timezone,created_at,updated_at",
    )
    .eq("workspace_id", workspaceId);
  let calendarBlocksQuery = supabase
    .from("calendar_blocks")
    .select("id,title,color,starts_at,ends_at,timezone,created_at,updated_at")
    .eq("workspace_id", workspaceId)
    .eq("tutor_id", teacherId);
  let externalEventsQuery = supabase
    .from("external_google_events")
    .select(
      "id,summary,starts_at,ends_at,start_date,end_date,timezone,all_day,status,transparency,app_color,recurring_event_id,original_start_time",
    )
    .eq("workspace_id", workspaceId)
    .eq("teacher_id", teacherId)
    .neq("status", "cancelled");
  if (range) {
    lessonsQuery = lessonsQuery
      .lt("starts_at", range.end)
      .gt("ends_at", range.start);
    calendarBlocksQuery = calendarBlocksQuery
      .lt("starts_at", range.end)
      .gt("ends_at", range.start);
    const startDate = range.start.slice(0, 10);
    const endDate = range.end.slice(0, 10);
    externalEventsQuery = externalEventsQuery.or(
      `and(all_day.eq.false,starts_at.lt.${range.end},ends_at.gt.${range.start}),and(all_day.eq.true,start_date.lte.${endDate},end_date.gte.${startDate})`,
    );
  }
  const [
    studentsResult,
    lessonsResult,
    participantsResult,
    attendanceResult,
    planItemsResult,
    planResultsResult,
    homeworksResult,
    notesResult,
    availabilityResult,
    availabilityExceptionsResult,
    calendarBlocksResult,
    externalEventsResult,
    importsResult,
    contactsResult,
    studentContactsResult,
    groupsResult,
    groupMembersResult,
    packagesResult,
    packageBalancesResult,
    chargeBalancesResult,
  ] = await Promise.all([
    supabase
      .from("students")
      .select(
        "id,first_name,last_name,display_name,email,phone,legacy_contact,subject,level,goal,notes,status,default_lesson_duration_minutes,default_format,default_location,default_lesson_price_grosz,currency,timezone,created_at",
      )
      .eq("workspace_id", workspaceId),
    lessonsQuery,
    supabase
      .from("lesson_participants")
      .select("id,lesson_id,student_id,payment_status")
      .eq("workspace_id", workspaceId),
    supabase
      .from("attendances")
      .select("lesson_id,student_id,status")
      .eq("workspace_id", workspaceId),
    supabase
      .from("lesson_plan_items")
      .select("id,lesson_id,position,content")
      .eq("workspace_id", workspaceId),
    supabase
      .from("plan_item_results")
      .select("lesson_participant_id,plan_item_id,completed,score,note")
      .eq("workspace_id", workspaceId),
    supabase
      .from("homeworks")
      .select("lesson_id,description")
      .eq("workspace_id", workspaceId),
    supabase
      .from("lesson_notes")
      .select("lesson_id,content,note_type")
      .eq("workspace_id", workspaceId)
      .eq("note_type", "general"),
    supabase
      .from("availability_rules")
      .select(
        "id,kind,label,day_of_week,starts_at,ends_at,start_time,end_time,timezone,all_day,is_available",
      )
      .eq("workspace_id", workspaceId)
      .eq("tutor_id", teacherId),
    supabase
      .from("availability_exceptions")
      .select("id,exception_date,kind,start_time,end_time,timezone,reason")
      .eq("workspace_id", workspaceId)
      .eq("tutor_id", teacherId),
    calendarBlocksQuery,
    externalEventsQuery,
    supabase
      .from("student_stat_imports")
      .select(
        "id,student_id,occurred_at,topic,skill,score,duration_minutes,attendance_status,source_file,imported_at",
      )
      .eq("workspace_id", workspaceId),
    supabase
      .from("contacts")
      .select("id,first_name,last_name,email,phone,type")
      .eq("workspace_id", workspaceId),
    supabase
      .from("student_contacts")
      .select(
        "id,student_id,contact_id,relationship,is_primary,is_billing_contact,created_at",
      )
      .eq("workspace_id", workspaceId),
    supabase
      .from("groups")
      .select(
        "id,name,subject,level,status,default_duration_minutes,default_price_grosz,currency,notes,created_at",
      )
      .eq("workspace_id", workspaceId)
      .eq("is_ad_hoc", false),
    supabase
      .from("group_members")
      .select("id,group_id,student_id,status,joined_at,left_at")
      .eq("workspace_id", workspaceId),
    supabase
      .from("packages")
      .select("id,student_id,status")
      .eq("workspace_id", workspaceId)
      .eq("status", "active"),
    supabase
      .from("package_balances")
      .select("package_id,student_id,remaining_lessons")
      .eq("workspace_id", workspaceId),
    supabase
      .from("charge_balances")
      .select("student_id,outstanding_grosz,currency")
      .eq("workspace_id", workspaceId)
      .gt("outstanding_grosz", 0)
      .neq("status", "cancelled"),
  ]);
  const domainFailure = [
    studentsResult,
    lessonsResult,
    participantsResult,
    attendanceResult,
    planItemsResult,
    planResultsResult,
    homeworksResult,
    notesResult,
    availabilityResult,
    availabilityExceptionsResult,
    calendarBlocksResult,
    externalEventsResult,
    importsResult,
    contactsResult,
    studentContactsResult,
    groupsResult,
    groupMembersResult,
    packagesResult,
    packageBalancesResult,
    chargeBalancesResult,
  ].find((result) => result.error);
  if (domainFailure?.error) throw domainFailure.error;

  const studentRows = (studentsResult.data ?? []) as StudentRow[];
  const lessonRows = (lessonsResult.data ?? []) as LessonRow[];
  const participantRows = (participantsResult.data ??
    []) as LessonParticipantRow[];
  const attendanceRows = (attendanceResult.data ?? []) as AttendanceRow[];
  const planItemRows = (planItemsResult.data ?? []) as PlanItemRow[];
  const planResultRows = (planResultsResult.data ?? []) as PlanResultRow[];
  const contactRows = (contactsResult.data ?? []) as ContactRow[];
  const studentContactRows = (studentContactsResult.data ??
    []) as StudentContactRow[];
  const groupRows = (groupsResult.data ?? []) as GroupRow[];
  const groupMemberRows = (groupMembersResult.data ?? []) as GroupMemberRow[];
  const homeworkRows = (homeworksResult.data ?? []) as Array<{
    lesson_id: string;
    description: string | null;
  }>;
  const noteRows = (notesResult.data ?? []) as Array<{
    lesson_id: string;
    content: string;
  }>;
  const states = new Map(
    (integrationsResult.data ?? []).map((row) => [
      row.provider,
      {
        status: row.status,
        label: row.label ?? undefined,
        lastError: safeIntegrationError(
          row.provider,
          row.status,
          row.last_error,
        ),
        syncState: row.sync_state ?? undefined,
        lastAttemptedSyncAt: row.last_attempted_sync_at ?? undefined,
        lastSuccessfulSyncAt: row.last_successful_sync_at ?? undefined,
      } as IntegrationState,
    ]),
  );
  const teacher: TeacherRecord = {
    id: teacherId,
    name: profile.full_name,
    email: profile.email,
    timezone: profile.timezone,
    onboardingCompletedAt: profile.onboarding_completed_at ?? undefined,
    passwordHash: "",
    subscription: mapSubscriptionRow(subscription),
    google: states.get("google") ?? defaultIntegration("google"),
    telegram: states.get("telegram") ?? defaultIntegration("telegram"),
    payu: states.get("payu") ?? defaultIntegration("payu"),
  };
  const activePackageIds = new Set(
    (packagesResult.data ?? []).map((row) => row.id as string),
  );
  const visibleGroupIds = new Set(groupRows.map((row) => row.id));
  const groupIdsByStudent = new Map<string, string[]>();
  const membersByGroup = new Map<string, GroupMemberRow[]>();
  for (const member of groupMemberRows) {
    const groupMembers = membersByGroup.get(member.group_id) ?? [];
    groupMembers.push(member);
    membersByGroup.set(member.group_id, groupMembers);
    if (member.status !== "active" || !visibleGroupIds.has(member.group_id)) {
      continue;
    }
    const studentGroups = groupIdsByStudent.get(member.student_id) ?? [];
    studentGroups.push(member.group_id);
    groupIdsByStudent.set(member.student_id, studentGroups);
  }
  const packageRemainingByStudent = new Map<string, number>();
  for (const row of packageBalancesResult.data ?? []) {
    if (!activePackageIds.has(row.package_id as string)) continue;
    const studentId = row.student_id as string;
    packageRemainingByStudent.set(
      studentId,
      (packageRemainingByStudent.get(studentId) ?? 0) +
        Number(row.remaining_lessons),
    );
  }
  const balanceDueByStudent = new Map<
    string,
    { amount: number; currency: string }
  >();
  for (const row of chargeBalancesResult.data ?? []) {
    const studentId = row.student_id as string;
    const currency = row.currency as string;
    const current = balanceDueByStudent.get(studentId);
    if (current && current.currency !== currency) continue;
    balanceDueByStudent.set(studentId, {
      amount: (current?.amount ?? 0) + Number(row.outstanding_grosz),
      currency,
    });
  }
  const students: StoreShape["students"] = studentRows.map((row) => ({
    id: row.id,
    teacherId,
    firstName: row.first_name,
    lastName: row.last_name,
    displayName: row.display_name,
    name: row.display_name,
    email: row.email ?? "",
    phone: row.phone ?? "",
    contact: row.legacy_contact ?? row.email ?? row.phone ?? "",
    subject: row.subject ?? "",
    level: row.level ?? "",
    goal: row.goal ?? "",
    notes: row.notes ?? "",
    status: row.status === "active" ? "active" : "archived",
    defaultDurationMinutes: row.default_lesson_duration_minutes,
    defaultFormat: row.default_format,
    defaultLocation: row.default_location ?? "",
    defaultPrice:
      row.default_lesson_price_grosz === null
        ? null
        : {
            amount: Number(row.default_lesson_price_grosz),
            currency: row.currency,
          },
    timezone: row.timezone ?? undefined,
    groupIds: groupIdsByStudent.get(row.id) ?? [],
    packageRemainingLessons: packageRemainingByStudent.has(row.id)
      ? packageRemainingByStudent.get(row.id)!
      : null,
    balanceDue: balanceDueByStudent.get(row.id) ?? {
      amount: 0,
      currency: row.currency,
    },
    createdAt: row.created_at,
  }));
  const participantsByLesson = groupBy(
    participantRows,
    (participant) => participant.lesson_id,
  );
  const planItemsByLesson = groupBy(planItemRows, (item) => item.lesson_id);
  const planResultsByParticipant = groupBy(
    planResultRows,
    (result) => result.lesson_participant_id,
  );
  const attendanceByLessonAndStudent = new Map(
    attendanceRows.map((attendance) => [
      `${attendance.lesson_id}:${attendance.student_id}`,
      attendance.status,
    ]),
  );
  const homeworkByLesson = new Map(
    homeworkRows.map((homework) => [homework.lesson_id, homework.description]),
  );
  const noteByLesson = new Map(
    noteRows.map((note) => [note.lesson_id, note.content]),
  );
  const lessons: StoreShape["lessons"] = lessonRows.map((row) => {
    const lessonParticipants = participantsByLesson.get(row.id) ?? [];
    const planItems = (planItemsByLesson.get(row.id) ?? [])
      .sort((a, b) => a.position - b.position)
      .map((item) => ({
        id: item.id,
        position: item.position,
        text: item.content,
      }));
    const priceAmount =
      row.price_grosz === null ? null : Number(row.price_grosz);
    return {
      id: row.id,
      color: row.color ?? DEFAULT_CALENDAR_COLOR,
      teacherId,
      groupId: row.group_id ?? undefined,
      participantIds: lessonParticipants.map(
        (participant) => participant.student_id,
      ),
      startsAt: row.starts_at,
      durationMinutes: Math.round(
        (new Date(row.ends_at).getTime() - new Date(row.starts_at).getTime()) /
          60_000,
      ),
      format: row.format,
      location:
        row.format === "online"
          ? (row.meeting_url ?? "")
          : (row.location ?? ""),
      price:
        priceAmount === null
          ? null
          : { amount: priceAmount, currency: row.currency },
      mode: row.creation_mode,
      seriesId: row.recurring_series_id ?? undefined,
      recurrenceOriginalStartsAt:
        row.recurrence_original_starts_at ?? undefined,
      subject: row.subject ?? "",
      timezone: row.timezone,
      status: row.status,
      syncStatus: row.sync_status,
      syncMessage: row.sync_message ?? undefined,
      topic: row.title,
      planItems,
      homework: homeworkByLesson.get(row.id) ?? "",
      generalNotes: noteByLesson.get(row.id) ?? "",
      participants: lessonParticipants.map((participant) => ({
        studentId: participant.student_id,
        attendanceStatus:
          attendanceByLessonAndStudent.get(
            `${row.id}:${participant.student_id}`,
          ) ?? "unknown",
        paymentStatus: participant.payment_status,
        results: (planResultsByParticipant.get(participant.id) ?? []).map(
          (result) => ({
            planItemId: result.plan_item_id,
            completed: result.completed,
            score: result.score ?? undefined,
            note: result.note ?? "",
          }),
        ),
      })),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });
  const contactsById = new Map(contactRows.map((row) => [row.id, row]));
  const contacts: StoreShape["contacts"] = studentContactRows.flatMap(
    (relation) => {
      const contact = contactsById.get(relation.contact_id);
      if (!contact) return [];
      return [
        {
          id: relation.id,
          teacherId,
          studentId: relation.student_id,
          contactId: contact.id,
          firstName: contact.first_name,
          lastName: contact.last_name,
          displayName: [contact.first_name, contact.last_name]
            .filter(Boolean)
            .join(" "),
          email: contact.email ?? "",
          phone: contact.phone ?? "",
          type: contact.type,
          relationship: relation.relationship ?? "",
          isPrimary: relation.is_primary,
          isBillingContact: relation.is_billing_contact,
          createdAt: relation.created_at,
        },
      ];
    },
  );
  const groups: StoreShape["groups"] = groupRows.map((row) => ({
    id: row.id,
    teacherId,
    name: row.name,
    subject: row.subject ?? "",
    level: row.level ?? "",
    status: row.status === "active" ? "active" : "archived",
    defaultDurationMinutes: row.default_duration_minutes,
    defaultPrice:
      row.default_price_grosz === null
        ? null
        : { amount: Number(row.default_price_grosz), currency: "PLN" },
    notes: row.notes ?? "",
    members: (membersByGroup.get(row.id) ?? []).map((member) => ({
      id: member.id,
      studentId: member.student_id,
      status: member.status === "active" ? "active" : "suspended",
      joinedAt: member.joined_at,
      leftAt: member.left_at ?? undefined,
    })),
    createdAt: row.created_at,
  }));
  const availability = (availabilityResult.data ?? []) as Array<{
    id: string;
    kind: "single" | "recurring";
    label: string;
    day_of_week: number | null;
    starts_at: string | null;
    ends_at: string | null;
    start_time: string | null;
    end_time: string | null;
    timezone: string;
    all_day: boolean;
    is_available: boolean;
  }>;
  const imports = (importsResult.data ?? []) as Array<{
    id: string;
    student_id: string;
    occurred_at: string;
    topic: string;
    skill: string;
    score: number | string | null;
    duration_minutes: number;
    attendance_status: "present" | "absent";
    source_file: string;
    imported_at: string;
  }>;
  return {
    supabase,
    workspaceId,
    store: {
      version: 1,
      teachers: [teacher],
      students,
      contacts,
      groups,
      lessons,
      studentStatImports: imports.map((row) => ({
        id: row.id,
        teacherId,
        studentId: row.student_id,
        occurredAt: row.occurred_at,
        topic: row.topic,
        skill: row.skill,
        score: row.score === null ? undefined : Number(row.score),
        durationMinutes: row.duration_minutes,
        attendanceStatus: row.attendance_status,
        sourceFile: row.source_file,
        importedAt: row.imported_at,
      })),
      availability: availability.map((row) => ({
        id: row.id,
        teacherId,
        kind: row.kind,
        allDay: row.all_day,
        label: row.label,
        start:
          row.starts_at ??
          fromZonedTime(
            `1970-01-05T${row.start_time ?? "00:00:00"}`,
            row.timezone,
          ).toISOString(),
        end:
          row.ends_at ??
          fromZonedTime(
            `1970-01-05T${row.end_time ?? "23:59:59"}`,
            row.timezone,
          ).toISOString(),
        weekday: row.day_of_week ?? undefined,
        isAvailable: row.is_available,
      })),
      availabilityExceptions: (availabilityExceptionsResult.data ?? []).map(
        (row) => ({
          id: row.id,
          teacherId,
          date: row.exception_date,
          kind: row.kind,
          startTime: row.start_time?.slice(0, 5) ?? undefined,
          endTime: row.end_time?.slice(0, 5) ?? undefined,
          timezone: row.timezone,
          reason: row.reason ?? "",
        }),
      ),
      calendarBlocks: (calendarBlocksResult.data ?? []).map((row) => ({
        id: row.id,
        color: row.color ?? "#7F8A9A",
        teacherId,
        title: row.title,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        timezone: row.timezone,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
      externalGoogleEvents: (externalEventsResult.data ?? []).map((row) => ({
        id: row.id,
        teacherId,
        title: row.summary || "Zajęty",
        startsAt: row.starts_at ?? undefined,
        endsAt: row.ends_at ?? undefined,
        startDate: row.start_date ?? undefined,
        endDate: row.end_date ?? undefined,
        timezone: row.timezone ?? undefined,
        allDay: row.all_day,
        status: row.status,
        transparency: row.transparency,
        color: row.app_color ?? "#7F8A9A",
        recurringEventId: row.recurring_event_id ?? undefined,
        originalStartTime: row.original_start_time ?? undefined,
        readOnly: true as const,
        blocksTime: row.transparency !== "transparent",
      })),
      sessions: [],
    } satisfies StoreShape,
  };
}

function groupBy<T>(rows: T[], keyOf: (row: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) {
    const key = keyOf(row);
    const values = grouped.get(key) ?? [];
    values.push(row);
    grouped.set(key, values);
  }
  return grouped;
}

export async function queryStore<T>(
  teacherId: string,
  operation: (store: StoreShape) => T,
  range?: { start: string; end: string },
): Promise<T> {
  if (localAllowed()) return local.queryStore(operation);
  return operation((await loadTenantStore(teacherId, range)).store);
}

export async function mutateStore<T>(
  teacherId: string,
  operation: (store: StoreShape) => T | Promise<T>,
): Promise<T> {
  if (localAllowed()) return local.mutateStore(operation);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const loaded = await loadTenantStore(teacherId);
    const { data: legacyState, error: legacyStateError } = await loaded.supabase
      .from("teacher_states")
      .select("version")
      .eq("teacher_id", teacherId)
      .single();
    if (legacyStateError) throw legacyStateError;
    const result = await operation(loaded.store);
    const teacher = loaded.store.teachers[0];
    const state = {
      students: loaded.store.students.map((row) => stripTenant(row)),
      lessons: loaded.store.lessons.map((row) => stripTenant(row)),
      studentStatImports: loaded.store.studentStatImports.map((row) =>
        stripTenant(row),
      ),
      availability: loaded.store.availability.map((row) => stripTenant(row)),
    };
    const { error } = await loaded.supabase.rpc("update_teacher_state", {
      expected_version: Number(legacyState.version),
      new_state: state,
    });
    if (error?.code === "40001") continue;
    if (error) throw error;
    await Promise.all([
      loaded.supabase
        .from("profiles")
        .update({ full_name: teacher.name, timezone: teacher.timezone })
        .eq("id", teacherId),
      enqueuePendingSync(
        loaded.supabase,
        loaded.workspaceId,
        teacherId,
        state.lessons,
      ),
      enqueueReminders(
        loaded.supabase,
        loaded.workspaceId,
        teacherId,
        state.lessons,
      ),
    ]);
    return result;
  }
  throw new Error("STATE_VERSION_CONFLICT");
}

const peopleActionTypes = [
  "createStudent",
  "updateStudent",
  "setStudentStatus",
  "createStudentContact",
  "updateStudentContact",
  "removeStudentContact",
  "createGroup",
  "updateGroup",
  "setGroupStatus",
  "addGroupMembers",
  "removeGroupMember",
] as const;

type PeopleAction = Extract<
  AppAction,
  { type: (typeof peopleActionTypes)[number] }
>;

export function isPeopleAction(action: AppAction): action is PeopleAction {
  return (peopleActionTypes as readonly string[]).includes(action.type);
}

async function loadWriteContext(teacherId: string) {
  const supabase = await createSupabaseServerClient();
  const [
    { data: authData, error: authError },
    tutorResult,
    subscriptionResult,
    profileResult,
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("tutor_profiles")
      .select("workspace_id")
      .eq("user_id", teacherId)
      .single(),
    supabase
      .from("subscriptions")
      .select("status,tier,read_only")
      .eq("teacher_id", teacherId)
      .single(),
    supabase.from("profiles").select("timezone").eq("id", teacherId).single(),
  ]);
  if (authError || authData.user?.id !== teacherId) {
    throw new ApiFailure(401, {
      code: "UNAUTHENTICATED",
      message: "Sesja wygasła. Zaloguj się ponownie.",
    });
  }
  if (tutorResult.error) throw tutorResult.error;
  if (subscriptionResult.error) throw subscriptionResult.error;
  if (profileResult.error) throw profileResult.error;
  if (subscriptionResult.data.read_only) {
    throw new ApiFailure(403, {
      code: "READ_ONLY",
      message:
        "Konto działa w trybie tylko do odczytu. Aktywuj subskrypcję, aby zapisywać zmiany.",
    });
  }
  return {
    supabase,
    workspaceId: tutorResult.data.workspace_id as string,
    timezone: profileResult.data.timezone as string,
    subscription: {
      status: subscriptionResult.data.status,
      tier: subscriptionResult.data.tier,
    },
  };
}

function databaseFailure(error: { code?: string; message?: string }): never {
  const message = error.message ?? "";
  if (message.includes("EXTERNAL_GOOGLE_EVENT_CONFLICT")) {
    throw new ApiFailure(409, {
      code: "LESSON_CONFLICT",
      message: "Ten termin jest oznaczony jako zajęty w Google Calendar.",
    });
  }
  if (message.includes("LESSON_CONFLICT")) {
    throw new ApiFailure(409, {
      code: "LESSON_CONFLICT",
      message: "Ten termin koliduje z inną lekcją lub blokadą kalendarza.",
    });
  }
  if (message.includes("OUTSIDE_AVAILABILITY")) {
    throw new ApiFailure(409, {
      code: "OUTSIDE_AVAILABILITY",
      message: "Ten termin jest poza Twoją regularną dostępnością.",
    });
  }
  if (error.code === "40001" || message.includes("STALE_WRITE")) {
    throw new ApiFailure(409, {
      code: "STALE_WRITE",
      message:
        "Ta lekcja została zmieniona w innym miejscu. Odśwież kalendarz i spróbuj ponownie.",
    });
  }
  if (message.includes("COMPLETED_LESSON_IMMUTABLE")) {
    throw new ApiFailure(409, {
      code: "COMPLETED_LESSON_IMMUTABLE",
      message:
        "Uzupełnionej lekcji nie można przenieść ani odwołać z kalendarza.",
    });
  }
  if (message.includes("NO_FUTURE_OCCURRENCES")) {
    throw new ApiFailure(409, {
      code: "NO_FUTURE_OCCURRENCES",
      message: "W tej serii nie ma przyszłych zajęć do przeniesienia.",
    });
  }
  if (message.includes("INVALID_LOCAL_TIME")) {
    throw new ApiFailure(422, {
      code: "INVALID_LOCAL_TIME",
      message:
        "Wybrana godzina nie istnieje albo jest niejednoznaczna przy zmianie czasu.",
    });
  }
  if (message.includes("TARGET_NOT_ACTIVE")) {
    throw new ApiFailure(422, {
      code: "TARGET_NOT_ACTIVE",
      message: "Wybierz aktywnego ucznia lub aktywną grupę.",
      fieldErrors: {
        target: "Archiwalny uczeń lub grupa nie może otrzymać nowej lekcji.",
      },
    });
  }
  if (error.code === "P0002" || error.code === "PGRST116") {
    throw new ApiFailure(404, {
      code: "NOT_FOUND",
      message: "Nie znaleziono wskazanego elementu.",
    });
  }
  if (error.code === "23505") {
    throw new ApiFailure(409, {
      code: "CONFLICT",
      message: "Ta relacja już istnieje.",
    });
  }
  throw error;
}

const schedulingActionTypes = [
  "createLesson",
  "mergeLesson",
  "saveLesson",
  "setPayment",
  "cancelLesson",
  "rescheduleLesson",
  "updateLessonColor",
  "retrySync",
  "disableSync",
  "createAvailability",
  "deleteAvailability",
  "createAvailabilityException",
  "deleteAvailabilityException",
  "createCalendarBlock",
  "updateCalendarBlock",
  "deleteCalendarBlock",
] as const;

type SchedulingAction = Extract<
  AppAction,
  { type: (typeof schedulingActionTypes)[number] }
>;

export function isSchedulingAction(
  action: AppAction,
): action is SchedulingAction {
  return (schedulingActionTypes as readonly string[]).includes(action.type);
}

export async function mutateSchedulingDomain(
  teacherId: string,
  action: SchedulingAction,
): Promise<MutationResponse> {
  if (localAllowed()) throw new Error("LOCAL_SCHEDULING_ACTION_MUST_USE_STORE");
  const { supabase, workspaceId, timezone } = await loadWriteContext(teacherId);
  let result: MutationResponse["result"];

  switch (action.type) {
    case "createLesson": {
      const target =
        action.lesson.target ??
        (action.lesson.participantIds?.length === 1
          ? { type: "student" as const, id: action.lesson.participantIds[0] }
          : undefined);
      if (!target) {
        throw new ApiFailure(422, {
          code: "VALIDATION_ERROR",
          message: "Wybierz ucznia lub grupę.",
          fieldErrors: { target: "Wybierz ucznia lub grupę." },
        });
      }
      const first = action.lesson.occurrences[0];
      const recurrence = action.lesson.recurrence;
      const { data, error } = await supabase.rpc(
        "create_lesson_schedule_with_color",
        {
          p_payload: {
            targetType: target.type,
            targetId: target.id,
            requestId: action.lesson.requestId ?? crypto.randomUUID(),
            mode: action.lesson.mode,
            timezone: recurrence?.timezone ?? timezone,
            occurrences: action.lesson.occurrences,
            format: action.lesson.format,
            location: action.lesson.location,
            priceGrosz: action.lesson.priceAmount,
            title: action.lesson.topic,
            color: action.lesson.color ?? DEFAULT_CALENDAR_COLOR,
            subject: action.lesson.subject ?? "",
            plan: action.lesson.plan,
            allowOutsideAvailability:
              action.lesson.allowOutsideAvailability ?? false,
            recurrence:
              action.lesson.mode === "recurring"
                ? {
                    intervalWeeks:
                      recurrence?.intervalWeeks ??
                      (recurrence?.frequency === "biweekly" ? 2 : 1),
                    daysOfWeek: recurrence?.daysOfWeek ?? [
                      new Date(first.startsAt).getUTCDay() || 7,
                    ],
                    startDate:
                      recurrence?.startDate ?? first.startsAt.slice(0, 10),
                    endDate: recurrence?.endDate ?? null,
                    startTime:
                      recurrence?.startTime ?? first.startsAt.slice(11, 16),
                    durationMinutes: first.durationMinutes,
                  }
                : null,
          },
        },
      );
      if (error) databaseFailure(error);
      const payload = data as { id?: string; ids?: string[] };
      result = { id: payload.id, ids: payload.ids };
      break;
    }
    case "mergeLesson": {
      const { data: lesson, error: lessonError } = await supabase
        .from("lessons")
        .select("id,status")
        .eq("workspace_id", workspaceId)
        .eq("id", action.conflictingLessonId)
        .single();
      if (lessonError) databaseFailure(lessonError);
      if (lesson.status === "completed" || lesson.status === "cancelled") {
        throw new ApiFailure(409, {
          code: "LESSON_NOT_EDITABLE",
          message:
            "Do zakończonej lub odwołanej lekcji nie można dodać uczestnika.",
        });
      }
      const { data: students, error: studentsError } = await supabase
        .from("students")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("status", "active")
        .in("id", action.participantIds);
      if (studentsError) databaseFailure(studentsError);
      if ((students ?? []).length !== new Set(action.participantIds).size) {
        throw new ApiFailure(422, {
          code: "TARGET_NOT_ACTIVE",
          message: "Wybierz aktywnych uczniów z bieżącego obszaru roboczego.",
        });
      }
      const rows = [...new Set(action.participantIds)].map((studentId) => ({
        workspace_id: workspaceId,
        lesson_id: action.conflictingLessonId,
        student_id: studentId,
      }));
      if (rows.length) {
        const [{ error: participantError }, { error: attendanceError }] =
          await Promise.all([
            supabase.from("lesson_participants").upsert(rows, {
              onConflict: "lesson_id,student_id",
              ignoreDuplicates: true,
            }),
            supabase.from("attendances").upsert(rows, {
              onConflict: "lesson_id,student_id",
              ignoreDuplicates: true,
            }),
          ]);
        if (participantError) databaseFailure(participantError);
        if (attendanceError) databaseFailure(attendanceError);
      }
      result = { id: action.conflictingLessonId };
      break;
    }
    case "rescheduleLesson": {
      const { data, error } = await supabase.rpc(
        "reschedule_lesson_relational",
        {
          p_payload: {
            lessonId: action.lessonId,
            startsAt: action.startsAt,
            durationMinutes: action.durationMinutes,
            scope: action.scope ?? "single",
            expectedUpdatedAt: action.expectedUpdatedAt,
            allowOutsideAvailability: action.allowOutsideAvailability ?? false,
          },
        },
      );
      if (error) databaseFailure(error);
      result = data as MutationResponse["result"];
      break;
    }
    case "cancelLesson": {
      const { data, error } = await supabase.rpc("cancel_lesson_relational", {
        p_payload: {
          lessonId: action.lessonId,
          scope: action.scope ?? "single",
          expectedUpdatedAt: action.expectedUpdatedAt,
        },
      });
      if (error) databaseFailure(error);
      result = data as MutationResponse["result"];
      break;
    }
    case "updateLessonColor": {
      const { data, error } = await supabase.rpc(
        "update_lesson_color_relational",
        {
          p_payload: {
            lessonId: action.lessonId,
            color: action.color,
            scope: action.scope ?? "single",
            expectedUpdatedAt: action.expectedUpdatedAt,
          },
        },
      );
      if (error) databaseFailure(error);
      result = data as MutationResponse["result"];
      break;
    }
    case "setPayment": {
      const { data, error } = await supabase
        .from("lesson_participants")
        .update({
          payment_status: action.status,
          updated_at: new Date().toISOString(),
        })
        .eq("workspace_id", workspaceId)
        .eq("lesson_id", action.lessonId)
        .eq("student_id", action.studentId)
        .select("id")
        .maybeSingle();
      if (error) databaseFailure(error);
      if (!data) databaseFailure({ code: "PGRST116" });
      break;
    }
    case "retrySync":
    case "disableSync": {
      const syncStatus = action.type === "retrySync" ? "pending" : "disabled";
      const { data, error } = await supabase
        .from("lessons")
        .update({
          sync_status: syncStatus,
          sync_message: null,
          updated_at: new Date().toISOString(),
        })
        .eq("workspace_id", workspaceId)
        .eq("id", action.lessonId)
        .select("id,starts_at,status")
        .maybeSingle();
      if (error) databaseFailure(error);
      if (!data) databaseFailure({ code: "PGRST116" });
      if (syncStatus === "pending") {
        const { error: jobError } = await supabase
          .from("google_sync_jobs")
          .upsert(
            {
              workspace_id: workspaceId,
              teacher_id: teacherId,
              lesson_id: action.lessonId,
              google_event_id: googleEventIdForLesson(
                teacherId,
                action.lessonId,
              ),
              status: "pending",
              attempts: 0,
              next_attempt_at: new Date().toISOString(),
              last_error: null,
            },
            { onConflict: "teacher_id,lesson_id" },
          );
        if (jobError) databaseFailure(jobError);
      }
      break;
    }
    case "createAvailability": {
      const rule = action.rule;
      const start = new Date(rule.start);
      const end = new Date(rule.end);
      const time = (date: Date) => formatInTimeZone(date, timezone, "HH:mm:ss");
      const { data, error } = await supabase
        .from("availability_rules")
        .insert({
          workspace_id: workspaceId,
          tutor_id: teacherId,
          kind: rule.kind,
          label: rule.label,
          day_of_week: rule.kind === "recurring" ? rule.weekday : null,
          start_time:
            rule.kind === "recurring" && !rule.allDay ? time(start) : null,
          end_time:
            rule.kind === "recurring" && !rule.allDay ? time(end) : null,
          starts_at: rule.kind === "single" ? rule.start : null,
          ends_at: rule.kind === "single" ? rule.end : null,
          timezone,
          all_day: rule.allDay ?? false,
          is_available: rule.isAvailable ?? false,
        })
        .select("id")
        .single();
      if (error) databaseFailure(error);
      result = { id: data.id };
      break;
    }
    case "deleteAvailability": {
      const { data, error } = await supabase
        .from("availability_rules")
        .delete()
        .eq("workspace_id", workspaceId)
        .eq("id", action.ruleId)
        .select("id")
        .maybeSingle();
      if (error) databaseFailure(error);
      if (!data) databaseFailure({ code: "PGRST116" });
      break;
    }
    case "createAvailabilityException": {
      const value = action.exception;
      const { data, error } = await supabase
        .from("availability_exceptions")
        .insert({
          workspace_id: workspaceId,
          tutor_id: teacherId,
          exception_date: value.date,
          kind: value.kind,
          start_time: value.startTime ?? null,
          end_time: value.endTime ?? null,
          timezone: value.timezone,
          reason: value.reason || null,
        })
        .select("id")
        .single();
      if (error) databaseFailure(error);
      result = { id: data.id };
      break;
    }
    case "deleteAvailabilityException": {
      const { data, error } = await supabase
        .from("availability_exceptions")
        .delete()
        .eq("workspace_id", workspaceId)
        .eq("id", action.exceptionId)
        .select("id")
        .maybeSingle();
      if (error) databaseFailure(error);
      if (!data) databaseFailure({ code: "PGRST116" });
      break;
    }
    case "createCalendarBlock": {
      const { data, error } = await supabase.rpc(
        "upsert_calendar_block_with_color",
        {
          p_payload: {
            title: action.block.title,
            startsAt: action.block.startsAt,
            endsAt: action.block.endsAt,
            timezone: action.block.timezone,
            color: action.block.color ?? "#7F8A9A",
          },
        },
      );
      if (error) databaseFailure(error);
      result = data as MutationResponse["result"];
      break;
    }
    case "updateCalendarBlock": {
      const { data, error } = await supabase.rpc(
        "upsert_calendar_block_with_color",
        {
          p_payload: {
            blockId: action.blockId,
            title: action.block.title,
            startsAt: action.block.startsAt,
            endsAt: action.block.endsAt,
            timezone: action.block.timezone,
            color: action.block.color ?? "#7F8A9A",
            expectedUpdatedAt: action.expectedUpdatedAt,
          },
        },
      );
      if (error) databaseFailure(error);
      result = data as MutationResponse["result"];
      break;
    }
    case "deleteCalendarBlock": {
      const { data, error } = await supabase
        .from("calendar_blocks")
        .delete()
        .eq("workspace_id", workspaceId)
        .eq("id", action.blockId)
        .select("id")
        .maybeSingle();
      if (error) databaseFailure(error);
      if (!data) databaseFailure({ code: "PGRST116" });
      break;
    }
    case "saveLesson": {
      await saveLessonRelational(supabase, workspaceId, teacherId, action);
      break;
    }
  }
  return { data: await getAppData(teacherId), result };
}

async function saveLessonRelational(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  workspaceId: string,
  teacherId: string,
  action: Extract<AppAction, { type: "saveLesson" }>,
) {
  const { data: lesson, error: lessonError } = await supabase
    .from("lessons")
    .select("id,student_id,group_id,status,billing_type,sync_status")
    .eq("workspace_id", workspaceId)
    .eq("id", action.lessonId)
    .single();
  if (lessonError) databaseFailure(lessonError);
  if (lesson.status === "cancelled" && action.complete) {
    throw new ApiFailure(409, {
      code: "CANCELLED_LESSON_CANNOT_BE_COMPLETED",
      message: "Odwołanej lekcji nie można oznaczyć jako uzupełnioną.",
    });
  }
  const now = new Date().toISOString();
  if (
    action.complete &&
    lesson.billing_type === "package" &&
    lesson.student_id
  ) {
    const { data: packageRow, error: packageError } = await supabase
      .from("packages")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("student_id", lesson.student_id)
      .in("status", ["active", "exhausted"])
      .order("purchased_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (packageError) databaseFailure(packageError);
    if (packageRow) {
      const { error: usageError } = await supabase.rpc(
        "complete_lesson_with_package",
        {
          p_workspace_id: workspaceId,
          p_lesson_id: action.lessonId,
          p_student_id: lesson.student_id,
          p_package_id: packageRow.id,
          p_idempotency_key: `complete:${action.lessonId}:${lesson.student_id}`,
        },
      );
      if (usageError) databaseFailure(usageError);
    }
  }
  const nextSyncStatus =
    lesson.sync_status === "disabled" ? "disabled" : "pending";
  const { error: updateError } = await supabase
    .from("lessons")
    .update({
      title: action.topic,
      status: action.complete ? "completed" : lesson.status,
      completed_at: action.complete ? now : null,
      sync_status: nextSyncStatus,
      updated_at: now,
    })
    .eq("workspace_id", workspaceId)
    .eq("id", action.lessonId);
  if (updateError) databaseFailure(updateError);
  if (nextSyncStatus === "pending") {
    const { error: jobError } = await supabase.from("google_sync_jobs").upsert(
      {
        workspace_id: workspaceId,
        teacher_id: teacherId,
        lesson_id: action.lessonId,
        google_event_id: googleEventIdForLesson(teacherId, action.lessonId),
        status: "pending",
        attempts: 0,
        next_attempt_at: now,
        last_error: null,
      },
      { onConflict: "teacher_id,lesson_id" },
    );
    if (jobError) databaseFailure(jobError);
  }
  if (action.complete) {
    const { error: reminderError } = await supabase
      .from("reminder_deliveries")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("lesson_id", action.lessonId)
      .in("status", ["pending", "failed"]);
    if (reminderError) databaseFailure(reminderError);
  }

  const keepPlanIds = action.planItems
    .filter((item) => item.text.trim())
    .map((item) => item.id);
  if (keepPlanIds.length) {
    const { error } = await supabase.from("lesson_plan_items").upsert(
      action.planItems
        .filter((item) => item.text.trim())
        .map((item, position) => ({
          id: item.id,
          workspace_id: workspaceId,
          lesson_id: action.lessonId,
          position,
          content: item.text.trim(),
          updated_at: now,
        })),
      { onConflict: "id" },
    );
    if (error) databaseFailure(error);
    const { error: deleteError } = await supabase
      .from("lesson_plan_items")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("lesson_id", action.lessonId)
      .not("id", "in", `(${keepPlanIds.join(",")})`);
    if (deleteError) databaseFailure(deleteError);
  } else {
    const { error } = await supabase
      .from("lesson_plan_items")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("lesson_id", action.lessonId);
    if (error) databaseFailure(error);
  }

  for (const participant of action.participants) {
    const { data: relation, error } = await supabase
      .from("lesson_participants")
      .update({ payment_status: participant.paymentStatus, updated_at: now })
      .eq("workspace_id", workspaceId)
      .eq("lesson_id", action.lessonId)
      .eq("student_id", participant.studentId)
      .select("id")
      .single();
    if (error) databaseFailure(error);
    const { error: attendanceError } = await supabase
      .from("attendances")
      .upsert(
        {
          workspace_id: workspaceId,
          lesson_id: action.lessonId,
          student_id: participant.studentId,
          status: participant.attendanceStatus,
          marked_at: participant.attendanceStatus === "unknown" ? null : now,
          updated_at: now,
        },
        { onConflict: "lesson_id,student_id" },
      );
    if (attendanceError) databaseFailure(attendanceError);
    if (participant.results.length) {
      const { error: resultsError } = await supabase
        .from("plan_item_results")
        .upsert(
          participant.results
            .filter((entry) => keepPlanIds.includes(entry.planItemId))
            .map((entry) => ({
              workspace_id: workspaceId,
              lesson_participant_id: relation.id,
              plan_item_id: entry.planItemId,
              completed: entry.completed,
              score: entry.score ?? null,
              note: entry.note ?? null,
              updated_at: now,
            })),
          { onConflict: "lesson_participant_id,plan_item_id" },
        );
      if (resultsError) databaseFailure(resultsError);
    }
  }
  const { error: noteError } = await supabase.from("lesson_notes").upsert(
    {
      workspace_id: workspaceId,
      lesson_id: action.lessonId,
      author_user_id: teacherId,
      content: action.generalNotes,
      note_type: "general",
      visibility: "private",
      updated_at: now,
    },
    { onConflict: "lesson_id,author_user_id,note_type" },
  );
  if (noteError) databaseFailure(noteError);
  const homeworkTarget = lesson.student_id
    ? { student_id: lesson.student_id, group_id: null }
    : { student_id: null, group_id: lesson.group_id };
  const { error: homeworkError } = await supabase.from("homeworks").upsert(
    {
      workspace_id: workspaceId,
      lesson_id: action.lessonId,
      ...homeworkTarget,
      title: "Praca domowa",
      description: action.homework,
      updated_at: now,
    },
    { onConflict: "lesson_id" },
  );
  if (homeworkError) databaseFailure(homeworkError);
}

export async function mutatePeopleDomain(
  teacherId: string,
  action: PeopleAction,
): Promise<MutationResponse> {
  if (localAllowed()) {
    throw new Error("LOCAL_PEOPLE_ACTION_MUST_USE_STORE");
  }
  const { supabase, workspaceId, subscription } =
    await loadWriteContext(teacherId);
  let result: MutationResponse["result"];

  switch (action.type) {
    case "createStudent": {
      const { count: activeStudents, error: countError } = await supabase
        .from("students")
        .select("id", { count: "exact", head: true })
        .eq("workspace_id", workspaceId)
        .eq("status", "active");
      if (countError) databaseFailure(countError);
      assertActiveStudentCapacity(subscription, activeStudents ?? 0);
      const displayName = studentDisplayName(action.student);
      if (!action.student.allowDuplicate) {
        const { data: candidates, error } = await supabase
          .from("students")
          .select("id,display_name,email,phone")
          .eq("workspace_id", workspaceId);
        if (error) databaseFailure(error);
        const duplicateIds = findProbableDuplicateIds(
          action.student,
          (candidates ?? []).map((candidate) => ({
            id: candidate.id,
            displayName: candidate.display_name,
            email: candidate.email,
            phone: candidate.phone,
          })),
        );
        if (duplicateIds.length) {
          throw new ApiFailure(409, {
            code: "POSSIBLE_DUPLICATE",
            message: "Uczeń o podobnych danych już istnieje.",
            details: { studentIds: duplicateIds },
          });
        }
      }
      const { data, error } = await supabase
        .from("students")
        .insert({
          workspace_id: workspaceId,
          first_name: action.student.firstName.trim(),
          last_name: action.student.lastName.trim(),
          display_name: displayName,
          email: action.student.email.trim() || null,
          phone: action.student.phone.trim() || null,
          subject: action.student.subject.trim() || null,
          level: action.student.level.trim() || null,
          goal: action.student.goal?.trim() || null,
          notes: action.student.notes?.trim() || null,
          status: "active",
          default_lesson_duration_minutes:
            action.student.defaultDurationMinutes ?? 60,
          default_format: action.student.defaultFormat ?? "online",
          default_location: action.student.defaultLocation?.trim() || null,
          default_lesson_price_grosz:
            action.student.defaultPrice?.amount ?? null,
          currency: action.student.defaultPrice?.currency ?? "PLN",
          timezone: action.student.timezone?.trim() || null,
        })
        .select("id")
        .single();
      if (error) databaseFailure(error);
      result = { id: data.id };
      break;
    }
    case "updateStudent": {
      const displayName = studentDisplayName(action.patch);
      const { data, error } = await supabase
        .from("students")
        .update({
          first_name: action.patch.firstName.trim(),
          last_name: action.patch.lastName.trim(),
          display_name: displayName,
          email: action.patch.email.trim() || null,
          phone: action.patch.phone.trim() || null,
          subject: action.patch.subject.trim() || null,
          level: action.patch.level.trim() || null,
          goal: action.patch.goal?.trim() || null,
          notes: action.patch.notes?.trim() || null,
          default_lesson_duration_minutes:
            action.patch.defaultDurationMinutes ?? 60,
          default_format: action.patch.defaultFormat ?? "online",
          default_location: action.patch.defaultLocation?.trim() || null,
          default_lesson_price_grosz: action.patch.defaultPrice?.amount ?? null,
          currency: action.patch.defaultPrice?.currency ?? "PLN",
          timezone: action.patch.timezone?.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("workspace_id", workspaceId)
        .eq("id", action.studentId)
        .select("id")
        .maybeSingle();
      if (error) databaseFailure(error);
      if (!data) databaseFailure({ code: "PGRST116" });
      break;
    }
    case "setStudentStatus": {
      if (action.status === "active") {
        const [{ data: existing, error: existingError }, countResult] =
          await Promise.all([
            supabase
              .from("students")
              .select("status")
              .eq("workspace_id", workspaceId)
              .eq("id", action.studentId)
              .maybeSingle(),
            supabase
              .from("students")
              .select("id", { count: "exact", head: true })
              .eq("workspace_id", workspaceId)
              .eq("status", "active"),
          ]);
        if (existingError) databaseFailure(existingError);
        if (!existing) databaseFailure({ code: "PGRST116" });
        if (countResult.error) databaseFailure(countResult.error);
        if (existing.status === "archived") {
          assertActiveStudentCapacity(subscription, countResult.count ?? 0);
        }
      }
      const { data, error } = await supabase
        .from("students")
        .update({
          status: action.status,
          archived_at:
            action.status === "archived" ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq("workspace_id", workspaceId)
        .eq("id", action.studentId)
        .select("id")
        .maybeSingle();
      if (error) databaseFailure(error);
      if (!data) databaseFailure({ code: "PGRST116" });
      break;
    }
    case "createStudentContact": {
      const { data, error } = await supabase.rpc("create_student_contact", {
        p_student_id: action.studentId,
        p_first_name: action.contact.firstName,
        p_last_name: action.contact.lastName,
        p_email: action.contact.email,
        p_phone: action.contact.phone,
        p_type: action.contact.type,
        p_relationship: action.contact.relationship,
        p_is_primary: action.contact.isPrimary,
        p_is_billing_contact: action.contact.isBillingContact,
      });
      if (error) databaseFailure(error);
      result = { id: data as string };
      break;
    }
    case "updateStudentContact": {
      const { data, error } = await supabase.rpc("update_student_contact", {
        p_relation_id: action.relationId,
        p_first_name: action.contact.firstName,
        p_last_name: action.contact.lastName,
        p_email: action.contact.email,
        p_phone: action.contact.phone,
        p_type: action.contact.type,
        p_relationship: action.contact.relationship,
        p_is_primary: action.contact.isPrimary,
        p_is_billing_contact: action.contact.isBillingContact,
      });
      if (error) databaseFailure(error);
      result = { id: data as string };
      break;
    }
    case "removeStudentContact": {
      const { data, error } = await supabase
        .from("student_contacts")
        .delete()
        .eq("workspace_id", workspaceId)
        .eq("id", action.relationId)
        .select("id")
        .maybeSingle();
      if (error) databaseFailure(error);
      if (!data) databaseFailure({ code: "PGRST116" });
      break;
    }
    case "createGroup": {
      const { data, error } = await supabase
        .from("groups")
        .insert({
          workspace_id: workspaceId,
          name: action.group.name.trim(),
          subject: action.group.subject.trim() || null,
          level: action.group.level.trim() || null,
          status: "active",
          default_duration_minutes: action.group.defaultDurationMinutes,
          default_price_grosz: action.group.defaultPrice?.amount ?? null,
          currency: action.group.defaultPrice?.currency ?? "PLN",
          notes: action.group.notes.trim() || null,
          is_ad_hoc: false,
        })
        .select("id")
        .single();
      if (error) databaseFailure(error);
      result = { id: data.id };
      break;
    }
    case "updateGroup": {
      const { data, error } = await supabase
        .from("groups")
        .update({
          name: action.patch.name.trim(),
          subject: action.patch.subject.trim() || null,
          level: action.patch.level.trim() || null,
          default_duration_minutes: action.patch.defaultDurationMinutes,
          default_price_grosz: action.patch.defaultPrice?.amount ?? null,
          currency: action.patch.defaultPrice?.currency ?? "PLN",
          notes: action.patch.notes.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("workspace_id", workspaceId)
        .eq("id", action.groupId)
        .eq("is_ad_hoc", false)
        .select("id")
        .maybeSingle();
      if (error) databaseFailure(error);
      if (!data) databaseFailure({ code: "PGRST116" });
      break;
    }
    case "setGroupStatus": {
      const { data, error } = await supabase
        .from("groups")
        .update({
          status: action.status,
          archived_at:
            action.status === "archived" ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq("workspace_id", workspaceId)
        .eq("id", action.groupId)
        .eq("is_ad_hoc", false)
        .select("id")
        .maybeSingle();
      if (error) databaseFailure(error);
      if (!data) databaseFailure({ code: "PGRST116" });
      break;
    }
    case "addGroupMembers": {
      const studentIds = [...new Set(action.studentIds)];
      const { data, error } = await supabase.rpc("add_group_members", {
        p_group_id: action.groupId,
        p_student_ids: studentIds,
      });
      if (error) databaseFailure(error);
      result = { ids: studentIds, id: String(data ?? studentIds.length) };
      break;
    }
    case "removeGroupMember": {
      const { data, error } = await supabase
        .from("group_members")
        .update({ status: "suspended", left_at: new Date().toISOString() })
        .eq("workspace_id", workspaceId)
        .eq("group_id", action.groupId)
        .eq("student_id", action.studentId)
        .eq("status", "active")
        .select("id")
        .maybeSingle();
      if (error) databaseFailure(error);
      if (!data) databaseFailure({ code: "PGRST116" });
      break;
    }
  }

  return { data: await getAppData(teacherId), result };
}

async function enqueueReminders(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  workspaceId: string,
  teacherId: string,
  lessons: Array<{ id: string; startsAt: string; status: string }>,
) {
  const now = Date.now();
  const rows = lessons
    .filter(
      (lesson) =>
        lesson.status === "scheduled" &&
        new Date(lesson.startsAt).getTime() > now,
    )
    .flatMap((lesson) =>
      [60, 1440].map((lead) => ({
        workspace_id: workspaceId,
        teacher_id: teacherId,
        lesson_id: lesson.id,
        lead_minutes: lead,
        scheduled_for: new Date(
          new Date(lesson.startsAt).getTime() - lead * 60_000,
        ).toISOString(),
        status: "pending",
        next_attempt_at: new Date().toISOString(),
        last_error: null,
      })),
    );
  if (rows.length) {
    const lessonIds = [...new Set(rows.map((row) => row.lesson_id))];
    const { error: deleteError } = await supabase
      .from("reminder_deliveries")
      .delete()
      .eq("teacher_id", teacherId)
      .in("lesson_id", lessonIds)
      .in("status", ["pending", "failed"]);
    if (deleteError) throw deleteError;
    const { error } = await supabase.from("reminder_deliveries").upsert(rows, {
      onConflict: "teacher_id,lesson_id,lead_minutes",
      ignoreDuplicates: true,
    });
    if (error) throw error;
  }
}

async function enqueuePendingSync(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  workspaceId: string,
  teacherId: string,
  lessons: Array<{ id: string; syncStatus: string }>,
) {
  const jobs = lessons
    .filter((lesson) => lesson.syncStatus === "pending")
    .map((lesson) => ({
      workspace_id: workspaceId,
      teacher_id: teacherId,
      lesson_id: lesson.id,
      google_event_id: googleEventIdForLesson(teacherId, lesson.id),
      status: "pending",
      next_attempt_at: new Date().toISOString(),
      last_error: null,
    }));
  if (jobs.length) {
    const { error } = await supabase
      .from("google_sync_jobs")
      .upsert(jobs, { onConflict: "teacher_id,lesson_id" });
    if (error) throw error;
  }
}

export async function getAppData(
  teacherId: string,
  range?: { start: string; end: string },
): Promise<AppData> {
  if (localAllowed()) {
    const data = await local.getAppData(teacherId);
    if (!range) return data;
    const rangeStart = Date.parse(range.start);
    return {
      ...data,
      lessons: data.lessons.filter(
        (lesson) =>
          lesson.startsAt < range.end &&
          Date.parse(lesson.startsAt) + lesson.durationMinutes * 60_000 >
            rangeStart,
      ),
      calendarBlocks: data.calendarBlocks.filter(
        (block) => block.startsAt < range.end && block.endsAt > range.start,
      ),
      externalGoogleEvents: data.externalGoogleEvents.filter((event) =>
        event.allDay
          ? Boolean(
              event.startDate &&
              event.endDate &&
              event.startDate <= range.end.slice(0, 10) &&
              event.endDate >= range.start.slice(0, 10),
            )
          : Boolean(
              event.startsAt &&
              event.endsAt &&
              event.startsAt < range.end &&
              event.endsAt > range.start,
            ),
      ),
    };
  }
  return queryStore(
    teacherId,
    (store) => local.appDataFromStore(store, teacherId),
    range,
  );
}

export { localAllowed };

function stripTenant<T extends { teacherId: string }>(
  row: T,
): Omit<T, "teacherId"> {
  const copy: Partial<T> = { ...row };
  delete copy.teacherId;
  return copy as Omit<T, "teacherId">;
}
