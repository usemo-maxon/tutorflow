import "server-only";

import { createHash, randomBytes } from "node:crypto";
import type { GuestBooking, PublicBookingRecord } from "@/lib/public-booking";
import {
  calculatePublicAvailability,
  DEFAULT_BOOKING_AVAILABILITY,
  localDateForTimezone,
} from "@/lib/public-availability";
import {
  assertPublicAvailabilityRange,
  type PublicAvailability,
} from "./booking-availability";
import { ApiFailure } from "./errors";
import { isSupabaseConfigured, siteUrl } from "./env";
import {
  sendBookingConfirmationEmail,
  type BookingEmailSender,
} from "./booking-email";
import { mutateStore, queryStore } from "./store";
import {
  createSupabaseAdminClient,
  createSupabaseServerClient,
} from "./supabase";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function createBookingManagementToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashBookingManagementToken(token) };
}

export function hashBookingManagementToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

function tokenHash(token: string) {
  return TOKEN_PATTERN.test(token) ? hashBookingManagementToken(token) : null;
}

function unavailable(): ApiFailure {
  return new ApiFailure(404, {
    code: "BOOKING_UNAVAILABLE",
    message: "Ta rezerwacja jest niedostępna.",
  });
}

function toGuestBooking(input: {
  tutorPublicName: string;
  eventTypeName: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  format: "online" | "offline";
  publicLocation?: string | null;
  status: GuestBooking["status"];
  cancellationNoticeHours: number;
  rescheduleNoticeHours: number;
  rescheduledAt?: string | null;
  rescheduleCount?: number;
  now?: Date;
}): GuestBooking {
  const deadline = new Date(
    Date.parse(input.startsAt) - input.cancellationNoticeHours * 3_600_000,
  ).toISOString();
  const rescheduleDeadline = new Date(
    Date.parse(input.startsAt) - input.rescheduleNoticeHours * 3_600_000,
  ).toISOString();
  const now = input.now ?? new Date();
  const reason =
    input.status === "converted"
      ? "converted"
      : input.status === "cancelled"
        ? "cancelled"
        : now.getTime() >= Date.parse(deadline)
          ? "deadline"
          : undefined;
  const rescheduleReason =
    input.status === "converted"
      ? "converted"
      : input.status === "cancelled"
        ? "cancelled"
        : now.getTime() >= Date.parse(rescheduleDeadline)
          ? "deadline"
          : undefined;
  return {
    tutorPublicName: input.tutorPublicName,
    eventTypeName: input.eventTypeName,
    startsAt: input.startsAt,
    endsAt: input.endsAt,
    timezone: input.timezone,
    format: input.format,
    publicLocation: input.publicLocation || undefined,
    status: input.status,
    cancellationDeadline: deadline,
    canCancel: !reason,
    cancellationBlockedReason: reason,
    rescheduleDeadline,
    canReschedule: !rescheduleReason,
    rescheduleBlockedReason: rescheduleReason,
    rescheduledAt: input.rescheduledAt || undefined,
    rescheduleCount: input.rescheduleCount ?? 0,
  };
}

