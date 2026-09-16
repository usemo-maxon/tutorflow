"use client";

import { BrandLogo } from "@/components/brand-logo";

import * as Dialog from "@radix-ui/react-dialog";
import {
  BarChart3,
  CalendarDays,
  ChevronDown,
  CircleDollarSign,
  Clock3,
  LogOut,
  Menu,
  Plus,
  Settings,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  type ReactNode,
} from "react";
import { authRequest } from "@/lib/api-client";
import type { Teacher } from "@/lib/domain";
import { copy } from "@/lib/copy";
import { useAppData } from "@/hooks/use-app-data";
import { AppUiProvider, useAppUi } from "./app-ui-context";
import { LessonComposer } from "./lesson-composer";
import { StudentComposer } from "./student-composer";

const SessionContext = createContext<Teacher | null>(null);

const nav = [
  { href: "/app/dzisiaj", label: copy.nav.today, icon: Clock3 },
  { href: "/app/kalendarz", label: copy.nav.calendar, icon: CalendarDays },
  { href: "/app/uczniowie", label: copy.nav.students, icon: Users },
  { href: "/app/platnosci", label: copy.nav.payments, icon: CircleDollarSign },
  { href: "/app/statystyki", label: copy.nav.statistics, icon: BarChart3 },
  { href: "/app/ustawienia/profil", label: copy.nav.settings, icon: Settings },
];

export function AppShell({
  teacher,
  children,
}: {
  teacher: Teacher;
  children: ReactNode;
}) {
  return (
    <SessionContext.Provider value={teacher}>
      <AppUiProvider>
        <ShellBody teacher={teacher}>{children}</ShellBody>
      </AppUiProvider>
    </SessionContext.Provider>
  );
}

