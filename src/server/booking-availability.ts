import "server-only";

import type { BookingAvailabilitySettings } from "@/lib/public-availability";
import {
  calculatePublicAvailability,
  DEFAULT_BOOKING_AVAILABILITY,
} from "@/lib/public-availability";
import { isSupabaseConfigured } from "./env";
import { ApiFailure } from "./errors";
import { getAppData } from "./repository";
import { mutateStore, queryStore } from "./store";
import { createSupabaseServerClient } from "./supabase";

export type PublicAvailability = {
  timezone: string;
  days: ReturnType<typeof calculatePublicAvailability>;
};

const MAX_PUBLIC_RANGE_DAYS = 14;

function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

export function assertPublicAvailabilityRange(
  startDate: string,
  endDate: string,
) {
  if (!validDate(startDate) || !validDate(endDate) || endDate < startDate) {
    throw new ApiFailure(400, {
      code: "INVALID_DATE_RANGE",
      message: "Nieprawidłowy zakres dat.",
    });
  }
  const days = Math.round(
    (Date.parse(`${endDate}T12:00:00Z`) -
      Date.parse(`${startDate}T12:00:00Z`)) /
      86_400_000,
  );
  if (days > MAX_PUBLIC_RANGE_DAYS - 1) {
    throw new ApiFailure(400, {
      code: "DATE_RANGE_TOO_LARGE",
      message: "Zakres może obejmować maksymalnie 14 dni.",
    });
  }
}

export async function getOwnBookingAvailabilitySettings(
  teacherId: string,
): Promise<BookingAvailabilitySettings> {
  if (!isSupabaseConfigured() && process.env.NODE_ENV !== "production") {
    return queryStore((store) => ({
      ...DEFAULT_BOOKING_AVAILABILITY,
      ...store.teachers.find((teacher) => teacher.id === teacherId)
        ?.bookingAvailability,
    }));
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("booking_availability_settings")
    .select(
      "minimum_notice_hours,booking_horizon_days,cancellation_notice_hours,reschedule_notice_hours,reminder_24_hours_enabled",
    )
    .eq("tutor_id", teacherId)
    .maybeSingle();
  if (error) throw error;
  return data
    ? {
        minimumNoticeHours: data.minimum_notice_hours,
        bookingHorizonDays: data.booking_horizon_days,
        cancellationNoticeHours: data.cancellation_notice_hours,
        rescheduleNoticeHours: data.reschedule_notice_hours,
        reminder24HoursEnabled: data.reminder_24_hours_enabled,
      }
    : DEFAULT_BOOKING_AVAILABILITY;
}

export async function saveOwnBookingAvailabilitySettings(
  teacherId: string,
  settings: BookingAvailabilitySettings,
): Promise<BookingAvailabilitySettings> {
  if (!isSupabaseConfigured() && process.env.NODE_ENV !== "production") {
    return mutateStore((store) => {
      const teacher = store.teachers.find((item) => item.id === teacherId);
      if (!teacher) throw new Error("NOT_FOUND");
      teacher.bookingAvailability = settings;
      return settings;
    });
  }
  const supabase = await createSupabaseServerClient();
  const { data: tutor, error: tutorError } = await supabase
    .from("tutor_profiles")
    .select("workspace_id")
    .eq("user_id", teacherId)
    .single();
  if (tutorError || !tutor) throw new Error("NOT_FOUND");
  const { error } = await supabase.from("booking_availability_settings").upsert(
    {
      workspace_id: tutor.workspace_id,
      tutor_id: teacherId,
      minimum_notice_hours: settings.minimumNoticeHours,
      booking_horizon_days: settings.bookingHorizonDays,
      cancellation_notice_hours: settings.cancellationNoticeHours,
      reschedule_notice_hours:
        settings.rescheduleNoticeHours ??
        DEFAULT_BOOKING_AVAILABILITY.rescheduleNoticeHours,
      reminder_24_hours_enabled:
        settings.reminder24HoursEnabled ??
        DEFAULT_BOOKING_AVAILABILITY.reminder24HoursEnabled,
    },
    { onConflict: "tutor_id" },
  );
  if (error) throw error;
  return settings;
}

export async function getPublicTutorAvailability(
  slug: string,
  eventTypeId: string,
  startDate: string,
  endDate: string,
): Promise<PublicAvailability> {
  assertPublicAvailabilityRange(startDate, endDate);
  if (!isSupabaseConfigured() && process.env.NODE_ENV !== "production") {
    const published = await queryStore((store) => {
      const teacher = store.teachers.find(
        (item) =>
          item.publicProfile?.enabled && item.publicProfile.slug === slug,
      );
      const eventType = store.bookingEventTypes?.find(
        (item) =>
          item.id === eventTypeId &&
          item.teacherId === teacher?.id &&
          item.active &&
          item.isPublic,
      );
      return teacher && eventType ? { teacher, eventType } : undefined;
    });
    if (!published)
      throw new ApiFailure(404, {
        code: "NOT_FOUND",
        message: "Nie znaleziono publicznej oferty.",
      });
    const rangeStart = new Date(`${startDate}T00:00:00.000Z`);
    const rangeEnd = new Date(`${endDate}T23:59:59.999Z`);
    rangeStart.setUTCDate(rangeStart.getUTCDate() - 1);
    rangeEnd.setUTCDate(rangeEnd.getUTCDate() + 1);
    const data = await getAppData(published.teacher.id, {
      start: rangeStart.toISOString(),
      end: rangeEnd.toISOString(),
    });
    const settings = await getOwnBookingAvailabilitySettings(
      published.teacher.id,
    );
    const bookings = await queryStore((store) =>
      (store.bookings ?? []).filter(
        (booking) => booking.teacherId === published.teacher.id,
      ),
    );
    return {
      timezone: published.teacher.timezone,
      days: calculatePublicAvailability({
        data,
        timezone: published.teacher.timezone,
        durationMinutes: published.eventType.durationMinutes,
        startDate,
        endDate,
        settings,
        bookings,
      }),
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("get_public_tutor_availability", {
    p_slug: slug,
    p_event_type_id: eventTypeId,
    p_start_date: startDate,
    p_end_date: endDate,
  });
  if (error) throw error;
  const rows = (data ?? []) as Array<{
    date: string;
    starts_at: string | null;
    ends_at: string | null;
    timezone: string;
  }>;
  if (!rows.length)
    throw new ApiFailure(404, {
      code: "NOT_FOUND",
      message: "Nie znaleziono publicznej oferty.",
    });
  return {
    timezone: rows[0].timezone,
    days: rows.reduce<PublicAvailability["days"]>((days, row) => {
      const day =
        days.at(-1) ??
        ((): (typeof days)[number] => {
          const next: (typeof days)[number] = { date: row.date, slots: [] };
          days.push(next);
          return next;
        })();
      if (day.date !== row.date) {
        const next: (typeof days)[number] = { date: row.date, slots: [] };
        days.push(next);
        if (row.starts_at && row.ends_at)
          next.slots.push({ startsAt: row.starts_at, endsAt: row.ends_at });
      } else if (row.starts_at && row.ends_at) {
        day.slots.push({ startsAt: row.starts_at, endsAt: row.ends_at });
      }
      return days;
    }, []),
  };
}
