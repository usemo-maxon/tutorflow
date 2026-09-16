"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { zodResolver } from "@hookform/resolvers/zod";
import { addDays, addHours, format, parseISO } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import {
  AlertTriangle,
  CalendarPlus,
  LoaderCircle,
  Plus,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { ClientApiError } from "@/lib/api-client";
import { copy } from "@/lib/copy";
import {
  lessonCountLabel,
  formatTime,
  localDateKey,
  localInputToUtc,
} from "@/lib/format";
import { useAppData, useAppMutation } from "@/hooks/use-app-data";
import { useSessionTeacher } from "./app-shell";
import { useAppUi, type LessonComposerPreset } from "./app-ui-context";

const occurrenceSchema = z.object({
  id: z.string(),
  date: z.string().min(1, "Wybierz datę."),
  time: z.string().min(1, "Wybierz godzinę."),
  durationMinutes: z.number().min(15).max(360),
});
const schema = z
  .object({
    targetKey: z.string().min(1, "Wybierz ucznia lub grupę."),
    mode: z.enum(["single", "multiple", "recurring"]),
    occurrences: z.array(occurrenceSchema).min(1),
    intervalWeeks: z.number().min(1).max(12),
    daysOfWeek: z.array(z.enum(["1", "2", "3", "4", "5", "6", "7"])).min(1),
    endDate: z.string(),
    count: z.number().min(2).max(52),
    format: z.enum(["online", "offline"]),
    location: z.string(),
    atTeacherPlace: z.boolean(),
    priceZloty: z.number().min(0),
    trial: z.boolean(),
    subject: z.string(),
    topic: z.string(),
    plan: z.string(),
  })
  .superRefine((values, context) => {
    if (!values.atTeacherPlace && values.location.trim().length < 3) {
      context.addIssue({
        code: "custom",
        path: ["location"],
        message: "Dodaj link lub adres spotkania.",
      });
    }
  });
type Values = z.infer<typeof schema>;

interface ConflictState {
  message: string;
  conflictingLessonId?: string;
  canMerge: boolean;
  canOverrideAvailability?: boolean;
}

export function LessonComposer() {
  const teacher = useSessionTeacher();
  const router = useRouter();
  const { data } = useAppData(teacher.id);
  const mutation = useAppMutation(teacher.id);
  const {
    lessonComposer,
    closeLessonComposer,
    restoreComposerFocus,
    openStudentComposer,
    showToast,
  } = useAppUi();
  const [pickerExpanded, setPickerExpanded] = useState(true);
  const [search, setSearch] = useState("");
  const [saveError, setSaveError] = useState("");
  const initialized = useRef<LessonComposerPreset | null>(null);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const previousTarget = useRef("");
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const {
    control,
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    getValues,
    getFieldState,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<Values>({
    resolver: (values, context, options) =>
      zodResolver(schema)(
        {
          ...values,
          occurrences:
            values.mode === "multiple"
              ? values.occurrences
              : values.occurrences.slice(0, 1),
        },
        context,
        options,
      ),
    defaultValues: getDefaults(
      teacher.timezone,
      lessonComposer ?? {},
      data?.students ?? [],
    ),
  });
  const occurrences = useFieldArray({
    control,
    name: "occurrences",
    keyName: "fieldKey",
  });
  const trial = useWatch({ control, name: "trial" });
  const formatValue = useWatch({ control, name: "format" });
  const atTeacherPlace = useWatch({ control, name: "atTeacherPlace" });
  const mode = useWatch({ control, name: "mode" });
  const targetKey = useWatch({ control, name: "targetKey" });
  const intervalWeeks = useWatch({ control, name: "intervalWeeks" });
  const daysOfWeek = useWatch({ control, name: "daysOfWeek" });
  const endDate = useWatch({ control, name: "endDate" });
  const count = useWatch({ control, name: "count" });
  const firstOccurrence = useWatch({ control, name: "occurrences.0" });
  const activeStudents =
    data?.students.filter((student) => student.status === "active") ?? [];
  const activeGroups =
    data?.groups.filter((group) => group.status === "active") ?? [];
  const selectedTargetName = targetKey
    ? targetKey.startsWith("group:")
      ? activeGroups.find((group) => group.id === targetKey.split(":")[1])?.name
      : activeStudents.find((student) => student.id === targetKey.split(":")[1])
          ?.name
    : "";

  useEffect(() => {
    if (!lessonComposer) {
      initialized.current = null;
      return;
    }
    if (initialized.current !== lessonComposer && data) {
      initialized.current = lessonComposer;
      previousTarget.current = lessonComposer.studentIds?.[0]
        ? `student:${lessonComposer.studentIds[0]}`
        : "";
      setSearch("");
      setPickerExpanded(!lessonComposer.studentIds?.length);
      setSaveError("");
      setConflict(null);
      reset(
        getDefaults(
          data?.teacher.timezone ?? teacher.timezone,
          lessonComposer,
          data?.students ?? [],
        ),
      );
    }
  }, [
    lessonComposer,
    data,
    reset,
    data?.students,
    data?.groups,
    data?.teacher.timezone,
    teacher.timezone,
  ]);

  useUnsavedChanges(Boolean(lessonComposer) && isDirty);
  useEffect(() => {
    if (!targetKey || targetKey === previousTarget.current) return;
    previousTarget.current = targetKey;
    const [type, id] = targetKey.split(":");
    const student =
      type === "student" ? data?.students.find((s) => s.id === id) : undefined;
    const group =
      type === "group"
        ? data?.groups.find((item) => item.id === id)
        : undefined;
    if (!student && !group) return;
    const defaults = {
      format: student?.defaultFormat ?? ("online" as const),
      location: student?.defaultLocation ?? "",
      atTeacherPlace:
        student?.defaultFormat === "offline" &&
        student.defaultLocation === "W domu / w biurze",
      priceZloty:
        ((student?.defaultPrice ?? group?.defaultPrice)?.amount ?? 0) / 100,
      trial: (student?.defaultPrice ?? group?.defaultPrice) === null,
      subject: student?.subject ?? group?.subject ?? "",
    };
    for (const key of [
      "format",
      "location",
      "atTeacherPlace",
      "priceZloty",
      "trial",
    ] as const) {
      if (!getFieldState(key).isDirty) setValue(key, defaults[key]);
    }
    if (
      !lessonComposer?.durationMinutes &&
      !getFieldState("occurrences.0.durationMinutes").isDirty
    )
      setValue(
        "occurrences.0.durationMinutes",
        (student ?? group)!.defaultDurationMinutes,
      );
    if (!getFieldState("subject").isDirty)
      setValue("subject", defaults.subject);
  }, [
    targetKey,
    data?.students,
    data?.groups,
    getFieldState,
    lessonComposer?.durationMinutes,
    setValue,
  ]);

  useEffect(() => {
    if (formatValue === "online" && atTeacherPlace) {
      setValue("atTeacherPlace", false, { shouldDirty: true });
    }
  }, [atTeacherPlace, formatValue, setValue]);

  const recurringDates = (() => {
    if (mode !== "recurring" || !firstOccurrence?.date || !firstOccurrence.time)
      return [];
    try {
      return buildRecurringDates({
        date: firstOccurrence.date,
        time: firstOccurrence.time,
        timezone: data?.teacher.timezone ?? teacher.timezone,
        intervalWeeks: Number(intervalWeeks) || 1,
        daysOfWeek: daysOfWeek.map(Number),
        count: Math.min(52, Math.max(2, Number(count) || 2)),
        endDate,
      });
    } catch {
      return [];
    }
  })();

  const lessonCount =
    mode === "recurring"
      ? recurringDates.length
      : mode === "multiple"
        ? occurrences.fields.length
        : 1;
  function requestClose() {
    if (isSubmitting || mutation.isPending) return;
    if (
      isDirty &&
      !window.confirm("Masz niezapisane zmiany. Zamknąć formularz?")
    )
      return;
    setConflict(null);
    closeLessonComposer();
  }

  async function save(values: Values, allowOutsideAvailability = false) {
    setConflict(null);
    setSaveError("");
    const timezone = data?.teacher.timezone ?? teacher.timezone;
    try {
      const inputOccurrences =
        values.mode === "recurring"
          ? buildRecurringDates({
              date: values.occurrences[0].date,
              time: values.occurrences[0].time,
              timezone,
              intervalWeeks: values.intervalWeeks,
              daysOfWeek: values.daysOfWeek.map(Number),
              count: values.count,
              endDate: values.endDate,
            }).map((startsAt) => ({
              startsAt,
              durationMinutes: values.occurrences[0].durationMinutes,
            }))
          : (values.mode === "single"
              ? values.occurrences.slice(0, 1)
              : values.occurrences
            ).map((item) => ({
              startsAt: localInputToUtc(item.date, item.time, timezone),
              durationMinutes: item.durationMinutes,
            }));
      const response = await mutation.mutateAsync({
        type: "createLesson",
        lesson: {
          target: {
            type: values.targetKey.startsWith("group:") ? "group" : "student",
            id: values.targetKey.split(":")[1],
          },
          mode: values.mode,
          occurrences: inputOccurrences,
          format: values.format,
          location:
            values.format === "offline" && values.atTeacherPlace
              ? "W domu / w biurze"
              : values.location.trim(),
          priceAmount: values.trial
            ? null
            : Math.round(values.priceZloty * 100),
          topic: values.topic,
          subject: values.subject,
          allowOutsideAvailability,
          requestId,
          plan: values.plan
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean),
          recurrence:
            values.mode === "recurring"
              ? {
                  frequency: values.intervalWeeks === 2 ? "biweekly" : "weekly",
                  count: values.count,
                  timezone,
                  startDate: values.occurrences[0].date,
                  startTime: values.occurrences[0].time,
                  intervalWeeks: values.intervalWeeks,
                  daysOfWeek: values.daysOfWeek.map(Number),
                  endDate: values.endDate || undefined,
                }
              : undefined,
        },
      });
      setRequestId(crypto.randomUUID());
      closeLessonComposer();
      showToast({
        message:
          lessonCount > 1
            ? copy.toasts.lessonsCreated
            : copy.toasts.lessonCreated,
      });
      if (response.result?.id) router.push(`/app/lekcje/${response.result.id}`);
    } catch (error) {
      if (
        error instanceof ClientApiError &&
        (error.data.code === "LESSON_CONFLICT" ||
          error.data.code === "AVAILABILITY_CONFLICT" ||
          error.data.code === "OUTSIDE_AVAILABILITY")
      ) {
        const details = error.data.details as
          { conflicts?: { lessonId: string }[] } | undefined;
        setConflict({
          message: error.data.message,
          conflictingLessonId: details?.conflicts?.[0]?.lessonId,
          canMerge:
            values.mode === "single" &&
            Boolean(details?.conflicts?.length === 1),
          canOverrideAvailability: error.data.code === "OUTSIDE_AVAILABILITY",
        });
      } else {
        const fieldErrors =
          error instanceof ClientApiError ? error.data.fieldErrors : undefined;
        Object.entries(fieldErrors ?? {}).forEach(([field, message]) =>
          setError(field as keyof Values, { message }),
        );
        setSaveError(
          error instanceof ClientApiError
            ? error.data.message
            : "Nie udało się zapisać lekcji. Dane pozostają w formularzu. Sprawdź połączenie i spróbuj ponownie.",
        );
      }
    }
  }
  const submit = handleSubmit((values) => save(values));

  function addOccurrence() {
    const previous = getValues("occurrences").at(-1);
    const nextDate = previous?.date
      ? format(addDays(parseISO(previous.date), 7), "yyyy-MM-dd")
      : formatInTimeZone(
          addDays(new Date(), 7),
          teacher.timezone,
          "yyyy-MM-dd",
        );
    occurrences.append({
      id: crypto.randomUUID(),
      date: nextDate,
      time: previous?.time ?? "14:00",
      durationMinutes: previous?.durationMinutes ?? 60,
    });
  }

  return (
    <Dialog.Root
      open={Boolean(lessonComposer)}
      onOpenChange={(open) => {
        if (!open) requestClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content dialog-content--sheet"
          aria-describedby="lesson-description"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            restoreComposerFocus("lesson");
          }}
        >
          <header className="dialog-header">
            <div>
              <Dialog.Title>Zaplanuj lekcję</Dialog.Title>
              <Dialog.Description id="lesson-description">
                Wybierz ucznia i termin. Domyślne dane możesz zmienić tylko dla
                tej lekcji.
              </Dialog.Description>
            </div>
            <button
              className="icon-button"
              onClick={requestClose}
              aria-label="Zamknij"
            >
              <X size={20} />
            </button>
          </header>
          <form
            id="lesson-form"
            className="dialog-scroll form-stack lesson-form"
            onSubmit={submit}
            noValidate
          >
            <fieldset className="field-group">
              <legend>Uczeń lub grupa</legend>
              {targetKey && (
                <div className="selected-participants">
                  <strong>{selectedTargetName}</strong>
                  <button
                    type="button"
                    className="text-link"
                    aria-expanded={pickerExpanded}
                    onClick={() => setPickerExpanded(!pickerExpanded)}
                  >
                    {pickerExpanded ? "Gotowe" : "Zmień"}
                  </button>
                </div>
              )}
              <div hidden={!pickerExpanded && Boolean(targetKey)}>
                <label className="field">
                  <span className="sr-only">Szukaj uczestnika</span>
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Szukaj ucznia lub grupy"
                  />
                </label>
                <div className="student-picker">
                  {activeStudents.some((student) =>
                    student.name
                      .toLocaleLowerCase("pl")
                      .includes(search.toLocaleLowerCase("pl")),
                  ) && (
                    <small className="picker-section-label">Uczniowie</small>
                  )}
                  {activeStudents
                    .filter((s) =>
                      s.name
                        .toLocaleLowerCase("pl")
                        .includes(search.toLocaleLowerCase("pl")),
                    )
                    .map((student) => (
                      <label key={student.id} className="student-option">
                        <input
                          type="radio"
                          value={`student:${student.id}`}
                          aria-describedby={
                            errors.targetKey ? "participants-error" : undefined
                          }
                          {...register("targetKey")}
                        />
                        <span
                          className="avatar avatar--small"
                          aria-hidden="true"
                        >
                          {student.name
                            .split(" ")
                            .map((part) => part[0])
                            .slice(0, 2)
                            .join("")}
                        </span>
                        <span>
                          <strong>{student.name}</strong>
                          <small>
                            {student.level} ·{" "}
                            {student.goal || "Bez określonego celu"}
                          </small>
                        </span>
                      </label>
                    ))}
                  {activeGroups.some((group) =>
                    group.name
                      .toLocaleLowerCase("pl")
                      .includes(search.toLocaleLowerCase("pl")),
                  ) && <small className="picker-section-label">Grupy</small>}
                  {activeGroups
                    .filter((group) =>
                      group.name
                        .toLocaleLowerCase("pl")
                        .includes(search.toLocaleLowerCase("pl")),
                    )
                    .map((group) => (
                      <label key={group.id} className="student-option">
                        <input
                          type="radio"
                          value={`group:${group.id}`}
                          aria-describedby={
                            errors.targetKey ? "participants-error" : undefined
                          }
                          {...register("targetKey")}
                        />
                        <span
                          className="avatar avatar--small"
                          aria-hidden="true"
                        >
                          <Users size={15} />
                        </span>
                        <span>
                          <strong>{group.name}</strong>
                          <small>
                            {group.subject || "Grupa"} ·{" "}
                            {
                              group.members.filter(
                                (member) => member.status === "active",
                              ).length
                            }{" "}
                            uczniów
                          </small>
                        </span>
                      </label>
                    ))}
                </div>
              </div>
              {errors.targetKey && (
                <small id="participants-error" className="field-error">
                  {errors.targetKey.message}
                </small>
              )}
              {!activeStudents.length && !activeGroups.length && (
                <div className="inline-empty inline-empty--action">
                  <span>Najpierw dodaj aktywnego ucznia.</span>
                  <button
                    type="button"
                    className="button button--secondary"
                    onClick={() => {
                      closeLessonComposer();
                      openStudentComposer();
                    }}
                  >
                    Dodaj pierwszego ucznia
                  </button>
                </div>
              )}
            </fieldset>
            <fieldset className="field-group">
              <legend>
                Termin{" "}
                <small>· {data?.teacher.timezone ?? teacher.timezone}</small>
              </legend>
              <div className="segmented-control" aria-label="Rodzaj planowania">
                {(
                  [
                    ["single", "Jednorazowo"],
                    ["multiple", "Kilka terminów"],
                    ["recurring", "Cyklicznie"],
                  ] as const
                ).map(([value, label]) => (
                  <label key={value}>
                    <input type="radio" value={value} {...register("mode")} />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
              {mode !== "recurring" ? (
                <div className="occurrence-list">
                  {(mode === "single"
                    ? occurrences.fields.slice(0, 1)
                    : occurrences.fields
                  ).map((field, index) => (
                    <div className="occurrence-row" key={field.fieldKey}>
                      <label className="field">
                        <span>Data</span>
                        <input
                          type="date"
                          aria-invalid={Boolean(
                            errors.occurrences?.[index]?.date,
                          )}
                          aria-describedby={
                            errors.occurrences?.[index]?.date
                              ? `date-error-${index}`
                              : undefined
                          }
                          {...register(`occurrences.${index}.date`)}
                        />
                        {errors.occurrences?.[index]?.date && (
                          <small
                            className="field-error"
                            id={`date-error-${index}`}
                          >
                            {errors.occurrences[index]?.date?.message}
                          </small>
                        )}
                      </label>
                      <label className="field">
                        <span>Godzina</span>
                        <input
                          type="time"
                          aria-invalid={Boolean(
                            errors.occurrences?.[index]?.time,
                          )}
                          aria-describedby={
                            errors.occurrences?.[index]?.time
                              ? `time-error-${index}`
                              : undefined
                          }
                          {...register(`occurrences.${index}.time`)}
                        />
                        {errors.occurrences?.[index]?.time && (
                          <small
                            className="field-error"
                            id={`time-error-${index}`}
                          >
                            {errors.occurrences[index]?.time?.message}
                          </small>
                        )}
                      </label>
                      <label className="field field--duration">
                        <span>Czas</span>
                        <select
                          {...register(`occurrences.${index}.durationMinutes`, {
                            valueAsNumber: true,
                          })}
                        >
                          <option value="15">15 min</option>
                          <option value="30">30 min</option>
                          <option value="45">45 min</option>
                          <option value="60">60 min</option>
                          <option value="90">90 min</option>
                          <option value="120">120 min</option>
                        </select>
                      </label>
                      {mode === "multiple" && occurrences.fields.length > 1 && (
                        <button
                          className="icon-button occurrence-remove"
                          type="button"
                          aria-label="Usuń termin"
                          onClick={() => occurrences.remove(index)}
                        >
                          <Trash2 size={17} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <div className="occurrence-row">
                    <label className="field">
                      <span>Pierwsza data</span>
                      <input
                        type="date"
                        aria-invalid={Boolean(errors.occurrences?.[0]?.date)}
                        aria-describedby={
                          errors.occurrences?.[0]?.date
                            ? "first-date-error"
                            : undefined
                        }
                        {...register("occurrences.0.date")}
                      />
                      {errors.occurrences?.[0]?.date && (
                        <small id="first-date-error" className="field-error">
                          {errors.occurrences[0].date.message}
                        </small>
                      )}
                    </label>
                    <label className="field">
                      <span>Godzina</span>
                      <input
                        type="time"
                        aria-invalid={Boolean(errors.occurrences?.[0]?.time)}
                        aria-describedby={
                          errors.occurrences?.[0]?.time
                            ? "first-time-error"
                            : undefined
                        }
                        {...register("occurrences.0.time")}
                      />
                      {errors.occurrences?.[0]?.time && (
                        <small id="first-time-error" className="field-error">
                          {errors.occurrences[0].time.message}
                        </small>
                      )}
                    </label>
                    <label className="field">
                      <span>Czas</span>
                      <select
                        {...register("occurrences.0.durationMinutes", {
                          valueAsNumber: true,
                        })}
                      >
                        <option value="15">15 min</option>
                        <option value="30">30 min</option>
                        <option value="45">45 min</option>
                        <option value="60">60 min</option>
                        <option value="90">90 min</option>
                        <option value="120">120 min</option>
                      </select>
                    </label>
                  </div>
                  <div className="form-row">
                    <label className="field">
                      <span>Powtarzanie</span>
                      <select
                        {...register("intervalWeeks", { valueAsNumber: true })}
                      >
                        <option value="1">Co tydzień</option>
                        <option value="2">Co 2 tygodnie</option>
                        <option value="3">Co 3 tygodnie</option>
                        <option value="4">Co 4 tygodnie</option>
                      </select>
                    </label>
                    <label className="field">
                      <span>Liczba lekcji</span>
                      <input
                        type="number"
                        min="2"
                        max="52"
                        aria-invalid={Boolean(errors.count)}
                        aria-describedby={
                          errors.count ? "series-count-error" : undefined
                        }
                        {...register("count", { valueAsNumber: true })}
                      />
                      {errors.count && (
                        <small id="series-count-error" className="field-error">
                          Wybierz od 2 do 52 lekcji.
                        </small>
                      )}
                    </label>
                  </div>
                  <fieldset className="field-group recurrence-weekdays">
                    <legend>Dni tygodnia</legend>
                    <div className="weekday-picker">
                      {["Pon", "Wt", "Śr", "Czw", "Pt", "Sob", "Niedz"].map(
                        (label, index) => (
                          <label key={label}>
                            <input
                              type="checkbox"
                              value={index + 1}
                              {...register("daysOfWeek")}
                            />
                            <span>{label}</span>
                          </label>
                        ),
                      )}
                    </div>
                    {errors.daysOfWeek && (
                      <small className="field-error">
                        Wybierz co najmniej jeden dzień.
                      </small>
                    )}
                  </fieldset>
                  <label className="field">
                    <span>
                      Koniec serii <small>opcjonalnie</small>
                    </span>
                    <input
                      type="date"
                      min={firstOccurrence?.date}
                      {...register("endDate")}
                    />
                  </label>
                  <div className="recurrence-preview">
                    <CalendarPlus size={18} aria-hidden="true" />
                    <div>
                      <strong>{recurringDates.length} lekcji</strong>
                      <p>
                        {recurringDates
                          .slice(0, 5)
                          .map((date) =>
                            formatInTimeZone(
                              date,
                              teacher.timezone,
                              "dd.MM, HH:mm",
                            ),
                          )
                          .join(" · ")}
                      </p>
                      {recurringDates.length > 5 && (
                        <small>
                          oraz {recurringDates.length - 5} kolejnych terminów ·
                          ostatnia:{" "}
                          {formatInTimeZone(
                            recurringDates.at(-1)!,
                            teacher.timezone,
                            "dd.MM.yyyy",
                          )}
                        </small>
                      )}
                    </div>
                  </div>
                </>
              )}
              {mode === "multiple" && (
                <button
                  className="button button--quiet button--inline"
                  type="button"
                  onClick={addOccurrence}
                >
                  <Plus size={17} aria-hidden="true" />
                  Dodaj kolejny termin
                </button>
              )}
            </fieldset>
            {firstOccurrence?.date && (
              <section
                className="schedule-context"
                aria-label="Plan wybranego dnia"
              >
                <h3>
                  Plan dnia ·{" "}
                  {firstOccurrence.date.split("-").reverse().join(".")}
                </h3>
                {data?.lessons
                  .filter(
                    (l) =>
                      localDateKey(l.startsAt, data.teacher.timezone) ===
                        firstOccurrence.date && l.status !== "cancelled",
                  )
                  .map((l) => (
                    <p key={l.id}>
                      <time>
                        {formatTime(l.startsAt, data.teacher.timezone)}–
                        {formatTime(
                          new Date(
                            new Date(l.startsAt).getTime() +
                              l.durationMinutes * 60000,
                          ).toISOString(),
                          data.teacher.timezone,
                        )}
                      </time>
                      <span>
                        {l.participantIds
                          .map(
                            (id) =>
                              data.students.find((s) => s.id === id)?.name,
                          )
                          .join(", ")}
                      </span>
                    </p>
                  ))}
                {!data?.lessons.some(
                  (l) =>
                    localDateKey(l.startsAt, data.teacher.timezone) ===
                      firstOccurrence.date && l.status !== "cancelled",
                ) && <p>Brak innych lekcji tego dnia.</p>}
                <small>
                  Przed zapisem sprawdzimy także niedostępność i pozostałe
                  terminy.
                </small>
              </section>
            )}
            <fieldset className="field-group">
              <legend>Szczegóły lekcji</legend>
              <div className="form-row">
                <label className="field">
                  <span>Format</span>
                  <select {...register("format")}>
                    <option value="online">Online</option>
                    <option value="offline">Stacjonarnie</option>
                  </select>
                </label>
                <label className="field">
                  <span>Cena (zł)</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    readOnly={trial}
                    {...register("priceZloty", { valueAsNumber: true })}
                  />
                </label>
              </div>
              <label className="check-row">
                <input type="checkbox" {...register("trial")} />
                <span>Lekcja próbna bez ceny</span>
              </label>
              <label
                className={`check-row place-choice ${formatValue === "online" ? "place-choice--disabled" : ""}`}
              >
                <input
                  type="checkbox"
                  disabled={formatValue === "online"}
                  {...register("atTeacherPlace")}
                />
                <span>
                  W domu / w biurze
                  <small>Nie trzeba podawać adresu</small>
                </span>
              </label>
              <label className="field">
                <span>Link lub adres</span>
                <input
                  disabled={formatValue === "offline" && atTeacherPlace}
                  placeholder={
                    formatValue === "offline"
                      ? "np. ul. Długa 12, Warszawa"
                      : "np. https://meet.google.com/..."
                  }
                  {...register("location")}
                  aria-invalid={Boolean(errors.location)}
                  aria-describedby={
                    errors.location ? "lesson-location-error" : undefined
                  }
                />
                {errors.location && (
                  <small id="lesson-location-error" className="field-error">
                    {errors.location.message}
                  </small>
                )}
              </label>
              <label className="field">
                <span>
                  Przedmiot <small>opcjonalnie</small>
                </span>
                <input placeholder="np. angielski" {...register("subject")} />
              </label>
              <details className="optional-plan">
                <summary>
                  Temat i wstępny plan <small>opcjonalnie</small>
                </summary>
                <label className="field">
                  <span>
                    Temat <small>opcjonalnie</small>
                  </span>
                  <input {...register("topic")} />
                </label>
                <label className="field">
                  <span>
                    Wstępny plan{" "}
                    <small>jeden punkt w wierszu, opcjonalnie</small>
                  </span>
                  <textarea rows={4} {...register("plan")} />
                </label>
              </details>
            </fieldset>
            {Object.keys(errors).length > 0 && (
              <div className="form-alert" role="alert">
                Sprawdź zaznaczone pola: wybierz ucznia, poprawną datę, godzinę,
                czas trwania i dane spotkania. Liczba lekcji w serii: 2–52.
              </div>
            )}
            {saveError && (
              <div className="form-alert" role="alert">
                {saveError}
              </div>
            )}
            {conflict && (
              <div
                className="conflict-panel"
                role="alert"
                ref={(node) => node?.scrollIntoView({ block: "nearest" })}
              >
                <AlertTriangle size={21} aria-hidden="true" />
                <div>
                  <strong>Ten termin wymaga decyzji</strong>
                  <p>{conflict.message}</p>
                  {conflict.canOverrideAvailability && (
                    <button
                      type="button"
                      className="button button--primary"
                      disabled={mutation.isPending}
                      onClick={() => void save(getValues(), true)}
                    >
                      Utwórz mimo to
                    </button>
                  )}
                </div>
              </div>
            )}
          </form>
          <footer className="dialog-footer">
            <button
              className="button button--quiet"
              type="button"
              onClick={requestClose}
            >
              {copy.actions.cancel}
            </button>
            <button
              className="button button--primary"
              form="lesson-form"
              disabled={
                isSubmitting ||
                mutation.isPending ||
                (!activeStudents.length && !activeGroups.length) ||
                data?.teacher.subscription.readOnly
              }
            >
              {isSubmitting && <LoaderCircle size={18} className="spin" />}
              {lessonCount === 1
                ? copy.actions.planLesson
                : `Zaplanuj ${lessonCountLabel(lessonCount)}`}
            </button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function getDefaults(
  timezone: string,
  preset: LessonComposerPreset,
  students: {
    id: string;
    defaultDurationMinutes: number;
    defaultFormat: "online" | "offline";
    defaultLocation: string;
    defaultPrice: { amount: number } | null;
  }[],
): Values {
  const selected = students.find((student) =>
    preset.studentIds?.includes(student.id),
  );
  const nextHour = addHours(new Date(), 1);
  nextHour.setMinutes(0, 0, 0);
  return {
    targetKey: selected ? `student:${selected.id}` : "",
    mode: "single",
    occurrences: [
      {
        id: crypto.randomUUID(),
        date: preset.date ?? formatInTimeZone(nextHour, timezone, "yyyy-MM-dd"),
        time: preset.time ?? formatInTimeZone(nextHour, timezone, "HH:mm"),
        durationMinutes:
          preset.durationMinutes ?? selected?.defaultDurationMinutes ?? 60,
      },
    ],
    intervalWeeks: 1,
    daysOfWeek: [
      String(
        new Date(
          `${preset.date ?? formatInTimeZone(nextHour, timezone, "yyyy-MM-dd")}T00:00:00Z`,
        ).getUTCDay() || 7,
      ) as "1" | "2" | "3" | "4" | "5" | "6" | "7",
    ],
    endDate: "",
    count: 4,
    format: selected?.defaultFormat ?? "online",
    location: selected?.defaultLocation ?? "",
    atTeacherPlace:
      selected?.defaultFormat === "offline" &&
      selected?.defaultLocation === "W domu / w biurze",
    priceZloty: (selected?.defaultPrice?.amount ?? 0) / 100,
    trial: selected?.defaultPrice === null,
    subject: "",
    topic: "",
    plan: "",
  };
}

function buildRecurringDates(input: {
  date: string;
  time: string;
  timezone: string;
  intervalWeeks: number;
  daysOfWeek: number[];
  count: number;
  endDate?: string;
}) {
  const result: string[] = [];
  const start = new Date(`${input.date}T00:00:00Z`);
  const limit = input.endDate
    ? new Date(`${input.endDate}T00:00:00Z`)
    : new Date(
        start.getTime() +
          Math.max(370, input.count * input.intervalWeeks * 7) * 86_400_000,
      );
  for (
    let day = start;
    day <= limit && result.length < input.count;
    day = new Date(day.getTime() + 86_400_000)
  ) {
    const elapsedDays = Math.round(
      (day.getTime() - start.getTime()) / 86_400_000,
    );
    const week = Math.floor(elapsedDays / 7);
    const weekday = day.getUTCDay() || 7;
    if (
      week % input.intervalWeeks === 0 &&
      input.daysOfWeek.includes(weekday)
    ) {
      result.push(
        localInputToUtc(
          day.toISOString().slice(0, 10),
          input.time,
          input.timezone,
        ),
      );
    }
  }
  return result;
}
