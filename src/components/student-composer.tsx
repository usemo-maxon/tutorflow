"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { copy } from "@/lib/copy";
import { studentCreatedPath } from "@/lib/composer-context";
import { useAppMutation } from "@/hooks/use-app-data";
import { ClientApiError } from "@/lib/api-client";
import { useSessionTeacher } from "./app-shell";
import { useAppUi } from "./app-ui-context";

const schema = z.object({
  firstName: z.string().trim().min(1, "Podaj imię ucznia."),
  lastName: z.string(),
  displayName: z.string(),
  email: z.union([z.literal(""), z.email("Podaj poprawny adres e-mail.")]),
  phone: z.string(),
  subject: z.string(),
  level: z.string(),
  goal: z.string(),
  notes: z.string(),
  defaultDurationMinutes: z.number().int().min(15).max(480),
  defaultFormat: z.enum(["online", "offline"]),
  defaultLocation: z.string(),
  priceZloty: z.number().min(0, "Cena nie może być ujemna."),
  noPrice: z.boolean(),
  timezone: z.string(),
});
type Values = z.infer<typeof schema>;

const defaults: Values = {
  firstName: "",
  lastName: "",
  displayName: "",
  email: "",
  phone: "",
  subject: "",
  level: "",
  goal: "",
  notes: "",
  defaultDurationMinutes: 60,
  defaultFormat: "online",
  defaultLocation: "",
  priceZloty: 0,
  noPrice: true,
  timezone: "",
};

