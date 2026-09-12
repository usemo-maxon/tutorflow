import "server-only";

import { createHash } from "node:crypto";
import type { AppData, IntegrationState, Teacher } from "@/lib/domain";
import { isSupabaseConfigured } from "./env";
import * as local from "./store";
import type { StoreShape, TeacherRecord } from "./store";
import { createSupabaseServerClient } from "./supabase";

const localAllowed = () =>
  process.env.NODE_ENV !== "production" &&
  (Boolean(process.env.TUTORFLOW_DATA_DIR) || !isSupabaseConfigured());

function configured(provider: "google" | "telegram" | "payu"): boolean {
  if (provider === "google")
    return Boolean(
      process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
    );
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
  return { status: configured(provider) ? "not_connected" : "not_configured" };
}

async function loadTenantStore(teacherId: string) {
  const supabase = await createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || authData.user?.id !== teacherId)
    throw new Error("UNAUTHENTICATED");

  const [profileResult, stateResult, subscriptionResult, integrationsResult] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id,email,full_name,timezone")
        .eq("id", teacherId)
        .single(),
      supabase
        .from("teacher_states")
        .select("state,version")
        .eq("teacher_id", teacherId)
        .single(),
      supabase
        .from("subscriptions")
        .select("status,plan,read_only,trial_ends_at,renews_at")
        .eq("teacher_id", teacherId)
        .single(),
      supabase
        .from("integration_connections")
        .select("provider,status,label,last_error")
        .eq("teacher_id", teacherId),
    ]);
  const failure = [profileResult, stateResult, subscriptionResult].find(
    (result) => result.error,
  );
  if (failure?.error) throw failure.error;
  const profile = profileResult.data!;
  const subscription = subscriptionResult.data!;
  const state = stateResult.data!.state as {
    students: StoreShape["students"];
    lessons: StoreShape["lessons"];
    availability: StoreShape["availability"];
  };
  const states = new Map(
    (integrationsResult.data ?? []).map((row) => [
      row.provider,
      {
        status: row.status,
        label: row.label ?? undefined,
        lastError: row.last_error ?? undefined,
      } as IntegrationState,
    ]),
  );
  const teacher: TeacherRecord = {
    id: teacherId,
    name: profile.full_name,
    email: profile.email,
    timezone: profile.timezone,
    passwordHash: "",
    subscription: {
      status: subscription.status as Teacher["subscription"]["status"],
      plan: subscription.plan as Teacher["subscription"]["plan"],
      readOnly: subscription.read_only,
      trialEndsAt: subscription.trial_ends_at ?? undefined,
      renewsAt: subscription.renews_at ?? undefined,
    },
    google: states.get("google") ?? defaultIntegration("google"),
    telegram: states.get("telegram") ?? defaultIntegration("telegram"),
    payu: states.get("payu") ?? defaultIntegration("payu"),
  };
  const decorate = <T extends object>(rows: T[]) =>
    rows.map((row) => ({ ...row, teacherId }));
  return {
    supabase,
    version: Number(stateResult.data!.version),
    store: {
      version: 1,
      teachers: [teacher],
      students: decorate(state.students ?? []),
      lessons: decorate(state.lessons ?? []),
      availability: decorate(state.availability ?? []),
      sessions: [],
    } satisfies StoreShape,
  };
}

export async function queryStore<T>(
  teacherId: string,
  operation: (store: StoreShape) => T,
): Promise<T> {
  if (localAllowed()) return local.queryStore(operation);
  return operation((await loadTenantStore(teacherId)).store);
}

export async function mutateStore<T>(
  teacherId: string,
  operation: (store: StoreShape) => T | Promise<T>,
): Promise<T> {
  if (localAllowed()) return local.mutateStore(operation);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const loaded = await loadTenantStore(teacherId);
    const result = await operation(loaded.store);
    const teacher = loaded.store.teachers[0];
    const state = {
      students: loaded.store.students.map((row) => stripTenant(row)),
      lessons: loaded.store.lessons.map((row) => stripTenant(row)),
      availability: loaded.store.availability.map((row) => stripTenant(row)),
    };
    const { error } = await loaded.supabase.rpc("update_teacher_state", {
      expected_version: loaded.version,
      new_state: state,
    });
    if (error?.code === "40001") continue;
    if (error) throw error;
    await Promise.all([
      loaded.supabase
        .from("profiles")
        .update({ full_name: teacher.name, timezone: teacher.timezone })
        .eq("id", teacherId),
      enqueuePendingSync(loaded.supabase, teacherId, state.lessons),
      enqueueReminders(loaded.supabase, teacherId, state.lessons),
    ]);
    return result;
  }
  throw new Error("STATE_VERSION_CONFLICT");
}

async function enqueueReminders(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
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
  teacherId: string,
  lessons: Array<{ id: string; syncStatus: string }>,
) {
  const jobs = lessons
    .filter((lesson) => lesson.syncStatus === "pending")
    .map((lesson) => ({
      teacher_id: teacherId,
      lesson_id: lesson.id,
      google_event_id: createHash("sha256")
        .update(`${teacherId}:${lesson.id}`)
        .digest("hex")
        .slice(0, 32),
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

export async function getAppData(teacherId: string): Promise<AppData> {
  if (localAllowed()) return local.getAppData(teacherId);
  return queryStore(teacherId, (store) =>
    local.appDataFromStore(store, teacherId),
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
