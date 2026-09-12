import "server-only";

import { randomUUID } from "node:crypto";
import { formatInTimeZone } from "date-fns-tz";
import type {
  AppAction,
  LessonParticipant,
  MutationResponse,
  PlanItem,
  Student,
} from "@/lib/domain";
import { ApiFailure } from "./errors";
import { mutateStore } from "./repository";
import { appDataFromStore, type LessonRecord, type StoreShape } from "./store";

export async function performAction(
  teacherId: string,
  action: AppAction,
): Promise<MutationResponse> {
  return mutateStore(teacherId, (store) => {
    const teacher = store.teachers.find(
      (candidate) => candidate.id === teacherId,
    );
    if (!teacher) unauthorized();
    if (teacher.subscription.readOnly) {
      throw new ApiFailure(403, {
        code: "READ_ONLY",
        message:
          "Konto działa w trybie tylko do odczytu. Aktywuj subskrypcję, aby zapisywać zmiany.",
      });
    }

    let result: MutationResponse["result"];
    switch (action.type) {
      case "createStudent": {
        validateStudent(action.student);
        const student = {
          ...action.student,
          id: randomUUID(),
          teacherId,
          createdAt: new Date().toISOString(),
        };
        store.students.push(student);
        result = { id: student.id };
        break;
      }
      case "updateStudent": {
        const student = ownedStudent(store, teacherId, action.studentId);
        const allowedPatch: Partial<Student> = {
          name: action.patch.name,
          contact: action.patch.contact,
          level: action.patch.level,
          goal: action.patch.goal,
          notes: action.patch.notes,
          defaultDurationMinutes: action.patch.defaultDurationMinutes,
          defaultFormat: action.patch.defaultFormat,
          defaultLocation: action.patch.defaultLocation,
          defaultPrice: action.patch.defaultPrice,
        };
        Object.entries(allowedPatch).forEach(([key, value]) => {
          if (value !== undefined) Object.assign(student, { [key]: value });
        });
        validateStudent(student);
        break;
      }
      case "setStudentStatus": {
        const student = ownedStudent(store, teacherId, action.studentId);
        student.status = action.status;
        break;
      }
      case "createLesson": {
        const input = action.lesson;
        if (!input.participantIds.length) {
          validation(
            "participantIds",
            "Wybierz co najmniej jednego aktywnego ucznia.",
          );
        }
        const uniqueIds = [...new Set(input.participantIds)];
        const participants = uniqueIds.map((id) =>
          ownedStudent(store, teacherId, id),
        );
        if (participants.some((student) => student.status !== "active")) {
          validation(
            "participantIds",
            "Archiwalny uczeń nie może zostać dodany do nowej lekcji.",
          );
        }
        if (!input.occurrences.length || input.occurrences.length > 52) {
          validation("occurrences", "Dodaj od 1 do 52 terminów.");
        }
        if (input.priceAmount !== null && input.priceAmount < 0) {
          validation("priceAmount", "Cena nie może być ujemna.");
        }
        if (
          input.format === "online" &&
          !isValidMeetingLocation(input.location)
        ) {
          validation(
            "location",
            "Dodaj poprawny link lub sposób połączenia online.",
          );
        }
        input.occurrences.forEach((occurrence) =>
          validateOccurrence(occurrence),
        );
        const conflicts = input.occurrences.flatMap((occurrence) =>
          findConflicts(
            store,
            teacherId,
            occurrence.startsAt,
            occurrence.durationMinutes,
          ),
        );
        const unavailable = input.occurrences.flatMap((occurrence) =>
          findAvailabilityConflicts(
            store,
            teacherId,
            occurrence.startsAt,
            occurrence.durationMinutes,
          ),
        );
        if (conflicts.length || unavailable.length) {
          throw new ApiFailure(409, {
            code: conflicts.length
              ? "LESSON_CONFLICT"
              : "AVAILABILITY_CONFLICT",
            message: conflicts.length
              ? "Wybrany termin jest już zajęty. Wybierz inny termin lub potwierdź lekcję grupową."
              : "Wybrany termin pokrywa się z czasem niedostępnym.",
            details: {
              conflicts: conflicts.map((lesson) => ({
                lessonId: lesson.id,
                startsAt: lesson.startsAt,
                participantIds: lesson.participantIds,
              })),
              unavailable: unavailable.map((rule) => ({
                id: rule.id,
                label: rule.label,
              })),
            },
          });
        }

        const seriesId = input.mode === "recurring" ? randomUUID() : undefined;
        const createdIds = input.occurrences.map((occurrence) => {
          const planItems: PlanItem[] = input.plan
            .filter((text) => text.trim())
            .map((text, position) => ({
              id: randomUUID(),
              position,
              text: text.trim(),
            }));
          const lesson: LessonRecord = {
            id: randomUUID(),
            teacherId,
            participantIds: uniqueIds,
            startsAt: occurrence.startsAt,
            durationMinutes: occurrence.durationMinutes,
            format: input.format,
            location: input.location.trim(),
            price:
              input.priceAmount === null
                ? null
                : { amount: Math.round(input.priceAmount), currency: "PLN" },
            mode: input.mode,
            seriesId,
            status: "scheduled",
            syncStatus:
              teacher.google.status === "connected" ? "pending" : "disabled",
            topic: input.topic.trim(),
            planItems,
            homework: "",
            generalNotes: "",
            participants: uniqueIds.map((studentId) =>
              emptyParticipant(studentId, planItems),
            ),
            createdAt: new Date().toISOString(),
          };
          store.lessons.push(lesson);
          return lesson.id;
        });
        result = { id: createdIds[0], ids: createdIds };
        break;
      }
      case "mergeLesson": {
        const lesson = ownedLesson(
          store,
          teacherId,
          action.conflictingLessonId,
        );
        if (lesson.status === "cancelled" || lesson.status === "completed") {
          throw new ApiFailure(409, {
            code: "LESSON_NOT_MERGEABLE",
            message: "Tego terminu nie można już zmienić w lekcję grupową.",
          });
        }
        const incoming = [...new Set(action.participantIds)].filter(
          (studentId) => !lesson.participantIds.includes(studentId),
        );
        incoming.forEach((studentId) => {
          const student = ownedStudent(store, teacherId, studentId);
          if (student.status !== "active") {
            validation(
              "participantIds",
              "Archiwalny uczeń nie może dołączyć do lekcji.",
            );
          }
          lesson.participantIds.push(studentId);
          lesson.participants.push(
            emptyParticipant(studentId, lesson.planItems),
          );
        });
        lesson.syncStatus =
          teacher.google.status === "connected" ? "pending" : "disabled";
        result = { id: lesson.id };
        break;
      }
      case "saveLesson": {
        const lesson = ownedLesson(store, teacherId, action.lessonId);
        const participantIds = new Set(lesson.participantIds);
        action.participants.forEach((participant) => {
          if (!participantIds.has(participant.studentId)) unauthorized();
          participant.results.forEach((item) => {
            if (
              item.score !== undefined &&
              (!Number.isInteger(item.score) ||
                item.score < 1 ||
                item.score > 10)
            ) {
              validation(
                "score",
                "Ocena musi być liczbą całkowitą od 1 do 10.",
              );
            }
          });
        });
        lesson.topic = action.topic.trim();
        lesson.planItems = action.planItems
          .filter((item) => item.text.trim())
          .map((item, position) => ({
            ...item,
            text: item.text.trim(),
            position,
          }));
        lesson.homework = action.homework.trim();
        lesson.generalNotes = action.generalNotes.trim();
        lesson.participants = action.participants;
        if (action.complete) lesson.status = "completed";
        lesson.syncStatus =
          teacher.google.status === "connected" ? "pending" : "disabled";
        break;
      }
      case "setPayment": {
        const lesson = ownedLesson(store, teacherId, action.lessonId);
        const participant = lesson.participants.find(
          (candidate) => candidate.studentId === action.studentId,
        );
        if (!participant) unauthorized();
        participant.paymentStatus = action.status;
        break;
      }
      case "cancelLesson": {
        const lesson = ownedLesson(store, teacherId, action.lessonId);
        const targets =
          action.scope === "future" && lesson.seriesId
            ? store.lessons.filter(
                (candidate) =>
                  candidate.teacherId === teacherId &&
                  candidate.seriesId === lesson.seriesId &&
                  candidate.startsAt >= lesson.startsAt,
              )
            : [lesson];
        targets.forEach((target) => {
          target.status = "cancelled";
          target.syncStatus =
            teacher.google.status === "connected" ? "pending" : "disabled";
        });
        break;
      }
      case "rescheduleLesson": {
        const lesson = ownedLesson(store, teacherId, action.lessonId);
        validateOccurrence({
          startsAt: action.startsAt,
          durationMinutes: lesson.durationMinutes,
        });
        const delta =
          new Date(action.startsAt).getTime() -
          new Date(lesson.startsAt).getTime();
        const targets =
          action.scope === "future" && lesson.seriesId
            ? store.lessons.filter(
                (candidate) =>
                  candidate.teacherId === teacherId &&
                  candidate.seriesId === lesson.seriesId &&
                  candidate.startsAt >= lesson.startsAt,
              )
            : [lesson];
        const targetIds = new Set(targets.map((target) => target.id));
        const proposed = targets.map((target) => ({
          target,
          startsAt: new Date(
            new Date(target.startsAt).getTime() + delta,
          ).toISOString(),
        }));
        const conflicts = proposed.flatMap(({ target, startsAt }) =>
          findConflicts(
            store,
            teacherId,
            startsAt,
            target.durationMinutes,
            target.id,
          ).filter((candidate) => !targetIds.has(candidate.id)),
        );
        if (conflicts.length) {
          throw new ApiFailure(409, {
            code: "LESSON_CONFLICT",
            message: "Nowy termin jest już zajęty. Wybierz inny czas.",
            details: {
              conflicts: conflicts.map((item) => ({ lessonId: item.id })),
            },
          });
        }
        proposed.forEach(({ target, startsAt }) => {
          target.startsAt = startsAt;
          target.syncStatus =
            teacher.google.status === "connected" ? "pending" : "disabled";
        });
        break;
      }
      case "retrySync": {
        const lesson = ownedLesson(store, teacherId, action.lessonId);
        if (teacher.google.status !== "connected") {
          throw new ApiFailure(503, {
            code: "GOOGLE_NOT_CONNECTED",
            message:
              "Nie udało się połączyć z Google Calendar. Skonfiguruj integrację i spróbuj ponownie.",
            retryable: false,
          });
        }
        lesson.syncStatus = "pending";
        lesson.syncMessage = undefined;
        break;
      }
      case "disableSync": {
        const lesson = ownedLesson(store, teacherId, action.lessonId);
        lesson.syncStatus = "disabled";
        lesson.syncMessage = undefined;
        break;
      }
      case "updateProfile": {
        if (!action.name.trim()) validation("name", "Podaj imię i nazwisko.");
        try {
          new Intl.DateTimeFormat("pl-PL", {
            timeZone: action.timezone,
          }).format();
        } catch {
          validation("timezone", "Wybierz poprawną strefę czasową.");
        }
        teacher.name = action.name.trim();
        teacher.timezone = action.timezone;
        break;
      }
      case "createAvailability": {
        const start = new Date(action.rule.start);
        const end = new Date(action.rule.end);
        if (
          Number.isNaN(start.getTime()) ||
          Number.isNaN(end.getTime()) ||
          start >= end
        ) {
          validation(
            "availability",
            "Godzina zakończenia musi być późniejsza niż rozpoczęcia.",
          );
        }
        store.availability.push({
          ...action.rule,
          id: randomUUID(),
          teacherId,
        });
        break;
      }
      case "deleteAvailability": {
        const owned = store.availability.some(
          (rule) => rule.id === action.ruleId && rule.teacherId === teacherId,
        );
        if (!owned) unauthorized();
        store.availability = store.availability.filter(
          (rule) => rule.id !== action.ruleId,
        );
        break;
      }
    }
    return { data: appDataFromStore(store, teacherId), result };
  });
}

