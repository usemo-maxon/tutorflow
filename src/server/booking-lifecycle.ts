import "server-only";

import { randomUUID } from "node:crypto";
import type {
  BookingConversionDraft,
  BookingConversionInput,
  BookingConversionResult,
  BookingStudentCandidate,
  PublicBookingRecord,
  TutorBookingDetail,
} from "@/lib/public-booking";
import { DEFAULT_CALENDAR_COLOR } from "@/lib/calendar-colors";
import { ApiFailure } from "./errors";
import { assertActiveStudentCapacity } from "./entitlements";
import { isSupabaseConfigured } from "./env";
import { mutateStore, queryStore, type StoreShape } from "./store";
import { createSupabaseServerClient } from "./supabase";

type BookingRow = {
  id: string;
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
  guest_phone: string | null;
  guest_level: string | null;
  guest_goal: string | null;
  guest_message: string | null;
  status: "confirmed" | "cancelled" | "converted";
  student_id: string | null;
  converted_lesson_id: string | null;
  converted_at: string | null;
  cancelled_at: string | null;
  cancelled_by: "guest" | "tutor" | null;
  rescheduled_at: string | null;
  reschedule_count: number;
  acquisition_source: string | null;
  created_at: string;
};

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

const bookingSelect =
  "id,tutor_id,event_type_id,event_type_name,duration_minutes,price_grosz,currency,format,starts_at,ends_at,timezone,guest_name,guest_email,guest_phone,guest_level,guest_goal,guest_message,status,student_id,converted_lesson_id,converted_at,cancelled_at,cancelled_by,rescheduled_at,reschedule_count,acquisition_source,created_at";

function notFound(): ApiFailure {
  return new ApiFailure(404, {
    code: "BOOKING_NOT_FOUND",
    message: "Nie znaleziono rezerwacji.",
  });
}

function rowToBooking(row: BookingRow): PublicBookingRecord {
  return {
    bookingId: row.id,
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
    guestPhone: row.guest_phone ?? undefined,
    guestLevel: row.guest_level ?? undefined,
    guestGoal: row.guest_goal ?? undefined,
    guestMessage: row.guest_message ?? undefined,
    status: row.status,
    studentId: row.student_id ?? undefined,
    lessonId: row.converted_lesson_id ?? undefined,
    convertedAt: row.converted_at ?? undefined,
    cancelledAt: row.cancelled_at ?? undefined,
    cancelledBy: row.cancelled_by ?? undefined,
    rescheduledAt: row.rescheduled_at ?? undefined,
    rescheduleCount: row.reschedule_count,
    acquisitionSource: row.acquisition_source ?? undefined,
    createdAt: row.created_at,
  };
}

function proposedStudent(booking: PublicBookingRecord): BookingConversionDraft {
  const parts = booking.guestName.trim().split(/\s+/);
  return {
    firstName: parts.shift() ?? booking.guestName.trim(),
    lastName: parts.join(" "),
    email: booking.guestEmail,
    phone: booking.guestPhone ?? "",
    level: booking.guestLevel ?? "",
    goal: booking.guestGoal ?? "",
  };
}

const normalized = (value?: string | null) =>
  (value ?? "").normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase();
const normalizedPhone = (value?: string | null) =>
  (value ?? "").replace(/[^\d+]/g, "").replace(/^00/, "+");

function matchingCandidates(
  booking: PublicBookingRecord,
  students: BookingStudentCandidate[],
): BookingStudentCandidate[] {
  const name = normalized(booking.guestName);
  const email = normalized(booking.guestEmail);
  const phone = normalizedPhone(booking.guestPhone);
  return students.filter(
    (student) =>
      (name && normalized(student.displayName) === name) ||
      (email && normalized(student.email) === email) ||
      (phone && normalizedPhone(student.phone) === phone),
  );
}

function validateConversion(input: BookingConversionInput): void {
  if (input.mode === "existing") {
    if (!input.studentId.trim()) throw notFound();
    return;
  }
  if (!input.student.firstName.trim()) {
    throw new ApiFailure(422, {
      code: "VALIDATION_ERROR",
      message: "Podaj imię ucznia.",
      fieldErrors: { firstName: "Podaj imię ucznia." },
    });
  }
  if (input.student.email && !/^\S+@\S+\.\S+$/.test(input.student.email)) {
    throw new ApiFailure(422, {
      code: "VALIDATION_ERROR",
      message: "Podaj poprawny adres e-mail.",
      fieldErrors: { email: "Podaj poprawny adres e-mail." },
    });
  }
}