export async function getGuestBooking(
  token: string,
  now = new Date(),
): Promise<GuestBooking> {
  const hash = tokenHash(token);
  if (!hash) throw unavailable();
  if (!isSupabaseConfigured() && process.env.NODE_ENV !== "production") {
    const result = await queryStore((store) => {
      const booking = (store.bookings ?? []).find(
        (item) => item.managementTokenHash === hash,
      );
      if (!booking) return null;
      const teacher = store.teachers.find(
        (item) => item.id === booking.teacherId,
      );
      if (!teacher) return null;
      return toGuestBooking({
        tutorPublicName:
          teacher.publicProfile?.publicName || teacher.name || "Nauczyciel",
        eventTypeName: booking.eventTypeName,
        startsAt: booking.startsAt,
        endsAt: booking.endsAt,
        timezone: booking.timezone,
        format: booking.format,
        publicLocation:
          booking.format === "offline"
            ? teacher.publicProfile?.city
            : undefined,
        status: booking.status,
        cancellationNoticeHours:
          teacher.bookingAvailability?.cancellationNoticeHours ??
          DEFAULT_BOOKING_AVAILABILITY.cancellationNoticeHours,
        rescheduleNoticeHours:
          teacher.bookingAvailability?.rescheduleNoticeHours ??
          DEFAULT_BOOKING_AVAILABILITY.rescheduleNoticeHours,
        rescheduledAt: booking.rescheduledAt,
        rescheduleCount: booking.rescheduleCount,
        now,
      });
    });
    if (!result) throw unavailable();
    return result;
  }
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .rpc("get_public_booking_by_token", { p_token_hash: hash })
    .maybeSingle();
  if (error) throw error;
  if (!data) throw unavailable();
  const row = data as {
    tutor_public_name: string;
    event_type_name: string;
    starts_at: string;
    ends_at: string;
    timezone: string;
    format: "online" | "offline";
    public_location: string | null;
    status: GuestBooking["status"];
    cancellation_notice_hours: number;
    reschedule_notice_hours: number;
    rescheduled_at: string | null;
    reschedule_count: number;
  };
  return toGuestBooking({
    tutorPublicName: row.tutor_public_name,
    eventTypeName: row.event_type_name,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    timezone: row.timezone,
    format: row.format,
    publicLocation: row.public_location,
    status: row.status,
    cancellationNoticeHours: row.cancellation_notice_hours,
    rescheduleNoticeHours: row.reschedule_notice_hours,
    rescheduledAt: row.rescheduled_at,
    rescheduleCount: row.reschedule_count,
    now,
  });
}