function validateStudent(
  student: Omit<Student, "id" | "createdAt"> | Student,
): void {
  const errors: Record<string, string> = {};
  if (!student.name.trim()) errors.name = "Podaj imię i nazwisko ucznia.";
  if (
    student.defaultDurationMinutes < 15 ||
    student.defaultDurationMinutes > 360
  ) {
    errors.defaultDurationMinutes =
      "Czas lekcji musi mieścić się między 15 a 360 minut.";
  }
  if (student.defaultPrice && student.defaultPrice.amount < 0) {
    errors.defaultPrice = "Cena nie może być ujemna.";
  }
  if (
    student.defaultFormat === "online" &&
    !isValidMeetingLocation(student.defaultLocation)
  ) {
    errors.defaultLocation =
      "Dodaj poprawny link lub sposób połączenia online.";
  }
  if (Object.keys(errors).length) {
    throw new ApiFailure(422, {
      code: "VALIDATION_ERROR",
      message: "Popraw oznaczone pola.",
      fieldErrors: errors,
    });
  }
}

function validateOccurrence(occurrence: {
  startsAt: string;
  durationMinutes: number;
}): void {
  if (Number.isNaN(new Date(occurrence.startsAt).getTime())) {
    validation("occurrences", "Wybierz poprawną datę i godzinę.");
  }
  if (occurrence.durationMinutes < 15 || occurrence.durationMinutes > 360) {
    validation(
      "durationMinutes",
      "Czas lekcji musi mieścić się między 15 a 360 minut.",
    );
  }
}

