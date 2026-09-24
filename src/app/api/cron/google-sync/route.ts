import {
  isAuthorizedCron,
  schedulerFailureResponse,
  schedulerUnauthorizedResponse,
} from "@/server/cron";
import {
  maintainGoogleConnections,
  processGoogleLessonJobs,
} from "@/server/google-calendar-sync";

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
    return schedulerFailureResponse();
  }
}
