import type { LessonStatus } from "@/lib/domain";
import {
  getGlobalCreateRoute,
  type GlobalCreateAction,
} from "@/lib/global-create";

export const GLOBAL_SEARCH_MIN_QUERY_LENGTH = 2;
export const GLOBAL_SEARCH_MAX_QUERY_LENGTH = 80;

export interface GlobalStudentSearchResult {
  type: "student";
  id: string;
  name: string;
  subject?: string;
  level?: string;
  status: "active" | "archived";
  href: string;
}

export interface GlobalGroupSearchResult {
  type: "group";
  id: string;
  name: string;
  subject?: string;
  level?: string;
  status: "active" | "archived";
  href: string;
}

export interface GlobalLessonSearchResult {
  type: "lesson";
  id: string;
  participantLabel: string;
  topic?: string;
  subject?: string;
  startsAt: string;
  status: LessonStatus;
  href: string;
}

export interface GlobalSearchResponse {
  students: GlobalStudentSearchResult[];
  groups: GlobalGroupSearchResult[];
  lessons: GlobalLessonSearchResult[];
}

export const EMPTY_GLOBAL_SEARCH_RESPONSE: GlobalSearchResponse = {
  students: [],
  groups: [],
  lessons: [],
};

export interface GlobalNavigationCommand {
  kind: "navigation";
  id: string;
  label: string;
  href: string;
  aliases: readonly string[];
}

export interface GlobalCreateCommand {
  kind: "create";
  id: GlobalCreateAction;
  label: string;
  href: string | null;
  aliases: readonly string[];
}

export const GLOBAL_NAVIGATION_COMMANDS = [
  {
    kind: "navigation",
    id: "today",
    label: "Dzisiaj",
    href: "/app/dzisiaj",
    aliases: ["dzis", "plan dnia"],
  },
  {
    kind: "navigation",
    id: "calendar",
    label: "Kalendarz",
    href: "/app/kalendarz",
    aliases: ["terminarz", "zajecia", "lekcje"],
  },
  {
    kind: "navigation",
    id: "students",
    label: "Uczniowie",
    href: "/app/uczniowie",
    aliases: ["uczen", "uczniowie"],
  },
  {
    kind: "navigation",
    id: "groups",
    label: "Grupy",
    href: "/app/uczniowie/grupy",
    aliases: ["grupa", "klasa"],
  },
  {
    kind: "navigation",
    id: "payments",
    label: "Płatności",
    href: "/app/platnosci",
    aliases: ["platnosc", "wplata", "finanse"],
  },
  {
    kind: "navigation",
    id: "statistics",
    label: "Statystyki",
    href: "/app/statystyki",
    aliases: ["wyniki", "raport"],
  },
  {
    kind: "navigation",
    id: "settings",
    label: "Ustawienia",
    href: "/app/ustawienia/profil",
    aliases: ["profil", "konto"],
  },
] as const satisfies readonly GlobalNavigationCommand[];

export const GLOBAL_CREATE_COMMANDS = [
  {
    kind: "create",
    id: "lesson",
    label: "Dodaj lekcję",
    href: getGlobalCreateRoute("lesson"),
    aliases: ["lekcja", "zajecia", "nowa lekcja"],
  },
  {
    kind: "create",
    id: "student",
    label: "Dodaj ucznia",
    href: getGlobalCreateRoute("student"),
    aliases: ["uczen", "uczniowie", "nowy uczen"],
  },
  {
    kind: "create",
    id: "group",
    label: "Utwórz grupę",
    href: getGlobalCreateRoute("group"),
    aliases: ["dodaj grupe", "grupa", "nowa grupa"],
  },
  {
    kind: "create",
    id: "block",
    label: "Zablokuj czas",
    href: getGlobalCreateRoute("block"),
    aliases: ["blok czasu", "niedostepnosc", "wolne"],
  },
  {
    kind: "create",
    id: "payment",
    label: "Zarejestruj płatność",
    href: getGlobalCreateRoute("payment"),
    aliases: ["platnosc", "wplata", "zaplata"],
  },
  {
    kind: "create",
    id: "package",
    label: "Utwórz pakiet",
    href: getGlobalCreateRoute("package"),
    aliases: ["pakiet", "karnet"],
  },
] as const satisfies readonly GlobalCreateCommand[];

export function normalizeGlobalSearch(value: string): string {
  return value
    .trim()
    .toLocaleLowerCase("pl-PL")
    .replaceAll("ł", "l")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

export function globalSearchMatchRank(
  query: string,
  primary: string,
  secondary: readonly string[] = [],
): number {
  const normalizedQuery = normalizeGlobalSearch(query);
  if (!normalizedQuery) return 0;
  const normalizedPrimary = normalizeGlobalSearch(primary);
  if (normalizedPrimary === normalizedQuery) return 0;
  if (normalizedPrimary.startsWith(normalizedQuery)) return 1;
  if (
    normalizedPrimary
      .split(/\s+/)
      .some((word) => word.startsWith(normalizedQuery))
  )
    return 2;
  if (normalizedPrimary.includes(normalizedQuery)) return 3;
  for (const field of secondary) {
    const normalizedField = normalizeGlobalSearch(field);
    if (normalizedField === normalizedQuery) return 4;
    if (normalizedField.startsWith(normalizedQuery)) return 5;
    if (normalizedField.includes(normalizedQuery)) return 6;
  }
  return Number.POSITIVE_INFINITY;
}

export function filterGlobalCommands<
  T extends { label: string; aliases: readonly string[] },
>(commands: readonly T[], query: string): T[] {
  const normalizedQuery = normalizeGlobalSearch(query);
  if (!normalizedQuery) return [...commands];
  return commands
    .map((command, index) => ({
      command,
      index,
      rank: globalSearchMatchRank(
        normalizedQuery,
        command.label,
        command.aliases,
      ),
    }))
    .filter(({ rank }) => Number.isFinite(rank))
    .sort((left, right) => left.rank - right.rank || left.index - right.index)
    .map(({ command }) => command);
}

export function availableGlobalCreateCommands(readOnly: boolean) {
  return readOnly ? [] : [...GLOBAL_CREATE_COMMANDS];
}
