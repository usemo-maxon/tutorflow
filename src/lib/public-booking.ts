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
  bookingId: string;
  eventTypeName: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  guestEmail: string;
};

export type PublicBookingRecord = PublicBookingConfirmation & {
  teacherId: string;
  eventTypeId: string;
  durationMinutes: number;
  priceGrosz: number;
  currency: "PLN";
  format: "online" | "offline";
  guestName: string;
  guestPhone?: string;
  guestLevel?: string;
  guestGoal?: string;
  guestMessage?: string;
  status: "confirmed" | "cancelled" | "converted";
  studentId?: string;
  lessonId?: string;
  convertedAt?: string;
  createdAt: string;
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