export async function getGuestRescheduleAvailability(
  token: string,
  startDate: string,
  endDate: string,
  now = new Date(),
): Promise<PublicAvailability> {
  assertPublicAvailabilityRange(startDate, endDate);
  const hash = tokenHash(token);
  if (!hash) throw unavailable();
  if (!isSupabaseConfigured() && process.env.NODE_ENV !== "production") {
    const result = await queryStore((store) => {
      const booking = (store.bookings ?? []).find(
        (item) => item.managementTokenHash === hash,
      );
      const teacher = store.teachers.find(
        (item) => item.id === booking?.teacherId,
      );
      if (!booking || !teacher) return null;
      assertReschedulable(
        booking.status,
        booking.startsAt,
        teacher.bookingAvailability?.rescheduleNoticeHours ??
          DEFAULT_BOOKING_AVAILABILITY.rescheduleNoticeHours,
        now,
      );
      return {
        timezone: booking.timezone,
        days: calculatePublicAvailability({
          data: {
            lessons: store.lessons.filter(
              (item) => item.teacherId === teacher.id,
            ),
            availability: store.availability.filter(
              (item) => item.teacherId === teacher.id,
            ),
            availabilityExceptions: (store.availabilityExceptions ?? []).filter(
              (item) => item.teacherId === teacher.id,
            ),
            calendarBlocks: (store.calendarBlocks ?? []).filter(
              (item) => item.teacherId === teacher.id,
            ),
            externalGoogleEvents: (store.externalGoogleEvents ?? []).filter(
              (item) => item.teacherId === teacher.id,
            ),
            integrations: {
              google: teacher.google,
              telegram: teacher.telegram,
              payu: teacher.payu,
            },
          },
          timezone: booking.timezone,
          durationMinutes: booking.durationMinutes,
          startDate,
          endDate,
          settings: {
            ...DEFAULT_BOOKING_AVAILABILITY,
            ...teacher.bookingAvailability,
          },
          bookings: (store.bookings ?? []).filter(
            (item) =>
              item.teacherId === teacher.id &&
              item.bookingId !== booking.bookingId,
          ),
          now,
        }),
      };
    });
    if (!result) throw unavailable();
    return result;
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc(
    "get_public_booking_reschedule_availability",
    {
      p_token_hash: hash,
      p_start_date: startDate,
      p_end_date: endDate,
    },
  );
  if (error) throw rescheduleFailure(error.message);
  const rows = (data ?? []) as Array<{
    date: string;
    starts_at: string | null;
    ends_at: string | null;
    timezone: string;
  }>;
  if (!rows.length) throw unavailable();
  return {
    timezone: rows[0].timezone,
    days: rows.reduce<PublicAvailability["days"]>((days, row) => {
      let day = days.at(-1);
      if (!day || day.date !== row.date) {
        day = { date: row.date, slots: [] };
        days.push(day);
      }
      if (row.starts_at && row.ends_at) {
        day.slots.push({ startsAt: row.starts_at, endsAt: row.ends_at });
      }
      return days;
    }, []),
  };
}

export async function rescheduleGuestBooking(
  token: string,
  startsAt: string,
  options: {
    now?: Date;
    emailSender?: BookingEmailSender;
    baseUrl?: string;
  } = {},
): Promise<GuestBooking> {
  const hash = tokenHash(token);
  if (!hash) throw unavailable();
  const now = options.now ?? new Date();
  let result: {
    booking: import("./store").BookingRecord;
    tutorPublicName: string;
    publicLocation?: string;
    rescheduleNoticeHours: number;
    cancellationNoticeHours: number;
  };

  if (!isSupabaseConfigured() && process.env.NODE_ENV !== "production") {
    result = await mutateStore((store) => {
      const booking = (store.bookings ?? []).find(
        (item) => item.managementTokenHash === hash,
      );
      const teacher = store.teachers.find(
        (item) => item.id === booking?.teacherId,
      );
      if (!booking || !teacher) throw unavailable();
      const notice =
        teacher.bookingAvailability?.rescheduleNoticeHours ??
        DEFAULT_BOOKING_AVAILABILITY.rescheduleNoticeHours;
      assertReschedulable(booking.status, booking.startsAt, notice, now);
      const date = localDateForTimezone(new Date(startsAt), booking.timezone);
      const days = calculatePublicAvailability({
        data: {
          lessons: store.lessons.filter(
            (item) => item.teacherId === teacher.id,
          ),
          availability: store.availability.filter(
            (item) => item.teacherId === teacher.id,
          ),
          availabilityExceptions: (store.availabilityExceptions ?? []).filter(
            (item) => item.teacherId === teacher.id,
          ),
          calendarBlocks: (store.calendarBlocks ?? []).filter(
            (item) => item.teacherId === teacher.id,
          ),
          externalGoogleEvents: (store.externalGoogleEvents ?? []).filter(
            (item) => item.teacherId === teacher.id,
          ),
          integrations: {
            google: teacher.google,
            telegram: teacher.telegram,
            payu: teacher.payu,
          },
        },
        timezone: booking.timezone,
        durationMinutes: booking.durationMinutes,
        startDate: date,
        endDate: date,
        settings: {
          ...DEFAULT_BOOKING_AVAILABILITY,
          ...teacher.bookingAvailability,
        },
        bookings: (store.bookings ?? []).filter(
          (item) =>
            item.teacherId === teacher.id &&
            item.bookingId !== booking.bookingId,
        ),
        now,
      });
      const slot = days[0]?.slots.find(
        (candidate) => candidate.startsAt === startsAt,
      );
      if (!slot) throw rescheduleFailure("BOOKING_SLOT_UNAVAILABLE");
      booking.startsAt = slot.startsAt;
      booking.endsAt = slot.endsAt;
      booking.rescheduledAt = now.toISOString();
      booking.rescheduleCount = (booking.rescheduleCount ?? 0) + 1;
      return {
        booking,
        tutorPublicName:
          teacher.publicProfile?.publicName || teacher.name || "Nauczyciel",
        publicLocation:
          booking.format === "offline"
            ? teacher.publicProfile?.city || undefined
            : undefined,
        rescheduleNoticeHours: notice,
        cancellationNoticeHours:
          teacher.bookingAvailability?.cancellationNoticeHours ??
          DEFAULT_BOOKING_AVAILABILITY.cancellationNoticeHours,
      };
    });
  } else {
    const supabase = createSupabaseAdminClient();
    const { data, error } = await supabase
      .rpc("reschedule_public_booking_by_token", {
        p_token_hash: hash,
        p_starts_at: startsAt,
      })
      .single();
    if (error) throw rescheduleFailure(error.message);
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
      rescheduled_at: string;
      reschedule_count: number;
      reschedule_notice_hours: number;
      cancellation_notice_hours: number;
      created_at: string;
    };
    result = {
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
        rescheduledAt: row.rescheduled_at,
        rescheduleCount: row.reschedule_count,
        createdAt: row.created_at,
      },
      tutorPublicName: row.tutor_public_name,
      publicLocation: row.public_location ?? undefined,
      rescheduleNoticeHours: row.reschedule_notice_hours,
      cancellationNoticeHours: row.cancellation_notice_hours,
    };
  }

  const baseUrl = (options.baseUrl ?? siteUrl()).replace(/\/$/, "");
  const managementUrl = `${baseUrl}/rezerwacja/${token}`;
  try {
    await (options.emailSender ?? sendBookingConfirmationEmail)({
      kind: "rescheduled",
      deliveryKey: `booking-rescheduled/${result.booking.bookingId}/${result.booking.rescheduleCount}`,
      to: result.booking.guestEmail,
      tutorPublicName: result.tutorPublicName,
      eventTypeName: result.booking.eventTypeName,
      startsAt: result.booking.startsAt,
      endsAt: result.booking.endsAt,
      timezone: result.booking.timezone,
      format: result.booking.format,
      publicLocation: result.publicLocation,
      managementUrl,
      calendarUrl: `${managementUrl}/kalendarz.ics`,
    });
  } catch (error) {
    console.error("Booking reschedule email failed", {
      bookingId: result.booking.bookingId,
      reason: error instanceof Error ? error.name : "UnknownError",
    });
  }
  return toGuestBooking({
    tutorPublicName: result.tutorPublicName,
    eventTypeName: result.booking.eventTypeName,
    startsAt: result.booking.startsAt,
    endsAt: result.booking.endsAt,
    timezone: result.booking.timezone,
    format: result.booking.format,
    publicLocation: result.publicLocation,
    status: result.booking.status,
    cancellationNoticeHours: result.cancellationNoticeHours,
    rescheduleNoticeHours: result.rescheduleNoticeHours,
    rescheduledAt: result.booking.rescheduledAt,
    rescheduleCount: result.booking.rescheduleCount,
    now,
  });
}

