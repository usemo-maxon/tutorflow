import "server-only";

import { randomUUID } from "node:crypto";
import type {
  PublicBookingConfirmation,
  PublicBookingInput,
  PublicBookingRecord,
} from "@/lib/public-booking";
import {
  calculatePublicAvailability,
  DEFAULT_BOOKING_AVAILABILITY,
  localDateForTimezone,
} from "@/lib/public-availability";
import { PublicBookingInputSchema } from "@/lib/validation";
import { isSupabaseConfigured, siteUrl } from "./env";
import { createBookingManagementToken } from "./booking-management";
import {
  sendBookingConfirmationEmail,
  type BookingEmailSender,
} from "./booking-email";
import { ApiFailure } from "./errors";
import { encryptSecret } from "./crypto";
import { mutateStore, queryStore } from "./store";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "./supabase";

const offerNotFound = () =>
  new ApiFailure(404, {
    code: "PUBLIC_BOOKING_OFFER_NOT_FOUND",
    message: "Ta oferta nie jest już dostępna.",
  });

const slotUnavailable = () =>
  new ApiFailure(409, {
    code: "PUBLIC_BOOKING_SLOT_UNAVAILABLE",
    message: "Ten termin jest już niedostępny. Wybierz inny termin.",
  });

function withoutBookingSecrets(
  booking: import("./store").BookingRecord,
): PublicBookingRecord {
  const publicBooking: Partial<import("./store").BookingRecord> = {
    ...booking,
  };
  delete publicBooking.managementTokenHash;
  delete publicBooking.managementTokenCiphertext;
  delete publicBooking.confirmationEmailSentAt;
  return publicBooking as PublicBookingRecord;
}

function validateInput(input: unknown): PublicBookingInput {
  const parsed = PublicBookingInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new ApiFailure(400, {
      code: "VALIDATION_ERROR",
      message: parsed.error.issues[0]?.message || "Sprawdź podane dane.",
    });
  }
  return parsed.data;
}

type CreatedBooking = {
  booking: PublicBookingRecord;
  tutorPublicName: string;
  publicLocation?: string;
};

function publicConfirmation(
  booking: PublicBookingRecord,
  managementUrl: string,
): PublicBookingConfirmation {
  return {
    eventTypeName: booking.eventTypeName,
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    timezone: booking.timezone,
    guestEmail: booking.guestEmail,
    managementUrl,
  };
}

async function createLocalPublicBooking(
  input: PublicBookingInput,
  managementTokenHash: string,
): Promise<CreatedBooking> {
  return mutateStore((store) => {
    const teacher = store.teachers.find(
      (item) =>
        item.publicProfile?.enabled && item.publicProfile.slug === input.slug,
    );
    const eventType = store.bookingEventTypes?.find(
      (item) =>
        item.id === input.eventTypeId &&
        item.teacherId === teacher?.id &&
        item.active &&
        item.isPublic,
    );
    if (!teacher || !eventType) throw offerNotFound();

    const localDate = localDateForTimezone(
      new Date(input.startsAt),
      teacher.timezone,
    );
    const bookings = (store.bookings ?? []).filter(
      (booking) => booking.teacherId === teacher.id,
    );
    const days = calculatePublicAvailability({
      data: {
        lessons: store.lessons.filter(
          (lesson) => lesson.teacherId === teacher.id,
        ),
        availability: store.availability.filter(
          (rule) => rule.teacherId === teacher.id,
        ),
        availabilityExceptions: (store.availabilityExceptions ?? []).filter(
          (exception) => exception.teacherId === teacher.id,
        ),
        calendarBlocks: (store.calendarBlocks ?? []).filter(
          (block) => block.teacherId === teacher.id,
        ),
        externalGoogleEvents: (store.externalGoogleEvents ?? []).filter(
          (event) => event.teacherId === teacher.id,
        ),
        integrations: {
          google: teacher.google,
          telegram: teacher.telegram,
          payu: teacher.payu,
        },
      },
      timezone: teacher.timezone,
      durationMinutes: eventType.durationMinutes,
      startDate: localDate,
      endDate: localDate,
      settings: teacher.bookingAvailability ?? DEFAULT_BOOKING_AVAILABILITY,
      bookings,
    });
    const slot = days[0]?.slots.find(
      (candidate) => candidate.startsAt === input.startsAt,
    );
    if (!slot) throw slotUnavailable();

    const createdAt = new Date().toISOString();
    const booking: import("./store").BookingRecord = {
      bookingId: randomUUID(),
      teacherId: teacher.id,
      eventTypeId: eventType.id,
      eventTypeName: eventType.name,
      durationMinutes: eventType.durationMinutes,
      priceGrosz: eventType.priceGrosz,
      currency: eventType.currency,
      format: eventType.format,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      timezone: teacher.timezone,
      guestName: input.name,
      guestEmail: input.email,
      guestPhone: input.phone,
      guestLevel: input.level,
      guestGoal: input.goal,
      guestMessage: input.message,
      status: "confirmed",
      managementTokenHash,
      createdAt,
    };
    (store.bookings ??= []).push(booking);
    return {
      booking,
      tutorPublicName: teacher.publicProfile!.publicName,
      publicLocation:
        eventType.format === "offline"
          ? teacher.publicProfile!.city || undefined
          : undefined,
    };
  });
}

