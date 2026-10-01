import { processBookingReminders } from "@/server/booking-reminders";
import {
  isAuthorizedCron,
  schedulerFailureResponse,
  schedulerUnauthorizedResponse,
} from "@/server/cron";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return schedulerUnauthorizedResponse();
  try {
    return Response.json({ ok: true, ...(await processBookingReminders()) });
  } catch {
    return schedulerFailureResponse();
  }
}
