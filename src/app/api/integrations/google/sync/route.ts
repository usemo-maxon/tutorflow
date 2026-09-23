import { after } from "next/server";
import { currentTeacher } from "@/server/auth";
import { assertEntitlement } from "@/server/entitlements";
import { ApiFailure, errorResponse } from "@/server/errors";
import {
  enqueueMissingGoogleLessonsForConnection,
  processGoogleLessonJobs,
  requestGoogleSyncForTeacher,
  syncGoogleConnection,
} from "@/server/google-calendar-sync";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site")
    return Response.json({ ok: false }, { status: 403 });
  const teacher = await currentTeacher();
  if (!teacher) return Response.json({ ok: false }, { status: 401 });
  try {
    assertEntitlement(teacher.subscription, "googleCalendar");
    const connectionId = await requestGoogleSyncForTeacher(teacher.id);
    after(() =>
      Promise.resolve()
        .then(async () => {
          await syncGoogleConnection(connectionId).catch(() => undefined);
          const queued =
            await enqueueMissingGoogleLessonsForConnection(connectionId);
          await processGoogleLessonJobs({
            teacherId: teacher.id,
            limit: Math.max(20, queued),
          });
        })
        .catch(() => undefined),
    );
    return Response.json({ ok: true, status: "pending" }, { status: 202 });
  } catch (error) {
    if (error instanceof ApiFailure) {
      return errorResponse(error);
    }
    return Response.json(
      { ok: false, message: "Google Calendar wymaga ponownego połączenia." },
      { status: 409 },
    );
  }
}
