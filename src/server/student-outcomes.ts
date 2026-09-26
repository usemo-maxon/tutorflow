import "server-only";

import { randomUUID } from "node:crypto";
import type { LessonStudentOutcome } from "@/lib/domain";
import { LessonStudentOutcomeUpsertSchema } from "@/lib/lesson-workspace";
import { isSupabaseConfigured } from "./env";
import { ApiFailure } from "./errors";
import * as local from "./store";
import { createSupabaseServerClient } from "./supabase";

type SupabaseServerClient = Awaited<
  ReturnType<typeof createSupabaseServerClient>
>;

interface OutcomeRow {
  id: string;
  lesson_id: string;
  student_id: string;
  progress_summary: string | null;
  difficulty_level: "easy" | "mixed" | "hard" | null;
  difficulty_note: string | null;
  next_step: string | null;
  created_at: string;
  updated_at: string;
}

export interface UpsertLessonStudentOutcomeInput {
  teacherId: string;
  lessonId: string;
  studentId: string;
  progressSummary?: string;
  difficultyLevel?: "easy" | "mixed" | "hard";
  difficultyNote?: string;
  nextStep?: string;
}

const localAdapterEnabled = () =>
  process.env.NODE_ENV !== "production" &&
  (Boolean(process.env.TUTORFLOW_DATA_DIR) || !isSupabaseConfigured());

export async function getLessonStudentOutcomes(
  supabase: SupabaseServerClient,
  workspaceId: string,
  lessonId: string,
): Promise<LessonStudentOutcome[]> {
  const { data, error } = await supabase
    .from("lesson_student_outcomes")
    .select(
      "id,lesson_id,student_id,progress_summary,difficulty_level,difficulty_note,next_step,created_at,updated_at",
    )
    .eq("workspace_id", workspaceId)
    .eq("lesson_id", lessonId);
  if (error) databaseFailure(error);
  return ((data ?? []) as OutcomeRow[]).map(outcomeFromRow);
}

export async function upsertLessonStudentOutcome(
  input: UpsertLessonStudentOutcomeInput,
): Promise<LessonStudentOutcome | undefined> {
  const parsed = LessonStudentOutcomeUpsertSchema.safeParse(input);
  if (!parsed.success) {
    throw new ApiFailure(422, {
      code: "VALIDATION_ERROR",
      message: "Sprawdź dane podsumowania ucznia i spróbuj ponownie.",
    });
  }
  const normalized = parsed.data;
  if (localAdapterEnabled()) {
    return local.mutateStore((store) =>
      upsertLocalOutcome(store, input.teacherId, normalized),
    );
  }

  const { supabase, workspaceId } = await writeContext(input.teacherId);
  const { data: participant, error: participantError } = await supabase
    .from("lesson_participants")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("lesson_id", normalized.lessonId)
    .eq("student_id", normalized.studentId)
    .maybeSingle();
  if (participantError) databaseFailure(participantError);
  if (!participant) invalidParticipant();

  const values = outcomeValues(normalized);
  if (isBlankOutcome(normalized)) {
    const { data: existing, error: existingError } = await supabase
      .from("lesson_student_outcomes")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("lesson_id", normalized.lessonId)
      .eq("student_id", normalized.studentId)
      .maybeSingle();
    if (existingError) databaseFailure(existingError);
    if (!existing) return undefined;
  }

  const { data, error } = await supabase
    .from("lesson_student_outcomes")
    .upsert(
      {
        workspace_id: workspaceId,
        lesson_id: normalized.lessonId,
        student_id: normalized.studentId,
        ...values,
      },
      { onConflict: "workspace_id,lesson_id,student_id" },
    )
    .select(
      "id,lesson_id,student_id,progress_summary,difficulty_level,difficulty_note,next_step,created_at,updated_at",
    )
    .single();
  if (error) databaseFailure(error);
  return outcomeFromRow(data as OutcomeRow);
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
  if (auth.user?.id !== teacherId) {
    throw new ApiFailure(401, {
      code: "UNAUTHENTICATED",
      message: "Sesja wygasła. Zaloguj się ponownie.",
    });
  }
  if (tutor.error || subscription.error) {
    throw new ApiFailure(404, {
      code: "LESSON_NOT_FOUND",
      message: "Nie znaleziono tych zajęć.",
    });
  }
  if (subscription.data.read_only) readOnly();
  return { supabase, workspaceId: tutor.data.workspace_id as string };
}

