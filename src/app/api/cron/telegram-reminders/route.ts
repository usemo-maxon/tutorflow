import { decryptSecret } from "@/server/crypto";
import {
  isAuthorizedCron,
  schedulerFailureResponse,
  schedulerUnauthorizedResponse,
} from "@/server/cron";
import { createSupabaseAdminClient } from "@/server/supabase";
import { entitledTeacherIds } from "@/server/entitlements";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) return schedulerUnauthorizedResponse();
  try {
    return await processReminders();
  } catch {
    return schedulerFailureResponse();
  }
}

async function processReminders() {
  const supabase = createSupabaseAdminClient();
  const now = new Date().toISOString();
  const { data: deliveries, error } = await supabase
    .from("reminder_deliveries")
    .select("id,workspace_id,teacher_id,lesson_id,lead_minutes,attempts")
    .in("status", ["pending", "failed"])
    .lte("scheduled_for", now)
    .lte("next_attempt_at", now)
    .order("scheduled_for")
    .limit(30);
  if (error) throw error;
  const teacherIds = [
    ...new Set((deliveries ?? []).map((delivery) => delivery.teacher_id)),
  ];
  const { data: subscriptions, error: subscriptionError } = teacherIds.length
    ? await supabase
        .from("subscriptions")
        .select("teacher_id,status,tier")
        .in("teacher_id", teacherIds)
    : { data: [], error: null };
  if (subscriptionError) throw subscriptionError;
  const entitled = entitledTeacherIds(subscriptions ?? [], "telegramReminders");
  let sent = 0;
  let retried = 0;
  let skipped = (deliveries ?? []).filter(
    (delivery) => !entitled.has(delivery.teacher_id),
  ).length;
  let failed = 0;
  let processed = 0;
  for (const delivery of deliveries ?? []) {
    if (!entitled.has(delivery.teacher_id)) continue;
    const { data: claimed } = await supabase
      .from("reminder_deliveries")
      .update({ status: "processing", attempts: delivery.attempts + 1 })
      .eq("id", delivery.id)
      .in("status", ["pending", "failed"])
      .select("id");
    if (!claimed?.length) {
      skipped += 1;
      continue;
    }
    processed += 1;
    if (delivery.attempts > 0) retried += 1;
    try {
      const [{ data: connection }, { data: lesson }, { data: profile }] =
        await Promise.all([
          supabase
            .from("integration_connections")
            .select("encrypted_credentials")
            .eq("teacher_id", delivery.teacher_id)
            .eq("provider", "telegram")
            .eq("status", "connected")
            .single(),
          supabase
            .from("lessons")
            .select("id,starts_at,status")
            .eq("workspace_id", delivery.workspace_id)
            .eq("id", delivery.lesson_id)
            .single(),
          supabase
            .from("profiles")
            .select("timezone")
            .eq("id", delivery.teacher_id)
            .single(),
        ]);
      if (!connection?.encrypted_credentials || !lesson || !profile)
        throw new Error("TELEGRAM_NOT_CONNECTED");
      if (!lesson || lesson.status !== "scheduled") {
        await supabase
          .from("reminder_deliveries")
          .update({
            status: "succeeded",
            last_error: "LESSON_CANCELLED",
            sent_at: null,
          })
          .eq("id", delivery.id);
        skipped += 1;
        continue;
      }
      const { data: participantRows } = await supabase
        .from("lesson_participants")
        .select("student_id")
        .eq("workspace_id", delivery.workspace_id)
        .eq("lesson_id", delivery.lesson_id);
      const studentIds = (participantRows ?? []).map((row) => row.student_id);
      const { data: studentRows } = studentIds.length
        ? await supabase
            .from("students")
            .select("id,display_name")
            .eq("workspace_id", delivery.workspace_id)
            .in("id", studentIds)
        : { data: [] };
      const names = studentIds
        .map(
          (id) =>
            studentRows?.find((student) => student.id === id)?.display_name,
        )
        .filter(Boolean)
        .join(", ");
      const date = new Intl.DateTimeFormat("pl-PL", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: profile.timezone,
      }).format(new Date(lesson.starts_at));
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
            text: `Przypomnienie easy4tutor: za ${lead} masz lekcję${names ? ` z ${names}` : ""}. Termin: ${date}.`,
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
      failed += 1;
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
  return Response.json({
    ok: true,
    processed,
    sent,
    retried,
    skipped,
    failed,
  });
}
