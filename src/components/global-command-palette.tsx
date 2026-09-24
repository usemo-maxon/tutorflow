"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  CalendarDays,
  CalendarPlus,
  CircleDollarSign,
  Clock3,
  PackagePlus,
  ReceiptText,
  Search,
  Settings,
  User,
  UserPlus,
  Users,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import type { GlobalCreateAction } from "@/lib/global-create";
import {
  availableGlobalCreateCommands,
  EMPTY_GLOBAL_SEARCH_RESPONSE,
  filterGlobalCommands,
  GLOBAL_NAVIGATION_COMMANDS,
  GLOBAL_SEARCH_MIN_QUERY_LENGTH,
  normalizeGlobalSearch,
  type GlobalSearchResponse,
} from "@/lib/global-search";

export interface GlobalCommandPaletteHandle {
  open: (trigger?: HTMLElement | null) => void;
}

interface PaletteItem {
  key: string;
  label: string;
  meta?: string;
  badge?: string;
  icon: LucideIcon;
  activate: () => void;
}

interface PaletteCategory {
  id: string;
  label: string;
  items: PaletteItem[];
}

const navigationIcons: Record<string, LucideIcon> = {
  today: Clock3,
  calendar: CalendarDays,
  students: Users,
  groups: UsersRound,
  payments: CircleDollarSign,
  statistics: BarChart3,
  settings: Settings,
};

const createIcons: Record<GlobalCreateAction, LucideIcon> = {
  lesson: CalendarPlus,
  student: UserPlus,
  group: UsersRound,
  block: Clock3,
  payment: ReceiptText,
  package: PackagePlus,
};

async function fetchGlobalSearch(
  query: string,
  signal: AbortSignal,
): Promise<GlobalSearchResponse> {
  const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
    signal,
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error("GLOBAL_SEARCH_FAILED");
  return response.json() as Promise<GlobalSearchResponse>;
}

export const GlobalCommandPalette = forwardRef<
  GlobalCommandPaletteHandle,
  {
    readOnly: boolean;
    timezone: string;
    onCreate: (action: GlobalCreateAction) => void;
  }
