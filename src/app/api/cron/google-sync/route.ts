import { updateStateAsAdmin, type PersistedState } from "@/server/admin-state";
import { isAuthorizedCron } from "@/server/cron";
import { googleEvent, validGoogleAccessToken } from "@/server/google-calendar";
import { createSupabaseAdminClient } from "@/server/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request))
    return Response.json({ ok: false }, { status: 401 });
  const supabase = createSupabaseAdminClient();
  const { data: jobs, error } = await supabase
    .from("google_sync_jobs")
    .select("id,teacher_id,lesson_id,google_event_id,attempts")
    .in("status", ["pending", "failed"])
    .lte("next_attempt_at", new Date().toISOString())
    .order("next_attempt_at")
    .limit(20);
  if (error) throw error;
  const results = [];
  for (const job of jobs ?? []) results.push(await processJob(job));
  return Response.json({ ok: true, processed: results.length });
}

async function processJob(job: {
  id: string;
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
    const [{ data: connection }, { data: stateRow }] = await Promise.all([
      supabase
        .from("integration_connections")
        .select("encrypted_credentials")
        .eq("teacher_id", job.teacher_id)
        .eq("provider", "google")
        .eq("status", "connected")
        .single(),
      supabase
        .from("teacher_states")
        .select("state")
        .eq("teacher_id", job.teacher_id)
        .single(),
    ]);
    if (!connection?.encrypted_credentials || !stateRow)
      throw new Error("GOOGLE_NOT_CONNECTED");
    const state = stateRow.state as PersistedState;
    const lesson = state.lessons.find(
      (candidate) => candidate.id === job.lesson_id,
    );
    if (!lesson || lesson.syncStatus === "disabled")
      throw new Error("LESSON_NOT_SYNCABLE");
    const names = lesson.participantIds
      .map((id) => state.students.find((student) => student.id === id)?.name)
      .filter((name): name is string => Boolean(name));
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
    await updateStateAsAdmin(job.teacher_id, (latest) => {
      const current = latest.lessons.find(
        (candidate) => candidate.id === job.lesson_id,
      );
      if (current) {
        current.syncStatus = "synced";
        current.syncMessage = undefined;
      }
    });
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
      updateStateAsAdmin(job.teacher_id, (latest) => {
        const current = latest.lessons.find(
          (candidate) => candidate.id === job.lesson_id,
        );
        if (current) {
          current.syncStatus = "failed";
          current.syncMessage =
            "Nie udało się zsynchronizować wydarzenia z Google Calendar.";
        }
      }).catch(() => undefined),
    ]);
    return "failed";
  }
}
