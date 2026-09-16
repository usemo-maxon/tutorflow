"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, X } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useAppMutation } from "@/hooks/use-app-data";
import { ClientApiError } from "@/lib/api-client";
import type { StudentContact } from "@/lib/domain";
import { useSessionTeacher } from "./app-shell";
import { useAppUi } from "./app-ui-context";

const schema = z.object({
  firstName: z.string().trim().min(1, "Podaj imię kontaktu."),
  lastName: z.string(),
  email: z.union([z.literal(""), z.email("Podaj poprawny adres e-mail.")]),
  phone: z.string(),
  type: z.enum(["parent", "guardian", "billing", "other"]),
  relationship: z.string(),
  isPrimary: z.boolean(),
  isBillingContact: z.boolean(),
});
type Values = z.infer<typeof schema>;

const empty: Values = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  type: "parent",
  relationship: "",
  isPrimary: false,
  isBillingContact: false,
};

export function ContactComposer({
  studentId,
  contact,
  open,
  onOpenChange,
}: {
  studentId: string;
  contact?: StudentContact | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const teacher = useSessionTeacher();
  const mutation = useAppMutation(teacher.id);
  const { showToast, showError } = useAppUi();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: empty });

  useEffect(() => {
    if (open)
      reset(
        contact
          ? {
              firstName: contact.firstName,
              lastName: contact.lastName,
              email: contact.email,
              phone: contact.phone,
              type: contact.type,
              relationship: contact.relationship,
              isPrimary: contact.isPrimary,
              isBillingContact: contact.isBillingContact,
            }
          : empty,
      );
  }, [open, contact, reset]);

  const submit = handleSubmit(async (values) => {
    try {
      await mutation.mutateAsync(
        contact
          ? {
              type: "updateStudentContact",
              relationId: contact.id,
              contact: values,
            }
          : {
              type: "createStudentContact",
              studentId,
              contact: values,
            },
      );
      onOpenChange(false);
      showToast({
        message: contact ? "Dane kontaktu zapisane." : "Kontakt został dodany.",
      });
    } catch (error) {
      const fieldErrors =
        error instanceof ClientApiError ? error.data.fieldErrors : undefined;
      Object.entries(fieldErrors ?? {}).forEach(([field, message]) =>
        setError(field as keyof Values, { message }),
      );
      showError(error);
    }
  });

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content dialog-content--medium"
          aria-describedby="contact-description"
        >
          <header className="dialog-header">
            <div>
              <Dialog.Title>
                {contact ? "Edytuj kontakt" : "Dodaj kontakt"}
              </Dialog.Title>
              <Dialog.Description id="contact-description">
                Rodzic, opiekun lub osoba odpowiedzialna za rozliczenia.
              </Dialog.Description>
            </div>
            <Dialog.Close className="icon-button" aria-label="Zamknij">
              <X size={20} />
            </Dialog.Close>
          </header>
          <form
            id="contact-form"
            className="dialog-scroll form-stack"
            onSubmit={submit}
            noValidate
          >
            <div className="form-row">
              <label className="field">
                <span>Imię *</span>
                <input
                  autoFocus
                  {...register("firstName")}
                  aria-invalid={Boolean(errors.firstName)}
                />
                {errors.firstName && (
                  <small className="field-error">
                    {errors.firstName.message}
                  </small>
                )}
              </label>
              <label className="field">
                <span>Nazwisko</span>
                <input {...register("lastName")} />
              </label>
            </div>
            <div className="form-row">
              <label className="field">
                <span>E-mail</span>
                <input
                  type="email"
                  {...register("email")}
                  aria-invalid={Boolean(errors.email)}
                />
                {errors.email && (
                  <small className="field-error">{errors.email.message}</small>
                )}
              </label>
              <label className="field">
                <span>Telefon</span>
                <input type="tel" {...register("phone")} />
              </label>
            </div>
            <div className="form-row">
              <label className="field">
                <span>Typ kontaktu</span>
                <select {...register("type")}>
                  <option value="parent">Rodzic</option>
                  <option value="guardian">Opiekun</option>
                  <option value="billing">Rozliczenia</option>
                  <option value="other">Inny</option>
                </select>
              </label>
              <label className="field">
                <span>Relacja</span>
                <input placeholder="np. Mama" {...register("relationship")} />
              </label>
            </div>
            <label className="check-row">
              <input type="checkbox" {...register("isPrimary")} />
              Główny kontakt
            </label>
            <label className="check-row">
              <input type="checkbox" {...register("isBillingContact")} />
              Kontakt do rozliczeń
            </label>
          </form>
          <footer className="dialog-footer">
            <Dialog.Close className="button button--quiet">Anuluj</Dialog.Close>
            <button
              className="button button--primary"
              form="contact-form"
              disabled={isSubmitting || mutation.isPending}
            >
              {(isSubmitting || mutation.isPending) && (
                <LoaderCircle size={18} className="spin" />
              )}
              {contact ? "Zapisz zmiany" : "Dodaj kontakt"}
            </button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