function ShellBody({
  teacher,
  children,
}: {
  teacher: Teacher;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { data, error, refetch } = useAppData(teacher.id);
  const {
    openLessonComposer,
    openStudentComposer,
    studentComposerOpen,
    toast,
    dismissToast,
    showError,
  } = useAppUi();
  const [online, setOnline] = useState(true);
  const [mobileMenu, setMobileMenu] = useState(false);
  const menuTrigger = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  async function logout() {
    try {
      await authRequest("logout");
      router.push("/logowanie");
      router.refresh();
    } catch (error) {
      showError(error);
    }
  }
  const readOnly = data?.teacher.subscription.readOnly;
  function startPlanning() {
    setMobileMenu(false);
    if (readOnly) {
      router.push("/app/ustawienia/subskrypcja");
      return;
    }
    if (data && !data.students.some((s) => s.status === "active"))
      openStudentComposer();
    else if (pathname !== "/app/kalendarz") router.push("/app/kalendarz");
    else openLessonComposer();
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Przejdź do treści
      </a>

      <aside className="sidebar">
        <div className="sidebar-head">
          <Link className="brand" href="/app/dzisiaj">
            <BrandLogo />
          </Link>
          <button
            className="icon-button sidebar-close"
            aria-label="Zamknij menu"
            onClick={() => setMobileMenu(false)}
          >
            <X size={20} />
          </button>
        </div>
        <button
          className="button button--secondary sidebar-add"
          aria-label="Dodaj lekcję"
          title="Dodaj lekcję"
          disabled={readOnly}
          onClick={startPlanning}
        >
          <Plus size={18} aria-hidden="true" />
          {copy.actions.addLesson}
        </button>
        <nav className="sidebar-nav" aria-label="Główna nawigacja">
          {nav.map(({ href, label, icon: Icon }) => {
            const active =
              pathname === href ||
              (href !== "/app/dzisiaj" &&
                pathname.startsWith(
                  href.startsWith("/app/ustawienia") ? "/app/ustawienia" : href,
                ));
            return (
              <Link
                key={href}
                className={active ? "active" : ""}
                href={href}
                aria-label={label}
                title={label}
                onClick={() => setMobileMenu(false)}
                aria-current={active ? "page" : undefined}
              >
                <Icon size={19} aria-hidden="true" />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="sidebar-account">
          <span className="avatar" aria-hidden="true">
            {teacher.name
              .split(" ")
              .map((part) => part[0])
              .slice(0, 2)
              .join("")}
          </span>
          <span>
            <strong>{data?.teacher.name ?? teacher.name}</strong>
            <small>
              {(data?.teacher.email ?? teacher.email) === "demo@tutorflow.local"
                ? "Konto demonstracyjne"
                : (data?.teacher.email ?? teacher.email)}
            </small>
          </span>
          <button
            className="icon-button"
            aria-label="Wyloguj się"
            onClick={logout}
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>

      <Dialog.Root open={mobileMenu} onOpenChange={setMobileMenu}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content
            className="mobile-menu-panel"
            aria-describedby={undefined}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              menuTrigger.current?.focus();
            }}
          >
            <header className="dialog-header">
              <Dialog.Title className="brand">
                <BrandLogo />
              </Dialog.Title>
              <Dialog.Close className="icon-button" aria-label="Zamknij menu">
                <X size={20} />
              </Dialog.Close>
            </header>
            <nav className="sidebar-nav" aria-label="Menu mobilne">
              {nav.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMobileMenu(false)}
                  aria-current={pathname.startsWith(href) ? "page" : undefined}
                >
                  <Icon size={20} aria-hidden="true" />
                  {label}
                </Link>
              ))}
            </nav>
            <button className="button button--quiet" onClick={logout}>
              <LogOut size={18} />
              Wyloguj się
            </button>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <header className="mobile-header">
        <button
          className="icon-button"
          aria-label="Otwórz menu"
          aria-expanded={mobileMenu}
          onClick={(event) => {
            menuTrigger.current = event.currentTarget;
            setMobileMenu(true);
          }}
        >
          <Menu size={22} />
        </button>
        <Link className="brand" href="/app/dzisiaj">
          <BrandLogo />
        </Link>
        <button
          className="icon-button icon-button--blue"
          aria-label="Dodaj lekcję"
          onClick={startPlanning}
        >
          <Plus size={21} />
        </button>
      </header>

      <main id="main-content" className="app-main" tabIndex={-1}>
        {!online && (
          <div className="offline-banner" role="status">
            Brak połączenia. Niezapisane zmiany mogą zostać utracone.
          </div>
        )}
        {data?.teacher.subscription.readOnly && (
          <div className="readonly-banner" role="status">
            Tryb tylko do odczytu. Dane i eksport są dostępne, ale zapisywanie
            wymaga aktywnej subskrypcji.{" "}
            <Link href="/app/ustawienia/subskrypcja">Sprawdź subskrypcję</Link>
          </div>
        )}

        {error && !data ? (
          <div className="route-error" role="alert">
            <h1>Nie udało się wczytać danych</h1>
            <p>
              Sprawdź połączenie i spróbuj ponownie. Twoje zapisane dane są
              bezpieczne.
            </p>
            <button
              className="button button--primary"
              onClick={() => refetch()}
            >
              Spróbuj ponownie
            </button>
          </div>
        ) : (
          children
        )}
      </main>

      <nav className="bottom-nav" aria-label="Nawigacja mobilna">
        {nav.slice(0, 3).map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={pathname.startsWith(href) ? "active" : ""}
          >
            <Icon size={20} aria-hidden="true" />
            <span>{label}</span>
          </Link>
        ))}
        <button
          aria-expanded={mobileMenu}
          onClick={(event) => {
            menuTrigger.current = event.currentTarget;
            setMobileMenu(true);
          }}
        >
          <ChevronDown size={20} aria-hidden="true" />
          <span>{copy.nav.more}</span>
        </button>
      </nav>

      <LessonComposer />
      {studentComposerOpen && <StudentComposer />}
      {toast && (
        <div
          className={`toast toast--${toast.tone ?? "success"}`}
          role={toast.tone === "error" ? "alert" : "status"}
          aria-live={toast.tone === "error" ? "assertive" : "polite"}
        >
          <span>{toast.message}</span>
          <button
            className="toast-dismiss"
            aria-label="Zamknij powiadomienie"
            onClick={dismissToast}
          >
            <X size={17} />
          </button>
          {toast.actionLabel && toast.onAction && (
            <button
              onClick={() => {
                dismissToast();
                toast.onAction?.();
              }}
            >
              {toast.actionLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function useSessionTeacher() {
  const teacher = useContext(SessionContext);
  if (!teacher)
    throw new Error("useSessionTeacher must be used within AppShell");
  return teacher;
}
