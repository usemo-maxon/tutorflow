"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useAppMutation } from "@/hooks/use-app-data";
import { copy } from "@/lib/copy";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { useSessionTeacher } from "../app-shell";
import { useAppUi } from "../app-ui-context";

const schema = z.object({
  name: z.string().trim().min(2, "Podaj imię i nazwisko."),
  timezone: z.string().min(1),
});
type Values = z.infer<typeof schema>;
export function ProfileSettings() {
  const session = useSessionTeacher();
  const router = useRouter();
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
  useUnsavedChanges(isDirty);
  const submit = handleSubmit(async (values) => {
    try {
      await mutation.mutateAsync({ type: "updateProfile", ...values });
      showToast({ message: copy.toasts.changesSaved });
      reset(values);
      router.refresh();
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
            readOnly={session.subscription.readOnly}
            aria-invalid={Boolean(errors.name)}
          />
          {errors.name && (
            <small className="field-error">{errors.name.message}</small>
          )}
        </label>
        <label className="field">
          <span>Adres e-mail</span>
          <input
            value={
              session.email === "demo@tutorflow.local"
                ? "demo@easy4tutor.local"
                : session.email
            }
            readOnly
          />
          <small>Zmiana adresu będzie wymagała ponownej weryfikacji.</small>
        </label>
        <label className="field">
          <span>Strefa czasowa</span>
          <select
            {...register("timezone")}
            disabled={session.subscription.readOnly}
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
            !isDirty || isSubmitting || session.subscription.readOnly
          }
        >
          {isSubmitting && <LoaderCircle className="spin" size={17} />}Zapisz
          zmiany
        </button>
      </form>
      <section className="account-settings" aria-labelledby="account-title">
        <div>
          <h3 id="account-title">Konto</h3>
          <p>Zadbaj o bezpieczny dostęp do swojego obszaru pracy.</p>
        </div>
        <Link className="button button--secondary" href="/odzyskaj-haslo">
          Ustaw nowe hasło
        </Link>
      </section>
    </section>
  );
}
