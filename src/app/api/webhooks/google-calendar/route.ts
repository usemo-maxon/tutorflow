import { after } from "next/server";
import {
  acceptGoogleWebhook,
  GOOGLE_WEBHOOK_REPAIR_BATCH_LIMIT,
  processGoogleLessonJobs,
  syncGoogleConnection,
} from "@/server/google-calendar-sync";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const resourceState = request.headers.get("x-goog-resource-state");
  if (resourceState !== "sync" && resourceState !== "exists")
    return new Response(null, { status: 404 });
  try {
    const decision = await acceptGoogleWebhook(request);
    if (decision.kind === "invalid") return new Response(null, { status: 404 });
    if (decision.kind === "skipped_not_entitled")
      return new Response(null, { status: 204 });
    after(async () => {
      try {
        await syncGoogleConnection(decision.connectionId);
        await processGoogleLessonJobs({
          teacherId: decision.teacherId,
          limit: GOOGLE_WEBHOOK_REPAIR_BATCH_LIMIT,
        });
      } catch {
        // Persisted sync/job state provides the retry signal for manual/daily recovery.
      }
    });
    return new Response(null, { status: 204 });
  } catch {
    return new Response(null, { status: 503 });
  }
}
