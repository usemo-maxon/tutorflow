export type PublicBookingInput = {
  slug: string;
  eventTypeId: string;
  startsAt: string;
  name: string;
  email: string;
  phone?: string;
  level?: string;
  goal?: string;
  message?: string;
  website?: string;
};

export type PublicBookingConfirmation = {
  eventTypeName: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  guestEmail: string;
  managementUrl: string;
};

export type PublicBookingRecord = {
  bookingId: string;
  teacherId: string;
  eventTypeId: string;
  eventTypeName: string;
  durationMinutes: number;
  priceGrosz: number;
  currency: "PLN";
  format: "online" | "offline";
  startsAt: string;
  endsAt: string;
  timezone: string;
  guestName: string;
  guestEmail: string;
  guestPhone?: string;
  guestLevel?: string;
  guestGoal?: string;
  guestMessage?: string;
  status: "confirmed" | "cancelled" | "converted";
  studentId?: string;
  lessonId?: string;
  convertedAt?: string;
  cancelledAt?: string;
  cancelledBy?: "guest" | "tutor";
  rescheduledAt?: string;
  rescheduleCount?: number;
  createdAt: string;
};

export type GuestBooking = {
  tutorPublicName: string;
  eventTypeName: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  format: "online" | "offline";
  publicLocation?: string;
  status: "confirmed" | "cancelled" | "converted";
  cancellationDeadline: string;
  canCancel: boolean;
  cancellationBlockedReason?: "cancelled" | "converted" | "deadline";
  rescheduleDeadline: string;
  canReschedule: boolean;
  rescheduleBlockedReason?: "cancelled" | "converted" | "deadline";
  rescheduledAt?: string;
  rescheduleCount?: number;
};

export type BookingStudentCandidate = {
  id: string;
  displayName: string;
  email: string;
  phone: string;
  level: string;
  status: "active" | "archived";
};

export type BookingConversionDraft = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  level: string;
  goal: string;
};

export type TutorBookingDetail = PublicBookingRecord & {
  proposedStudent: BookingConversionDraft;
  matchingStudents: BookingStudentCandidate[];
};

export type BookingConversionInput =
  | { mode: "existing"; studentId: string }
  | { mode: "new"; student: BookingConversionDraft };

export type BookingConversionResult = {
  bookingId: string;
  studentId: string;
  lessonId: string;
  convertedAt: string;
  alreadyConverted: boolean;
};

export function isActivePublicBooking(booking: {
  status: PublicBookingRecord["status"];
  studentId?: string | null;
  lessonId?: string | null;
}): boolean {
  return (
    booking.status === "confirmed" && !booking.studentId && !booking.lessonId
  );
}
