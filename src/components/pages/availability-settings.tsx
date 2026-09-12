"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Clock3, Plus, Trash2 } from "lucide-react";
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
    label: z.string().min(2, "Opis powinien zawierać co najmniej 2 znaki."),
  })
  .refine((value) => value.endTime > value.startTime, {
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
      kind: "single",
      date: localDateKey(new Date(), session.timezone),
      weekday: 1,
      startTime: "17:00",
      endTime: "20:00",
      label: "Czas niedostępny",
    },
  });
  const kind = useWatch({ control, name: "kind" });
  if (isPending || !data) return <PageLoading />;
  const submit = handleSubmit(async (values) => {
    const baseDate =
      values.kind === "single" ? values.date : weekdayDates[values.weekday];
    try {
      await mutation.mutateAsync({
        type: "createAvailability",
        rule: {
          kind: values.kind,
          label: values.label,
          start: localInputToUtc(
            baseDate,
            values.startTime,
            data.teacher.timezone,
          ),
          end: localInputToUtc(baseDate, values.endTime, data.teacher.timezone),
          weekday: values.kind === "recurring" ? values.weekday : undefined,
        },
      });
      showToast({ message: "Czas niedostępny dodany" });
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
  return (
    <section className="settings-panel settings-panel--availability">
      <div className="settings-copy">
        <p className="eyebrow">Granice kalendarza</p>
        <h2>Czas niedostępny</h2>
        <p>
          TutorFlow sprawdzi te reguły przed zapisaniem pojedynczej lekcji,
          wielu terminów i serii.
        </p>
        <div className="availability-list">
          {!data.availability.length && (
            <p className="inline-empty">
              Nie masz ograniczeń dostępności. Dodaj czas wolny od lekcji w
              formularzu.
            </p>
          )}
          {data.availability.map((rule) => (
            <div key={rule.id}>
              <Clock3 size={17} />
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
                  {new Intl.DateTimeFormat("pl-PL", {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: data.teacher.timezone,
                  }).format(new Date(rule.start))}
                  –
                  {new Intl.DateTimeFormat("pl-PL", {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: data.teacher.timezone,
                  }).format(new Date(rule.end))}{" "}
                  · {rule.label}
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
          <legend>Nowa reguła</legend>
          <div className="segmented-control">
            <label>
              <input type="radio" value="single" {...register("kind")} />
              <span>Jednorazowo</span>
            </label>
            <label>
              <input type="radio" value="recurring" {...register("kind")} />
              <span>Co tydzień</span>
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
          <div className="form-row">
            <label className="field">
              <span>Od</span>
              <input type="time" {...register("startTime")} />
            </label>
            <label className="field">
              <span>Do</span>
              <input
                type="time"
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
          Dodaj czas niedostępny
        </button>
      </form>
    </section>
  );
}
