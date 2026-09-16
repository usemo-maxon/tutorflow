import {
  isAuthorizedCron,
  schedulerFailureResponse,
  schedulerUnauthorizedResponse,
} from "@/server/cron";
import { googleEvent, validGoogleAccessToken } from "@/server/google-calendar";
import { createSupabaseAdminClient } from "@/server/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return schedulerUnauthorizedResponse();
  try {
    return await processSyncJobs();
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
    .lte("next_attempt_at", new Date().toISOString())
    .order("next_attempt_at")
    .limit(20);
  if (error) throw error;
  const results = [];
  for (const job of jobs ?? []) results.push(await processJob(job));
  return Response.json({
    ok: true,
    processed: results.length,
    succeeded: results.filter((result) => result === "succeeded").length,
    retried: (jobs ?? []).filter((job) => job.attempts > 0).length,
    skipped: results.filter((result) => result === "skipped").length,
    failed: results.filter((result) => result === "failed").length,
  });
}

async function processJob(job: {
  id: string;
  workspace_id: string;
  teacher_id: string;
  lesson_id: string;
  google_event_id: string;
  attempts: number;
}) {
  const supabase = createSupabaseAdminClient();
  const claimedAt = new Date().toISOString();
  const { data: claimed } = await supabase
    .from("google_sync_jobs")
    .update({
      status: "processing",
      locked_at: claimedAt,
      attempts: job.attempts + 1,
    })
    .eq("id", job.id)
    .in("status", ["pending", "failed"])
    .select("id");
  if (!claimed?.length) return "skipped";
  try {
    const [{ data: connection }, { data: lessonRow }] = await Promise.all([
      supabase
        .from("integration_connections")
        .select("encrypted_credentials")
        .eq("teacher_id", job.teacher_id)
        .eq("provider", "google")
        .eq("status", "connected")
        .single(),
      supabase
        .from("lessons")
        .select(
          "id,title,starts_at,ends_at,format,location,meeting_url,status,sync_status",
        )
        .eq("workspace_id", job.workspace_id)
        .eq("id", job.lesson_id)
        .single(),
    ]);
    if (!connection?.encrypted_credentials || !lessonRow)
      throw new Error("GOOGLE_NOT_CONNECTED");
    if (lessonRow.sync_status === "disabled")
      throw new Error("LESSON_NOT_SYNCABLE");
    const { data: participantRows } = await supabase
      .from("lesson_participants")
      .select("student_id")
      .eq("workspace_id", job.workspace_id)
      .eq("lesson_id", job.lesson_id);
    const studentIds = (participantRows ?? []).map((row) => row.student_id);
    const { data: studentRows } = studentIds.length
      ? await supabase
          .from("students")
          .select("id,display_name")
          .eq("workspace_id", job.workspace_id)
          .in("id", studentIds)
      : { data: [] };
    const names = studentIds
      .map(
        (id) => studentRows?.find((student) => student.id === id)?.display_name,
      )
      .filter((name): name is string => Boolean(name));
    const lesson = {
      id: lessonRow.id,
      startsAt: lessonRow.starts_at,
      durationMinutes: Math.round(
        (new Date(lessonRow.ends_at).getTime() -
          new Date(lessonRow.starts_at).getTime()) /
          60_000,
      ),
      location:
        lessonRow.format === "online"
          ? (lessonRow.meeting_url ?? "")
          : (lessonRow.location ?? ""),
      status: lessonRow.status,
      topic: lessonRow.title,
    };
    const { token, credentials } = await validGoogleAccessToken(
      job.teacher_id,
      connection.encrypted_credentials,
    );
    const endpoint = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(credentials.calendarId)}/events/${job.google_event_id}`;
    let response: Response;
    if (lesson.status === "cancelled") {
      response = await fetch(endpoint, {
        method: "DELETE",
        headers: { authorization: `Bearer ${token}` },
      });
      if (response.status === 404 || response.status === 410)
        response = new Response(null, { status: 204 });
    } else {
      response = await fetch(endpoint, {
        method: "PATCH",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(googleEvent(lesson, names)),
      });
      if (response.status === 404) {
        response = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(credentials.calendarId)}/events`,
          {
            method: "POST",
            headers: {
              authorization: `Bearer ${token}`,
              "content-type": "application/json",
            },
            body: JSON.stringify({
              id: job.google_event_id,
              ...googleEvent(lesson, names),
            }),
          },
        );
      }
    }
    if (!response.ok && response.status !== 409)
      throw new Error(`GOOGLE_HTTP_${response.status}`);
    await supabase
      .from("lessons")
      .update({
        sync_status: "synced",
        sync_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("workspace_id", job.workspace_id)
      .eq("id", job.lesson_id);
    await supabase
      .from("google_sync_jobs")
      .update({
        status: "succeeded",
        last_error: null,
        locked_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", job.id);
    return "succeeded";
  } catch (error) {
    const attempts = job.attempts + 1;
    const safeError =
      error instanceof Error ? error.message.slice(0, 120) : "UNKNOWN";
    await Promise.all([
      supabase
        .from("google_sync_jobs")
        .update({
          status: "failed",
          last_error: safeError,
          locked_at: null,
          next_attempt_at: new Date(
            Date.now() + Math.min(3600, 2 ** attempts * 60) * 1000,
          ).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id),
      supabase
        .from("lessons")
        .update({
          sync_status: "failed",
          sync_message:
            "Nie udało się zsynchronizować wydarzenia z Google Calendar.",
          updated_at: new Date().toISOString(),
        })
        .eq("workspace_id", job.workspace_id)
        .eq("id", job.lesson_id),
    ]);
    return "failed";
  }
}
