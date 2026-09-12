import { decryptSecret } from "@/server/crypto";
import { isAuthorizedCron } from "@/server/cron";
import { createSupabaseAdminClient } from "@/server/supabase";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request))
    return Response.json({ ok: false }, { status: 401 });
  const supabase = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const { data: deliveries, error } = await supabase
    .from("reminder_deliveries")
    .select("id,teacher_id,lesson_id,lead_minutes,attempts")
    .in("status", ["pending", "failed"])
    .lte("scheduled_for", now)
    .lte("next_attempt_at", now)
    .order("scheduled_for")
    .limit(30);
  if (error) throw error;
  let sent = 0;
  for (const delivery of deliveries ?? []) {
    const { data: claimed } = await supabase
      .from("reminder_deliveries")
      .update({ status: "processing", attempts: delivery.attempts + 1 })
      .eq("id", delivery.id)
      .in("status", ["pending", "failed"])
      .select("id");
    if (!claimed?.length) continue;
    try {
      const [{ data: connection }, { data: stateRow }, { data: profile }] =
        await Promise.all([
          supabase
            .from("integration_connections")
            .select("encrypted_credentials")
            .eq("teacher_id", delivery.teacher_id)
            .eq("provider", "telegram")
            .eq("status", "connected")
            .single(),
          supabase
            .from("teacher_states")
            .select("state")
            .eq("teacher_id", delivery.teacher_id)
            .single(),
          supabase
            .from("profiles")
            .select("timezone")
            .eq("id", delivery.teacher_id)
            .single(),
        ]);
      if (!connection?.encrypted_credentials || !stateRow || !profile)
        throw new Error("TELEGRAM_NOT_CONNECTED");
      const state = stateRow.state as {
        lessons: Array<{
          id: string;
          startsAt: string;
          status: string;
          participantIds: string[];
        }>;
        students: Array<{ id: string; name: string }>;
      };
      const lesson = state.lessons.find(
        (item) => item.id === delivery.lesson_id,
      );
      if (!lesson || lesson.status !== "scheduled") {
        await supabase
          .from("reminder_deliveries")
          .update({
            status: "succeeded",
            last_error: "LESSON_CANCELLED",
            sent_at: null,
          })
          .eq("id", delivery.id);
        continue;
      }
      const names = lesson.participantIds
        .map((id) => state.students.find((student) => student.id === id)?.name)
        .filter(Boolean)
        .join(", ");
      const date = new Intl.DateTimeFormat("pl-PL", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: profile.timezone,
      }).format(new Date(lesson.startsAt));
      const lead = delivery.lead_minutes === 1440 ? "24 godziny" : "1 godzinę";
      const { chatId } = decryptSecret<{ chatId: number }>(
        connection.encrypted_credentials,
      );
      const response = await fetch(
        `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: `Przypomnienie TutorFlow: za ${lead} masz lekcję${names ? ` z ${names}` : ""}. Termin: ${date}.`,
          }),
        },
      );
      if (!response.ok) throw new Error(`TELEGRAM_HTTP_${response.status}`);
      await supabase
        .from("reminder_deliveries")
        .update({
          status: "succeeded",
          sent_at: new Date().toISOString(),
          last_error: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", delivery.id);
      sent += 1;
    } catch (error) {
      const attempts = delivery.attempts + 1;
      await supabase
        .from("reminder_deliveries")
        .update({
          status: "failed",
          last_error:
            error instanceof Error ? error.message.slice(0, 120) : "UNKNOWN",
          next_attempt_at: new Date(
            Date.now() + Math.min(3600, 2 ** attempts * 60) * 1000,
          ).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", delivery.id);
    }
  }
  return Response.json({ ok: true, processed: deliveries?.length ?? 0, sent });
}
