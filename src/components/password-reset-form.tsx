"use client";

import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authRequest, ClientApiError } from "@/lib/api-client";

export function PasswordResetForm() {
  const update = useSearchParams().get("mode") === "update";
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await authRequest(
        update ? "update-password" : "request-reset",
        update ? { password: value } : { email: value },
      );
      setMessage(
        update
          ? "Hasło zostało zmienione. Możesz się zalogować."
          : "Jeśli konto istnieje, link do zmiany hasła został wysłany.",
      );
      setValue("");
    } catch (caught) {
      setError(
        caught instanceof ClientApiError
          ? caught.data.message
          : "Brak połączenia. Spróbuj ponownie.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="auth-form" onSubmit={submit}>
      <label className="field">
        <span>{update ? "Nowe hasło" : "Adres e-mail"}</span>
        <input
          type={update ? "password" : "email"}
          autoComplete={update ? "new-password" : "email"}
          required
          minLength={update ? 8 : undefined}
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </label>
      {message && (
        <div className="integration-note" role="status">
          {message}
        </div>
      )}
      {error && (
        <div className="form-alert" role="alert">
          {error}
        </div>
      )}
      <button className="button button--primary" disabled={busy}>
        {busy ? "Wysyłanie…" : update ? "Zmień hasło" : "Wyślij link"}
      </button>
      <a className="button button--secondary" href="/logowanie">
        Wróć do logowania
      </a>
    </form>
  );
}
