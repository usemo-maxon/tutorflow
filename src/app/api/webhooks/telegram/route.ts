import { createHash, timingSafeEqual } from "node:crypto";
import { encryptSecret } from "@/server/crypto";
import { createSupabaseAdminClient } from "@/server/supabase";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const expected = process.env.TELEGRAM_WEBHOOK_SECRET;
  const supplied = request.headers.get("x-telegram-bot-api-secret-token");
  if (!expected || !supplied || !safeEqual(expected, supplied))
    return Response.json({ ok: false }, { status: 401 });
  const update = (await request.json()) as {
    update_id?: number;
    message?: {
      text?: string;
      chat?: { id?: number; username?: string; first_name?: string };
    };
  };
  if (update.update_id === undefined) return Response.json({ ok: true });
  const supabase = createSupabaseAdminClient();
  const externalId = String(update.update_id);
  const { data: existing } = await supabase
    .from("webhook_events")
    .select("external_id")
    .eq("provider", "telegram")
    .eq("external_id", externalId)
    .maybeSingle();
  if (existing) return Response.json({ ok: true });
  const match = update.message?.text?.match(/^\/start\s+([A-Za-z0-9_-]+)$/);
  if (match && update.message?.chat?.id !== undefined) {
    const codeHash = createHash("sha256").update(match[1]).digest("hex");
    const { data: link } = await supabase
      .from("telegram_link_codes")
      .select("teacher_id")
      .eq("code_hash", codeHash)
      .is("consumed_at", null)
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (link) {
      const label = update.message.chat.username
        ? `@${update.message.chat.username}`
        : (update.message.chat.first_name ?? "Telegram");
      await supabase.from("integration_connections").upsert({
        teacher_id: link.teacher_id,
        provider: "telegram",
        status: "connected",
        label,
        encrypted_credentials: encryptSecret({
          chatId: update.message.chat.id,
        }),
        last_error: null,
        updated_at: new Date().toISOString(),
      });
      await supabase
        .from("telegram_link_codes")
        .update({ consumed_at: new Date().toISOString() })
        .eq("code_hash", codeHash);
      await sendTelegram(
        update.message.chat.id,
        "TutorFlow połączony. Przypomnienia wyślemy 24 godziny i 1 godzinę przed lekcją.",
      );
    }
  }
  await supabase.from("webhook_events").insert({
    provider: "telegram",
    external_id: externalId,
    payload_hash: createHash("sha256")
      .update(JSON.stringify(update))
      .digest("hex"),
  });
  return Response.json({ ok: true });
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
async function sendTelegram(chatId: number, text: string) {
  const response = await fetch(
    `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    },
  );
  if (!response.ok) throw new Error("TELEGRAM_SEND_FAILED");
}
