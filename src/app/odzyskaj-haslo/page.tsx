import Link from "next/link";
import { Suspense } from "react";
import { PasswordResetForm } from "@/components/password-reset-form";

export default function ResetPage() {
  return (
    <main className="legal-page">
      <Link className="brand brand--public" href="/">
        <span className="brand-mark" aria-hidden="true">
          <span />
        </span>
        TutorFlow
      </Link>
      <article>
        <p className="eyebrow">Odzyskiwanie dostępu</p>
        <h1>Ustaw bezpieczne hasło.</h1>
        <p>Wyślemy jednorazowy link na adres przypisany do konta.</p>
        <Suspense
          fallback={
            <div
              className="auth-form-skeleton"
              aria-label="Ładowanie formularza"
            />
          }
        >
          <PasswordResetForm />
        </Suspense>
      </article>
    </main>
  );
}