function upsertLocalOutcome(
  store: local.StoreShape,
  teacherId: string,
  input: ReturnType<typeof LessonStudentOutcomeUpsertSchema.parse>,
): LessonStudentOutcome | undefined {
  const teacher = store.teachers.find((item) => item.id === teacherId);
  if (!teacher) {
    throw new ApiFailure(401, {
      code: "UNAUTHENTICATED",
      message: "Sesja wygasła. Zaloguj się ponownie.",
    });
  }
  if (teacher.subscription.readOnly) readOnly();
  const lesson = store.lessons.find(
    (item) => item.id === input.lessonId && item.teacherId === teacherId,
  );
  if (
    !lesson ||
    !lesson.participants.some((item) => item.studentId === input.studentId)
  ) {
    invalidParticipant();
  }

  store.lessonStudentOutcomes ??= [];
  const existing = store.lessonStudentOutcomes.find(
    (item) =>
      item.teacherId === teacherId &&
      item.lessonId === input.lessonId &&
      item.studentId === input.studentId,
  );
  if (!existing && isBlankOutcome(input)) return undefined;

  const now = new Date().toISOString();
  if (existing) {
    Object.assign(existing, outcomeDomainValues(input), { updatedAt: now });
    return withoutTeacher(existing);
  }
  const created: local.LessonStudentOutcomeRecord = {
    id: randomUUID(),
    teacherId,
    lessonId: input.lessonId,
    studentId: input.studentId,
    ...outcomeDomainValues(input),
    createdAt: now,
    updatedAt: now,
  };
  store.lessonStudentOutcomes.push(created);
  return withoutTeacher(created);
}

function outcomeValues(
  input: ReturnType<typeof LessonStudentOutcomeUpsertSchema.parse>,
) {
  return {
    progress_summary: input.progressSummary ?? null,
    difficulty_level: input.difficultyLevel ?? null,
    difficulty_note: input.difficultyNote ?? null,
    next_step: input.nextStep ?? null,
  };
}

function outcomeDomainValues(
  input: ReturnType<typeof LessonStudentOutcomeUpsertSchema.parse>,
) {
  return {
    progressSummary: input.progressSummary,
    difficultyLevel: input.difficultyLevel,
    difficultyNote: input.difficultyNote,
    nextStep: input.nextStep,
  };
}

function isBlankOutcome(
  input: ReturnType<typeof LessonStudentOutcomeUpsertSchema.parse>,
) {
  return !(
    input.progressSummary ||
    input.difficultyLevel ||
    input.difficultyNote ||
    input.nextStep
  );
}

function outcomeFromRow(row: OutcomeRow): LessonStudentOutcome {
  return {
    id: row.id,
    lessonId: row.lesson_id,
    studentId: row.student_id,
    progressSummary: row.progress_summary ?? undefined,
    difficultyLevel: row.difficulty_level ?? undefined,
    difficultyNote: row.difficulty_note ?? undefined,
    nextStep: row.next_step ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function withoutTeacher(
  outcome: local.LessonStudentOutcomeRecord,
): LessonStudentOutcome {
  return {
    id: outcome.id,
    lessonId: outcome.lessonId,
    studentId: outcome.studentId,
    progressSummary: outcome.progressSummary,
    difficultyLevel: outcome.difficultyLevel,
    difficultyNote: outcome.difficultyNote,
    nextStep: outcome.nextStep,
    createdAt: outcome.createdAt,
    updatedAt: outcome.updatedAt,
  };
}

function invalidParticipant(): never {
  throw new ApiFailure(422, {
    code: "INVALID_PARTICIPANT",
    message: "Ten uczeń nie należy do historycznej listy uczestników zajęć.",
  });
}

function readOnly(): never {
  throw new ApiFailure(403, {
    code: "READ_ONLY",
    message: "W trybie tylko do odczytu nie można zmieniać zajęć.",
  });
}

function databaseFailure(error: unknown): never {
  throw error;
}
