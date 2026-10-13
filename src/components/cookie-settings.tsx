"use client";
import { useEffect, useState } from "react";
import { COOKIE_CONSENT_VERSION } from "@/lib/legal/config";
const KEY = "easy4tutor-cookie-consent";
type Choice = {
  version: string;
  preferences: boolean;
  analytics: false;
  marketing: false;
  recordedAt: string;
};
export function openCookieSettings() {
  window.dispatchEvent(new Event("easy4tutor:cookie-settings"));
}
export function CookieSettingsButton({ className }: { className?: string }) {
  return (
    <button className={className} type="button" onClick={openCookieSettings}>
      Ustawienia cookies
    </button>
  );
}
export function CookieSettings() {
  const [open, setOpen] = useState(false);
  const [preferences, setPreferences] = useState(false);
  useEffect(() => {
    const listener = () => {
      try {
        const saved = JSON.parse(
          localStorage.getItem(KEY) || "null",
        ) as Choice | null;
        setPreferences(saved?.preferences === true);
      } catch {}
      setOpen(true);
    };
    window.addEventListener("easy4tutor:cookie-settings", listener);
    return () =>
      window.removeEventListener("easy4tutor:cookie-settings", listener);
  }, []);
  function save() {
    const choice: Choice = {
      version: COOKIE_CONSENT_VERSION,
      preferences,
      analytics: false,
      marketing: false,
      recordedAt: new Date().toISOString(),
    };
    localStorage.setItem(KEY, JSON.stringify(choice));
    setOpen(false);
  }
  if (!open) return null;
  return (
    <div
      className="cookie-overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <section
        className="cookie-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cookie-title"
      >
        <h2 id="cookie-title">Ustawienia cookies</h2>
        <p>
          Easy4Tutor używa niezbędnych technologii do logowania, sesji i
          bezpieczeństwa. Obecnie nie używamy zewnętrznych trackerów
          analitycznych ani marketingowych.
        </p>
        <label>
          <span>
            <strong>Niezbędne</strong>
            <small>Zawsze włączone</small>
          </span>
          <input type="checkbox" checked disabled />
        </label>
        <label>
          <span>
            <strong>Preferencje</strong>
            <small>Zapamiętywanie opcjonalnych ustawień interfejsu</small>
          </span>
          <input
            type="checkbox"
            checked={preferences}
            onChange={(e) => setPreferences(e.target.checked)}
          />
        </label>
        <label>
          <span>
            <strong>Analityka</strong>
            <small>Nie jest obecnie używana</small>
          </span>
          <input type="checkbox" disabled />
        </label>
        <label>
          <span>
            <strong>Marketing</strong>
            <small>Nie jest obecnie używany</small>
          </span>
          <input type="checkbox" disabled />
        </label>
        <div>
          <button
            type="button"
            className="button button--secondary"
            onClick={() => {
              setPreferences(false);
              localStorage.setItem(
                KEY,
                JSON.stringify({
                  version: COOKIE_CONSENT_VERSION,
                  preferences: false,
                  analytics: false,
                  marketing: false,
                  recordedAt: new Date().toISOString(),
                }),
              );
              setOpen(false);
            }}
          >
            Odrzucam opcjonalne
          </button>
          <button
            type="button"
            className="button button--primary"
            onClick={save}
          >
            Zapisz wybór
          </button>
        </div>
      </section>
    </div>
  );
}