export async function createPublicBooking(
  rawInput: unknown,
  options: {
    emailSender?: BookingEmailSender;
    baseUrl?: string;
  } = {},
): Promise<PublicBookingConfirmation> {
  const input = validateInput(rawInput);
  const { token, tokenHash } = createBookingManagementToken();
  const baseUrl = (options.baseUrl ?? siteUrl()).replace(/\/$/, "");
  let created: CreatedBooking;
  if (!isSupabaseConfigured() && process.env.NODE_ENV !== "production") {
    created = await createLocalPublicBooking(input, tokenHash);
  } else {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .rpc("create_public_booking", {
        p_slug: input.slug,
        p_event_type_id: input.eventTypeId,
        p_starts_at: input.startsAt,
        p_guest_name: input.name,
        p_guest_email: input.email,
        p_guest_phone: input.phone ?? null,
        p_guest_level: input.level ?? null,
        p_guest_goal: input.goal ?? null,
        p_guest_message: input.message ?? null,
        p_management_token_hash: tokenHash,
        p_management_token_ciphertext: encryptSecret({ token }),
      })
      .single();

    if (error) {
      if (error.message.includes("PUBLIC_BOOKING_SLOT_UNAVAILABLE")) {
        throw slotUnavailable();
      }
      if (error.message.includes("PUBLIC_BOOKING_OFFER_NOT_FOUND")) {
        throw offerNotFound();
      }
      if (error.message.includes("PUBLIC_BOOKING_INVALID_GUEST")) {
        throw new ApiFailure(400, {
          code: "VALIDATION_ERROR",
          message: "Sprawdź podane dane.",
        });
      }
      throw error;
    }

    const row = data as {
      booking_id: string;
      tutor_id: string;
      event_type_id: string;
      event_type_name: string;
      duration_minutes: number;
      price_grosz: number;
      currency: "PLN";
      format: "online" | "offline";
      starts_at: string;
      ends_at: string;
      timezone: string;
      guest_name: string;
      guest_email: string;
      tutor_public_name: string;
      public_location: string | null;
      created_at: string;
    };
    created = {
      booking: {
        bookingId: row.booking_id,
        teacherId: row.tutor_id,
        eventTypeId: row.event_type_id,
        eventTypeName: row.event_type_name,
        durationMinutes: row.duration_minutes,
        priceGrosz: row.price_grosz,
        currency: row.currency,
        format: row.format,
        startsAt: row.starts_at,
        endsAt: row.ends_at,
        timezone: row.timezone,
        guestName: row.guest_name,
        guestEmail: row.guest_email,
        status: "confirmed",
        createdAt: row.created_at,
      },
      tutorPublicName: row.tutor_public_name,
      publicLocation: row.public_location ?? undefined,
    };
  }

  const managementUrl = `${baseUrl}/rezerwacja/${token}`;
  const calendarUrl = `${managementUrl}/kalendarz.ics`;
  try {
    await (options.emailSender ?? sendBookingConfirmationEmail)({
      deliveryKey: `booking-confirmation/${created.booking.bookingId}`,
      to: created.booking.guestEmail,
      tutorPublicName: created.tutorPublicName,
      eventTypeName: created.booking.eventTypeName,
      startsAt: created.booking.startsAt,
      endsAt: created.booking.endsAt,
      timezone: created.booking.timezone,
      format: created.booking.format,
      publicLocation: created.publicLocation,
      managementUrl,
      calendarUrl,
    });
    await markConfirmationEmailSent(created.booking.bookingId);
  } catch (error) {
    console.error("Booking confirmation email failed", {
      bookingId: created.booking.bookingId,
      reason: error instanceof Error ? error.name : "UnknownError",
    });
  }
  return publicConfirmation(created.booking, managementUrl);
}

