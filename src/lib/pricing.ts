import type {
  BillingInterval,
  SubscriptionStatus,
  SubscriptionTier,
} from "@/lib/domain";

export const FREE_PRICE_GROSZ = 0;
export const PRO_MONTHLY_PRICE_GROSZ = 4_499;
export const PRO_ANNUAL_PRICE_GROSZ = 39_900;
export const FOUNDER_MONTHLY_PRICE_GROSZ = 2_999;
export const TRIAL_DAYS = 14;
export const FOUNDER_SLOT_LIMIT = 50;

export const ANNUAL_SAVING_GROSZ =
  PRO_MONTHLY_PRICE_GROSZ * 12 - PRO_ANNUAL_PRICE_GROSZ;

export const FREE_FEATURES = [
  "Do 3 aktywnych uczniów",
  "Kalendarz, lekcje i dostępność",
  "Notatki i zadania domowe",
  "Płatności i pakiety",
  "Podstawowe statystyki",
] as const;

export const PRO_FEATURES = [
  "Bez limitu aktywnych uczniów",
  "Google Calendar",
  "Przypomnienia Telegram",
  "Zaawansowane statystyki",
  "Automatyzacje",
  "Przyszłe funkcje Pro",
] as const;

export function priceForBillingInterval(interval: BillingInterval): number {
  return interval === "annual"
    ? PRO_ANNUAL_PRICE_GROSZ
    : PRO_MONTHLY_PRICE_GROSZ;
}

export function checkoutPrice(
  interval: BillingInterval,
  founderEligible: boolean,
): number {
  return interval === "monthly" && founderEligible
    ? FOUNDER_MONTHLY_PRICE_GROSZ
    : priceForBillingInterval(interval);
}

export function formatPrice(grosz: number): string {
  return new Intl.NumberFormat("pl-PL", {
    style: "currency",
    currency: "PLN",
    minimumFractionDigits: grosz % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })
    .format(grosz / 100)
    .replace(/\u00a0/g, " ");
}

export function monthlyAnnualEquivalentGrosz(): number {
  return Math.round(PRO_ANNUAL_PRICE_GROSZ / 12);
}

export type SubscriptionPresentation = {
  plan: "Free" | "Pro" | "Founder";
  variant: "free" | "trial" | "pro-monthly" | "pro-annual" | "founder";
  priceGrosz?: number;
  priceSuffix?: string;
};

export function subscriptionPresentation(subscription: {
  status: SubscriptionStatus;
  tier: SubscriptionTier;
  billingInterval?: BillingInterval;
}): SubscriptionPresentation {
  if (subscription.status === "trial") {
    return { plan: "Pro", variant: "trial" };
  }
  if (subscription.tier === "founder") {
    return {
      plan: "Founder",
      variant: "founder",
      priceGrosz: FOUNDER_MONTHLY_PRICE_GROSZ,
      priceSuffix: "/ miesiąc",
    };
  }
  if (subscription.tier === "pro") {
    const interval = subscription.billingInterval ?? "monthly";
    return {
      plan: "Pro",
      variant: interval === "annual" ? "pro-annual" : "pro-monthly",
      priceGrosz: priceForBillingInterval(interval),
      priceSuffix: interval === "annual" ? "/ rok" : "/ miesiąc",
    };
  }
  return { plan: "Free", variant: "free", priceGrosz: FREE_PRICE_GROSZ };
}

export function remainingTrialDays(
  trialEndsAt: string,
  now = new Date(),
): number {
  const remainingMs = Date.parse(trialEndsAt) - now.getTime();
  return Math.max(0, Math.ceil(remainingMs / 86_400_000));
}
