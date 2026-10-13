"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- Export endpoints intentionally trigger downloads. */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CookieSettingsButton } from "@/components/cookie-settings";
export function PrivacySettings() {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  async function remove() {
    if (text !== "USUŃ KONTO") return;
    const r = await fetch("/api/account", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirmation: text }),
    });
    if (!r.ok) {
      setError(
        "Nie udało się usunąć konta. Skontaktuj się z support@easy4tutor.pl.",
      );
      return;
    }
    router.push("/");
    router.refresh();
  }
  return (
    <section className="settings-panel settings-panel--stack">
      <div className="settings-copy">
        <p className="eyebrow">Moje dane</p>
        <h2>Prywatność i dane</h2>
        <p>Zarządzaj kopią danych, połączonymi usługami i kontem.</p>
      </div>
      <div className="privacy-grid">
        <article>
          <h3>Połączone usługi</h3>
          <p>
            Stan Google Calendar i pozostałych integracji znajdziesz w
            ustawieniach integracji.
          </p>
          <Link
            className="button button--secondary"
            href="/app/ustawienia/integracje"
          >
            Zarządzaj usługami
          </Link>
        </article>
        <article>
          <h3>Eksport danych</h3>
          <p>
            Pobierz kopię danych przechowywanych w Easy4Tutor w formacie
            umożliwiającym ich późniejsze wykorzystanie lub przeniesienie.
          </p>
          <a className="button button--primary" href="/api/export/dane">
            Przygotuj eksport
          </a>
        </article>
        <article>
          <h3>Ustawienia cookies</h3>
          <p>Zmień wybór dotyczący opcjonalnych ustawień przeglądarki.</p>
          <CookieSettingsButton className="button button--secondary" />
        </article>
        <article className="privacy-danger">
          <h3>Usuń konto</h3>
          <p>
            Usunięcie konta spowoduje zakończenie korzystania z Easy4Tutor i
            rozpoczęcie procesu usuwania danych powiązanych z kontem oraz
            Workspace, z zastrzeżeniem danych, które musimy zachować ze względu
            na obowiązki prawne, rozliczenia, bezpieczeństwo lub ustalenie,
            dochodzenie albo obronę roszczeń.
          </p>
          <p>Przed usunięciem konta możesz wyeksportować swoje dane.</p>
          <div>
            <a className="button button--secondary" href="/api/export/dane">
              Eksportuj dane
            </a>
            <button
              className="button button--danger"
              type="button"
              onClick={() => setConfirm(true)}
            >
              Usuń konto
            </button>
          </div>
          {confirm && (
            <div className="delete-confirm">
              <label>
                Wpisz <strong>USUŃ KONTO</strong>, aby potwierdzić
                <input value={text} onChange={(e) => setText(e.target.value)} />
              </label>
              <button
                className="button button--danger"
                type="button"
                disabled={text !== "USUŃ KONTO"}
                onClick={remove}
              >
                Trwale usuń konto
              </button>
              <button
                className="button button--secondary"
                type="button"
                onClick={() => setConfirm(false)}
              >
                Anuluj
              </button>
            </div>
          )}
          {error && (
            <p className="form-alert" role="alert">
              {error}
            </p>
          )}
        </article>
      </div>
      <p>
        <Link href="/polityka-prywatnosci">
          Polityka prywatności Easy4Tutor
        </Link>
      </p>
    </section>
  );
}
