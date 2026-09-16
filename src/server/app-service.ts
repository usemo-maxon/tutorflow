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
import {
  cancelLesson as transitionToCancelled,
  completeLesson as transitionToCompleted,
  DomainRuleError,
  markAttendance,
} from "./domain/lesson";
import {
  isPeopleAction,
  isSchedulingAction,
  localAllowed,
  mutatePeopleDomain,
  mutateSchedulingDomain,
  mutateStore,
} from "./repository";
import { findProbableDuplicateIds, studentDisplayName } from "./domain/student";
import { appDataFromStore, type LessonRecord, type StoreShape } from "./store";

export async function performAction(
  teacherId: string,
  action: AppAction,
): Promise<MutationResponse> {
  if (!localAllowed() && isPeopleAction(action)) {
    return mutatePeopleDomain(teacherId, action);
  }
  if (!localAllowed() && isSchedulingAction(action)) {
    return mutateSchedulingDomain(teacherId, action);
  }
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
        const displayName = studentDisplayName(action.student);
        const duplicateIds = findProbableDuplicateIds(
          action.student,
          store.students
            .filter((candidate) => candidate.teacherId === teacherId)
            .map((candidate) => ({
              id: candidate.id,
              displayName: candidate.displayName || candidate.name,
              email: candidate.email,
              phone: candidate.phone,
            })),
        );
        if (duplicateIds.length && !action.student.allowDuplicate) {
          throw new ApiFailure(409, {
            code: "POSSIBLE_DUPLICATE",
            message: "Uczeń o podobnych danych już istnieje.",
            details: { studentIds: duplicateIds },
          });
        }
        const student = {
          id: randomUUID(),
          teacherId,
          firstName: action.student.firstName.trim(),
          lastName: action.student.lastName.trim(),
          displayName,
          name: displayName,
          email: action.student.email.trim(),
          phone: action.student.phone.trim(),
          contact: action.student.email.trim() || action.student.phone.trim(),
          subject: action.student.subject.trim(),
          level: action.student.level.trim(),
          goal: action.student.goal?.trim() ?? "",
          notes: action.student.notes?.trim() ?? "",
          status: "active" as const,
          defaultDurationMinutes: action.student.defaultDurationMinutes ?? 60,
          defaultFormat: action.student.defaultFormat ?? "online",
          defaultLocation: action.student.defaultLocation?.trim() ?? "",
          defaultPrice: action.student.defaultPrice ?? null,
          timezone: action.student.timezone,
          groupIds: [],
          packageRemainingLessons: null,
          balanceDue: { amount: 0, currency: "PLN" as const },
          createdAt: new Date().toISOString(),
        };
        validateStudent(student);
        store.students.push(student);
        result = { id: student.id };
        break;
      }
      case "updateStudent": {
        const student = ownedStudent(store, teacherId, action.studentId);
        const displayName = studentDisplayName(action.patch);
        const allowedPatch: Partial<Student> = {
          firstName: action.patch.firstName,
          lastName: action.patch.lastName,
          displayName,
          name: displayName,
          email: action.patch.email,
          phone: action.patch.phone,
          contact: action.patch.email || action.patch.phone,
          subject: action.patch.subject,
          level: action.patch.level,
          goal: action.patch.goal,
          notes: action.patch.notes,
          defaultDurationMinutes: action.patch.defaultDurationMinutes,
          defaultFormat: action.patch.defaultFormat,
          defaultLocation: action.patch.defaultLocation,
          defaultPrice: action.patch.defaultPrice,
          timezone: action.patch.timezone,
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
      case "createStudentContact": {
        ownedStudent(store, teacherId, action.studentId);
        store.contacts ??= [];
        if (action.contact.isPrimary) {
          store.contacts
            .filter((item) => item.studentId === action.studentId)
            .forEach((item) => (item.isPrimary = false));
        }
        if (action.contact.isBillingContact) {
          store.contacts
            .filter((item) => item.studentId === action.studentId)
            .forEach((item) => (item.isBillingContact = false));
        }
        const contactId =
          store.contacts.find(
            (item) =>
              item.teacherId === teacherId &&
              ((action.contact.email &&
                item.email.toLocaleLowerCase("pl") ===
                  action.contact.email.toLocaleLowerCase("pl")) ||
                (action.contact.phone && item.phone === action.contact.phone)),
          )?.contactId ?? randomUUID();
        const contact = {
          ...action.contact,
          id: randomUUID(),
          contactId,
          studentId: action.studentId,
          teacherId,
          displayName: [
            action.contact.firstName.trim(),
            action.contact.lastName.trim(),
          ]
            .filter(Boolean)
            .join(" "),
          createdAt: new Date().toISOString(),
        };
        store.contacts.push(contact);
        result = { id: contactId };
        break;
      }
      case "updateStudentContact": {
        store.contacts ??= [];
        const relation = store.contacts.find(
          (item) =>
            item.id === action.relationId && item.teacherId === teacherId,
        );
        if (!relation) unauthorized();
        if (action.contact.isPrimary) {
          store.contacts
            .filter(
              (item) =>
                item.studentId === relation.studentId &&
                item.id !== relation.id,
            )
            .forEach((item) => (item.isPrimary = false));
        }
        if (action.contact.isBillingContact) {
          store.contacts
            .filter(
              (item) =>
                item.studentId === relation.studentId &&
                item.id !== relation.id,
            )
            .forEach((item) => (item.isBillingContact = false));
        }
        const displayName = [
          action.contact.firstName.trim(),
          action.contact.lastName.trim(),
        ]
          .filter(Boolean)
          .join(" ");
        store.contacts
          .filter((item) => item.contactId === relation.contactId)
          .forEach((item) =>
            Object.assign(item, {
              firstName: action.contact.firstName,
              lastName: action.contact.lastName,
              displayName,
              email: action.contact.email,
              phone: action.contact.phone,
              type: action.contact.type,
            }),
          );
        Object.assign(relation, {
          relationship: action.contact.relationship,
          isPrimary: action.contact.isPrimary,
          isBillingContact: action.contact.isBillingContact,
        });
        break;
      }
      case "removeStudentContact": {
        store.contacts ??= [];
        const before = store.contacts.length;
        store.contacts = store.contacts.filter(
          (item) =>
            item.teacherId !== teacherId || item.id !== action.relationId,
        );
        if (store.contacts.length === before) unauthorized();
        break;
      }
      case "createGroup": {
        store.groups ??= [];
        const group = {
          ...action.group,
          id: randomUUID(),
          teacherId,
          status: "active" as const,
          members: [],
          createdAt: new Date().toISOString(),
        };
        store.groups.push(group);
        result = { id: group.id };
        break;
      }
      case "updateGroup": {
        const group = ownedGroup(store, teacherId, action.groupId);
        Object.assign(group, action.patch);
        break;
      }
      case "setGroupStatus": {
        const group = ownedGroup(store, teacherId, action.groupId);
        group.status = action.status;
        break;
      }
      case "addGroupMembers": {
        const group = ownedGroup(store, teacherId, action.groupId);
        const ids = [...new Set(action.studentIds)];
        ids.forEach((studentId) => {
          const student = ownedStudent(store, teacherId, studentId);
          if (student.status !== "active") {
            validation(
              "studentIds",
              "Archiwalnego ucznia nie można dodać do grupy.",
            );
          }
          const existing = group.members.find(
            (member) => member.studentId === studentId,
          );
          if (existing) {
            existing.status = "active";
            existing.leftAt = undefined;
          } else {
            group.members.push({
              id: randomUUID(),
              studentId,
              status: "active",
              joinedAt: new Date().toISOString(),
            });
          }
          student.groupIds = [
            ...new Set([...(student.groupIds ?? []), group.id]),
          ];
        });
        result = { ids };
        break;
      }
      case "removeGroupMember": {
        const group = ownedGroup(store, teacherId, action.groupId);
        const member = group.members.find(
          (candidate) =>
            candidate.studentId === action.studentId &&
            candidate.status === "active",
        );
        if (!member) unauthorized();
        member.status = "suspended";
        member.leftAt = new Date().toISOString();
        const student = ownedStudent(store, teacherId, action.studentId);
        student.groupIds = (student.groupIds ?? []).filter(
          (groupId) => groupId !== group.id,
        );
        break;
      }
      case "createLesson": {
        const input = action.lesson;
        const group =
          input.target?.type === "group"
            ? ownedGroup(store, teacherId, input.target.id)
            : undefined;
        const requestedParticipantIds = group
          ? group.members
              .filter((member) => member.status === "active")
              .map((member) => member.studentId)
          : input.target?.type === "student"
            ? [input.target.id]
            : (input.participantIds ?? []);
        if (!requestedParticipantIds.length) {
          validation(
            "participantIds",
            "Wybierz co najmniej jednego aktywnego ucznia.",
          );
        }
        const uniqueIds = [...new Set(requestedParticipantIds)];
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
        const blockConflict = input.occurrences.some((occurrence) =>
          hasCalendarBlockConflict(
            store,
            teacherId,
            occurrence.startsAt,
            occurrence.durationMinutes,
          ),
        );
        if (
          conflicts.length ||
          blockConflict ||
          (unavailable.length && !input.allowOutsideAvailability)
        ) {
          throw new ApiFailure(409, {
            code:
              conflicts.length || blockConflict
                ? "LESSON_CONFLICT"
                : "OUTSIDE_AVAILABILITY",
            message:
              conflicts.length || blockConflict
                ? "Wybrany termin jest już zajęty. Wybierz inny termin lub potwierdź lekcję grupową."
                : "Ten termin jest poza Twoją regularną dostępnością.",
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
            groupId: group?.id,
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
            recurrenceOriginalStartsAt: seriesId
              ? occurrence.startsAt
              : undefined,
            subject:
              input.subject?.trim() ||
              group?.subject ||
              participants[0]?.subject ||
              "",
            timezone: input.recurrence?.timezone ?? teacher.timezone,
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
            updatedAt: new Date().toISOString(),
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
          markAttendance(
            lesson.participantIds,
            participant.studentId,
            participant.attendanceStatus,
          );
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
        if (action.complete) {
          try {
            lesson.status = transitionToCompleted(lesson.status);
          } catch (error) {
            domainConflict(error);
          }
        }
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
          action.scope !== "single" && lesson.seriesId
            ? store.lessons.filter(
                (candidate) =>
                  candidate.teacherId === teacherId &&
                  candidate.seriesId === lesson.seriesId &&
                  candidate.status !== "completed" &&
                  (action.scope === "series" ||
                    candidate.startsAt >= lesson.startsAt),
              )
            : [lesson];
        targets.forEach((target) => {
          try {
            target.status = transitionToCancelled(target.status);
          } catch (error) {
            domainConflict(error);
          }
          target.syncStatus =
            teacher.google.status === "connected" ? "pending" : "disabled";
        });
        break;
      }
      case "rescheduleLesson": {
        const lesson = ownedLesson(store, teacherId, action.lessonId);
        validateOccurrence({
          startsAt: action.startsAt,
          durationMinutes: action.durationMinutes ?? lesson.durationMinutes,
        });
        const delta =
          new Date(action.startsAt).getTime() -
          new Date(lesson.startsAt).getTime();
        const targets =
          action.scope !== "single" && lesson.seriesId
            ? store.lessons.filter(
                (candidate) =>
                  candidate.teacherId === teacherId &&
                  candidate.seriesId === lesson.seriesId &&
                  candidate.status !== "completed" &&
                  (action.scope === "series" ||
                    candidate.startsAt >= lesson.startsAt),
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
            action.durationMinutes ?? target.durationMinutes,
            target.id,
          ).filter((candidate) => !targetIds.has(candidate.id)),
        );
        const blockConflict = proposed.some(({ target, startsAt }) =>
          hasCalendarBlockConflict(
            store,
            teacherId,
            startsAt,
            action.durationMinutes ?? target.durationMinutes,
          ),
        );
        if (conflicts.length || blockConflict) {
          throw new ApiFailure(409, {
            code: "LESSON_CONFLICT",
            message: "Nowy termin jest już zajęty. Wybierz inny czas.",
            details: {
              conflicts: conflicts.map((item) => ({ lessonId: item.id })),
            },
          });
        }
        const outsideAvailability = proposed.some(
          ({ target, startsAt }) =>
            findAvailabilityConflicts(
              store,
              teacherId,
              startsAt,
              action.durationMinutes ?? target.durationMinutes,
            ).length > 0,
        );
        if (outsideAvailability && !action.allowOutsideAvailability) {
          throw new ApiFailure(409, {
            code: "OUTSIDE_AVAILABILITY",
            message: "Ten termin jest poza Twoją regularną dostępnością.",
          });
        }
        proposed.forEach(({ target, startsAt }) => {
          target.startsAt = startsAt;
          target.durationMinutes =
            action.durationMinutes ?? target.durationMinutes;
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
      case "createAvailabilityException": {
        store.availabilityExceptions ??= [];
        const item = {
          ...action.exception,
          id: randomUUID(),
          teacherId,
        };
        store.availabilityExceptions.push(item);
        result = { id: item.id };
        break;
      }
      case "deleteAvailabilityException": {
        store.availabilityExceptions ??= [];
        const before = store.availabilityExceptions.length;
        store.availabilityExceptions = store.availabilityExceptions.filter(
          (item) =>
            item.teacherId !== teacherId || item.id !== action.exceptionId,
        );
        if (store.availabilityExceptions.length === before) unauthorized();
        break;
      }
      case "createCalendarBlock": {
        store.calendarBlocks ??= [];
        const start = new Date(action.block.startsAt);
        const end = new Date(action.block.endsAt);
        if (!(start < end))
          validation(
            "endsAt",
            "Zakończenie musi być późniejsze niż rozpoczęcie.",
          );
        const blockDuration = Math.round(
          (end.getTime() - start.getTime()) / 60_000,
        );
        if (
          findConflicts(store, teacherId, action.block.startsAt, blockDuration)
            .length ||
          hasCalendarBlockConflict(
            store,
            teacherId,
            action.block.startsAt,
            blockDuration,
          )
        ) {
          throw new ApiFailure(409, {
            code: "LESSON_CONFLICT",
            message: "Ten termin koliduje z lekcją lub inną blokadą.",
          });
        }
        const now = new Date().toISOString();
        const block = {
          ...action.block,
          id: randomUUID(),
          teacherId,
          createdAt: now,
          updatedAt: now,
        };
        store.calendarBlocks.push(block);
        result = { id: block.id };
        break;
      }
      case "updateCalendarBlock": {
        store.calendarBlocks ??= [];
        const block = store.calendarBlocks.find(
          (item) => item.id === action.blockId && item.teacherId === teacherId,
        );
        if (!block) unauthorized();
        const start = new Date(action.block.startsAt);
        const end = new Date(action.block.endsAt);
        const blockDuration = Math.round(
          (end.getTime() - start.getTime()) / 60_000,
        );
        if (!(start < end))
          validation(
            "endsAt",
            "Zakończenie musi być późniejsze niż rozpoczęcie.",
          );
        if (
          findConflicts(store, teacherId, action.block.startsAt, blockDuration)
            .length ||
          hasCalendarBlockConflict(
            store,
            teacherId,
            action.block.startsAt,
            blockDuration,
            block.id,
          )
        ) {
          throw new ApiFailure(409, {
            code: "LESSON_CONFLICT",
            message: "Ten termin koliduje z lekcją lub inną blokadą.",
          });
        }
        Object.assign(block, action.block, {
          updatedAt: new Date().toISOString(),
        });
        break;
      }
      case "deleteCalendarBlock": {
        store.calendarBlocks ??= [];
        const before = store.calendarBlocks.length;
        store.calendarBlocks = store.calendarBlocks.filter(
          (item) => item.teacherId !== teacherId || item.id !== action.blockId,
        );
        if (store.calendarBlocks.length === before) unauthorized();
        break;
      }
      case "importStudentStats": {
        ownedStudent(store, teacherId, action.studentId);
        store.studentStatImports ??= [];
        if (!action.records.length || action.records.length > 1000) {
          validation("records", "Plik musi zawierać od 1 do 1000 wierszy.");
        }
        const importedAt = new Date().toISOString();
        const sourceFile =
          action.sourceFile.trim().slice(0, 180) || "import.csv";
        const records = action.records.map((record) => {
          const occurredAt = new Date(record.occurredAt);
          if (Number.isNaN(occurredAt.getTime())) {
            validation("records", "Każdy wiersz musi mieć poprawną datę.");
          }
          if (
            record.score !== undefined &&
            (!Number.isFinite(record.score) ||
              record.score < 0 ||
              record.score > 10)
          ) {
            validation("records", "Wynik musi mieścić się w skali 0–10.");
          }
          if (
            !Number.isFinite(record.durationMinutes) ||
            record.durationMinutes < 0 ||
            record.durationMinutes > 600
          ) {
            validation(
              "records",
              "Czas nauki musi mieścić się w zakresie 0–600 minut.",
            );
          }
          if (!["present", "absent"].includes(record.attendanceStatus)) {
            validation(
              "records",
              "Frekwencja musi mieć wartość present lub absent.",
            );
          }
          return {
            ...record,
            id: randomUUID(),
            teacherId,
            studentId: action.studentId,
            occurredAt: occurredAt.toISOString(),
            topic: record.topic.trim().slice(0, 180),
            skill: record.skill.trim().slice(0, 120),
            sourceFile,
            importedAt,
          };
        });
        store.studentStatImports.push(...records);
        result = { ids: records.map((record) => record.id) };
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
  if (!student.firstName.trim()) errors.firstName = "Podaj imię ucznia.";
  if (
    student.defaultDurationMinutes < 15 ||
    student.defaultDurationMinutes > 480
  ) {
    errors.defaultDurationMinutes =
      "Czas lekcji musi mieścić się między 15 a 480 minut.";
  }
  if (student.defaultPrice && student.defaultPrice.amount < 0) {
    errors.defaultPrice = "Cena nie może być ujemna.";
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

function hasCalendarBlockConflict(
  store: StoreShape,
  teacherId: string,
  startsAt: string,
  durationMinutes: number,
  excludedId?: string,
): boolean {
  const start = new Date(startsAt).getTime();
  const end = start + durationMinutes * 60_000;
  return (store.calendarBlocks ?? []).some((block) => {
    if (block.teacherId !== teacherId || block.id === excludedId) return false;
    const blockStart = new Date(block.startsAt).getTime();
    const blockEnd = new Date(block.endsAt).getTime();
    return start < blockEnd && end > blockStart;
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
  const date = formatInTimeZone(startsAt, timezone, "yyyy-MM-dd");
  const weekday = Number(formatInTimeZone(startsAt, timezone, "i"));
  const occurrenceStart =
    Number(formatInTimeZone(startsAt, timezone, "H")) * 60 +
    Number(formatInTimeZone(startsAt, timezone, "m"));
  const occurrenceEnd = occurrenceStart + durationMinutes;
  const minute = (value?: string) => {
    const [hours = 0, minutes = 0] = (value ?? "00:00").split(":").map(Number);
    return hours * 60 + minutes;
  };
  const exceptions = (store.availabilityExceptions ?? []).filter(
    (item) => item.teacherId === teacherId && item.date === date,
  );
  const unavailableException = exceptions.find(
    (item) =>
      item.kind === "unavailable" &&
      (!item.startTime ||
        (occurrenceStart < minute(item.endTime) &&
          occurrenceEnd > minute(item.startTime))),
  );
  if (unavailableException) {
    return [
      {
        id: unavailableException.id,
        label: unavailableException.reason || "Niedostępny",
      },
    ];
  }
  const availableExceptions = exceptions.filter(
    (item) => item.kind === "available",
  );
  if (
    availableExceptions.length &&
    !availableExceptions.some(
      (item) =>
        !item.startTime ||
        (occurrenceStart >= minute(item.startTime) &&
          occurrenceEnd <= minute(item.endTime)),
    )
  ) {
    return [
      { id: availableExceptions[0].id, label: "Poza wyjątkową dostępnością" },
    ];
  }
  const rules = store.availability.filter(
    (rule) => rule.teacherId === teacherId,
  );
  const unavailable = rules.filter((rule) => {
    if (rule.isAvailable) return false;
    if (rule.kind === "single") {
      return (
        start < new Date(rule.end).getTime() &&
        end > new Date(rule.start).getTime()
      );
    }
    if (weekday !== rule.weekday) return false;
    if (rule.allDay) return true;
    const ruleStart =
      Number(formatInTimeZone(rule.start, timezone, "H")) * 60 +
      Number(formatInTimeZone(rule.start, timezone, "m"));
    const ruleEnd =
      Number(formatInTimeZone(rule.end, timezone, "H")) * 60 +
      Number(formatInTimeZone(rule.end, timezone, "m"));
    return occurrenceStart < ruleEnd && occurrenceEnd > ruleStart;
  });
  if (unavailable.length) return unavailable;
  const weeklyAvailable = rules.filter(
    (rule) => rule.isAvailable && rule.kind === "recurring",
  );
  if (
    weeklyAvailable.length &&
    !weeklyAvailable.some((rule) => {
      if (weekday !== rule.weekday || rule.allDay) return false;
      const ruleStart =
        Number(formatInTimeZone(rule.start, timezone, "H")) * 60 +
        Number(formatInTimeZone(rule.start, timezone, "m"));
      const ruleEnd =
        Number(formatInTimeZone(rule.end, timezone, "H")) * 60 +
        Number(formatInTimeZone(rule.end, timezone, "m"));
      return occurrenceStart >= ruleStart && occurrenceEnd <= ruleEnd;
    })
  ) {
    return [{ id: "regular-hours", label: "Poza regularną dostępnością" }];
  }
  return [];
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

function ownedGroup(store: StoreShape, teacherId: string, groupId: string) {
  const group = (store.groups ?? []).find(
    (candidate) =>
      candidate.id === groupId && candidate.teacherId === teacherId,
  );
  if (!group) unauthorized();
  return group;
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

function domainConflict(error: unknown): never {
  if (error instanceof DomainRuleError) {
    throw new ApiFailure(409, {
      code: error.message,
      message: "Nie można wykonać tej zmiany dla aktualnego stanu lekcji.",
    });
  }
  throw error;
}
