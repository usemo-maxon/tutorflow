import type { Metadata } from "next";
export const metadata: Metadata = { title: "Odzyskaj dostęp" };
import { BrandLogo } from "@/components/brand-logo";
import Link from "next/link";
import { Suspense } from "react";
import { PasswordResetForm } from "@/components/password-reset-form";

export default function ResetPage() {
  return (
    <main className="reset-page">
      <Link className="brand brand--public" href="/">
        <BrandLogo />
      </Link>
      <article className="auth-card">
        <p className="eyebrow">Odzyskiwanie dostępu</p>
        <h1>Wróć do swojego planu.</h1>
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
