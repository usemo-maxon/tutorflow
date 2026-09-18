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
    const [outbound, connections] = await Promise.all([
      processGoogleLessonJobs(),
      maintainGoogleConnections(),
    ]);
    return Response.json({ ok: true, outbound, connections });
  } catch {
    return schedulerFailureResponse();
  }
}
