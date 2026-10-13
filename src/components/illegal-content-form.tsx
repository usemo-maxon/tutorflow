"use client";
import { useState, type FormEvent } from "react";
import styles from "./legal-page.module.css";
export function IllegalContentForm() {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">(
    "idle",
  );
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState("sending");
    const form = new FormData(e.currentTarget);
    const body = Object.fromEntries(form);
    try {
      const r = await fetch("/api/legal/illegal-content-reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error();
      setState("done");
      e.currentTarget.reset();
    } catch {
      setState("error");
    }
  }
  return (
    <form className={styles.form} onSubmit={submit}>
      <label>
        Adres URL treści
        <input name="contentUrl" type="url" required maxLength={2000} />
      </label>
      <label>
        Opis zgłaszanej treści
        <textarea name="description" required rows={4} maxLength={5000} />
      </label>
      <label>
        Dlaczego uważasz tę treść za nielegalną?
        <textarea name="reason" required rows={4} maxLength={5000} />
      </label>
      <label>
        Adres e-mail
        <input name="email" type="email" required maxLength={255} />
      </label>
      <label>
        Informacje dodatkowe
        <textarea name="additionalInfo" rows={3} maxLength={5000} />
      </label>
      <label className={styles.check}>
        <input name="accurate" type="checkbox" value="true" required />
        <span>
          Oświadczam, że według mojej najlepszej wiedzy informacje zawarte w
          zgłoszeniu są prawidłowe i kompletne.
        </span>
      </label>
      <label hidden>
        Firma
        <input name="company" tabIndex={-1} autoComplete="off" />
      </label>
      <button disabled={state === "sending"}>
        {state === "sending" ? "Wysyłanie…" : "Wyślij zgłoszenie"}
      </button>
      {state === "done" && (
        <p className={styles.status} role="status">
          Zgłoszenie zostało zapisane. Skontaktujemy się, jeśli będzie to
          potrzebne.
        </p>
      )}
      {state === "error" && (
        <p className={styles.error} role="alert">
          Nie udało się wysłać zgłoszenia. Napisz na support@easy4tutor.pl.
        </p>
      )}
    </form>
  );
}
