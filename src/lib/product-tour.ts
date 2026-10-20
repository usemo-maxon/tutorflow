export const PRODUCT_TOUR_VERSION = 1;

export type ProductTourStatus =
  | "not_started"
  | "in_progress"
  | "completed"
  | "skipped"
  | "invitation_dismissed";

export interface ProductTourState {
  version: number;
  status: ProductTourStatus;
  currentStep: number;
}

export interface ProductTourStep {
  route: string;
  title: string;
  description: string;
  desktopTarget: string;
  mobileTarget?: string;
}

export const MAIN_TOUR_STEPS: ProductTourStep[] = [
  {
    route: "/app/dzisiaj",
    title: "Najpierw rytm, potem klikologia",
    description:
      "Dodajesz ucznia, planujesz lekcję, a po zajęciach zapisujesz krótkie podsumowanie i zadanie. Ekran Dzisiaj pilnuje, co jest teraz i co dalej.",
    desktopTarget: "dashboard-overview",
  },
  {
    route: "/app/dzisiaj",
    title: "Tu się nie zgubisz",
    description:
      "Nawigacja prowadzi do kalendarza, uczniów, materiałów, rezerwacji, płatności i statystyk. Gdyby co — Pomoc też jest pod ręką.",
    desktopTarget: "desktop-navigation",
    mobileTarget: "mobile-navigation",
  },
  {
    route: "/app/dzisiaj",
    title: "Plus robi porządek",
    description:
      "Z jednego menu dodasz lekcję, ucznia, grupę, materiał, płatność lub pakiet. Sam przewodnik niczego nie utworzy — tylko pokazuje palcem 🙂",
    desktopTarget: "desktop-global-create",
    mobileTarget: "mobile-global-create",
  },
  {
    route: "/app/kalendarz",
    title: "Kalendarz bez Tetrisa",
    description:
      "Tutaj planujesz lekcje indywidualne, grupowe i cykle oraz ustawiasz dostępność. Synchronizacja z Google Calendar jest opcjonalna i zależy od planu.",
    desktopTarget: "calendar-overview",
  },
  {
    route: "/app/uczniowie",
    title: "Każdy uczeń ma własną historię",
    description:
      "W profilu ucznia znajdziesz cel, grupy, obecność, materiały, zadania i historię lekcji. Kontekst rośnie po każdym zapisanym podsumowaniu.",
    desktopTarget: "students-overview",
  },
  {
    route: "/app/materialy",
    title: "Materiały gotowe do ponownego użycia",
    description:
      "Biblioteka zbiera materiały, foldery i szablony. Przypisujesz je do ucznia, grupy lub lekcji, zamiast za każdym razem szukać od zera.",
    desktopTarget: "materials-overview",
  },
  {
    route: "/app/rezerwacje",
    title: "Rezerwacje bez ping-ponga",
    description:
      "Tutaj trafiają zgłoszenia ze strony publicznej; Ty nadal decydujesz, co z nimi zrobić. Link i dostępne opcje zależą od konfiguracji profilu oraz planu.",
    desktopTarget: "bookings-overview",
  },
];

export function targetForStep(step: ProductTourStep, mobile: boolean) {
  return mobile && step.mobileTarget ? step.mobileTarget : step.desktopTarget;
}

export function shouldShowTourInvitation(input: {
  pathname: string;
  onboardingCompleted: boolean;
  state: ProductTourState;
}) {
  return (
    (input.pathname === "/app/start" ||
      (input.pathname === "/app/dzisiaj" && input.onboardingCompleted)) &&
    input.state.version === PRODUCT_TOUR_VERSION &&
    input.state.status === "not_started"
  );
}

export type TourAction =
  | { type: "start" }
  | { type: "next" }
  | { type: "back" }
  | { type: "skip" }
  | { type: "complete" }
  | { type: "dismiss_invitation" }
  | { type: "restart" };

export function reduceTourState(
  state: ProductTourState,
  action: TourAction,
): ProductTourState {
  switch (action.type) {
    case "start":
    case "restart":
      return {
        version: PRODUCT_TOUR_VERSION,
        status: "in_progress",
        currentStep: 0,
      };
    case "next":
      return {
        ...state,
        status: "in_progress",
        currentStep: Math.min(
          MAIN_TOUR_STEPS.length - 1,
          state.currentStep + 1,
        ),
      };
    case "back":
      return { ...state, currentStep: Math.max(0, state.currentStep - 1) };
    case "skip":
      return { ...state, status: "skipped" };
    case "complete":
      return { ...state, status: "completed" };
    case "dismiss_invitation":
      return { ...state, status: "invitation_dismissed" };
  }
}