export async function listTutorBookings(
  teacherId: string,
): Promise<PublicBookingRecord[]> {
  if (!isSupabaseConfigured() && process.env.NODE_ENV !== "production") {
    return queryStore((store) =>
      (store.bookings ?? [])
        .filter((booking) => booking.teacherId === teacherId)
        .map(withoutBookingSecrets)
        .sort((a, b) => b.startsAt.localeCompare(a.startsAt)),
    );
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("bookings")
    .select(bookingSelect)
    .eq("tutor_id", teacherId)
    .eq("source", "public_booking")
    .order("starts_at", { ascending: false });
  if (error) throw error;
  return (data as BookingRow[]).map(rowToBooking);
}

export async function getTutorBooking(
  teacherId: string,
  bookingId: string,
): Promise<TutorBookingDetail> {
  if (!isSupabaseConfigured() && process.env.NODE_ENV !== "production") {
    return queryStore((store) => {
      const booking = (store.bookings ?? []).find(
        (item) => item.bookingId === bookingId && item.teacherId === teacherId,
      );
      if (!booking) throw notFound();
      const publicBooking = withoutBookingSecrets(booking);
      const students = store.students
        .filter((item) => item.teacherId === teacherId)
        .map((item) => ({
          id: item.id,
          displayName: item.displayName,
          email: item.email,
          phone: item.phone,
          level: item.level,
          status: item.status,
        }));
      return {
        ...publicBooking,
        proposedStudent: proposedStudent(publicBooking),
        matchingStudents: matchingCandidates(publicBooking, students),
      };
    });
  }
  const supabase = await createSupabaseServerClient();
  const [{ data, error }, studentsResult] = await Promise.all([
    supabase
      .from("bookings")
      .select(bookingSelect)
      .eq("id", bookingId)
      .eq("tutor_id", teacherId)
      .eq("source", "public_booking")
      .maybeSingle(),
    supabase
      .from("students")
      .select("id,display_name,email,phone,level,status")
      .eq("status", "active"),
  ]);
  if (error) throw error;
  if (!data) throw notFound();
  if (studentsResult.error) throw studentsResult.error;
  const booking = rowToBooking(data as BookingRow);
  const students = (studentsResult.data ?? []).map((student) => ({
    id: student.id,
    displayName: student.display_name,
    email: student.email ?? "",
    phone: student.phone ?? "",
    level: student.level ?? "",
    status: student.status as "active" | "archived",
  }));
  return {
    ...booking,
    proposedStudent: proposedStudent(booking),
    matchingStudents: matchingCandidates(booking, students),
  };
}

export async function convertTutorBooking(
  teacherId: string,
  bookingId: string,
  input: BookingConversionInput,
): Promise<BookingConversionResult> {
  validateConversion(input);
  if (!isSupabaseConfigured() && process.env.NODE_ENV !== "production") {
    return convertLocalBooking(teacherId, bookingId, input);
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("convert_public_booking", {
    p_booking_id: bookingId,
    p_mode: input.mode,
    p_existing_student_id: input.mode === "existing" ? input.studentId : null,
    p_student:
      input.mode === "new"
        ? {
            firstName: input.student.firstName.trim(),
            lastName: input.student.lastName.trim(),
            email: input.student.email.trim(),
            phone: input.student.phone.trim(),
            level: input.student.level.trim(),
            goal: input.student.goal.trim(),
          }
        : {},
  });
  if (error) {
    if (error.message.includes("BOOKING_NOT_FOUND")) throw notFound();
    if (error.message.includes("STUDENT_LIMIT_REACHED")) {
      throw new ApiFailure(403, {
        code: "PLAN_LIMIT_REACHED",
        message: "Plan Free pozwala na maksymalnie 3 aktywnych uczniów.",
        details: { limit: 3, resource: "active_students" },
      });
    }
    if (error.message.includes("BOOKING_CONFLICT")) {
      throw new ApiFailure(409, {
        code: "LESSON_CONFLICT",
        message: "Po rezerwacji pojawił się konflikt w tym terminie.",
      });
    }
    if (error.message.includes("BOOKING_NOT_CONVERTIBLE")) {
      throw new ApiFailure(409, {
        code: "BOOKING_NOT_CONVERTIBLE",
        message: "Tej rezerwacji nie można już przekonwertować.",
      });
    }
    throw error;
  }
  const result = data as {
    bookingId: string;
    studentId: string;
    lessonId: string;
    convertedAt: string;
    alreadyConverted: boolean;
  };
  return result;
}

function hasConflict(store: StoreShape, booking: PublicBookingRecord): boolean {
  const start = Date.parse(booking.startsAt);
  const end = Date.parse(booking.endsAt);
  return (
    store.lessons.some((lesson) => {
      const lessonStart = Date.parse(lesson.startsAt);
      const lessonEnd = lessonStart + lesson.durationMinutes * 60_000;
      return (
        lesson.teacherId === booking.teacherId &&
        lesson.status !== "cancelled" &&
        start < lessonEnd &&
        end > lessonStart
      );
    }) ||
    (store.calendarBlocks ?? []).some(
      (block) =>
        block.teacherId === booking.teacherId &&
        start < Date.parse(block.endsAt) &&
        end > Date.parse(block.startsAt),
    ) ||
    (store.externalGoogleEvents ?? []).some(
      (event) =>
        event.teacherId === booking.teacherId &&
        event.blocksTime &&
        event.startsAt &&
        event.endsAt &&
        start < Date.parse(event.endsAt) &&
        end > Date.parse(event.startsAt),
    )
  );
}

async function convertLocalBooking(
  teacherId: string,
  bookingId: string,
  input: BookingConversionInput,
): Promise<BookingConversionResult> {
  return mutateStore((store) => {
    const booking = (store.bookings ?? []).find(
      (item) => item.bookingId === bookingId && item.teacherId === teacherId,
    );
    if (!booking) throw notFound();
    if (
      booking.status === "converted" &&
      booking.studentId &&
      booking.lessonId &&
      booking.convertedAt
    ) {
      return {
        bookingId,
        studentId: booking.studentId,
        lessonId: booking.lessonId,
        convertedAt: booking.convertedAt,
        alreadyConverted: true,
      };
    }
    if (booking.status !== "confirmed") {
      throw new ApiFailure(409, {
        code: "BOOKING_NOT_CONVERTIBLE",
        message: "Tej rezerwacji nie można już przekonwertować.",
      });
    }
    const teacher = store.teachers.find((item) => item.id === teacherId);
    if (!teacher) throw notFound();
    if (teacher.subscription.readOnly) {
      throw new ApiFailure(403, {
        code: "READ_ONLY",
        message: "Konto działa w trybie tylko do odczytu.",
      });
    }
    let studentId: string;
    if (input.mode === "existing") {
      const student = store.students.find(
        (item) =>
          item.id === input.studentId &&
          item.teacherId === teacherId &&
          item.status === "active",
      );
      if (!student) throw notFound();
      studentId = student.id;
    } else {
      assertActiveStudentCapacity(
        teacher.subscription,
        store.students.filter(
          (item) => item.teacherId === teacherId && item.status === "active",
        ).length,
      );
      studentId = randomUUID();
      const displayName = [input.student.firstName, input.student.lastName]
        .map((part) => part.trim())
        .filter(Boolean)
        .join(" ");
      store.students.push({
        id: studentId,
        teacherId,
        firstName: input.student.firstName.trim(),
        lastName: input.student.lastName.trim(),
        displayName,
        name: displayName,
        email: input.student.email.trim(),
        phone: input.student.phone.trim(),
        contact: input.student.email.trim() || input.student.phone.trim(),
        subject: "",
        level: input.student.level.trim(),
        goal: input.student.goal.trim(),
        notes: "",
        status: "active",
        defaultDurationMinutes: booking.durationMinutes,
        defaultFormat: booking.format,
        defaultLocation: "",
        defaultPrice: {
          amount: booking.priceGrosz,
          currency: booking.currency,
        },
        timezone: booking.timezone,
        groupIds: [],
        packageRemainingLessons: null,
        balanceDue: { amount: 0, currency: "PLN" },
        createdAt: new Date().toISOString(),
      });
    }
    if (hasConflict(store, booking)) {
      throw new ApiFailure(409, {
        code: "LESSON_CONFLICT",
        message: "Po rezerwacji pojawił się konflikt w tym terminie.",
      });
    }
    const lessonId = randomUUID();
    const convertedAt = new Date().toISOString();
    store.lessons.push({
      id: lessonId,
      teacherId,
      color: DEFAULT_CALENDAR_COLOR,
      participantIds: [studentId],
      startsAt: booking.startsAt,
      durationMinutes: booking.durationMinutes,
      format: booking.format,
      location: "",
      price: { amount: booking.priceGrosz, currency: booking.currency },
      mode: "single",
      timezone: booking.timezone,
      status: "scheduled",
      syncStatus:
        teacher.google.status === "connected" ? "pending" : "disabled",
      topic: booking.eventTypeName,
      planItems: [],
      homework: "",
      generalNotes: "",
      participants: [
        {
          studentId,
          attendanceStatus: "unknown",
          paymentStatus: "unpaid",
          results: [],
        },
      ],
      createdAt: convertedAt,
      updatedAt: convertedAt,
    });
    Object.assign(booking, {
      status: "converted" as const,
      studentId,
      lessonId,
      convertedAt,
    });
    return {
      bookingId,
      studentId,
      lessonId,
      convertedAt,
      alreadyConverted: false,
    };
  });
}
