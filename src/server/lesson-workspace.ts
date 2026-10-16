import "server-only";

import { createHash, randomUUID } from "node:crypto";
import type {
  LessonWorkspaceAction,
  LessonWorkspaceData,
  LessonWorkspaceMaterial,
  PreviousLessonReuseCandidate,
} from "@/lib/lesson-workspace";
import type { Lesson } from "@/lib/domain";
import { isSupabaseConfigured } from "./env";
import { ApiFailure, logServerError } from "./errors";
import * as local from "./store";
import { createSupabaseServerClient } from "./supabase";
import { DEFAULT_CALENDAR_COLOR } from "@/lib/calendar-colors";
import {
  getLessonStudentOutcomes,
  upsertLessonStudentOutcome,
} from "./student-outcomes";
import { getStudentMemory } from "./student-memory";
import { composeNextLessonBriefing } from "@/lib/next-lesson-briefing";
import { composeLessonPreparationContext } from "@/lib/preparation-context";

const localAdapterEnabled = () =>
  process.env.NODE_ENV !== "production" &&
  (Boolean(process.env.TUTORFLOW_DATA_DIR) || !isSupabaseConfigured());

export async function getLessonWorkspace(
  teacherId: string,
  lessonId: string,
): Promise<LessonWorkspaceData> {
  let workspace: LessonWorkspaceData;
  if (localAdapterEnabled()) {
    workspace = await local.queryStore((store) =>
      workspaceFromLocalStore(store, teacherId, lessonId),
    );
  } else {
    workspace = await getRelationalWorkspace(teacherId, lessonId);
  }
  return withBriefing(teacherId, workspace);
}

export async function mutateLessonWorkspace(
  teacherId: string,
  lessonId: string,
  action: LessonWorkspaceAction,
): Promise<LessonWorkspaceData> {
  if (action.type === "saveStudentOutcome") {
    await upsertLessonStudentOutcome({
      teacherId,
      lessonId,
      studentId: action.studentId,
      progressSummary: action.progressSummary,
      difficultyLevel: action.difficultyLevel,
      difficultyNote: action.difficultyNote,
      nextStep: action.nextStep,
    });
    return getLessonWorkspace(teacherId, lessonId);
  }
  if (localAdapterEnabled()) {
    await local.mutateStore((store) =>
      mutateLocalWorkspace(store, teacherId, lessonId, action),
    );
    return getLessonWorkspace(teacherId, lessonId);
  }
  await mutateRelationalWorkspace(teacherId, lessonId, action);
  return withBriefing(
    teacherId,
    await getRelationalWorkspace(teacherId, lessonId),
  );
}

async function withBriefing(
  teacherId: string,
  workspace: LessonWorkspaceData,
): Promise<LessonWorkspaceData> {
  const prepared = {
    ...workspace,
    preparationContext: composeLessonPreparationContext(workspace),
  };
  if (
    workspace.lesson.status !== "scheduled" &&
    workspace.lesson.status !== "needs_completion"
  ) {
    return prepared;
  }
  const generatedAt = new Date().toISOString();
  const memories = await Promise.all(
    workspace.participants.map((participant) =>
      getStudentMemory(teacherId, participant.studentId, generatedAt),
    ),
  );
  return {
    ...prepared,
    briefing: composeNextLessonBriefing(prepared, memories, generatedAt),
  };
}

async function writeContext(teacherId: string) {
  const supabase = await createSupabaseServerClient();
  const [{ data: auth }, tutor, subscription] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("tutor_profiles")
      .select("workspace_id")
      .eq("user_id", teacherId)
      .single(),
    supabase
      .from("subscriptions")
      .select("read_only")
      .eq("teacher_id", teacherId)
      .single(),
  ]);
  if (auth.user?.id !== teacherId) unauthenticated();
  if (tutor.error || subscription.error) notFound();
  if (subscription.data.read_only) {
    throw new ApiFailure(403, {
      code: "READ_ONLY",
      message: "W trybie tylko do odczytu nie można zmieniać zajęć.",
    });
  }
  return { supabase, workspaceId: tutor.data.workspace_id as string };
}

