"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { copy } from "@/lib/copy";
import { useAppMutation } from "@/hooks/use-app-data";
import { useSessionTeacher } from "./app-shell";
import { useAppUi } from "./app-ui-context";

const schema = z.object({
  name: z.string().trim().min(2, "Podaj imię i nazwisko ucznia."),
  contact: z.string(),
  level: z.string(),
  goal: z.string(),
  notes: z.string(),
  defaultDurationMinutes: z.number().min(15).max(360),
  defaultFormat: z.enum(["online", "offline"]),
  defaultLocation: z.string().min(3, "Dodaj link lub adres spotkania."),
  priceZloty: z.number().min(0, "Cena nie może być ujemna."),
  trial: z.boolean(),
});
type Values = z.infer<typeof schema>;

const defaults: Values = {
  name: "",
  contact: "",
  level: "B1",
  goal: "",
  notes: "",
  defaultDurationMinutes: 60,
  defaultFormat: "online",
  defaultLocation: "",
  priceZloty: 0,
  trial: false,
};

export function StudentComposer() {
  const teacher = useSessionTeacher();
  const router = useRouter();
  const mutation = useAppMutation(teacher.id);
  const {
    studentComposerOpen,
    editingStudent,
    closeStudentComposer,
    restoreComposerFocus,
    showToast,
    showError,
  } = useAppUi();
  const {
    control,
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: defaults,
  });

  const trial = useWatch({ control, name: "trial" });
  useEffect(() => {
    if (studentComposerOpen)
      reset(
        editingStudent
          ? {
              ...editingStudent,
              priceZloty: (editingStudent.defaultPrice?.amount ?? 0) / 100,
              trial: editingStudent.defaultPrice === null,
            }
          : defaults,
      );
  }, [studentComposerOpen, editingStudent, reset]);
  useUnsavedChanges(studentComposerOpen && isDirty);
  function requestClose() {
    if (isSubmitting) return;
    if (
      isDirty &&
      !window.confirm("Masz niezapisane zmiany. Zamknąć formularz?")
    )
      return;
    closeStudentComposer();
  }
  const submit = handleSubmit(async (values) => {
    try {
      const student = {
        name: values.name,
        contact: values.contact,
        level: values.level,
        goal: values.goal,
        notes: values.notes,
        status: editingStudent?.status ?? ("active" as const),
        defaultDurationMinutes: values.defaultDurationMinutes,
        defaultFormat: values.defaultFormat,
        defaultLocation: values.defaultLocation,
        defaultPrice: values.trial
          ? null
          : {
              amount: Math.round(values.priceZloty * 100),
              currency: "PLN" as const,
            },
      };
      const response = await mutation.mutateAsync(
        editingStudent
          ? {
              type: "updateStudent",
              studentId: editingStudent.id,
              patch: student,
            }
          : { type: "createStudent", student },
      );
      closeStudentComposer();
      showToast({
        message: editingStudent
          ? copy.toasts.changesSaved
          : copy.toasts.studentAdded,
      });
      if (!editingStudent && response.result?.id)
        router.push(`/app/uczniowie/${response.result.id}`);
    } catch (error) {
      const fieldErrors =
        error && typeof error === "object" && "data" in error
          ? (error as { data: { fieldErrors?: Record<string, string> } }).data
              .fieldErrors
          : undefined;
      Object.entries(fieldErrors ?? {}).forEach(([field, message]) =>
        setError(field as keyof Values, { message }),
      );
      showError(error);
    }
  });

  return (
    <Dialog.Root
      open={studentComposerOpen}
      onOpenChange={(open) => {
        if (!open) requestClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content dialog-content--medium"
          aria-describedby="student-description"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            restoreComposerFocus("student");
          }}
        >
          <header className="dialog-header">
            <div>
              <Dialog.Title>
                {editingStudent ? "Edytuj ucznia" : "Nowy uczeń"}
              </Dialog.Title>
              <Dialog.Description id="student-description">
                Ustaw dane, które będą automatycznie używane przy planowaniu
                lekcji.
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
            id="student-form"
            className="dialog-scroll form-stack"
            onSubmit={submit}
            noValidate
          >
            <label className="field">
              <span>Imię i nazwisko</span>
              <input
                autoFocus
                {...register("name")}
                aria-invalid={Boolean(errors.name)}
                aria-describedby={
                  errors.name ? "student-name-error" : undefined
                }
              />
              {errors.name && (
                <small id="student-name-error" className="field-error">
                  {errors.name.message}
                </small>
              )}
            </label>
            <div className="form-row">
              <label className="field">
                <span>Poziom</span>
                <select {...register("level")}>
                  <option>A1</option>
                  <option>A2</option>
                  <option>B1</option>
                  <option>B1+</option>
                  <option>B2</option>
                  <option>C1</option>
                  <option>C2</option>
                </select>
              </label>
              <label className="field">
                <span>Kontakt</span>
                <input {...register("contact")} />
              </label>
            </div>
            <label className="field">
              <span>Cel nauki</span>
              <input {...register("goal")} />
            </label>
            <fieldset className="field-group">
              <legend>Domyślna lekcja</legend>
              <div className="form-row form-row--three">
                <label className="field">
                  <span>Czas</span>
                  <select
                    {...register("defaultDurationMinutes", {
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
                <label className="field">
                  <span>Format</span>
                  <select {...register("defaultFormat")}>
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
                Lekcja próbna bez ceny
              </label>
              <label className="field">
                <span>Link lub adres</span>
                <input
                  {...register("defaultLocation")}
                  aria-invalid={Boolean(errors.defaultLocation)}
                />
                {errors.defaultLocation && (
                  <small className="field-error">
                    {errors.defaultLocation.message}
                  </small>
                )}
              </label>
            </fieldset>
            {Object.keys(errors).length > 0 && (
              <div className="form-alert" role="alert">
                Sprawdź imię ucznia, czas trwania, cenę i dane spotkania.
                Wprowadzone dane pozostają w formularzu.
              </div>
            )}
            <label className="field">
              <span>Notatki</span>
              <textarea rows={3} {...register("notes")} />
            </label>
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
              form="student-form"
              disabled={isSubmitting}
            >
              {isSubmitting && <LoaderCircle size={18} className="spin" />}
              {editingStudent ? "Zapisz zmiany" : copy.actions.addStudent}
            </button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
