export type GlobalCreateAction =
  "lesson" | "student" | "group" | "block" | "payment" | "package";

export type PaymentsCreateAction = Extract<
  GlobalCreateAction,
  "payment" | "package"
>;

interface GlobalCreateDescriptor {
  id: GlobalCreateAction;
  label: string;
}

interface GlobalCreateGroup {
  id: "teaching" | "organization" | "finance";
  label: string;
  actions: readonly GlobalCreateDescriptor[];
}

export const GLOBAL_CREATE_GROUPS = [
  {
    id: "teaching",
    label: "Nauczanie",
    actions: [
      { id: "lesson", label: "Lekcję" },
      { id: "student", label: "Ucznia" },
      { id: "group", label: "Grupę" },
    ],
  },
  {
    id: "organization",
    label: "Organizacja",
    actions: [{ id: "block", label: "Blok czasu" }],
  },
  {
    id: "finance",
    label: "Finanse",
    actions: [
      { id: "payment", label: "Płatność" },
      { id: "package", label: "Pakiet" },
    ],
  },
] as const satisfies readonly GlobalCreateGroup[];

const GLOBAL_CREATE_ROUTES: Partial<Record<GlobalCreateAction, string>> = {
  group: "/app/uczniowie/grupy?action=new",
  block: "/app/kalendarz?action=block",
  payment: "/app/platnosci?action=payment",
  package: "/app/platnosci?action=package",
};

export function getGlobalCreateRoute(action: GlobalCreateAction) {
  return GLOBAL_CREATE_ROUTES[action] ?? null;
}

export function parsePaymentsCreateAction(
  value: string | null,
): PaymentsCreateAction | null {
  return value === "payment" || value === "package" ? value : null;
}

export function removeActionFromUrl(pathname: string, query: string) {
  const params = new URLSearchParams(query);
  params.delete("action");
  const normalized = params.toString();
  return normalized ? `${pathname}?${normalized}` : pathname;
}
