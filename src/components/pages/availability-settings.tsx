"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { addDays, format, parseISO } from "date-fns";
import { CalendarOff, Clock3, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { useAppData, useAppMutation } from "@/hooks/use-app-data";
import { localInputToUtc, localDateKey } from "@/lib/format";
import { useSessionTeacher } from "../app-shell";
import { useAppUi } from "../app-ui-context";
import { PageLoading } from "../ui/loading";

const schema = z
  .object({
    kind: z.enum(["single", "recurring"]),
    date: z.string().min(1, "Wybierz datę."),
    weekday: z.number().min(1).max(7),
    startTime: z.string().min(1, "Wybierz godzinę rozpoczęcia."),
    endTime: z.string().min(1, "Wybierz godzinę zakończenia."),
    allDay: z.boolean(),
    label: z.string().min(2, "Opis powinien zawierać co najmniej 2 znaki."),
  })
  .refine((value) => value.allDay || value.endTime > value.startTime, {
    path: ["endTime"],
    message: "Zakończenie musi być późniejsze niż rozpoczęcie.",
  });
type Values = z.infer<typeof schema>;
const weekdayDates: Record<number, string> = {
  1: "2026-09-07",
  2: "2026-09-08",
  3: "2026-09-09",
  4: "2026-09-10",
  5: "2026-09-11",
  6: "2026-09-12",
  7: "2026-09-13",
};
export function AvailabilitySettings() {
  const session = useSessionTeacher();
  const { data, isPending } = useAppData(session.id);
  const mutation = useAppMutation(session.id);
  const { showToast, showError } = useAppUi();
  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      kind: "recurring",
      date: localDateKey(new Date(), session.timezone),
      weekday: 1,
      startTime: "17:00",
      endTime: "20:00",
      allDay: false,
      label: "Dostępność",
    },
  });
  const kind = useWatch({ control, name: "kind" });
  const allDay = useWatch({ control, name: "allDay" });
  const [exception, setException] = useState({
    date: localDateKey(new Date(), session.timezone),
    kind: "unavailable" as "available" | "unavailable",
    startTime: "10:00",
    endTime: "14:00",
  });
  if (isPending || !data) return <PageLoading />;
  const submit = handleSubmit(async (values) => {
    const baseDate =
      values.kind === "single" ? values.date : weekdayDates[values.weekday];
    const endDate = values.allDay
      ? format(addDays(parseISO(baseDate), 1), "yyyy-MM-dd")
      : baseDate;
    try {
      await mutation.mutateAsync({
        type: "createAvailability",
        rule: {
          kind: values.kind,
          allDay: values.allDay,
          label: values.label,
          start: localInputToUtc(
            baseDate,
            values.allDay ? "00:00" : values.startTime,
            data.teacher.timezone,
          ),
          end: localInputToUtc(
            endDate,
            values.allDay ? "00:00" : values.endTime,
            data.teacher.timezone,
          ),
          weekday: values.kind === "recurring" ? values.weekday : undefined,
          isAvailable: values.kind === "recurring",
        },
      });
      showToast({ message: "Dostępność zapisana" });
      reset({ ...values });
    } catch (error) {
      showError(error);
    }
  });
  async function remove(ruleId: string) {
    try {
      await mutation.mutateAsync({ type: "deleteAvailability", ruleId });
      showToast({ message: "Czas niedostępny usunięty" });
    } catch (error) {
      showError(error);
    }
  }
  async function addException(event: React.FormEvent) {
    event.preventDefault();
    try {
      await mutation.mutateAsync({
        type: "createAvailabilityException",
        exception: {
          date: exception.date,
          kind: exception.kind,
          startTime:
            exception.kind === "available" ? exception.startTime : undefined,
          endTime:
            exception.kind === "available" ? exception.endTime : undefined,
          timezone: data!.teacher.timezone,
          reason:
            exception.kind === "available"
              ? "Wyjątkowa dostępność"
              : "Niedostępny",
        },
      });
      showToast({ message: "Wyjątek dostępności zapisany" });
    } catch (error) {
      showError(error);
    }
  }
  return (
    <section className="settings-panel settings-panel--availability">
      <div className="settings-copy">
        <p className="eyebrow">Twój rytm pracy</p>
        <h2>Dostępność</h2>
        <p>
          Ustaw regularne godziny pracy. Terminy poza nimi wyświetlą
          ostrzeżenie, ale nadal możesz świadomie utworzyć lekcję.
        </p>
        <div className="availability-list">
          {!data.availability.length && (
            <p className="inline-empty">
              Nie masz jeszcze regularnych godzin dostępności.
            </p>
          )}
          {data.availability.map((rule) => (
            <div key={rule.id}>
              {rule.allDay ? <CalendarOff size={17} /> : <Clock3 size={17} />}
              <span>
                <strong>
                  {rule.kind === "recurring"
                    ? `Co ${["poniedziałek", "wtorek", "środa", "czwartek", "piątek", "sobota", "niedziela"][Number(rule.weekday) - 1]}`
                    : new Intl.DateTimeFormat("pl-PL", {
                        dateStyle: "medium",
                        timeZone: data.teacher.timezone,
                      }).format(new Date(rule.start))}
                </strong>
                <small>
                  {rule.allDay
                    ? "Cały dzień"
                    : `${new Intl.DateTimeFormat("pl-PL", {
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: data.teacher.timezone,
                      }).format(
                        new Date(rule.start),
                      )}–${new Intl.DateTimeFormat("pl-PL", {
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: data.teacher.timezone,
                      }).format(new Date(rule.end))}`}{" "}
                  · {rule.isAvailable ? "Dostępny" : rule.label}
                </small>
              </span>
              <button
                className="icon-button"
                aria-label="Usuń regułę"
                disabled={
                  mutation.isPending || data.teacher.subscription.readOnly
                }
                onClick={() => remove(rule.id)}
              >
                <Trash2 size={17} />
              </button>
            </div>
          ))}
        </div>
      </div>
      <form className="settings-form" onSubmit={submit}>
        <fieldset
          className="field-group"
          disabled={data.teacher.subscription.readOnly}
        >
          <legend>Nowy przedział</legend>
          <div className="segmented-control">
            <label>
              <input type="radio" value="single" {...register("kind")} />
              <span>Jednorazowo niedostępny</span>
            </label>
            <label>
              <input type="radio" value="recurring" {...register("kind")} />
              <span>Co tydzień dostępny</span>
            </label>
          </div>
          {kind === "single" ? (
            <label className="field">
              <span>Data</span>
              <input type="date" {...register("date")} />
            </label>
          ) : (
            <label className="field">
              <span>Dzień tygodnia</span>
              <select {...register("weekday", { valueAsNumber: true })}>
                <option value="1">Poniedziałek</option>
                <option value="2">Wtorek</option>
                <option value="3">Środa</option>
                <option value="4">Czwartek</option>
                <option value="5">Piątek</option>
                <option value="6">Sobota</option>
                <option value="7">Niedziela</option>
              </select>
            </label>
          )}
          <label className="check-row all-day-choice">
            <input type="checkbox" {...register("allDay")} />
            <span>
              Cały dzień
              <small>Dla jednorazowej niedostępności</small>
            </span>
          </label>
          <div className="form-row">
            <label className="field">
              <span>Od</span>
              <input type="time" disabled={allDay} {...register("startTime")} />
            </label>
            <label className="field">
              <span>Do</span>
              <input
                type="time"
                disabled={allDay}
                {...register("endTime")}
                aria-invalid={Boolean(errors.endTime)}
              />
              {errors.endTime && (
                <small className="field-error">{errors.endTime.message}</small>
              )}
            </label>
          </div>
          <label className="field">
            <span>Opis</span>
            <input
              {...register("label")}
              aria-invalid={Boolean(errors.label)}
            />
            {errors.label && (
              <small className="field-error">{errors.label.message}</small>
            )}
          </label>
        </fieldset>
        <button
          className="button button--primary"
          disabled={isSubmitting || data.teacher.subscription.readOnly}
        >
          <Plus size={17} />
          Zapisz przedział
        </button>
      </form>
      <div className="settings-copy availability-exceptions">
        <p className="eyebrow">Zmiany jednorazowe</p>
        <h3>Wyjątki</h3>
        <div className="availability-list">
          {data.availabilityExceptions.map((item) => (
            <div key={item.id}>
              <CalendarOff size={17} />
              <span>
                <strong>
                  {new Intl.DateTimeFormat("pl-PL", {
                    dateStyle: "medium",
                  }).format(parseISO(item.date))}
                </strong>
                <small>
                  {item.kind === "unavailable"
                    ? "Niedostępny cały dzień"
                    : `Dostępny ${item.startTime?.slice(0, 5)}–${item.endTime?.slice(0, 5)}`}
                </small>
              </span>
              <button
                className="icon-button"
                aria-label="Usuń wyjątek"
                onClick={() =>
                  void mutation
                    .mutateAsync({
                      type: "deleteAvailabilityException",
                      exceptionId: item.id,
                    })
                    .catch(showError)
                }
              >
                <Trash2 size={17} />
              </button>
            </div>
          ))}
        </div>
      </div>
      <form className="settings-form" onSubmit={addException}>
        <fieldset
          className="field-group"
          disabled={data.teacher.subscription.readOnly}
        >
          <legend>Nowy wyjątek</legend>
          <label className="field">
            <span>Data</span>
            <input
              type="date"
              required
              value={exception.date}
              onChange={(event) =>
                setException((current) => ({
                  ...current,
                  date: event.target.value,
                }))
              }
            />
          </label>
          <div className="segmented-control">
            <label>
              <input
                type="radio"
                checked={exception.kind === "unavailable"}
                onChange={() =>
                  setException((current) => ({
                    ...current,
                    kind: "unavailable",
                  }))
                }
              />
              <span>Niedostępny</span>
            </label>
            <label>
              <input
                type="radio"
                checked={exception.kind === "available"}
                onChange={() =>
                  setException((current) => ({ ...current, kind: "available" }))
                }
              />
              <span>Dostępny w godzinach</span>
            </label>
          </div>
          {exception.kind === "available" && (
            <div className="form-row">
              <label className="field">
                <span>Od</span>
                <input
                  type="time"
                  required
                  value={exception.startTime}
                  onChange={(event) =>
                    setException((current) => ({
                      ...current,
                      startTime: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="field">
                <span>Do</span>
                <input
                  type="time"
                  required
                  min={exception.startTime}
                  value={exception.endTime}
                  onChange={(event) =>
                    setException((current) => ({
                      ...current,
                      endTime: event.target.value,
                    }))
                  }
                />
              </label>
            </div>
          )}
        </fieldset>
        <button
          className="button button--secondary"
          disabled={
            mutation.isPending ||
            (exception.kind === "available" &&
              exception.endTime <= exception.startTime)
          }
        >
          <Plus size={17} /> Dodaj wyjątek
        </button>
      </form>
    </section>
  );
}
