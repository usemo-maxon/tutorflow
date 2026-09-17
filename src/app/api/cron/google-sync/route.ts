import {
  isAuthorizedCron,
  schedulerFailureResponse,
  schedulerUnauthorizedResponse,
} from "@/server/cron";
import {
  maintainGoogleConnections,
  processGoogleLessonJob,
} from "@/server/google-calendar-sync";
import { createSupabaseAdminClient } from "@/server/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return schedulerUnauthorizedResponse();
  try {
    const [outbound, connections] = await Promise.all([
      processSyncJobs(),
      maintainGoogleConnections(),
    ]);
    return Response.json({ ok: true, outbound, connections });
  } catch {
    return schedulerFailureResponse();
  }
}

async function processSyncJobs() {
  const supabase = createSupabaseAdminClient();
  const { data: jobs, error } = await supabase
    .from("google_sync_jobs")
    .select("id,workspace_id,teacher_id,lesson_id,google_event_id,attempts")
    .in("status", ["pending", "failed"])
    .lt("attempts", 8)
    .lte("next_attempt_at", new Date().toISOString())
    .order("next_attempt_at")
    .limit(20);
  if (error) throw error;
  const results = [];
  for (const job of jobs ?? []) results.push(await processGoogleLessonJob(job));
  return {
    processed: results.length,
    succeeded: results.filter((result) => result === "succeeded").length,
    retried: (jobs ?? []).filter((job) => job.attempts > 0).length,
    skipped: results.filter((result) => result === "skipped").length,
    failed: results.filter((result) => result === "failed").length,
  };
}
