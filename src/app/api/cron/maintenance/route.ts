import {
  isAuthorizedCron,
  schedulerFailureResponse,
  schedulerUnauthorizedResponse,
} from "@/server/cron";
import { updateStateAsAdmin } from "@/server/admin-state";
import { createSupabaseAdminClient } from "@/server/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return schedulerUnauthorizedResponse();
  try {
    return await runMaintenance();
  } catch {
    return schedulerFailureResponse();
  }
}

async function runMaintenance() {
  const supabase = createSupabaseAdminClient();
  const now = new Date();
  const { error: trialError } = await supabase
    .from("subscriptions")
    .update({
      status: "read_only",
      read_only: true,
      updated_at: now.toISOString(),
    })
    .eq("status", "trial")
    .lt("trial_ends_at", now.toISOString());
  if (trialError) throw trialError;
  const { error: renewalError } = await supabase
    .from("subscriptions")
    .update({
      status: "past_due",
      read_only: true,
      updated_at: now.toISOString(),
    })
    .eq("status", "active")
    .lt("renews_at", now.toISOString());
  if (renewalError) throw renewalError;

  const { data: states, error: statesError } = await supabase
    .from("teacher_states")
    .select("teacher_id,state");
  if (statesError) throw statesError;
  let transitioned = 0;
  for (const row of states ?? []) {
    const lessons =
      (
        row.state as {
          lessons?: Array<{
            status: string;
            startsAt: string;
            durationMinutes: number;
          }>;
        }
      ).lessons ?? [];
    if (
      !lessons.some(
        (lesson) =>
          lesson.status === "scheduled" &&
          new Date(lesson.startsAt).getTime() +
            lesson.durationMinutes * 60_000 <
            now.getTime(),
      )
    )
      continue;
    await updateStateAsAdmin(row.teacher_id, (state) => {
      state.lessons.forEach((lesson) => {
        if (
          lesson.status === "scheduled" &&
          new Date(lesson.startsAt).getTime() +
            lesson.durationMinutes * 60_000 <
            now.getTime()
        ) {
          lesson.status = "needs_completion";
          transitioned += 1;
        }
      });
    });
  }

  const { data: expired, error: expiredError } = await supabase
    .from("attachments")
    .select("id,object_path")
    .lt("expires_at", now.toISOString())
    .limit(500);
  if (expiredError) throw expiredError;
  const paths = (expired ?? []).map((item) => item.object_path);
  if (paths.length) {
    const { error: storageError } = await supabase.storage
      .from("attachments")
      .remove(paths);
    if (storageError) throw storageError;
    const { error: metadataError } = await supabase
      .from("attachments")
      .delete()
      .in(
        "id",
        (expired ?? []).map((item) => item.id),
      );
    if (metadataError) throw metadataError;
  }
  return Response.json({
    ok: true,
    processed: (states?.length ?? 0) + (expired?.length ?? 0),
    lessonsTransitioned: transitioned,
    attachmentsRemoved: paths.length,
    failed: 0,
  });
}
