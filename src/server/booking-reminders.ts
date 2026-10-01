import "server-only";

import { decryptSecret } from "./crypto";
import { siteUrl } from "./env";
import {
  sendBookingReminderEmail,
  type BookingReminderEmailSender,
} from "./booking-email";
import { createSupabaseAdminClient } from "./supabase";

export async function processBookingReminders(
  options: {
    emailSender?: BookingReminderEmailSender;
    now?: Date;
    baseUrl?: string;
  } = {},
) {
  const supabase = createSupabaseAdminClient();
  const now = options.now ?? new Date();
  const { error: prepareError } = await supabase.rpc(
    "prepare_booking_reminders",
  );
  if (prepareError) throw prepareError;
  const { data: deliveries, error } = await supabase
    .from("booking_reminder_deliveries")
    .select("id,booking_id,booking_starts_at,attempts")
    .in("status", ["pending", "failed"])
    .lte("scheduled_for", now.toISOString())
    .lte("next_attempt_at", now.toISOString())
    .order("scheduled_for")
    .limit(30);
  if (error) throw error;

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  for (const delivery of deliveries ?? []) {
    const { data: claimed } = await supabase
      .from("booking_reminder_deliveries")
      .update({
        status: "processing",
        attempts: delivery.attempts + 1,
        updated_at: now.toISOString(),
      })
      .eq("id", delivery.id)
      .in("status", ["pending", "failed"])
      .select("id");
    if (!claimed?.length) {
      skipped += 1;
      continue;
    }
    try {
      const { data: booking, error: bookingError } = await supabase
        .from("bookings")
        .select(
          "id,tutor_id,guest_email,event_type_name,duration_minutes,starts_at,ends_at,timezone,status,student_id,converted_lesson_id,management_token_ciphertext",
        )
        .eq("id", delivery.booking_id)
        .single();
      if (bookingError || !booking) throw bookingError ?? new Error("MISSING");
      if (
        booking.status !== "confirmed" ||
        booking.student_id ||
        booking.converted_lesson_id ||
        booking.starts_at !== delivery.booking_starts_at ||
        Date.parse(booking.starts_at) <= now.getTime()
      ) {
        await supabase
          .from("booking_reminder_deliveries")
          .update({
            status: "skipped",
            last_error: "BOOKING_CHANGED",
            updated_at: now.toISOString(),
          })
          .eq("id", delivery.id);
        skipped += 1;
        continue;
      }
      const { data: profile, error: profileError } = await supabase
        .from("tutor_public_profiles")
        .select("public_name")
        .eq("tutor_id", booking.tutor_id)
        .single();
      if (profileError || !profile)
        throw profileError ?? new Error("MISSING_PROFILE");
      const { token } = decryptSecret<{ token: string }>(
        booking.management_token_ciphertext,
      );
      const managementUrl = `${(options.baseUrl ?? siteUrl()).replace(/\/$/, "")}/rezerwacja/${token}`;
      await (options.emailSender ?? sendBookingReminderEmail)({
        deliveryKey: `booking-reminder/${delivery.id}`,
        to: booking.guest_email,
        tutorPublicName: profile.public_name,
        eventTypeName: booking.event_type_name,
        durationMinutes: booking.duration_minutes,
        startsAt: booking.starts_at,
        endsAt: booking.ends_at,
        timezone: booking.timezone,
        managementUrl,
      });
      await supabase
        .from("booking_reminder_deliveries")
        .update({
          status: "succeeded",
          sent_at: now.toISOString(),
          last_error: null,
          updated_at: now.toISOString(),
        })
        .eq("id", delivery.id);
      sent += 1;
    } catch (error) {
      const attempts = delivery.attempts + 1;
      await supabase
        .from("booking_reminder_deliveries")
        .update({
          status: "failed",
          last_error: error instanceof Error ? error.name : "UnknownError",
          next_attempt_at: new Date(
            now.getTime() + Math.min(3600, 2 ** attempts * 60) * 1000,
          ).toISOString(),
          updated_at: now.toISOString(),
        })
        .eq("id", delivery.id);
      failed += 1;
    }
  }
  return { processed: (deliveries ?? []).length, sent, failed, skipped };
}
