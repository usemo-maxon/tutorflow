import { after } from "next/server";
import {
  acceptGoogleWebhook,
  syncGoogleConnection,
} from "@/server/google-calendar-sync";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const connectionId = await acceptGoogleWebhook(request);
  if (!connectionId) return new Response(null, { status: 404 });
  after(() => syncGoogleConnection(connectionId).catch(() => undefined));
  return new Response(null, { status: 204 });
}
