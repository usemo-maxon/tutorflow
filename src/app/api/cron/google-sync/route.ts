import {
  isAuthorizedCron,
  schedulerFailureResponse,
  schedulerUnauthorizedResponse,
} from "@/server/cron";
import {
  maintainGoogleConnections,
  processGoogleLessonJobs,
} from "@/server/google-calendar-sync";
import { recordOperationalEvent } from "@/server/operational-events";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return schedulerUnauthorizedResponse();
  try {
    const connections = await maintainGoogleConnections();
    const outbound = await processGoogleLessonJobs();
    console.info(
      JSON.stringify({
        scope: "google_calendar",
        operation: "daily_maintenance",
        result: "success",
        connections,
        outbound,
      }),
    );
    return Response.json({ ok: true, outbound, connections });
  } catch {
    console.error(
      JSON.stringify({
        scope: "google_calendar",
        operation: "daily_maintenance",
        result: "error",
      }),
    );
    await recordOperationalEvent({ type: "google_calendar.scheduled_sync_failed", severity: "error", service: "google_calendar", summary: "Zaplanowana synchronizacja Google Calendar nie zakończyła się poprawnie.", idempotencyKey: `google-sync:${new Date().toISOString().slice(0, 13)}` });
    return schedulerFailureResponse();
  }
}
