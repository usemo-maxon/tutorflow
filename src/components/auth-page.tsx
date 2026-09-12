import Link from "next/link";
import { Suspense } from "react";
import { AuthForm } from "./auth-form";

export function AuthPage({ mode }: { mode: "login" | "register" }) {
  return (
    <main className="auth-layout">
      <section className="auth-panel">
        <Link className="brand brand--public" href="/">
          <span className="brand-mark" aria-hidden="true">
            <span />
          </span>
          TutorFlow
        </Link>
        <div className="auth-card">
          <p className="eyebrow">
            {mode === "login" ? "Witaj ponownie" : "14 dni bez opłat"}
          </p>
          <h1>
            {mode === "login"
              ? "Dobrze Cię widzieć."
              : "Zacznij od pierwszego ucznia."}
          </h1>
          <p>
            {mode === "login"
              ? "Zaloguj się, aby zobaczyć plan najbliższych lekcji."
              : "Utwórz prywatny obszar pracy. Karta płatnicza nie jest potrzebna."}
          </p>
          <Suspense
            fallback={
              <div
                className="auth-form-skeleton"
                aria-label="Ładowanie formularza"
              />
            }
          >
            <AuthForm mode={mode} />
          </Suspense>
          <p className="auth-switch">
            {mode === "login" ? "Nie masz jeszcze konta?" : "Masz już konto?"}{" "}
            <Link href={mode === "login" ? "/rejestracja" : "/logowanie"}>
              {mode === "login" ? "Załóż konto" : "Zaloguj się"}
            </Link>
          </p>
        </div>
      </section>
      <aside className="auth-aside" aria-label="TutorFlow w praktyce">
        <p className="eyebrow eyebrow--light">Dzisiaj · 4 lekcje</p>
        <blockquote>
          „Co było ostatnio?” nie musi być pierwszym pytaniem przed każdą
          lekcją.
        </blockquote>
        <div className="auth-mini-thread">
          <span className="mini-node mini-node--done" />
          <div>
            <small>Ostatnio</small>
            <strong>Past Simple</strong>
          </div>
          <span className="mini-line" />
          <span className="mini-node mini-node--now" />
          <div>
            <small>Teraz</small>
            <strong>Present Perfect</strong>
          </div>
          <span className="mini-line" />
          <span className="mini-node" />
          <div>
            <small>Następnie</small>
            <strong>Porównanie czasów</strong>
          </div>
        </div>
      </aside>
    </main>
  );
}