>(function GlobalCommandPalette({ readOnly, timezone, onCreate }, ref) {
  const router = useRouter();
  const pathname = usePathname();
  const inputRef = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const restoreFocusRef = useRef(true);
  const previousPathnameRef = useRef(pathname);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const listId = useId();
  const normalizedQuery = normalizeGlobalSearch(query);

  const openPalette = useCallback(
    (trigger?: HTMLElement | null) => {
      returnFocusRef.current =
        trigger ?? (document.activeElement as HTMLElement);
      restoreFocusRef.current = true;
      setQuery("");
      setDebouncedQuery("");
      setSelectedKey(readOnly ? "nav:today" : "create:lesson");
      setOpen(true);
    },
    [readOnly],
  );

  const closePalette = useCallback((restoreFocus = true) => {
    restoreFocusRef.current = restoreFocus;
    setOpen(false);
    setQuery("");
    setDebouncedQuery("");
    setSelectedKey(null);
  }, []);

  useImperativeHandle(ref, () => ({ open: openPalette }), [openPalette]);

  useEffect(() => {
    function onShortcut(event: KeyboardEvent) {
      if (
        event.key.toLocaleLowerCase() !== "k" ||
        (!event.ctrlKey && !event.metaKey)
      )
        return;
      if (event.altKey || event.shiftKey) return;
      event.preventDefault();
      if (open) inputRef.current?.focus();
      else openPalette();
    }
    document.addEventListener("keydown", onShortcut);
    return () => document.removeEventListener("keydown", onShortcut);
  }, [open, openPalette]);

  useEffect(() => {
    if (previousPathnameRef.current !== pathname && open) closePalette(false);
    previousPathnameRef.current = pathname;
  }, [closePalette, open, pathname]);

  useEffect(() => {
    if (!open || normalizedQuery.length < GLOBAL_SEARCH_MIN_QUERY_LENGTH) {
      setDebouncedQuery("");
      return;
    }
    const timer = window.setTimeout(
      () => setDebouncedQuery(normalizedQuery),
      200,
    );
    return () => window.clearTimeout(timer);
  }, [normalizedQuery, open]);

  const entitySearch = useQuery({
    queryKey: ["global-search", debouncedQuery],
    queryFn: ({ signal }) => fetchGlobalSearch(debouncedQuery, signal),
    enabled: open && debouncedQuery.length >= GLOBAL_SEARCH_MIN_QUERY_LENGTH,
    staleTime: 30_000,
  });
  const entities =
    debouncedQuery === normalizedQuery
      ? (entitySearch.data ?? EMPTY_GLOBAL_SEARCH_RESPONSE)
      : EMPTY_GLOBAL_SEARCH_RESPONSE;

  const categories = useMemo<PaletteCategory[]>(() => {
    const activateRoute = (href: string) => {
      closePalette(false);
      router.push(href);
    };
    const staticCreate = filterGlobalCommands(
      availableGlobalCreateCommands(readOnly),
      normalizedQuery,
    ).map((command): PaletteItem => ({
      key: `create:${command.id}`,
      label: command.label,
      icon: createIcons[command.id],
      activate: () => {
        closePalette(false);
        onCreate(command.id);
      },
    }));
    const staticNavigation = filterGlobalCommands(
      GLOBAL_NAVIGATION_COMMANDS,
      normalizedQuery,
    ).map((command): PaletteItem => ({
      key: `nav:${command.id}`,
      label: command.label,
      icon: navigationIcons[command.id] ?? Search,
      activate: () => activateRoute(command.href),
    }));
    const next: PaletteCategory[] = [
      { id: "create", label: "Szybkie działania", items: staticCreate },
      { id: "navigation", label: "Nawigacja", items: staticNavigation },
      {
        id: "students",
        label: "Uczniowie",
        items: entities.students.map((student) => ({
          key: `student:${student.id}`,
          label: student.name,
          meta: [student.subject, student.level].filter(Boolean).join(" · "),
          badge: student.status === "archived" ? "Archiwalny" : undefined,
          icon: User,
          activate: () => activateRoute(student.href),
        })),
      },
      {
        id: "groups",
        label: "Grupy",
        items: entities.groups.map((group) => ({
          key: `group:${group.id}`,
          label: group.name,
          meta: [group.subject, group.level].filter(Boolean).join(" · "),
          badge: group.status === "archived" ? "Archiwalna" : undefined,
          icon: UsersRound,
          activate: () => activateRoute(group.href),
        })),
      },
      {
        id: "lessons",
        label: "Lekcje",
        items: entities.lessons.map((lesson) => ({
          key: `lesson:${lesson.id}`,
          label: lesson.participantLabel,
          meta: [
            lesson.topic || lesson.subject,
            new Intl.DateTimeFormat("pl-PL", {
              day: "numeric",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
              timeZone: timezone,
            }).format(new Date(lesson.startsAt)),
          ]
            .filter(Boolean)
            .join(" · "),
          icon: CalendarDays,
          activate: () => activateRoute(lesson.href),
        })),
      },
    ];
    return next.filter((category) => category.items.length > 0);
  }, [
    closePalette,
    entities,
    normalizedQuery,
    onCreate,
    readOnly,
    router,
    timezone,
  ]);

  const items = useMemo(
    () => categories.flatMap((category) => category.items),
    [categories],
  );

  useEffect(() => {
    if (!open) return;
    setSelectedKey((current) =>
      current && items.some((item) => item.key === current)
        ? current
        : (items[0]?.key ?? null),
    );
  }, [items, open]);

  useEffect(() => {
    if (!selectedKey) return;
    document
      .getElementById(`${listId}-${selectedKey}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [listId, selectedKey]);

  function onInputKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!items.length) return;
    const current = Math.max(
      0,
      items.findIndex((item) => item.key === selectedKey),
    );
    let next: number | null = null;
    if (event.key === "ArrowDown") next = (current + 1) % items.length;
    if (event.key === "ArrowUp")
      next = (current - 1 + items.length) % items.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = items.length - 1;
    if (event.key === "Enter") {
      event.preventDefault();
      items[current]?.activate();
      return;
    }
    if (next !== null) {
      event.preventDefault();
      setSelectedKey(items[next]?.key ?? null);
    }
  }

  const waitingForDebounce =
    normalizedQuery.length >= GLOBAL_SEARCH_MIN_QUERY_LENGTH &&
    debouncedQuery !== normalizedQuery;
  const loading = waitingForDebounce || entitySearch.isFetching;
  const failed =
    debouncedQuery === normalizedQuery && entitySearch.isError && !loading;
  const noResults =
    normalizedQuery.length >= GLOBAL_SEARCH_MIN_QUERY_LENGTH &&
    !loading &&
    !failed &&
    items.length === 0;

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) closePalette(true);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay command-palette-overlay" />
        <Dialog.Content
          className="command-palette"
          aria-describedby={`${listId}-description`}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            window.setTimeout(() => inputRef.current?.focus(), 0);
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (restoreFocusRef.current) {
              window.setTimeout(() => returnFocusRef.current?.focus(), 0);
            }
          }}
          onEscapeKeyDown={() => {
            restoreFocusRef.current = true;
          }}
          onPointerDownOutside={() => {
            restoreFocusRef.current = true;
          }}
        >
          <Dialog.Title className="sr-only">Wyszukaj w easy4tutor</Dialog.Title>
          <Dialog.Description id={`${listId}-description`} className="sr-only">
            Wyszukaj stronę, działanie, ucznia, grupę lub lekcję.
          </Dialog.Description>
          <div className="command-palette__search">
            <Search size={21} aria-hidden="true" />
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onInputKeyDown}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded="true"
              aria-controls={listId}
              aria-activedescendant={
                selectedKey ? `${listId}-${selectedKey}` : undefined
              }
              autoComplete="off"
              spellCheck={false}
              placeholder="Szukaj ucznia, grupy, lekcji lub działania..."
            />
            <Dialog.Close
              className="icon-button"
              aria-label="Zamknij wyszukiwanie"
            >
              <X size={19} />
            </Dialog.Close>
          </div>

          <div id={listId} className="command-palette__results" role="listbox">
            {categories.map((category) => {
              const headingId = `${listId}-${category.id}`;
              return (
                <section
                  key={category.id}
                  className="command-palette__group"
                  role="group"
                  aria-labelledby={headingId}
                >
                  <h2 id={headingId}>{category.label}</h2>
                  {category.items.map((item) => {
                    const Icon = item.icon;
                    const selected = selectedKey === item.key;
                    return (
                      <button
                        id={`${listId}-${item.key}`}
                        key={item.key}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        className={selected ? "is-selected" : undefined}
                        onPointerMove={() => setSelectedKey(item.key)}
                        onClick={item.activate}
                      >
                        <span
                          className="command-palette__icon"
                          aria-hidden="true"
                        >
                          <Icon size={18} />
                        </span>
                        <span className="command-palette__copy">
                          <strong>{item.label}</strong>
                          {item.meta && <small>{item.meta}</small>}
                        </span>
                        {item.badge && (
                          <span className="command-palette__badge">
                            {item.badge}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </section>
              );
            })}
            {loading && (
              <p className="command-palette__state" role="status">
                Szukam...
              </p>
            )}
            {failed && (
              <p
                className="command-palette__state command-palette__state--error"
                role="status"
              >
                Nie udało się wyszukać danych. Spróbuj ponownie.
              </p>
            )}
            {noResults && (
              <p className="command-palette__state" role="status">
                Brak wyników dla „{query.trim()}”
              </p>
            )}
          </div>
          <footer className="command-palette__footer" aria-hidden="true">
            <span>↑↓ wybierz</span>
            <span>Enter otwórz</span>
            <span>Esc zamknij</span>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
});
