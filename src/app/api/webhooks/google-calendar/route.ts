import { acceptGoogleWebhook } from "@/server/google-calendar-sync";

export const runtime = "nodejs";
export const maxDuration = 10;

export async function POST(request: Request) {
  const accepted = await acceptGoogleWebhook(request);
  return new Response(null, { status: accepted ? 204 : 404 });
}
