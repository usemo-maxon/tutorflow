export const LEGAL_DOCUMENT_VERSION = "2026-10-04";
export const LEGAL_UPDATED_LABEL = "4 października 2026 r.";
export const LEGAL_CONTACT_EMAIL = "support@easy4tutor.pl";
export const COOKIE_CONSENT_VERSION = "2026-10-04";

export const legalOperator = {
  legalName: process.env.EASY4TUTOR_LEGAL_NAME?.trim() || null,
  tradingName: process.env.EASY4TUTOR_TRADING_NAME?.trim() || "Easy4Tutor",
  address: process.env.EASY4TUTOR_LEGAL_ADDRESS?.trim() || null,
  nip: process.env.EASY4TUTOR_NIP?.trim() || null,
  regon: process.env.EASY4TUTOR_REGON?.trim() || null,
  krs: process.env.EASY4TUTOR_KRS?.trim() || null,
  registrationCourt: process.env.EASY4TUTOR_REGISTRATION_COURT?.trim() || null,
  shareCapital: process.env.EASY4TUTOR_SHARE_CAPITAL?.trim() || null,
  email: LEGAL_CONTACT_EMAIL,
} as const;

export function isLegalOperatorComplete() {
  return Boolean(
    legalOperator.legalName && legalOperator.address && legalOperator.nip,
  );
}

export const subprocessors = [
  {
    name: "Supabase, Inc.",
    purpose: "Baza danych, uwierzytelnianie i przechowywanie plików",
    context: "Dane kont, Workspace i dane wprowadzane przez tutorów",
    region:
      "Region projektu skonfigurowany w Supabase; możliwe wsparcie globalne",
    transfer:
      "DPA dostawcy, SCC i inne właściwe mechanizmy, gdy mają zastosowanie",
    href: "https://supabase.com/legal/dpa",
  },
  {
    name: "Vercel Inc.",
    purpose: "Hosting aplikacji, dostarczanie treści i logi techniczne",
    context: "Dane żądań HTTP i dane przetwarzane przez funkcje serwerowe",
    region: "Infrastruktura globalna; region zależny od konfiguracji wdrożenia",
    transfer:
      "DPA dostawcy, SCC i inne właściwe mechanizmy, gdy mają zastosowanie",
    href: "https://vercel.com/legal/dpa",
  },
  {
    name: "Google LLC",
    purpose: "Google Sign-In i dobrowolna synchronizacja Google Calendar",
    context:
      "Identyfikator konta oraz dane kalendarza w zakresie przyznanych uprawnień",
    region: "Infrastruktura globalna Google",
    transfer:
      "Warunki i mechanizmy transferowe Google właściwe dla danej usługi",
    href: "https://policies.google.com/privacy",
  },
  {
    name: "PayU S.A.",
    purpose: "Obsługa płatności za płatne plany Easy4Tutor",
    context: "Dane płatnika, zamówienia i status płatności",
    region: "Polska / EOG, zgodnie z dokumentacją PayU",
    transfer: "Zgodnie z dokumentacją i warunkami PayU",
    href: "https://poland.payu.com/polityka-prywatnosci-payu/",
  },
] as const;

export const legalLinks = [
  ["/regulamin", "Regulamin"],
  ["/polityka-prywatnosci", "Polityka prywatności"],
  ["/powierzenie-danych", "Powierzenie danych"],
  ["/podprocesorzy", "Podprocesorzy"],
  ["/dane-uslugodawcy", "Dane usługodawcy"],
  ["/zglos-nielegalna-tresc", "Zgłoś nielegalną treść"],
] as const;