async function markConfirmationEmailSent(bookingId: string) {
  const sentAt = new Date().toISOString();
  if (!isSupabaseConfigured() && process.env.NODE_ENV !== "production") {
    await mutateStore((store) => {
      const booking = (store.bookings ?? []).find(
        (item) => item.bookingId === bookingId,
      );
      if (booking && !booking.confirmationEmailSentAt)
        booking.confirmationEmailSentAt = sentAt;
    });
    return;
  }
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.rpc("mark_booking_confirmation_email_sent", {
    p_booking_id: bookingId,
  });
  if (error) throw error;
}

/** Authenticated tutor-domain access; RLS still scopes production reads. */
export async function getOwnPublicBookings(
  teacherId: string,
): Promise<PublicBookingRecord[]> {
  if (!isSupabaseConfigured() && process.env.NODE_ENV !== "production") {
    return queryStore((store) =>
      (store.bookings ?? [])
        .filter((booking) => booking.teacherId === teacherId)
        .map(withoutBookingSecrets),
    );
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("bookings")
    .select(
      "id,tutor_id,event_type_id,event_type_name,duration_minutes,price_grosz,currency,format,starts_at,ends_at,timezone,guest_name,guest_email,guest_phone,guest_level,guest_goal,guest_message,status,student_id,converted_lesson_id,converted_at,cancelled_at,cancelled_by,rescheduled_at,reschedule_count,created_at",
    )
    .eq("tutor_id", teacherId)
    .eq("source", "public_booking")
    .order("starts_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    bookingId: row.id,
    teacherId: row.tutor_id,
    eventTypeId: row.event_type_id,
    eventTypeName: row.event_type_name,
    durationMinutes: row.duration_minutes,
    priceGrosz: row.price_grosz,
    currency: row.currency as "PLN",
    format: row.format as "online" | "offline",
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    timezone: row.timezone,
    guestName: row.guest_name,
    guestEmail: row.guest_email,
    guestPhone: row.guest_phone ?? undefined,
    guestLevel: row.guest_level ?? undefined,
    guestGoal: row.guest_goal ?? undefined,
    guestMessage: row.guest_message ?? undefined,
    status: row.status as "confirmed" | "cancelled" | "converted",
    studentId: row.student_id ?? undefined,
    lessonId: row.converted_lesson_id ?? undefined,
    convertedAt: row.converted_at ?? undefined,
    cancelledAt: row.cancelled_at ?? undefined,
    cancelledBy: row.cancelled_by ?? undefined,
    rescheduledAt: row.rescheduled_at ?? undefined,
    rescheduleCount: row.reschedule_count,
    createdAt: row.created_at,
  }));
}
