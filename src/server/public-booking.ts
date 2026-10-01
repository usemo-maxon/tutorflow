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
import { isSupabaseConfigured } from "./env";
import { ApiFailure } from "./errors";
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

function publicConfirmation(
  booking: PublicBookingRecord,
): PublicBookingConfirmation {
  return {
    bookingId: booking.bookingId,
    eventTypeName: booking.eventTypeName,
    startsAt: booking.startsAt,
    endsAt: booking.endsAt,
    timezone: booking.timezone,
    guestEmail: booking.guestEmail,
  };
}

async function createLocalPublicBooking(
  input: PublicBookingInput,
): Promise<PublicBookingConfirmation> {
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
    const booking: PublicBookingRecord = {
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
      createdAt,
    };
    (store.bookings ??= []).push(booking);
    return publicConfirmation(booking);
  });
}

export async function createPublicBooking(
  rawInput: unknown,
): Promise<PublicBookingConfirmation> {
  const input = validateInput(rawInput);
  if (!isSupabaseConfigured() && process.env.NODE_ENV !== "production") {
    return createLocalPublicBooking(input);
  }

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
    event_type_name: string;
    starts_at: string;
    ends_at: string;
    timezone: string;
    guest_email: string;
  };
  return {
    bookingId: row.booking_id,
    eventTypeName: row.event_type_name,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    timezone: row.timezone,
    guestEmail: row.guest_email,
  };
}

/** Authenticated tutor-domain access; RLS still scopes production reads. */
export async function getOwnPublicBookings(
  teacherId: string,
): Promise<PublicBookingRecord[]> {
  if (!isSupabaseConfigured() && process.env.NODE_ENV !== "production") {
    return queryStore((store) =>
      (store.bookings ?? []).filter(
        (booking) => booking.teacherId === teacherId,
      ),
    );
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("bookings")
    .select(
      "id,tutor_id,event_type_id,event_type_name,duration_minutes,price_grosz,currency,format,starts_at,ends_at,timezone,guest_name,guest_email,guest_phone,guest_level,guest_goal,guest_message,status,student_id,converted_lesson_id,converted_at,created_at",
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
    createdAt: row.created_at,
  }));
}
