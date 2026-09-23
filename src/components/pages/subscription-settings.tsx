"use client";

import { CalendarClock, Check, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { useAppData } from "@/hooks/use-app-data";
import { useSessionTeacher } from "../app-shell";
import { PageLoading } from "../ui/loading";

export function SubscriptionSettings() {
  const session = useSessionTeacher();
  const { data, isPending } = useAppData(session.id);
  const [checkout, setCheckout] = useState<"monthly" | "annual" | null>(null);
  const [checkoutError, setCheckoutError] = useState("");
  if (isPending || !data) return <PageLoading />;
  const subscription = data.teacher.subscription;
  async function startCheckout(plan: "monthly" | "annual") {
    setCheckout(plan);
    setCheckoutError("");
    try {
      const response = await fetch("/api/payu/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const body = (await response.json()) as {
        redirectUrl?: string;
        message?: string;
      };
      if (!response.ok || !body.redirectUrl) throw new Error(body.message);
      window.location.assign(body.redirectUrl);
    } catch {
      setCheckoutError("Nie udało się rozpocząć płatności. Spróbuj ponownie.");
      setCheckout(null);
    }
  }
  const end = subscription.trialEndsAt
    ? new Intl.DateTimeFormat("pl-PL", {
        dateStyle: "long",
        timeZone: data.teacher.timezone,
      }).format(new Date(subscription.trialEndsAt))
    : null;
  return (
    <section className="settings-panel settings-panel--subscription">
      <div className="settings-copy">
        <p className="eyebrow">Dostęp do easy4tutor</p>
        <h2>Subskrypcja</h2>
        <p>
          Po zakończeniu opłaconego okresu dane pozostaną dostępne do odczytu i
          eksportu.
        </p>
      </div>
      <div className="subscription-card">
        <div className="subscription-status">
          <CalendarClock size={21} />
          <span>
            <small>Aktualny status</small>
            <strong>
              {subscription.readOnly
                ? "Tylko do odczytu"
                : subscription.status === "trial"
                  ? "Okres próbny"
                  : subscription.status === "past_due"
                    ? "Płatność zaległa"
                    : subscription.status === "cancelled"
                      ? "Anulowana"
                      : "Aktywna"}
            </strong>
            {end && subscription.status === "trial" && (
              <p>Bezpłatny dostęp do {end}</p>
            )}
            {subscription.renewsAt && (
              <p>
                Odnowienie:{" "}
                {new Intl.DateTimeFormat("pl-PL", {
                  dateStyle: "long",
                  timeZone: data.teacher.timezone,
                }).format(new Date(subscription.renewsAt))}
              </p>
            )}
            {subscription.tier === "founder" && (
              <p>Plan Founder · 29 zł / miesiąc</p>
            )}
          </span>
        </div>
        <div className="price-choice">
          <article>
            <strong>39 zł</strong>
            <span>/ miesiąc</span>
            <p>
              <Check size={15} />
              Pełna wersja produktu
            </p>
            <button
              className="button button--secondary"
              disabled={
                Boolean(checkout) ||
                data.integrations.payu.status === "not_configured"
              }
              onClick={() => startCheckout("monthly")}
            >
              {checkout === "monthly" && (
                <LoaderCircle className="spin" size={16} />
              )}
              Wybierz miesiąc
            </button>
          </article>
          <article>
            <strong>390 zł</strong>
            <span>/ rok</span>
            <p>
              <Check size={15} />
              Oszczędzasz 78 zł rocznie
            </p>
            <button
              className="button button--secondary"
              disabled={
                Boolean(checkout) ||
                data.integrations.payu.status === "not_configured"
              }
              onClick={() => startCheckout("annual")}
            >
              {checkout === "annual" && (
                <LoaderCircle className="spin" size={16} />
              )}
              Wybierz rok
            </button>
          </article>
        </div>
        {data.integrations.payu.status === "not_configured" ? (
          <div className="integration-note">
            Płatności PayU są chwilowo niedostępne. Żadna opłata nie została
            pobrana.
          </div>
        ) : (
          <div className="integration-note">
            Status subskrypcji zmieni się dopiero po potwierdzeniu płatności
            przez PayU.
          </div>
        )}
        {checkoutError && (
          <div className="form-alert" role="alert">
            {checkoutError}
          </div>
        )}
      </div>
    </section>
  );
}
