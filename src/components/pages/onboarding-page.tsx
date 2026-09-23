"use client";

import {
  CalendarCheck,
  Check,
  CircleUserRound,
  LoaderCircle,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCompleteOnboarding, useAppData } from "@/hooks/use-app-data";
import { resolveEntitlements } from "@/lib/entitlements";
import { deriveOnboardingProgress } from "@/lib/onboarding";
import { useSessionTeacher } from "../app-shell";
import { useAppUi } from "../app-ui-context";
import { PageLoading } from "../ui/loading";

export function OnboardingPage() {
  const session = useSessionTeacher();
  const router = useRouter();
  const { data, isPending, error, refetch } = useAppData(session.id);
  const completion = useCompleteOnboarding(session.id);
  const { openStudentComposer, openLessonComposer, showError } = useAppUi();

  if (isPending) return <PageLoading />;
  if (error || !data) {
    return (
      <div className="route-error" role="alert">
        <h1>Nie udało się wczytać pierwszych kroków</h1>
        <p>Odśwież dane i spróbuj ponownie.</p>
        <button className="button button--secondary" onClick={() => refetch()}>
          Spróbuj ponownie
        </button>
      </div>
    );
  }

  const progress = deriveOnboardingProgress(data);
  const activeStudents = data.students.filter(
    (student) => student.status === "active",
  );
  const firstStudent = activeStudents[0];
  const entitlements = resolveEntitlements(data.teacher.subscription);
  const requiredDone = [
    progress.profileReady,
    progress.firstStudent,
    progress.firstLesson,
  ].filter(Boolean).length;
  const canFinish = requiredDone === 3;
  const readOnly = data.teacher.subscription.readOnly;

  async function finish() {
    try {
      await completion.mutateAsync();
      router.push("/app/dzisiaj");
      router.refresh();
    } catch (failure) {
      showError(failure);
      void refetch();
    }
  }

  return (
    <div className="onboarding-page page-enter">
      <header className="onboarding-header">
        <div>
          <p className="eyebrow">Pierwsze kroki</p>
          <h1>Skonfiguruj easy4tutor</h1>
          <p>Zajmie to tylko kilka minut.</p>
        </div>
        <div
          className="onboarding-progress"
          aria-label={`${requiredDone} z 3 wymaganych kroków gotowe`}
        >
          <strong>{requiredDone}/3</strong>
          <span>wymagane kroki</span>
        </div>
      </header>

      <ol className="onboarding-checklist">
        <OnboardingStep
          number={1}
          title="Profil nauczyciela"
          complete={progress.profileReady}
          icon={<CircleUserRound size={21} aria-hidden="true" />}
          description={
            progress.profileReady
              ? "Imię i strefa czasowa są gotowe."
              : "Uzupełnij imię i strefę czasową, żeby plan był wyświetlany poprawnie."
          }
        >
          {!progress.profileReady && (
            <Link
              className="button button--secondary"
              href="/app/ustawienia/profil"
            >
              Uzupełnij profil
            </Link>
          )}
        </OnboardingStep>

        <OnboardingStep
          number={2}
          title={
            progress.firstStudent
              ? "Pierwszy uczeń dodany"
              : "Dodaj pierwszego ucznia"
          }
          complete={progress.firstStudent}
          icon={<UserPlus size={21} aria-hidden="true" />}
          description={
            firstStudent
              ? `${firstStudent.name} jest gotowy do planowania lekcji.`
              : "Uczeń będzie podstawą kalendarza, lekcji i rozliczeń."
          }
        >
          {!progress.firstStudent && (
            <button
              className="button button--secondary"
              disabled={readOnly}
              onClick={() => openStudentComposer(undefined, "onboarding")}
            >
              Dodaj ucznia
            </button>
          )}
        </OnboardingStep>

        <OnboardingStep
          number={3}
          title={
            progress.firstLesson
              ? "Pierwsza lekcja zaplanowana"
              : "Zaplanuj pierwszą lekcję"
          }
          complete={progress.firstLesson}
          disabled={!progress.firstStudent}
          icon={<CalendarCheck size={21} aria-hidden="true" />}
          description={
            progress.firstLesson
              ? "Twój prawdziwy plan pracy jest już w kalendarzu."
              : progress.firstStudent
                ? "Dodaj termin, żeby zobaczyć swój prawdziwy plan pracy."
                : "Najpierw dodaj aktywnego ucznia, dla którego zaplanujesz termin."
          }
        >
          {!progress.firstLesson && progress.firstStudent && (
            <button
              className="button button--secondary"
              disabled={readOnly}
              onClick={() =>
                openLessonComposer({
                  studentIds: firstStudent ? [firstStudent.id] : undefined,
                  afterCreate: "onboarding",
                })
              }
            >
              Zaplanuj lekcję
            </button>
          )}
        </OnboardingStep>

        <OnboardingStep
          number={4}
          title="Połącz Google Calendar"
          complete={progress.googleConnected}
          optional
          icon={<CalendarCheck size={21} aria-hidden="true" />}
          description={
            progress.googleConnected
              ? "Google Calendar jest połączony."
              : "Zobacz zajętość i synchronizuj lekcje z kalendarzem Google."
          }
        >
          {!progress.googleConnected &&
            (entitlements.googleCalendar ? (
              <Link
                className="button button--secondary"
                href="/app/ustawienia/integracje"
              >
                Połącz Google Calendar
              </Link>
            ) : (
              <div className="onboarding-plan-note">
                <span>Dostępne w planie Pro</span>
                <Link className="text-link" href="/app/ustawienia/subskrypcja">
                  Zobacz plan Pro
                </Link>
              </div>
            ))}
        </OnboardingStep>
      </ol>

      {readOnly && (
        <p className="onboarding-readonly" role="status">
          Konto jest w trybie tylko do odczytu. Aktywuj subskrypcję, aby dodać
          ucznia lub lekcję.
        </p>
      )}

      <footer className="onboarding-footer">
        <button
          className="button button--primary"
          disabled={!canFinish || completion.isPending}
          onClick={finish}
        >
          {completion.isPending && (
            <LoaderCircle className="spin" size={17} aria-hidden="true" />
          )}
          Gotowe — przejdź do Dzisiaj
        </button>
        <Link className="button button--quiet" href="/app/dzisiaj">
          Zrobię to później
        </Link>
      </footer>
    </div>
  );
}

function OnboardingStep({
  number,
  title,
  description,
  complete,
  disabled = false,
  optional = false,
  icon,
  children,
}: {
  number: number;
  title: string;
  description: string;
  complete: boolean;
  disabled?: boolean;
  optional?: boolean;
  icon: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <li
      className={`onboarding-step${complete ? " is-complete" : ""}${disabled ? " is-disabled" : ""}`}
    >
      <span className="onboarding-step__number" aria-hidden="true">
        {complete ? <Check size={18} /> : number}
      </span>
      <span className="onboarding-step__icon" aria-hidden="true">
        {icon}
      </span>
      <div className="onboarding-step__body">
        <div className="onboarding-step__title">
          <h2>{title}</h2>
          {optional && <span>Opcjonalnie</span>}
        </div>
        <p>{description}</p>
        <span className="sr-only">
          {complete
            ? "Krok ukończony."
            : disabled
              ? "Krok jeszcze niedostępny."
              : "Krok do wykonania."}
        </span>
      </div>
      {children && <div className="onboarding-step__action">{children}</div>}
    </li>
  );
}
