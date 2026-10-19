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
    title: "Twój dzień w jednym miejscu",
    description:
      "Tutaj zobaczysz dzisiejsze lekcje, najbliższe spotkania i ważne zadania do wykonania.",
    desktopTarget: "dashboard-overview",
  },
  {
    route: "/app/dzisiaj",
    title: "Wszystkie narzędzia pod ręką",
    description:
      "Z nawigacji przejdziesz do kalendarza, uczniów, materiałów, rezerwacji i płatności.",
    desktopTarget: "desktop-navigation",
    mobileTarget: "mobile-navigation",
  },
  {
    route: "/app/dzisiaj",
    title: "Dodawaj wszystko jednym kliknięciem",
    description:
      "To menu pozwala dodawać lekcje, uczniów, grupy, materiały, płatności i pakiety. Przewodnik nie utworzy żadnych danych.",
    desktopTarget: "desktop-global-create",
    mobileTarget: "mobile-global-create",
  },
  {
    route: "/app/kalendarz",
    title: "Planuj lekcje bez chaosu",
    description:
      "Kalendarz łączy lekcje indywidualne i grupowe, cykle oraz dostępność. Synchronizacja z Google Calendar jest opcjonalna i zależy od planu.",
    desktopTarget: "calendar-overview",
  },
  {
    route: "/app/uczniowie",
    title: "Poznaj historię każdego ucznia",
    description:
      "Profile uczniów porządkują cele, grupy, historię lekcji i najważniejszy kontekst nauki.",
    desktopTarget: "students-overview",
  },
  {
    route: "/app/materialy",
    title: "Materiały i przygotowanie lekcji",
    description:
      "W bibliotece zbierzesz materiały, szablony i pomoce potrzebne do przygotowania kolejnych zajęć.",
    desktopTarget: "materials-overview",
  },
  {
    route: "/app/rezerwacje",
    title: "Pozwól uczniom rezerwować terminy",
    description:
      "Tutaj trafiają zapisy z Twojej strony publicznej. Link rezerwacyjny i dostępne opcje zależą od konfiguracji profilu oraz planu.",
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
    input.pathname === "/app/dzisiaj" &&
    input.onboardingCompleted &&
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
