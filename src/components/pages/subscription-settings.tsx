"use client";

import {
  CalendarClock,
  Check,
  Crown,
  LoaderCircle,
  Sparkles,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { resolveEntitlements } from "@/lib/entitlements";
import {
  ANNUAL_SAVING_GROSZ,
  FOUNDER_MONTHLY_PRICE_GROSZ,
  FREE_FEATURES,
  formatPrice,
  monthlyAnnualEquivalentGrosz,
  PRO_ANNUAL_PRICE_GROSZ,
  PRO_FEATURES,
  PRO_MONTHLY_PRICE_GROSZ,
  remainingTrialDays,
  subscriptionPresentation,
  TRIAL_DAYS,
} from "@/lib/pricing";
import { useAppData } from "@/hooks/use-app-data";
import { useSessionTeacher } from "../app-shell";
import { PageLoading } from "../ui/loading";

type BillingChoice = "monthly" | "annual";

export function SubscriptionSettings({
  payment,
}: {
  payment?: "processing" | "failed" | "cancelled";
}) {
  const session = useSessionTeacher();
  const { data, isPending } = useAppData(session.id);
  const [billing, setBilling] = useState<BillingChoice>("annual");
  const [checkout, setCheckout] = useState<BillingChoice | null>(null);
  const [checkoutError, setCheckoutError] = useState("");
  const [founderAvailable, setFounderAvailable] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/payu/checkout")
      .then(async (response) => {
        if (!response.ok) return { founderAvailable: false };
        return (await response.json()) as { founderAvailable?: boolean };
      })
      .then((result) => {
        if (active) setFounderAvailable(result.founderAvailable === true);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  if (isPending || !data) return <PageLoading />;

  const subscription = data.teacher.subscription;
  const presentation = subscriptionPresentation(subscription);
  const entitlements = resolveEntitlements(subscription);
  const activeStudents = data.students.filter(
    (student) => student.status === "active",
  ).length;
  const canPurchase =
    subscription.status === "trial" || subscription.tier === "free";
  const isFounder = subscription.tier === "founder";
  const selectedPrice =
    billing === "annual"
      ? PRO_ANNUAL_PRICE_GROSZ
      : founderAvailable
        ? FOUNDER_MONTHLY_PRICE_GROSZ
        : PRO_MONTHLY_PRICE_GROSZ;

  async function startCheckout(plan: BillingChoice) {
    if (checkout) return;
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

  const formattedTrialEnd = subscription.trialEndsAt
    ? formatDate(subscription.trialEndsAt, data.teacher.timezone)
    : null;
  const formattedRenewal = subscription.renewsAt
    ? formatDate(subscription.renewsAt, data.teacher.timezone)
    : null;

  return (
    <section className="settings-panel settings-panel--subscription">
      <div className="settings-copy">
        <p className="eyebrow">Plan i rozliczenia</p>
        <h2>Subskrypcja</h2>
        <p>
          Sprawdź swój plan, porównaj możliwości i wybierz rozliczenie, które
          pasuje do Twojej pracy.
        </p>
      </div>

      <div className="subscription-content">
        {payment && (
          <div
            className={`subscription-message subscription-message--${payment}`}
            role="status"
          >
            {payment === "processing"
              ? "Płatność jest weryfikowana. Plan zmieni się dopiero po potwierdzeniu przez PayU."
              : "Płatność nie została ukończona. Twój dotychczasowy plan nie zmienił się."}
          </div>
        )}

        <article className="current-plan-card" aria-labelledby="current-plan">
          <div className="current-plan-icon" aria-hidden="true">
            <CalendarClock size={22} />
          </div>
          <div className="current-plan-copy">
            <span className="plan-label">Twój plan</span>
            <h3 id="current-plan">
              {presentation.plan}
              {presentation.variant === "trial" && " — okres próbny"}
            </h3>
            {presentation.variant === "trial" && subscription.trialEndsAt && (
              <p>
                Pozostało {remainingTrialDays(subscription.trialEndsAt)} dni z{" "}
                {TRIAL_DAYS}-dniowego okresu próbnego. Po jego zakończeniu
                możesz korzystać z Free lub aktywować Pro.
              </p>
            )}
            {presentation.variant === "trial" && formattedTrialEnd && (
              <small>Okres próbny kończy się {formattedTrialEnd}.</small>
            )}
            {presentation.variant === "free" && (
              <p>
                {activeStudents} z {entitlements.maxActiveStudents} aktywnych
                uczniów. Twoje dotychczasowe dane pozostają dostępne.
              </p>
            )}
            {presentation.variant === "founder" && (
              <p>
                Pełny dostęp Pro · specjalna cena Founder ·{" "}
                {formatPrice(FOUNDER_MONTHLY_PRICE_GROSZ)} / miesiąc
              </p>
            )}
            {(presentation.variant === "pro-monthly" ||
              presentation.variant === "pro-annual") && (
              <p>
                {formatPrice(presentation.priceGrosz ?? 0)}{" "}
                {presentation.priceSuffix}
              </p>
            )}
            {formattedRenewal && <small>Odnowienie: {formattedRenewal}</small>}
          </div>
          <span className="current-plan-badge">Aktywny</span>
        </article>

        <div className="current-plan-benefits">
          <h3>Co masz w planie</h3>
          <p>
            {entitlements.maxActiveStudents === null
              ? "Nielimitowani aktywni uczniowie oraz wszystkie dostępne funkcje Pro."
              : `Pełna organizacja lekcji dla maksymalnie ${entitlements.maxActiveStudents} aktywnych uczniów.`}
          </p>
        </div>

        <div className="pricing-heading">
          <div>
            <p className="eyebrow">Porównaj plany</p>
            <h3>
              Free i Pro
              {(founderAvailable || isFounder) && " oraz oferta Founder"}
            </h3>
          </div>
          <div className="billing-toggle" aria-label="Okres rozliczeniowy">
            <button
              type="button"
              aria-pressed={billing === "monthly"}
              onClick={() => setBilling("monthly")}
            >
              Miesięcznie
            </button>
            <button
              type="button"
              aria-pressed={billing === "annual"}
              onClick={() => setBilling("annual")}
            >
              Rocznie
            </button>
          </div>
        </div>

        <div className="subscription-pricing-grid">
          <PlanCard
            title="Free"
            label={presentation.variant === "free" ? "Twój plan" : undefined}
            price="0 zł"
            description="Dla korepetytorów, którzy dopiero zaczynają."
            features={FREE_FEATURES}
          />

          <PlanCard
            featured
            title="Pro"
            label={
              presentation.plan === "Pro"
                ? "Twój plan"
                : "Najczęściej wybierany"
            }
            price={
              billing === "annual"
                ? `${formatPrice(PRO_ANNUAL_PRICE_GROSZ)} / rok`
                : `${formatPrice(PRO_MONTHLY_PRICE_GROSZ)} / miesiąc`
            }
            kicker={`Od ${formatPrice(monthlyAnnualEquivalentGrosz())} / mies. przy płatności rocznej`}
            description={
              billing === "annual"
                ? `Oszczędzasz ${formatPrice(ANNUAL_SAVING_GROSZ)} rocznie.`
                : "Pełne wsparcie codziennej pracy korepetytora."
            }
            features={PRO_FEATURES}
          >
            {canPurchase && (
              <button
                className="button button--primary plan-card-cta"
                type="button"
                disabled={
                  Boolean(checkout) ||
                  data.integrations.payu.status === "not_configured"
                }
                onClick={() => startCheckout(billing)}
              >
                {checkout === billing && (
                  <LoaderCircle className="spin" size={16} />
                )}
                {subscription.status === "trial" ? "Aktywuj" : "Przejdź na"}{" "}
                {billing === "monthly" && founderAvailable
                  ? `Founder — ${formatPrice(selectedPrice)}`
                  : `Pro — ${formatPrice(selectedPrice)}`}
              </button>
            )}
          </PlanCard>

          {(founderAvailable || isFounder) && (
            <PlanCard
              title="Founder"
              label={isFounder ? "Twój plan" : "Oferta Founder"}
              icon={<Crown size={18} aria-hidden="true" />}
              price={`${formatPrice(FOUNDER_MONTHLY_PRICE_GROSZ)} / miesiąc`}
              description="Pełny Pro w specjalnej cenie dla pierwszych użytkowników."
              features={["Wszystkie możliwości Pro", "Cena Founder"]}
            >
              {canPurchase && founderAvailable && (
                <button
                  className="button button--secondary plan-card-cta"
                  type="button"
                  disabled={
                    Boolean(checkout) ||
                    data.integrations.payu.status === "not_configured"
                  }
                  onClick={() => {
                    setBilling("monthly");
                    void startCheckout("monthly");
                  }}
                >
                  {checkout === "monthly" && (
                    <LoaderCircle className="spin" size={16} />
                  )}
                  Wybierz ofertę Founder
                </button>
              )}
            </PlanCard>
          )}
        </div>

        {subscription.status === "trial" && (
          <div className="trial-reassurance">
            <Sparkles size={18} aria-hidden="true" />
            <p>
              Teraz korzystasz z Pro za darmo. Po okresie próbnym możesz nadal
              korzystać z planu Free — nie pobierzemy opłaty automatycznie.
            </p>
          </div>
        )}

        {!canPurchase && !isFounder && (
          <p className="integration-note">
            Masz aktywny plan Pro. Zmiana okresu rozliczeniowego będzie dostępna
            w kolejnej wersji.
          </p>
        )}
        {isFounder && (
          <p className="integration-note">
            Zachowujesz plan Founder i specjalną cenę. Nie musisz przechodzić na
            zwykły plan Pro.
          </p>
        )}
        {data.integrations.payu.status === "not_configured" ? (
          <p className="integration-note">
            Płatności PayU są chwilowo niedostępne. Żadna opłata nie została
            pobrana.
          </p>
        ) : (
          <p className="integration-note">
            Plan zmieni się dopiero po potwierdzeniu płatności przez PayU.
          </p>
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

function PlanCard({
  title,
  label,
  price,
  kicker,
  description,
  features,
  featured = false,
  icon,
  children,
}: {
  title: string;
  label?: string;
  price: string;
  kicker?: string;
  description: string;
  features: readonly string[];
  featured?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <article className={`plan-card${featured ? " plan-card--featured" : ""}`}>
      <div className="plan-card-topline">
        <span className="plan-card-title">
          {icon}
          {title}
        </span>
        {label && <span className="plan-card-label">{label}</span>}
      </div>
      {kicker && <p className="plan-card-kicker">{kicker}</p>}
      <strong className="plan-card-price">{price}</strong>
      <p className="plan-card-description">{description}</p>
      <ul>
        {features.map((feature) => (
          <li key={feature}>
            <Check size={15} aria-hidden="true" /> {feature}
          </li>
        ))}
      </ul>
      {children}
    </article>
  );
}

function formatDate(value: string, timezone: string): string {
  return new Intl.DateTimeFormat("pl-PL", {
    dateStyle: "long",
    timeZone: timezone,
  }).format(new Date(value));
}