export function StudentComposer() {
  const teacher = useSessionTeacher();
  const router = useRouter();
  const mutation = useAppMutation(teacher.id);
  const [duplicateId, setDuplicateId] = useState<string | null>(null);
  const {
    studentComposerOpen,
    studentComposerContext,
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
    setError,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: editingStudent
      ? {
          firstName: editingStudent.firstName,
          lastName: editingStudent.lastName,
          displayName: editingStudent.displayName,
          email: editingStudent.email,
          phone: editingStudent.phone,
          subject: editingStudent.subject,
          level: editingStudent.level,
          goal: editingStudent.goal,
          notes: editingStudent.notes,
          defaultDurationMinutes: editingStudent.defaultDurationMinutes,
          defaultFormat: editingStudent.defaultFormat,
          defaultLocation: editingStudent.defaultLocation,
          priceZloty: (editingStudent.defaultPrice?.amount ?? 0) / 100,
          noPrice: editingStudent.defaultPrice === null,
          timezone: editingStudent.timezone ?? "",
        }
      : defaults,
  });
  const noPrice = useWatch({ control, name: "noPrice" });

  useUnsavedChanges(studentComposerOpen && isDirty);

  function requestClose() {
    if (isSubmitting) return;
    if (
      editingStudent &&
      isDirty &&
      !window.confirm("Masz niezapisane zmiany. Zamknąć formularz?")
    )
      return;
    closeStudentComposer();
  }

  async function save(values: Values, allowDuplicate = false) {
    setDuplicateId(null);
    try {
      const student = {
        firstName: values.firstName,
        lastName: values.lastName,
        displayName: values.displayName || undefined,
        email: values.email,
        phone: values.phone,
        subject: values.subject,
        level: values.level,
        goal: values.goal,
        notes: values.notes,
        defaultDurationMinutes: values.defaultDurationMinutes,
        defaultFormat: values.defaultFormat,
        defaultLocation: values.defaultLocation,
        defaultPrice: values.noPrice
          ? null
          : {
              amount: Math.round(values.priceZloty * 100),
              currency: "PLN" as const,
            },
        timezone: values.timezone || undefined,
      };
      const response = await mutation.mutateAsync(
        editingStudent
          ? {
              type: "updateStudent",
              studentId: editingStudent.id,
              patch: student,
            }
          : {
              type: "createStudent",
              student: { ...student, allowDuplicate },
            },
      );
      closeStudentComposer();
      showToast({
        message: editingStudent
          ? copy.toasts.changesSaved
          : copy.toasts.studentAdded,
      });
      if (!editingStudent && response.result?.id) {
        const destination = studentCreatedPath(
          studentComposerContext,
          response.result.id,
        );
        if (destination) router.push(destination);
      }
    } catch (error) {
      if (
        error instanceof ClientApiError &&
        error.data.code === "POSSIBLE_DUPLICATE"
      ) {
        const ids = (error.data.details as { studentIds?: string[] })
          ?.studentIds;
        setDuplicateId(ids?.[0] ?? null);
        return;
      }
      const fieldErrors =
        error instanceof ClientApiError ? error.data.fieldErrors : undefined;
      Object.entries(fieldErrors ?? {}).forEach(([field, message]) =>
        setError(field as keyof Values, { message }),
      );
      showError(error);
    }
  }

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
                {editingStudent ? "Edytuj ucznia" : "Dodaj ucznia"}
              </Dialog.Title>
              <Dialog.Description id="student-description">
                {editingStudent
                  ? "Uzupełnij profil i domyślne ustawienia lekcji."
                  : "Na początek wystarczą podstawowe dane. Resztę uzupełnisz później."}
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
            onSubmit={handleSubmit((values) => save(values))}
            noValidate
          >
            <div className="form-row">
              <Field label="Imię" required error={errors.firstName?.message}>
                <input
                  autoFocus
                  autoComplete="given-name"
                  {...register("firstName")}
                  aria-invalid={Boolean(errors.firstName)}
                />
              </Field>
              <Field label="Nazwisko">
                <input autoComplete="family-name" {...register("lastName")} />
              </Field>
            </div>
            <div className="form-row">
              <Field label="E-mail" error={errors.email?.message}>
                <input
                  type="email"
                  autoComplete="email"
                  {...register("email")}
                  aria-invalid={Boolean(errors.email)}
                />
              </Field>
              <Field label="Telefon">
                <input type="tel" autoComplete="tel" {...register("phone")} />
              </Field>
            </div>
            <div className="form-row">
              <Field label="Przedmiot">
                <input placeholder="np. Angielski" {...register("subject")} />
              </Field>
              <Field label="Poziom">
                <input placeholder="np. B1" {...register("level")} />
              </Field>
            </div>

            {duplicateId && (
              <div className="form-alert form-alert--warning" role="alert">
                <strong>Podobny uczeń już istnieje.</strong>
                <span>
                  Sprawdź profil albo dodaj tę osobę mimo ostrzeżenia.
                </span>
                <div className="inline-actions">
                  <button
                    className="button button--quiet"
                    type="button"
                    onClick={() => {
                      closeStudentComposer();
                      router.push(`/app/uczniowie/${duplicateId}`);
                    }}
                  >
                    Zobacz istniejącego
                  </button>
                  <button
                    className="button button--secondary"
                    type="button"
                    onClick={() =>
                      void handleSubmit((values) => save(values, true))()
                    }
                  >
                    Dodaj mimo to
                  </button>
                </div>
              </div>
            )}

            {editingStudent && (
              <>
                <Field label="Wyświetlana nazwa">
                  <input {...register("displayName")} />
                </Field>
                <Field label="Cel nauki">
                  <input {...register("goal")} />
                </Field>
                <fieldset className="field-group">
                  <legend>Domyślna lekcja</legend>
                  <div className="form-row form-row--three">
                    <Field label="Czas">
                      <select
                        {...register("defaultDurationMinutes", {
                          valueAsNumber: true,
                        })}
                      >
                        {[30, 45, 60, 90, 120].map((minutes) => (
                          <option key={minutes} value={minutes}>
                            {minutes} min
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Format">
                      <select {...register("defaultFormat")}>
                        <option value="online">Online</option>
                        <option value="offline">Stacjonarnie</option>
                      </select>
                    </Field>
                    <Field label="Cena (zł)" error={errors.priceZloty?.message}>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        readOnly={noPrice}
                        {...register("priceZloty", { valueAsNumber: true })}
                      />
                    </Field>
                  </div>
                  <label className="check-row">
                    <input type="checkbox" {...register("noPrice")} />
                    Bez domyślnej ceny
                  </label>
                  <Field label="Link lub adres">
                    <input {...register("defaultLocation")} />
                  </Field>
                </fieldset>
                <Field label="Strefa czasowa">
                  <input
                    placeholder="Europe/Warsaw"
                    {...register("timezone")}
                  />
                </Field>
                <Field label="Notatki">
                  <textarea rows={3} {...register("notes")} />
                </Field>
              </>
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
              form="student-form"
              disabled={isSubmitting || mutation.isPending}
            >
              {(isSubmitting || mutation.isPending) && (
                <LoaderCircle size={18} className="spin" />
              )}
              {editingStudent ? "Zapisz zmiany" : copy.actions.addStudent}
            </button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>
        {label} {required && <abbr title="pole wymagane">*</abbr>}
      </span>
      {children}
      {error && <small className="field-error">{error}</small>}
    </label>
  );
}
