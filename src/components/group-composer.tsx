"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle, X } from "lucide-react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { useAppMutation } from "@/hooks/use-app-data";
import type { StudentGroup } from "@/lib/domain";
import { useSessionTeacher } from "./app-shell";
import { useAppUi } from "./app-ui-context";

const schema = z.object({
  name: z.string().trim().min(1, "Podaj nazwę grupy."),
  subject: z.string(),
  level: z.string(),
  defaultDurationMinutes: z.number().int().min(15).max(480),
  priceZloty: z.number().min(0, "Cena nie może być ujemna."),
  noPrice: z.boolean(),
  notes: z.string(),
});
type Values = z.infer<typeof schema>;
const empty: Values = {
  name: "",
  subject: "",
  level: "",
  defaultDurationMinutes: 60,
  priceZloty: 0,
  noPrice: true,
  notes: "",
};

export function GroupComposer({
  group,
  open,
  onOpenChange,
  onCreated,
}: {
  group?: StudentGroup | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (id: string) => void;
}) {
  const teacher = useSessionTeacher();
  const mutation = useAppMutation(teacher.id);
  const { showToast, showError } = useAppUi();
  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: group
      ? {
          name: group.name,
          subject: group.subject,
          level: group.level,
          defaultDurationMinutes: group.defaultDurationMinutes,
          priceZloty: (group.defaultPrice?.amount ?? 0) / 100,
          noPrice: group.defaultPrice === null,
          notes: group.notes,
        }
      : empty,
  });
  const noPrice = useWatch({ control, name: "noPrice" });

  const submit = handleSubmit(async (values) => {
    try {
      const payload = {
        name: values.name,
        subject: values.subject,
        level: values.level,
        defaultDurationMinutes: values.defaultDurationMinutes,
        defaultPrice: values.noPrice
          ? null
          : {
              amount: Math.round(values.priceZloty * 100),
              currency: "PLN" as const,
            },
        notes: values.notes,
      };
      const response = await mutation.mutateAsync(
        group
          ? { type: "updateGroup", groupId: group.id, patch: payload }
          : { type: "createGroup", group: payload },
      );
      onOpenChange(false);
      showToast({
        message: group
          ? "Zmiany w grupie zapisane."
          : "Grupa została utworzona.",
      });
      if (!group && response.result?.id) onCreated?.(response.result.id);
    } catch (error) {
      showError(error);
    }
  });

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog-content dialog-content--medium"
          aria-describedby="group-description"
        >
          <header className="dialog-header">
            <div>
              <Dialog.Title>
                {group ? "Edytuj grupę" : "Utwórz grupę"}
              </Dialog.Title>
              <Dialog.Description id="group-description">
                Ustaw podstawowe dane. Uczniów dodasz w kolejnym kroku.
              </Dialog.Description>
            </div>
            <Dialog.Close className="icon-button" aria-label="Zamknij">
              <X size={20} />
            </Dialog.Close>
          </header>
          <form
            id="group-form"
            className="dialog-scroll form-stack"
            onSubmit={submit}
            noValidate
          >
            <label className="field">
              <span>Nazwa *</span>
              <input
                autoFocus
                {...register("name")}
                aria-invalid={Boolean(errors.name)}
              />
              {errors.name && (
                <small className="field-error">{errors.name.message}</small>
              )}
            </label>
            <div className="form-row">
              <label className="field">
                <span>Przedmiot</span>
                <input placeholder="np. Angielski" {...register("subject")} />
              </label>
              <label className="field">
                <span>Poziom</span>
                <input placeholder="np. B1" {...register("level")} />
              </label>
            </div>
            <div className="form-row">
              <label className="field">
                <span>Domyślny czas</span>
                <select
                  {...register("defaultDurationMinutes", {
                    valueAsNumber: true,
                  })}
                >
                  {[30, 45, 60, 90, 120].map((value) => (
                    <option key={value} value={value}>
                      {value} min
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Cena za lekcję (zł)</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  readOnly={noPrice}
                  {...register("priceZloty", { valueAsNumber: true })}
                />
              </label>
            </div>
            <label className="check-row">
              <input type="checkbox" {...register("noPrice")} />
              Bez domyślnej ceny
            </label>
            {group && (
              <label className="field">
                <span>Notatki</span>
                <textarea rows={3} {...register("notes")} />
              </label>
            )}
          </form>
          <footer className="dialog-footer">
            <Dialog.Close className="button button--quiet">Anuluj</Dialog.Close>
            <button
              className="button button--primary"
              form="group-form"
              disabled={isSubmitting || mutation.isPending}
            >
              {(isSubmitting || mutation.isPending) && (
                <LoaderCircle size={18} className="spin" />
              )}
              {group ? "Zapisz zmiany" : "Utwórz grupę"}
            </button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
