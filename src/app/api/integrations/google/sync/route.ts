import { after } from "next/server";
import { currentTeacherId } from "@/server/auth";
import {
  requestGoogleSyncForTeacher,
  syncGoogleConnection,
} from "@/server/google-calendar-sync";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  if (request.headers.get("sec-fetch-site") === "cross-site")
    return Response.json({ ok: false }, { status: 403 });
  const teacherId = await currentTeacherId();
  if (!teacherId) return Response.json({ ok: false }, { status: 401 });
  try {
    const connectionId = await requestGoogleSyncForTeacher(teacherId);
    after(() => syncGoogleConnection(connectionId).catch(() => undefined));
    return Response.json({ ok: true, status: "pending" }, { status: 202 });
  } catch {
    return Response.json(
      { ok: false, message: "Google Calendar wymaga ponownego połączenia." },
      { status: 409 },
    );
  }
}