export async function cancelGuestBooking(token: string, now = new Date()) {
  const hash = tokenHash(token);
  if (!hash) throw unavailable();
  if (!isSupabaseConfigured() && process.env.NODE_ENV !== "production") {
    return mutateStore((store) => {
      const booking = (store.bookings ?? []).find(
        (item) => item.managementTokenHash === hash,
      );
      if (!booking) throw unavailable();
      const teacher = store.teachers.find(
        (item) => item.id === booking.teacherId,
      );
      if (!teacher) throw unavailable();
      return cancelLocalBooking(
        booking,
        "guest",
        teacher.bookingAvailability?.cancellationNoticeHours ??
          DEFAULT_BOOKING_AVAILABILITY.cancellationNoticeHours,
        now,
      );
    });
  }
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("cancel_public_booking_by_token", {
    p_token_hash: hash,
  });
  if (error) throw cancellationFailure(error.message);
  return { status: data as PublicBookingRecord["status"] };
}

export async function cancelTutorBooking(
  teacherId: string,
  bookingId: string,
  now = new Date(),
) {
  if (!isSupabaseConfigured() && process.env.NODE_ENV !== "production") {
    return mutateStore((store) => {
      const booking = (store.bookings ?? []).find(
        (item) => item.bookingId === bookingId && item.teacherId === teacherId,
      );
      if (!booking) throw unavailable();
      return cancelLocalBooking(booking, "tutor", 0, now);
    });
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("cancel_public_booking_as_tutor", {
    p_booking_id: bookingId,
  });
  if (error) throw cancellationFailure(error.message);
  return { status: data as PublicBookingRecord["status"] };
}

function cancelLocalBooking(
  booking: import("./store").BookingRecord,
  actor: "guest" | "tutor",
  noticeHours: number,
  now: Date,
) {
  if (booking.status === "converted")
    throw cancellationFailure("BOOKING_CONVERTED");
  if (booking.status === "cancelled") return { status: booking.status };
  if (
    actor === "guest" &&
    now.getTime() >= Date.parse(booking.startsAt) - noticeHours * 3_600_000
  ) {
    throw cancellationFailure("BOOKING_CANCELLATION_DEADLINE");
  }
  booking.status = "cancelled";
  booking.cancelledAt = now.toISOString();
  booking.cancelledBy = actor;
  return { status: booking.status };
}

function cancellationFailure(message: string) {
  if (message.includes("BOOKING_CONVERTED"))
    return new ApiFailure(409, {
      code: "BOOKING_CONVERTED",
      message: "Ta rezerwacja została już przekształcona w lekcję.",
    });
  if (message.includes("BOOKING_CANCELLATION_DEADLINE"))
    return new ApiFailure(409, {
      code: "BOOKING_CANCELLATION_DEADLINE",
      message: "Nie możesz już anulować tej rezerwacji online.",
    });
  if (message.includes("BOOKING_UNAVAILABLE")) return unavailable();
  return new Error(message);
}

function assertReschedulable(
  status: PublicBookingRecord["status"],
  startsAt: string,
  noticeHours: number,
  now: Date,
) {
  if (status === "converted") throw rescheduleFailure("BOOKING_CONVERTED");
  if (status === "cancelled") throw rescheduleFailure("BOOKING_CANCELLED");
  if (status !== "confirmed") throw unavailable();
  if (now.getTime() >= Date.parse(startsAt) - noticeHours * 3_600_000) {
    throw rescheduleFailure("BOOKING_RESCHEDULE_DEADLINE");
  }
}

function rescheduleFailure(message: string) {
  if (message.includes("BOOKING_CONVERTED"))
    return new ApiFailure(409, {
      code: "BOOKING_CONVERTED",
      message:
        "Ta rezerwacja została już przekształcona w lekcję. Skontaktuj się z nauczycielem, aby zmienić termin.",
    });
  if (message.includes("BOOKING_CANCELLED"))
    return new ApiFailure(409, {
      code: "BOOKING_CANCELLED",
      message: "Anulowanej rezerwacji nie można przenieść.",
    });
  if (message.includes("BOOKING_RESCHEDULE_DEADLINE"))
    return new ApiFailure(409, {
      code: "BOOKING_RESCHEDULE_DEADLINE",
      message: "Nie możesz już zmienić terminu tej rezerwacji online.",
    });
  if (
    message.includes("BOOKING_SLOT_UNAVAILABLE") ||
    message.includes("PUBLIC_BOOKING_SLOT_UNAVAILABLE")
  )
    return new ApiFailure(409, {
      code: "BOOKING_SLOT_UNAVAILABLE",
      message: "Ten termin nie jest już dostępny.\nWybierz inny termin.",
    });
  if (message.includes("BOOKING_UNAVAILABLE")) return unavailable();
  return new Error(message);
}
