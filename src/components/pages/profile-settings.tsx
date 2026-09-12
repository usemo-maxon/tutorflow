"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useAppData, useAppMutation } from "@/hooks/use-app-data";
import { copy } from "@/lib/copy";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { useSessionTeacher } from "../app-shell";
import { useAppUi } from "../app-ui-context";
import { PageLoading } from "../ui/loading";

const schema = z.object({
  name: z.string().trim().min(2, "Podaj imię i nazwisko."),
  timezone: z.string().min(1),
});
type Values = z.infer<typeof schema>;
export function ProfileSettings() {
  const session = useSessionTeacher();
  const { data, isPending } = useAppData(session.id);
  const mutation = useAppMutation(session.id);
  const { showToast, showError } = useAppUi();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: { name: session.name, timezone: session.timezone },
  });
  useEffect(() => {
    if (data && !isDirty)
      reset({ name: data.teacher.name, timezone: data.teacher.timezone });
  }, [data, reset, isDirty]);
  useUnsavedChanges(isDirty);
  if (isPending || !data) return <PageLoading />;
  const submit = handleSubmit(async (values) => {
    try {
      await mutation.mutateAsync({ type: "updateProfile", ...values });
      showToast({ message: copy.toasts.changesSaved });
      reset(values);
    } catch (error) {
      showError(error);
    }
  });
  return (
    <section className="settings-panel">
      <div className="settings-copy">
        <p className="eyebrow">Profil nauczyciela</p>
        <h2>Dane i czas</h2>
        <p>
          Strefa czasowa steruje widokiem kalendarza. Reguły cykliczne zachowują
          lokalną godzinę także przy zmianie czasu.
        </p>
      </div>
      <form onSubmit={submit} className="settings-form">
        <label className="field">
          <span>Imię i nazwisko</span>
          <input
            {...register("name")}
            readOnly={data.teacher.subscription.readOnly}
            aria-invalid={Boolean(errors.name)}
          />
          {errors.name && (
            <small className="field-error">{errors.name.message}</small>
          )}
        </label>
        <label className="field">
          <span>Adres e-mail</span>
          <input value={data.teacher.email} readOnly />
          <small>Zmiana adresu będzie wymagała ponownej weryfikacji.</small>
        </label>
        <label className="field">
          <span>Strefa czasowa</span>
          <select
            {...register("timezone")}
            disabled={data.teacher.subscription.readOnly}
          >
            <option value="Europe/Warsaw">Europe/Warsaw (Polska)</option>
            <option value="Europe/London">Europe/London</option>
            <option value="Europe/Berlin">Europe/Berlin</option>
            <option value="America/New_York">America/New_York</option>
          </select>
        </label>
        <button
          className="button button--primary"
          disabled={
            !isDirty || isSubmitting || data.teacher.subscription.readOnly
          }
        >
          {isSubmitting && <LoaderCircle className="spin" size={17} />}Zapisz
          zmiany
        </button>
      </form>
    </section>
  );
}