function findConflicts(
  store: StoreShape,
  teacherId: string,
  startsAt: string,
  durationMinutes: number,
  excludedId?: string,
): LessonRecord[] {
  const start = new Date(startsAt).getTime();
  const end = start + durationMinutes * 60_000;
  return store.lessons.filter((lesson) => {
    if (
      lesson.teacherId !== teacherId ||
      lesson.id === excludedId ||
      lesson.status === "cancelled"
    ) {
      return false;
    }
    const lessonStart = new Date(lesson.startsAt).getTime();
    const lessonEnd = lessonStart + lesson.durationMinutes * 60_000;
    return start < lessonEnd && end > lessonStart;
  });
}

function findAvailabilityConflicts(
  store: StoreShape,
  teacherId: string,
  startsAt: string,
  durationMinutes: number,
) {
  const start = new Date(startsAt).getTime();
  const end = start + durationMinutes * 60_000;
  const timezone =
    store.teachers.find((teacher) => teacher.id === teacherId)?.timezone ??
    "Europe/Warsaw";
  return store.availability.filter((rule) => {
    if (rule.teacherId !== teacherId) return false;
    if (rule.kind === "recurring") {
      const weekday = Number(formatInTimeZone(startsAt, timezone, "i"));
      if (weekday !== rule.weekday) return false;
      const occurrenceStart =
        Number(formatInTimeZone(startsAt, timezone, "H")) * 60 +
        Number(formatInTimeZone(startsAt, timezone, "m"));
      const occurrenceEnd = occurrenceStart + durationMinutes;
      const ruleStartMinutes =
        Number(formatInTimeZone(rule.start, timezone, "H")) * 60 +
        Number(formatInTimeZone(rule.start, timezone, "m"));
      const ruleEndMinutes =
        Number(formatInTimeZone(rule.end, timezone, "H")) * 60 +
        Number(formatInTimeZone(rule.end, timezone, "m"));
      return (
        occurrenceStart < ruleEndMinutes && occurrenceEnd > ruleStartMinutes
      );
    }
    const ruleStart = new Date(rule.start).getTime();
    const ruleEnd = new Date(rule.end).getTime();
    return start < ruleEnd && end > ruleStart;
  });
}