async function getRelationalWorkspace(
  teacherId: string,
  lessonId: string,
): Promise<LessonWorkspaceData> {
  const supabase = await createSupabaseServerClient();
  const [{ data: auth }, profile, tutor, subscription] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("profiles").select("timezone").eq("id", teacherId).single(),
    supabase
      .from("tutor_profiles")
      .select("workspace_id")
      .eq("user_id", teacherId)
      .single(),
    supabase
      .from("subscriptions")
      .select("read_only")
      .eq("teacher_id", teacherId)
      .single(),
  ]);
  if (auth.user?.id !== teacherId) unauthenticated();
  if (profile.error || tutor.error || subscription.error) notFound();
  const workspaceId = tutor.data.workspace_id as string;
  const { data: lesson, error: lessonError } = await supabase
    .from("lessons")
    .select(
      "id,color,student_id,group_id,title,subject,starts_at,ends_at,timezone,status,format,location,meeting_url,sync_status,created_at,updated_at,billing_type,price_grosz,currency,recurring_series_id",
    )
    .eq("workspace_id", workspaceId)
    .eq("id", lessonId)
    .maybeSingle();
  if (lessonError) databaseFailure(lessonError);
  if (!lesson) notFound();

  const targetColumn = lesson.student_id ? "student_id" : "group_id";
  const targetId = (lesson.student_id ?? lesson.group_id) as string;
  const [
    participantsResult,
    outcomesResult,
    planResult,
    notesResult,
    homeworkResult,
    linksResult,
    libraryResult,
    groupResult,
    previousResult,
    nextResult,
    reuseLessonsResult,
  ] = await Promise.all([
    supabase
      .from("lesson_participants")
      .select("id,student_id,payment_status")
      .eq("workspace_id", workspaceId)
      .eq("lesson_id", lessonId)
      .order("created_at"),
    getLessonStudentOutcomes(supabase, workspaceId, lessonId).then(
      (data) => ({ data, error: null }),
      (error) => ({ data: null, error }),
    ),
    supabase
      .from("lesson_plan_items")
      .select(
        "id,position,content,title,instructions,estimated_minutes,completed",
      )
      .eq("workspace_id", workspaceId)
      .eq("lesson_id", lessonId)
      .order("position"),
    supabase
      .from("lesson_notes")
      .select("note_type,content,visibility,updated_at")
      .eq("workspace_id", workspaceId)
      .eq("lesson_id", lessonId)
      .in("note_type", ["general", "student_summary", "objectives"]),
    supabase
      .from("homeworks")
      .select("id,title,description,status,due_at,updated_at")
      .eq("workspace_id", workspaceId)
      .eq("lesson_id", lessonId)
      .maybeSingle(),
    supabase
      .from("lesson_materials")
      .select("material_id")
      .eq("workspace_id", workspaceId)
      .eq("lesson_id", lessonId),
    supabase
      .from("materials")
      .select(
        "id,title,description,type,text_content,file_url,external_url,subject,level,archived_at,created_at,updated_at",
      )
      .eq("workspace_id", workspaceId)
      .order("title")
      .limit(500),
    lesson.group_id
      ? supabase
          .from("groups")
          .select("id,name,subject,level,status")
          .eq("workspace_id", workspaceId)
          .eq("id", lesson.group_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from("lessons")
      .select("id,starts_at,title")
      .eq("workspace_id", workspaceId)
      .eq(targetColumn, targetId)
      .lt("starts_at", lesson.starts_at)
      .neq("status", "cancelled")
      .order("starts_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("lessons")
      .select("id,starts_at,title")
      .eq("workspace_id", workspaceId)
      .eq(targetColumn, targetId)
      .gt("starts_at", lesson.starts_at)
      .neq("status", "cancelled")
      .order("starts_at")
      .limit(1)
      .maybeSingle(),
    supabase
      .from("lessons")
      .select("id,starts_at,title")
      .eq("workspace_id", workspaceId)
      .eq(targetColumn, targetId)
      .eq("status", "completed")
      .lt("starts_at", lesson.starts_at)
      .order("starts_at", { ascending: false })
      .limit(5),
  ]);
  const failure = [
    participantsResult,
    outcomesResult,
    planResult,
    notesResult,
    homeworkResult,
    linksResult,
    libraryResult,
    groupResult,
    previousResult,
    nextResult,
    reuseLessonsResult,
  ].find((result) => result.error);
  if (failure?.error) databaseFailure(failure.error);

  const participantRows = participantsResult.data ?? [];
  const studentIds = participantRows.map((row) => row.student_id as string);
  const reuseLessonIds = (reuseLessonsResult.data ?? []).map((row) =>
    String(row.id),
  );
  const [
    studentsResult,
    attendanceResult,
    studentMaterialsResult,
    groupMaterialsResult,
    consumedPackageResult,
    chargeResult,
    reusePlanResult,
    reuseObjectiveResult,
    reuseLinksResult,
    homeworkAssignmentsResult,
    homeworkMaterialsResult,
  ] = await Promise.all([
    studentIds.length
      ? supabase
          .from("students")
          .select("id,display_name,subject,level,status")
          .eq("workspace_id", workspaceId)
          .in("id", studentIds)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("attendances")
      .select("student_id,status")
      .eq("workspace_id", workspaceId)
      .eq("lesson_id", lessonId),
    studentIds.length
      ? supabase
          .from("student_material_assignments")
          .select("student_id,material_id")
          .eq("workspace_id", workspaceId)
          .in("student_id", studentIds)
      : Promise.resolve({ data: [], error: null }),
    lesson.group_id
      ? supabase
          .from("group_material_assignments")
          .select("group_id,material_id")
          .eq("workspace_id", workspaceId)
          .eq("group_id", lesson.group_id)
      : Promise.resolve({ data: [], error: null }),
    lesson.student_id && lesson.billing_type === "package"
      ? supabase
          .from("package_usages")
          .select("id,package_id")
          .eq("workspace_id", workspaceId)
          .eq("lesson_id", lessonId)
          .eq("kind", "consumption")
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    lesson.student_id &&
    ["per_lesson", "per_student"].includes(lesson.billing_type)
      ? supabase
          .from("charge_balances")
          .select(
            "status,outstanding_grosz,due_at,is_overdue,currency,amount_grosz",
          )
          .eq("workspace_id", workspaceId)
          .eq("lesson_id", lessonId)
          .eq("student_id", lesson.student_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    reuseLessonIds.length
      ? supabase
          .from("lesson_plan_items")
          .select(
            "id,lesson_id,position,content,title,instructions,estimated_minutes,completed",
          )
          .eq("workspace_id", workspaceId)
          .in("lesson_id", reuseLessonIds)
          .order("position")
      : Promise.resolve({ data: [], error: null }),
    reuseLessonIds.length
      ? supabase
          .from("lesson_notes")
          .select("lesson_id,content")
          .eq("workspace_id", workspaceId)
          .eq("author_user_id", teacherId)
          .eq("note_type", "objectives")
          .in("lesson_id", reuseLessonIds)
      : Promise.resolve({ data: [], error: null }),
    reuseLessonIds.length
      ? supabase
          .from("lesson_materials")
          .select("lesson_id,material_id")
          .eq("workspace_id", workspaceId)
          .in("lesson_id", reuseLessonIds)
      : Promise.resolve({ data: [], error: null }),
    homeworkResult.data
      ? supabase
          .from("homework_assignments")
          .select(
            "id,student_id,status,feedback,completed_at,reviewed_at,updated_at",
          )
          .eq("workspace_id", workspaceId)
          .eq("homework_id", homeworkResult.data.id)
          .order("created_at")
      : Promise.resolve({ data: [], error: null }),
    homeworkResult.data
      ? supabase
          .from("homework_materials")
          .select("material_id")
          .eq("workspace_id", workspaceId)
          .eq("homework_id", homeworkResult.data.id)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (
    studentsResult.error ||
    attendanceResult.error ||
    studentMaterialsResult.error ||
    groupMaterialsResult.error ||
    consumedPackageResult.error ||
    chargeResult.error ||
    reusePlanResult.error ||
    reuseObjectiveResult.error ||
    reuseLinksResult.error ||
    homeworkAssignmentsResult.error ||
    homeworkMaterialsResult.error
  ) {
    databaseFailure(
      studentsResult.error ??
        attendanceResult.error ??
        studentMaterialsResult.error ??
        groupMaterialsResult.error ??
        consumedPackageResult.error ??
        chargeResult.error ??
        reusePlanResult.error ??
        reuseObjectiveResult.error ??
        reuseLinksResult.error ??
        homeworkAssignmentsResult.error ??
        homeworkMaterialsResult.error,
    );
  }
  const reuseMaterialIds = [
    ...new Set(
      (reuseLinksResult.data ?? []).map((row) => String(row.material_id)),
    ),
  ];
  const reuseMaterialsResult = reuseMaterialIds.length
    ? await supabase
        .from("materials")
        .select(
          "id,title,description,type,text_content,file_url,external_url,subject,level,archived_at,created_at,updated_at",
        )
        .eq("workspace_id", workspaceId)
        .in("id", reuseMaterialIds)
    : { data: [], error: null };
  if (reuseMaterialsResult.error) databaseFailure(reuseMaterialsResult.error);
  const packageResult =
    lesson.student_id && lesson.billing_type === "package"
      ? consumedPackageResult.data
        ? await supabase
            .from("packages")
            .select("id,name,status")
            .eq("workspace_id", workspaceId)
            .eq("id", consumedPackageResult.data.package_id)
            .maybeSingle()
        : await supabase
            .from("packages")
            .select("id,name,status")
            .eq("workspace_id", workspaceId)
            .eq("student_id", lesson.student_id)
            .eq("status", "active")
            .order("purchased_at")
            .limit(1)
            .maybeSingle()
      : { data: null, error: null };
  if (packageResult.error) databaseFailure(packageResult.error);
  const packageRow = packageResult.data;
  const balanceResult = packageRow
    ? await supabase
        .from("package_balances")
        .select("remaining_lessons")
        .eq("workspace_id", workspaceId)
        .eq("package_id", packageRow.id)
        .single()
    : { data: null, error: null };
  if (balanceResult.error) databaseFailure(balanceResult.error);
  const usageResult = consumedPackageResult;

  const students = new Map(
    (studentsResult.data ?? []).map((student) => [student.id, student]),
  );
  const attendance = new Map(
    (attendanceResult.data ?? []).map((row) => [row.student_id, row.status]),
  );
  const outcomes = new Map(
    (outcomesResult.data ?? []).map((outcome) => [outcome.studentId, outcome]),
  );
  const notes = new Map(
    (notesResult.data ?? []).map((note) => [note.note_type, note]),
  );
  const attachedIds = new Set(
    (linksResult.data ?? []).map((row) => row.material_id as string),
  );
  const studentMaterialRows = studentMaterialsResult.data ?? [];
  const groupMaterialRows = groupMaterialsResult.data ?? [];
  const assignedIds = new Set([
    ...studentMaterialRows.map((row) => row.material_id as string),
    ...groupMaterialRows.map((row) => row.material_id as string),
  ]);
  const homeworkMaterialIds = new Set(
    (homeworkMaterialsResult.data ?? []).map(
      (row) => row.material_id as string,
    ),
  );
  const library = (libraryResult.data ?? [])
    .filter(
      (row) =>
        !row.archived_at ||
        attachedIds.has(row.id) ||
        assignedIds.has(row.id) ||
        homeworkMaterialIds.has(row.id),
    )
    .map((row) => materialView(row, attachedIds.has(row.id)));
  const participants = participantRows.map((row) => {
    const student = students.get(row.student_id)!;
    return {
      id: row.id as string,
      studentId: row.student_id as string,
      name: student?.display_name ?? "Archiwalny uczeń",
      subject: student?.subject ?? "",
      level: student?.level ?? "",
      status:
        student?.status === "active"
          ? ("active" as const)
          : ("archived" as const),
      attendanceStatus: (attendance.get(row.student_id) ??
        "unknown") as LessonWorkspaceData["participants"][number]["attendanceStatus"],
      outcome: outcomes.get(row.student_id as string),
    };
  });
  const group = groupResult.data;
  const first = participants[0];
  const privateNote = notes.get("general");
  const summary = notes.get("student_summary");
  const objectives = notes.get("objectives");
  const previousLessons = relationalReuseCandidates(
    reuseLessonsResult.data ?? [],
    reusePlanResult.data ?? [],
    reuseObjectiveResult.data ?? [],
    reuseLinksResult.data ?? [],
    reuseMaterialsResult.data ?? [],
  );

  return {
    teacher: {
      timezone: profile.data.timezone,
      readOnly: subscription.data.read_only,
    },
    lesson: {
      id: lesson.id,
      color: lesson.color ?? DEFAULT_CALENDAR_COLOR,
      seriesId: lesson.recurring_series_id ?? undefined,
      studentId: lesson.student_id ?? undefined,
      groupId: lesson.group_id ?? undefined,
      participantLabel:
        group?.name ??
        (participants.map((item) => item.name).join(", ") || "Lekcja"),
      subject: lesson.subject ?? group?.subject ?? first?.subject ?? "",
      level: group?.level ?? first?.level ?? "",
      startsAt: lesson.starts_at,
      endsAt: lesson.ends_at,
      durationMinutes: Math.round(
        (Date.parse(lesson.ends_at) - Date.parse(lesson.starts_at)) / 60_000,
      ),
      format: lesson.format,
      location: lesson.location ?? "",
      meetingUrl: lesson.meeting_url ?? undefined,
      status: lesson.status,
      syncStatus: lesson.sync_status,
      topic: lesson.title,
      objectives: objectives?.content ?? "",
      planItems: (planResult.data ?? []).map((item) => ({
        id: item.id,
        position: item.position,
        title: item.title?.trim() || item.content,
        instructions: item.instructions ?? "",
        minutes: item.estimated_minutes ?? undefined,
        completed: Boolean(item.completed),
      })),
      privateNote: privateNote?.content ?? "",
      privateNoteUpdatedAt: privateNote?.updated_at,
      summary: summary?.content ?? "",
      summaryUpdatedAt: summary?.updated_at,
      createdAt: lesson.created_at,
      updatedAt: lesson.updated_at,
    },
    participants,
    homework: homeworkResult.data
      ? {
          id: homeworkResult.data.id,
          title: homeworkResult.data.title,
          description: homeworkResult.data.description ?? "",
          status: homeworkResult.data.status,
          dueAt: homeworkResult.data.due_at ?? undefined,
          updatedAt: homeworkResult.data.updated_at,
          recipients: (homeworkAssignmentsResult.data ?? []).map(
            (assignment) => ({
              id: assignment.id as string,
              studentId: assignment.student_id as string,
              studentName:
                students.get(assignment.student_id)?.display_name ??
                "Archiwalny uczeń",
              status: assignment.status,
              feedback: assignment.feedback ?? undefined,
              completedAt: assignment.completed_at ?? undefined,
              reviewedAt: assignment.reviewed_at ?? undefined,
              updatedAt: assignment.updated_at,
            }),
          ),
          materials: library
            .filter((material) => homeworkMaterialIds.has(material.id))
            .map((material) => ({
              id: material.id,
              title: material.title,
              type: material.type,
              url: material.url,
              archived: material.archived,
            })),
        }
      : undefined,
    materials: library.filter((item) => item.attached),
    materialLibrary: library.filter((item) => !item.attached),
    availableMaterials: availableMaterials(
      library,
      studentMaterialRows,
      groupMaterialRows,
      students,
      group?.name,
    ),
    packageContext:
      packageRow && balanceResult.data
        ? {
            id: packageRow.id,
            name: packageRow.name,
            remainingLessons: Number(balanceResult.data.remaining_lessons),
            consumedByLesson: Boolean(usageResult.data),
          }
        : undefined,
    financialContext: {
      mode: lesson.billing_type,
      amount:
        lesson.price_grosz === null ? undefined : Number(lesson.price_grosz),
      currency: lesson.currency,
      status:
        lesson.billing_type === "package"
          ? "package"
          : chargeResult.data
            ? Number(chargeResult.data.outstanding_grosz) === 0
              ? "paid"
              : chargeResult.data.status === "partial"
                ? "partial"
                : "unpaid"
            : "not_created",
      outstanding: chargeResult.data
        ? Number(chargeResult.data.outstanding_grosz)
        : undefined,
      dueAt: chargeResult.data?.due_at ?? undefined,
      overdue: Boolean(chargeResult.data?.is_overdue),
    },
    previousLesson: previousResult.data
      ? {
          id: previousResult.data.id,
          startsAt: previousResult.data.starts_at,
          topic: previousResult.data.title,
        }
      : undefined,
    nextLesson: nextResult.data
      ? {
          id: nextResult.data.id,
          startsAt: nextResult.data.starts_at,
          topic: nextResult.data.title,
        }
      : undefined,
    previousLessons,
  };
}

function relationalReuseCandidates(
  lessons: Array<{ id: string; starts_at: string; title: string }>,
  sections: Array<{
    id: string;
    lesson_id: string;
    position: number;
    content: string;
    title?: string | null;
    instructions?: string | null;
    estimated_minutes?: number | null;
    completed?: boolean | null;
  }>,
  objectives: Array<{ lesson_id: string; content: string }>,
  links: Array<{ lesson_id: string; material_id: string }>,
  materials: Array<{
    id: string;
    title: string;
    description: string | null;
    type: "link" | "file" | "note";
    text_content: string | null;
    file_url: string | null;
    external_url: string | null;
    subject: string | null;
    level: string | null;
    archived_at: string | null;
    created_at: string;
    updated_at: string;
  }>,
): PreviousLessonReuseCandidate[] {
  const objectiveByLesson = new Map(
    objectives.map((item) => [item.lesson_id, item.content]),
  );
  const materialById = new Map(materials.map((item) => [item.id, item]));
  return lessons.map((source) => ({
    id: source.id,
    startsAt: source.starts_at,
    topic: source.title,
    objective: objectiveByLesson.get(source.id) ?? "",
    planItems: sections
      .filter((item) => item.lesson_id === source.id)
      .sort((a, b) => a.position - b.position)
      .map((item) => ({
        id: item.id,
        position: item.position,
        title: item.title?.trim() || item.content,
        instructions: item.instructions ?? "",
        minutes: item.estimated_minutes ?? undefined,
        completed: Boolean(item.completed),
      })),
    materials: links
      .filter((item) => item.lesson_id === source.id)
      .map((link) => {
        const material = materialById.get(link.material_id);
        if (!material) {
          return {
            id: link.material_id,
            title: "Materiał niedostępny",
            description: "Nie masz już dostępu do tego materiału.",
            type: "note" as const,
            attached: false,
            available: false,
          };
        }
        return {
          ...materialView(material, false),
          available: true,
        };
      }),
  }));
}

function availableMaterials(
  library: LessonWorkspaceMaterial[],
  studentRows: Array<{ student_id: string; material_id: string }>,
  groupRows: Array<{ group_id: string; material_id: string }>,
  students: ReadonlyMap<string, { display_name?: string | null }>,
  groupName?: string | null,
) {
  const byId = new Map(library.map((material) => [material.id, material]));
  const student = studentRows.flatMap((row) => {
    const material = byId.get(row.material_id);
    if (!material || material.attached) return [];
    return [
      {
        ...material,
        source: "student" as const,
        sourceLabel: students.get(row.student_id)?.display_name ?? "Uczeń",
      },
    ];
  });
  const group = groupRows.flatMap((row) => {
    const material = byId.get(row.material_id);
    if (!material || material.attached) return [];
    return [
      {
        ...material,
        source: "group" as const,
        sourceLabel: groupName ?? "Grupa",
      },
    ];
  });
  const reserved = new Set([
    ...student.map((item) => item.id),
    ...group.map((item) => item.id),
  ]);
  return {
    student: uniqueMaterials(student),
    group: uniqueMaterials(group),
    library: library
      .filter((item) => !item.attached && !reserved.has(item.id))
      .map((item) => ({ ...item, source: "library" as const })),
  };
}

function uniqueMaterials(items: LessonWorkspaceMaterial[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.id}:${item.sourceLabel ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function materialView(
  row: {
    id: string;
    title: string;
    description: string | null;
    type: "link" | "file" | "note";
    file_url: string | null;
    external_url: string | null;
    text_content: string | null;
    subject: string | null;
    level: string | null;
    archived_at: string | null;
    created_at: string;
    updated_at: string;
  },
  attached: boolean,
): LessonWorkspaceMaterial {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    type: row.type,
    url:
      row.type === "file"
        ? `/api/materials/${row.id}/open`
        : (row.external_url ?? undefined),
    attached,
    textContent: row.text_content ?? undefined,
    subject: row.subject ?? "",
    level: row.level ?? "",
    archived: Boolean(row.archived_at),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function mutateRelationalWorkspace(
  teacherId: string,
  lessonId: string,
  action: LessonWorkspaceAction,
) {
  const { supabase, workspaceId } = await writeContext(teacherId);
  const { data: lesson, error } = await supabase
    .from("lessons")
    .select("id,student_id,group_id,status,updated_at,tutor_id,sync_status")
    .eq("workspace_id", workspaceId)
    .eq("id", lessonId)
    .maybeSingle();
  if (error) databaseFailure(error);
  if (!lesson) notFound();
  const now = new Date().toISOString();
  const editable = !["cancelled", "no_show"].includes(lesson.status);

  if (action.type === "applyPreviousLesson") {
    if (!editable || lesson.status === "completed") lifecycleConflict();
    const { error: reuseError } = await supabase.rpc(
      "apply_previous_lesson_preparation",
      {
        target_lesson_id: lessonId,
        source_lesson_id: action.sourceLessonId,
        selected_section_ids: action.sectionIds,
        selected_material_ids: action.materialIds,
        include_objective: action.includeObjective,
        import_key: action.importKey,
      },
    );
    if (reuseError) databaseFailure(reuseError);
    return;
  }

  if (action.type === "applyTemplate") {
    if (!editable || lesson.status === "completed") lifecycleConflict();
    const { error: templateError } = await supabase.rpc(
      "apply_lesson_template",
      {
        target_lesson_id: lessonId,
        target_template_id: action.templateId,
      },
    );
    if (templateError) databaseFailure(templateError);
    return;
  }

  if (action.type === "updateColor") {
    const { error: colorError } = await supabase.rpc(
      "update_lesson_color_relational",
      {
        p_payload: {
          lessonId,
          color: action.color,
          scope: action.scope,
          expectedUpdatedAt: action.expectedUpdatedAt,
        },
      },
    );
    if (colorError) databaseFailure(colorError);
    return;
  }

  if (action.type === "updatePlan") {
    if (!editable) lifecycleConflict();
    const { error: planError } = await supabase.rpc("replace_lesson_plan", {
      target_lesson_id: lessonId,
      expected_updated_at: action.expectedUpdatedAt,
      lesson_topic: action.topic,
      lesson_objective: action.objectives,
      plan_items: action.items,
    });
    if (planError) databaseFailure(planError);
    return;
  }
  if (action.type === "saveNote") {
    if (!editable && lesson.status !== "completed") lifecycleConflict();
    const noteType =
      action.noteType === "private" ? "general" : "student_summary";
    if (action.expectedUpdatedAt) {
      const { data: current } = await supabase
        .from("lesson_notes")
        .select("updated_at")
        .eq("workspace_id", workspaceId)
        .eq("lesson_id", lessonId)
        .eq("author_user_id", teacherId)
        .eq("note_type", noteType)
        .maybeSingle();
      if (current && current.updated_at !== action.expectedUpdatedAt)
        staleWrite();
    }
    await upsertNote(
      supabase,
      workspaceId,
      lessonId,
      teacherId,
      noteType,
      action.noteType === "private" ? "private" : "student_visible",
      action.content,
      now,
    );
    return;
  }
  if (action.type === "upsertHomework") {
    if (!editable && lesson.status !== "completed") lifecycleConflict();
    const { error: homeworkError } = await supabase.rpc(
      "upsert_lesson_homework",
      {
        target_lesson_id: lessonId,
        homework_title: action.title,
        homework_description: action.description,
        homework_due_at: action.dueAt ?? null,
        recipient_ids: action.recipientIds,
        material_ids: action.materialIds,
      },
    );
    if (homeworkError) databaseFailure(homeworkError);
    return;
  }
  if (action.type === "updateHomeworkRecipient") {
    if (!editable && lesson.status !== "completed") lifecycleConflict();
    const { data: homework, error: homeworkLookupError } = await supabase
      .from("homeworks")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("lesson_id", lessonId)
      .maybeSingle();
    if (homeworkLookupError) databaseFailure(homeworkLookupError);
    if (!homework) notFound();
    const completedAt = ["completed", "reviewed"].includes(action.status)
      ? now
      : null;
    const reviewedAt = action.status === "reviewed" ? now : null;
    const { data: updated, error: assignmentError } = await supabase
      .from("homework_assignments")
      .update({
        status: action.status,
        feedback: action.feedback ?? null,
        completed_at: completedAt,
        reviewed_at: reviewedAt,
      })
      .eq("workspace_id", workspaceId)
      .eq("homework_id", homework.id)
      .eq("student_id", action.studentId)
      .select("id")
      .maybeSingle();
    if (assignmentError) databaseFailure(assignmentError);
    if (!updated) notFound();
    return;
  }
  if (action.type === "deleteHomework") {
    const { error: homeworkError } = await supabase
      .from("homeworks")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("lesson_id", lessonId);
    if (homeworkError) databaseFailure(homeworkError);
    return;
  }
  if (action.type === "attachMaterial") {
    const { error: materialError } = await supabase
      .from("lesson_materials")
      .upsert(
        {
          workspace_id: workspaceId,
          lesson_id: lessonId,
          material_id: action.materialId,
        },
        { onConflict: "lesson_id,material_id", ignoreDuplicates: true },
      );
    if (materialError) databaseFailure(materialError);
    return;
  }
  if (action.type === "createAndAttachMaterial") {
    const materialId = randomUUID();
    const { error: materialError } = await supabase.from("materials").insert({
      id: materialId,
      workspace_id: workspaceId,
      owner_user_id: teacherId,
      title: action.title,
      description: null,
      type: "link",
      external_url: action.url,
    });
    if (materialError) databaseFailure(materialError);
    const { error: linkError } = await supabase
      .from("lesson_materials")
      .insert({
        workspace_id: workspaceId,
        lesson_id: lessonId,
        material_id: materialId,
      });
    if (linkError) databaseFailure(linkError);
    return;
  }
  if (action.type === "detachMaterial") {
    const { error: materialError } = await supabase
      .from("lesson_materials")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("lesson_id", lessonId)
      .eq("material_id", action.materialId);
    if (materialError) databaseFailure(materialError);
    return;
  }
  if (action.type === "markAttendance") {
    if (lesson.status === "completed") lifecycleConflict();
    const { data: participant, error: participantError } = await supabase
      .from("lesson_participants")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("lesson_id", lessonId)
      .eq("student_id", action.studentId)
      .maybeSingle();
    if (participantError) databaseFailure(participantError);
    if (!participant) {
      throw new ApiFailure(422, {
        code: "INVALID_PARTICIPANT",
        message:
          "Ten uczeń nie należy do historycznej listy uczestników zajęć.",
      });
    }
    const { error: attendanceError } = await supabase
      .from("attendances")
      .upsert(
        {
          workspace_id: workspaceId,
          lesson_id: lessonId,
          student_id: action.studentId,
          status: action.status,
          marked_at: now,
          updated_at: now,
        },
        { onConflict: "lesson_id,student_id" },
      );
    if (attendanceError) databaseFailure(attendanceError);
    return;
  }
  if (action.type === "markAllPresent") {
    if (lesson.status === "completed") lifecycleConflict();
    const { data: participants, error: participantsError } = await supabase
      .from("lesson_participants")
      .select("student_id")
      .eq("workspace_id", workspaceId)
      .eq("lesson_id", lessonId);
    if (participantsError) databaseFailure(participantsError);
    const { error: attendanceError } = await supabase
      .from("attendances")
      .upsert(
        (participants ?? []).map((participant) => ({
          workspace_id: workspaceId,
          lesson_id: lessonId,
          student_id: participant.student_id,
          status: "present",
          marked_at: now,
          updated_at: now,
        })),
        { onConflict: "lesson_id,student_id" },
      );
    if (attendanceError) databaseFailure(attendanceError);
    return;
  }
  if (action.type === "completeLesson" || action.type === "markNoShow") {
    const rpc =
      action.type === "completeLesson"
        ? "complete_lesson_workspace_v2"
        : "mark_lesson_no_show";
    const { error: lifecycleError } = await supabase.rpc(
      rpc,
      action.type === "completeLesson"
        ? {
            p_workspace_id: workspaceId,
            p_lesson_id: lessonId,
            p_idempotency_key: `${action.type}:${lessonId}`,
            p_expected_updated_at: action.expectedUpdatedAt,
            p_outcomes: action.outcomes,
          }
        : {
            p_workspace_id: workspaceId,
            p_lesson_id: lessonId,
            p_idempotency_key: `${action.type}:${lessonId}`,
          },
    );
    if (lifecycleError) databaseFailure(lifecycleError);
    try {
      await refreshCompletionHooks(
        supabase,
        workspaceId,
        teacherId,
        lessonId,
        lesson.sync_status,
        now,
      );
    } catch (hookError) {
      // The lesson/package transaction has already committed. Keep the primary
      // action successful; these idempotent hooks can be retried independently.
      logServerError("lesson_completion_hooks", hookError);
    }
    return;
  }
  if (action.type === "cancelLesson") {
    const { error: cancelError } = await supabase.rpc(
      "cancel_lesson_relational",
      {
        p_payload: {
          lessonId,
          scope: "single",
          expectedUpdatedAt: action.expectedUpdatedAt,
        },
      },
    );
    if (cancelError) databaseFailure(cancelError);
  }
}

async function upsertNote(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  workspaceId: string,
  lessonId: string,
  teacherId: string,
  noteType: string,
  visibility: "private" | "student_visible",
  content: string,
  now: string,
) {
  const { error } = await supabase.from("lesson_notes").upsert(
    {
      workspace_id: workspaceId,
      lesson_id: lessonId,
      author_user_id: teacherId,
      content,
      note_type: noteType,
      visibility,
      updated_at: now,
    },
    { onConflict: "lesson_id,author_user_id,note_type" },
  );
  if (error) databaseFailure(error);
}

async function refreshCompletionHooks(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  workspaceId: string,
  teacherId: string,
  lessonId: string,
  syncStatus: string,
  now: string,
) {
  const operations: PromiseLike<unknown>[] = [
    supabase
      .from("reminder_deliveries")
      .delete()
      .eq("workspace_id", workspaceId)
      .eq("lesson_id", lessonId)
      .in("status", ["pending", "failed"]),
  ];
  if (syncStatus !== "disabled") {
    operations.push(
      supabase.from("google_sync_jobs").upsert(
        {
          workspace_id: workspaceId,
          teacher_id: teacherId,
          lesson_id: lessonId,
          google_event_id: createHash("sha256")
            .update(`${teacherId}:${lessonId}`)
            .digest("hex")
            .slice(0, 32),
          status: "pending",
          attempts: 0,
          next_attempt_at: now,
          last_error: null,
        },
        { onConflict: "teacher_id,lesson_id" },
      ),
    );
  }
  const results = await Promise.all(operations);
  const failure = results.find((result): result is { error: unknown } =>
    Boolean(
      result && typeof result === "object" && "error" in result && result.error,
    ),
  );
  if (failure) databaseFailure(failure.error);
}

function workspaceFromLocalStore(
  store: local.StoreShape,
  teacherId: string,
  lessonId: string,
): LessonWorkspaceData {
  const teacher = store.teachers.find((item) => item.id === teacherId);
  const lesson = store.lessons.find(
    (item) => item.id === lessonId && item.teacherId === teacherId,
  );
  if (!teacher) unauthenticated();
  if (!lesson) notFound();
  const students = lesson.participantIds
    .map((id) => store.students.find((student) => student.id === id))
    .filter((student): student is local.StudentRecord => Boolean(student));
  const group = lesson.groupId
    ? store.groups.find((item) => item.id === lesson.groupId)
    : undefined;
  const adjacent = store.lessons
    .filter(
      (item) =>
        item.teacherId === teacherId &&
        item.id !== lesson.id &&
        item.status !== "cancelled" &&
        (lesson.groupId
          ? item.groupId === lesson.groupId
          : item.participantIds.length === 1 &&
            item.participantIds[0] === lesson.participantIds[0]),
    )
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const previousLessons = adjacent
    .filter(
      (item) => item.status === "completed" && item.startsAt < lesson.startsAt,
    )
    .sort((a, b) => b.startsAt.localeCompare(a.startsAt))
    .slice(0, 5)
    .map((item) => ({
      id: item.id,
      startsAt: item.startsAt,
      topic: item.topic,
      objective: item.planObjectives ?? "",
      planItems: item.planItems.map((section) => ({
        id: section.id,
        position: section.position,
        title: section.title?.trim() || section.text,
        instructions: section.instructions ?? "",
        minutes: section.minutes,
        completed: Boolean(section.completed),
      })),
      materials: (item.workspaceMaterials ?? []).map((material) => ({
        ...material,
        attached: false,
        available: true,
      })),
    }));
  const toAdjacent = (item: Lesson | undefined) =>
    item
      ? { id: item.id, startsAt: item.startsAt, topic: item.topic }
      : undefined;
  const endsAt = new Date(
    Date.parse(lesson.startsAt) + lesson.durationMinutes * 60_000,
  ).toISOString();
  const outcomes = new Map(
    (store.lessonStudentOutcomes ?? [])
      .filter(
        (outcome) =>
          outcome.teacherId === teacherId && outcome.lessonId === lessonId,
      )
      .map((outcome) => [outcome.studentId, outcome]),
  );
  return {
    teacher: {
      timezone: teacher.timezone,
      readOnly: teacher.subscription.readOnly,
    },
    lesson: {
      id: lesson.id,
      color: lesson.color ?? DEFAULT_CALENDAR_COLOR,
      seriesId: lesson.seriesId,
      studentId:
        !lesson.groupId && lesson.participantIds.length === 1
          ? lesson.participantIds[0]
          : undefined,
      groupId: lesson.groupId,
      participantLabel:
        group?.name ??
        (students.map((student) => student.name).join(", ") || "Lekcja"),
      subject: lesson.subject ?? group?.subject ?? students[0]?.subject ?? "",
      level: group?.level ?? students[0]?.level ?? "",
      startsAt: lesson.startsAt,
      endsAt,
      durationMinutes: lesson.durationMinutes,
      format: lesson.format,
      location: lesson.location,
      meetingUrl:
        lesson.format === "online" && /^https?:\/\//i.test(lesson.location)
          ? lesson.location
          : undefined,
      status: lesson.status,
      syncStatus: lesson.syncStatus,
      topic: lesson.topic,
      objectives: lesson.planObjectives ?? "",
      planItems: lesson.planItems.map((item) => ({
        id: item.id,
        position: item.position,
        title: item.title?.trim() || item.text,
        instructions: item.instructions ?? "",
        minutes: item.minutes,
        completed: Boolean(item.completed),
      })),
      privateNote: lesson.generalNotes,
      summary: lesson.studentSummary ?? "",
      createdAt: lesson.createdAt,
      updatedAt: lesson.updatedAt ?? lesson.createdAt,
    },
    participants: lesson.participants.map((participant) => {
      const student = students.find(
        (item) => item.id === participant.studentId,
      );
      const outcome = outcomes.get(participant.studentId);
      return {
        id: `${lesson.id}:${participant.studentId}`,
        studentId: participant.studentId,
        name: student?.name ?? "Archiwalny uczeń",
        subject: student?.subject ?? "",
        level: student?.level ?? "",
        status: student?.status ?? "archived",
        attendanceStatus: participant.attendanceStatus,
        outcome: outcome
          ? {
              id: outcome.id,
              lessonId: outcome.lessonId,
              studentId: outcome.studentId,
              progressSummary: outcome.progressSummary,
              difficultyLevel: outcome.difficultyLevel,
              difficultyNote: outcome.difficultyNote,
              nextStep: outcome.nextStep,
              createdAt: outcome.createdAt,
              updatedAt: outcome.updatedAt,
            }
          : undefined,
      };
    }),
    homework: lesson.homework
      ? {
          id: `${lesson.id}:homework`,
          title: lesson.homeworkTitle ?? "Praca domowa",
          description: lesson.homework,
          status: "assigned",
          dueAt: lesson.homeworkDueAt,
          updatedAt: lesson.updatedAt ?? lesson.createdAt,
          recipients: (lesson.homeworkRecipients?.length
            ? lesson.homeworkRecipients
            : lesson.participantIds.map((studentId) => ({
                studentId,
                status: "assigned" as const,
                feedback: undefined,
                completedAt: undefined,
                reviewedAt: undefined,
                updatedAt: undefined,
              }))
          ).map((recipient) => ({
            id: `${lesson.id}:homework:${recipient.studentId}`,
            studentId: recipient.studentId,
            studentName:
              students.find((student) => student.id === recipient.studentId)
                ?.name ?? "Archiwalny uczeń",
            status: recipient.status,
            feedback: recipient.feedback,
            completedAt: recipient.completedAt,
            reviewedAt: recipient.reviewedAt,
            updatedAt:
              recipient.updatedAt ?? lesson.updatedAt ?? lesson.createdAt,
          })),
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
        }
      : undefined,
    materials: (lesson.workspaceMaterials ?? []).map((item) => ({
      ...item,
      attached: true,
    })),
    materialLibrary: [],
    availableMaterials: { student: [], group: [], library: [] },
    packageContext:
      students.length === 1 &&
      typeof students[0].packageRemainingLessons === "number"
        ? {
            id: `${students[0].id}:package`,
            name: "Pakiet zajęć",
            remainingLessons: students[0].packageRemainingLessons,
            consumedByLesson: lesson.status === "completed",
          }
        : undefined,
    previousLesson: toAdjacent(
      adjacent.filter((item) => item.startsAt < lesson.startsAt).at(-1),
    ),
    nextLesson: toAdjacent(
      adjacent.find((item) => item.startsAt > lesson.startsAt),
    ),
    previousLessons,
  };
}

function mutateLocalWorkspace(
  store: local.StoreShape,
  teacherId: string,
  lessonId: string,
  action: LessonWorkspaceAction,
) {
  const teacher = store.teachers.find((item) => item.id === teacherId);
  const lesson = store.lessons.find(
    (item) => item.id === lessonId && item.teacherId === teacherId,
  );
  if (!teacher) unauthenticated();
  if (!lesson) notFound();
  if (teacher.subscription.readOnly) {
    throw new ApiFailure(403, {
      code: "READ_ONLY",
      message: "W trybie tylko do odczytu nie można zmieniać zajęć.",
    });
  }
  const now = new Date().toISOString();
  if (action.type === "applyPreviousLesson") {
    if (["cancelled", "no_show", "completed"].includes(lesson.status))
      lifecycleConflict();
    const importToken = `${lessonId}:${action.importKey}`;
    store.lessonReuseImportKeys ??= [];
    if (store.lessonReuseImportKeys.includes(importToken)) return;
    const source = store.lessons.find(
      (candidate) =>
        candidate.teacherId === teacherId &&
        candidate.id === action.sourceLessonId &&
        candidate.status === "completed" &&
        candidate.startsAt < lesson.startsAt &&
        (lesson.groupId
          ? candidate.groupId === lesson.groupId
          : !candidate.groupId &&
            candidate.participantIds.length === 1 &&
            candidate.participantIds[0] === lesson.participantIds[0]),
    );
    if (!source) reuseSourceUnavailable();
    const sectionIds = new Set(action.sectionIds);
    const nextPosition =
      lesson.planItems.reduce(
        (maximum, item) => Math.max(maximum, item.position),
        -1,
      ) + 1;
    const copied = source.planItems
      .filter((item) => sectionIds.has(item.id))
      .sort((a, b) => a.position - b.position)
      .map((item, index) => ({
        id: randomUUID(),
        position: nextPosition + index,
        text: item.title?.trim() || item.text,
        title: item.title?.trim() || item.text,
        instructions: item.instructions ?? "",
        minutes: item.minutes,
        completed: false,
      }));
    lesson.planItems.push(...copied);
    if (action.includeObjective && source.planObjectives?.trim()) {
      lesson.planObjectives = [lesson.planObjectives, source.planObjectives]
        .filter((value) => value?.trim())
        .join("\n\n");
    }
    const materialIds = new Set(action.materialIds);
    const existingIds = new Set(
      (lesson.workspaceMaterials ?? []).map((item) => item.id),
    );
    const copiedMaterials = (source.workspaceMaterials ?? []).filter(
      (item) => materialIds.has(item.id) && !existingIds.has(item.id),
    );
    lesson.workspaceMaterials = [
      ...(lesson.workspaceMaterials ?? []),
      ...copiedMaterials.map((item) => ({ ...item })),
    ];
    store.lessonReuseImportKeys.push(importToken);
    lesson.updatedAt = now;
    return;
  }
  if (action.type === "applyTemplate") {
    throw new ApiFailure(503, {
      code: "TEMPLATES_REQUIRE_DATABASE",
      message: "Szablony lekcji wymagają połączenia z bazą danych.",
    });
  }
  if (action.type === "updatePlan") {
    if (lesson.updatedAt && lesson.updatedAt !== action.expectedUpdatedAt)
      staleWrite();
    lesson.topic = action.topic;
    lesson.planObjectives = action.objectives;
    lesson.planItems = action.items.map((item) => ({
      id: item.id,
      position: item.position,
      text: item.title,
      title: item.title,
      instructions: item.instructions,
      minutes: item.minutes,
      completed: item.completed,
    }));
  } else if (action.type === "updateColor") {
    const targets =
      action.scope !== "single" && lesson.seriesId
        ? store.lessons.filter(
            (candidate) =>
              candidate.teacherId === teacherId &&
              candidate.seriesId === lesson.seriesId &&
              candidate.status !== "completed" &&
              candidate.status !== "cancelled" &&
              (action.scope === "series"
                ? Date.parse(candidate.startsAt) >= Date.now()
                : (candidate.recurrenceOriginalStartsAt ??
                    candidate.startsAt) >=
                  (lesson.recurrenceOriginalStartsAt ?? lesson.startsAt)),
          )
        : [lesson];
    targets.forEach((target) => {
      target.color = action.color;
      target.syncStatus =
        target.syncStatus === "disabled"
          ? "disabled"
          : teacher.google.status === "connected"
            ? "pending"
            : "disabled";
      target.updatedAt = now;
    });
  } else if (action.type === "saveNote") {
    if (action.noteType === "private") lesson.generalNotes = action.content;
    else lesson.studentSummary = action.content;
  } else if (action.type === "upsertHomework") {
    lesson.homeworkTitle = action.title;
    lesson.homework = action.description;
    lesson.homeworkDueAt = action.dueAt ?? undefined;
    const previous = new Map(
      (lesson.homeworkRecipients ?? []).map((recipient) => [
        recipient.studentId,
        recipient,
      ]),
    );
    lesson.homeworkRecipients = action.recipientIds.map(
      (studentId) =>
        previous.get(studentId) ?? { studentId, status: "assigned" },
    );
    lesson.homeworkMaterialIds = [...new Set(action.materialIds)];
  } else if (action.type === "updateHomeworkRecipient") {
    const recipients =
      lesson.homeworkRecipients ??
      lesson.participantIds.map((studentId) => ({
        studentId,
        status: "assigned" as const,
        feedback: undefined,
        completedAt: undefined,
        reviewedAt: undefined,
        updatedAt: undefined,
      }));
    const recipient = recipients.find(
      (item) => item.studentId === action.studentId,
    );
    if (!lesson.homework || !recipient) notFound();
    recipient.status = action.status;
    recipient.feedback = action.feedback;
    recipient.completedAt = ["completed", "reviewed"].includes(action.status)
      ? now
      : undefined;
    recipient.reviewedAt = action.status === "reviewed" ? now : undefined;
    recipient.updatedAt = now;
    lesson.homeworkRecipients = recipients;
  } else if (action.type === "deleteHomework") {
    lesson.homework = "";
    lesson.homeworkTitle = undefined;
    lesson.homeworkDueAt = undefined;
    lesson.homeworkRecipients = undefined;
    lesson.homeworkMaterialIds = undefined;
  } else if (action.type === "createAndAttachMaterial") {
    lesson.workspaceMaterials ??= [];
    lesson.workspaceMaterials.push({
      id: randomUUID(),
      title: action.title,
      description: "",
      type: "link",
      url: action.url,
    });
  } else if (action.type === "detachMaterial") {
    lesson.workspaceMaterials = (lesson.workspaceMaterials ?? []).filter(
      (item) => item.id !== action.materialId,
    );
  } else if (action.type === "attachMaterial") {
    const material = store.lessons
      .filter((item) => item.teacherId === teacherId)
      .flatMap((item) => item.workspaceMaterials ?? [])
      .find((item) => item.id === action.materialId);
    if (!material) {
      throw new ApiFailure(422, {
        code: "MATERIAL_NOT_FOUND",
        message: "Ten materiał nie jest dostępny w lokalnej bibliotece.",
      });
    }
    lesson.workspaceMaterials ??= [];
    if (!lesson.workspaceMaterials.some((item) => item.id === material.id)) {
      lesson.workspaceMaterials.push({ ...material });
    }
  } else if (action.type === "markAttendance") {
    const participant = lesson.participants.find(
      (item) => item.studentId === action.studentId,
    );
    if (!participant) {
      throw new ApiFailure(422, {
        code: "INVALID_PARTICIPANT",
        message: "Ten uczeń nie należy do listy uczestników zajęć.",
      });
    }
    participant.attendanceStatus = action.status;
  } else if (action.type === "markAllPresent") {
    lesson.participants.forEach((item) => (item.attendanceStatus = "present"));
  } else if (action.type === "completeLesson") {
    if (lesson.status === "cancelled") lifecycleConflict();
    if (lesson.status === "completed") return;
    if (lesson.updatedAt && lesson.updatedAt !== action.expectedUpdatedAt)
      staleWrite();
    if (
      lesson.participants.some((item) => item.attendanceStatus === "unknown")
    ) {
      attendanceRequired();
    }
    const packageStudent =
      lesson.participants.length === 1
        ? store.students.find(
            (student) =>
              student.teacherId === teacherId &&
              student.id === lesson.participants[0].studentId &&
              typeof student.packageRemainingLessons === "number",
          )
        : undefined;
    if (packageStudent && (packageStudent.packageRemainingLessons ?? 0) <= 0) {
      throw new ApiFailure(409, {
        code: "PACKAGE_EXHAUSTED",
        message: "Pakiet nie ma wolnej lekcji. Zajęcia nie zostały zakończone.",
      });
    }
    const participantIds = new Set(
      lesson.participants.map((participant) => participant.studentId),
    );
    if (
      new Set(action.outcomes.map((outcome) => outcome.studentId)).size !==
      action.outcomes.length
    ) {
      invalidCompletionPayload();
    }
    if (
      action.outcomes.some((outcome) => !participantIds.has(outcome.studentId))
    ) {
      invalidCompletionParticipant();
    }
    store.lessonStudentOutcomes ??= [];
    for (const outcome of action.outcomes) {
      if (
        !outcome.progressSummary &&
        !outcome.difficultyLevel &&
        !outcome.difficultyNote &&
        !outcome.nextStep
      )
        continue;
      const existing = store.lessonStudentOutcomes.find(
        (item) =>
          item.teacherId === teacherId &&
          item.lessonId === lessonId &&
          item.studentId === outcome.studentId,
      );
      const values = {
        progressSummary: outcome.progressSummary,
        difficultyLevel: outcome.difficultyLevel,
        difficultyNote: outcome.difficultyNote,
        nextStep: outcome.nextStep,
      };
      if (existing) Object.assign(existing, values, { updatedAt: now });
      else {
        store.lessonStudentOutcomes.push({
          id: randomUUID(),
          teacherId,
          lessonId,
          studentId: outcome.studentId,
          ...values,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
    if (packageStudent) packageStudent.packageRemainingLessons! -= 1;
    lesson.status = "completed";
  } else if (action.type === "markNoShow") {
    if (lesson.status === "completed" || lesson.status === "cancelled")
      lifecycleConflict();
    lesson.participants.forEach((item) => (item.attendanceStatus = "absent"));
    lesson.status = "no_show";
  } else if (action.type === "cancelLesson") {
    if (lesson.status === "completed") lifecycleConflict();
    if (lesson.updatedAt && lesson.updatedAt !== action.expectedUpdatedAt)
      staleWrite();
    lesson.status = "cancelled";
  }
  lesson.updatedAt = now;
}

function databaseFailure(error: unknown): never {
  const message = String(
    (error as { message?: string; details?: string })?.message ?? error,
  );
  if (message.includes("ATTENDANCE_REQUIRED")) attendanceRequired();
  if (message.includes("INVALID_OUTCOME_PARTICIPANT"))
    invalidCompletionParticipant();
  if (
    message.includes("INVALID_OUTCOME_PAYLOAD") ||
    message.includes("DUPLICATE_OUTCOME_PARTICIPANT")
  )
    invalidCompletionPayload();
  if (message.includes("PACKAGE_EXHAUSTED")) {
    throw new ApiFailure(409, {
      code: "PACKAGE_EXHAUSTED",
      message: "Pakiet nie ma wolnej lekcji. Zajęcia nie zostały zakończone.",
    });
  }
  if (
    message.includes("PACKAGE_REQUIRES_SINGLE_STUDENT") ||
    message.includes("PER_LESSON_REQUIRES_SINGLE_STUDENT")
  ) {
    throw new ApiFailure(422, {
      code: "UNSUPPORTED_BILLING_CONFIGURATION",
      message: "Ten sposób rozliczenia nie obsługuje lekcji grupowej.",
    });
  }
  if (
    message.includes("CANCELLED_LESSON") ||
    message.includes("LESSON_NOT_EDITABLE") ||
    message.includes("NO_SHOW")
  )
    lifecycleConflict();
  if (message.includes("REUSE_SOURCE_UNAVAILABLE")) reuseSourceUnavailable();
  if (message.includes("STALE")) staleWrite();
  throw error;
}

function attendanceRequired(): never {
  throw new ApiFailure(422, {
    code: "ATTENDANCE_REQUIRED",
    message: "Oznacz obecność wszystkich uczestników przed zakończeniem zajęć.",
  });
}

function invalidCompletionParticipant(): never {
  throw new ApiFailure(422, {
    code: "INVALID_PARTICIPANT",
    message: "Podsumowanie zawiera ucznia spoza listy uczestników lekcji.",
  });
}

function invalidCompletionPayload(): never {
  throw new ApiFailure(422, {
    code: "VALIDATION_ERROR",
    message: "Sprawdź podsumowania uczniów i spróbuj ponownie.",
  });
}

function staleWrite(): never {
  throw new ApiFailure(409, {
    code: "STALE_WRITE",
    message:
      "Zajęcia zmieniły się w innym oknie. Odśwież stronę i spróbuj ponownie.",
  });
}

function lifecycleConflict(): never {
  throw new ApiFailure(409, {
    code: "LESSON_NOT_EDITABLE",
    message: "Ten stan zajęć nie pozwala na wykonanie tej operacji.",
  });
}

function reuseSourceUnavailable(): never {
  throw new ApiFailure(422, {
    code: "REUSE_SOURCE_UNAVAILABLE",
    message: "Poprzednia lekcja nie jest już dostępna do ponownego użycia.",
  });
}

function notFound(): never {
  throw new ApiFailure(404, {
    code: "LESSON_NOT_FOUND",
    message: "Nie znaleziono tych zajęć.",
  });
}

function unauthenticated(): never {
  throw new ApiFailure(401, {
    code: "UNAUTHENTICATED",
    message: "Sesja wygasła. Zaloguj się ponownie.",
  });
}