function emptyParticipant(
  studentId: string,
  planItems: PlanItem[],
): LessonParticipant {
  return {
    studentId,
    attendanceStatus: "unknown",
    paymentStatus: "unpaid",
    results: planItems.map((item) => ({
      planItemId: item.id,
      completed: false,
      note: "",
    })),
  };
}

function ownedStudent(store: StoreShape, teacherId: string, studentId: string) {
  const student = store.students.find(
    (candidate) =>
      candidate.id === studentId && candidate.teacherId === teacherId,
  );
  if (!student) unauthorized();
  return student;
}

function ownedLesson(store: StoreShape, teacherId: string, lessonId: string) {
  const lesson = store.lessons.find(
    (candidate) =>
      candidate.id === lessonId && candidate.teacherId === teacherId,
  );
  if (!lesson) unauthorized();
  return lesson;
}

function isValidMeetingLocation(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (!trimmed.includes("://")) return trimmed.length >= 3;
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:";
  } catch {
    return false;
  }
}

function validation(field: string, message: string): never {
  throw new ApiFailure(422, {
    code: "VALIDATION_ERROR",
    message: "Popraw oznaczone pola.",
    fieldErrors: { [field]: message },
  });
}

function unauthorized(): never {
  throw new ApiFailure(404, {
    code: "NOT_FOUND",
    message: "Nie znaleziono wskazanego elementu.",
  });
}
