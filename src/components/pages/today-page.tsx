"use client";

import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  CircleDollarSign,
  Clock3,
  Link2,
  NotebookPen,
  PackageX,
  Plus,
  UserPlus,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { useDashboardData } from "@/hooks/use-app-data";
import { useMinuteClock } from "@/hooks/use-minute-clock";
import type {
  DashboardBriefingPreview,
  DashboardLesson,
  TodayAction,
} from "@/lib/dashboard";
import { formatDay, formatShortDay, formatTime } from "@/lib/format";
import { useSessionTeacher } from "../app-shell";
import { useAppUi } from "../app-ui-context";
import { LessonStatusBadge } from "../ui/status-badge";

export function TodayPage() {
  const session = useSessionTeacher();
  const { data, isPending, error, refetch } = useDashboardData(session.id);
  const { openLessonComposer, openStudentComposer } = useAppUi();
  const now = useMinuteClock();
  const currentLessonId = useMemo(
    () =>
      data?.todaysLessons.find(
        (lesson) =>
          !["completed", "cancelled", "no_show"].includes(lesson.status) &&
          Date.parse(lesson.startsAt) <= now.getTime() &&
          now.getTime() < Date.parse(lesson.endsAt),
      )?.id,
    [data, now],
  );

  if (isPending) return <TodayDashboardLoading />;
  if (error || !data) {
    return (
      <div className="route-error" role="alert">
        <AlertTriangle size={22} aria-hidden="true" />
        <h1>Nie udało się wczytać dzisiejszego planu</h1>
        <p>Spróbuj ponownie. Twoje zapisane dane są bezpieczne.</p>
        <button className="button button--secondary" onClick={() => refetch()}>
          Spróbuj ponownie
        </button>
      </div>
    );
  }

  const timezone = data.teacher.timezone;
  const isNewTutor = data.studentCount === 0;
  const teacherName = data.teacher.name.trim().split(/\s+/)[0];

  return (
    <div className="today-dashboard page-enter">
      <header className="today-dashboard__header">
        <div>
          <p className="eyebrow">Twój dzień w easy4tutor</p>
          <h1>Dzień dobry{teacherName ? `, ${teacherName}` : ""}</h1>
          <p className="today-dashboard__date">
            {capitalize(formatDay(now, timezone))}
          </p>
        </div>
        {!isNewTutor && (
          <button
            className="button button--primary today-dashboard__primary-action"
            disabled={data.teacher.readOnly}
            onClick={() => openLessonComposer()}
          >
            <Plus size={18} aria-hidden="true" />
            Dodaj lekcję
          </button>
        )}
      </header>

      {data.partialErrors.length > 0 && (
        <div className="dashboard-partial-error" role="status">
          <AlertTriangle size={18} aria-hidden="true" />
          <span>
            Część dodatkowego kontekstu jest chwilowo niedostępna. Plan lekcji
            pozostaje aktualny.
          </span>
          <button className="text-link" onClick={() => refetch()}>
            Spróbuj ponownie
          </button>
        </div>
      )}

      {isNewTutor ? (
        <NewTutorState
          readOnly={data.teacher.readOnly}
          onboardingIncomplete={!session.onboardingCompletedAt}
          onAddStudent={() => openStudentComposer()}
          onAddLesson={() => openLessonComposer()}
        />
      ) : (
        <div className="today-action-grid">
          <div className="today-action-grid__main">
            <NextLessonSection
              lesson={data.nextLesson}
              timezone={timezone}
              current={Boolean(data.nextLesson?.id === currentLessonId)}
            />
            <TodayLessonsSection
              lessons={data.todaysLessons}
              timezone={timezone}
              currentLessonId={currentLessonId}
              readOnly={data.teacher.readOnly}
              onAddLesson={() => openLessonComposer()}
            />
          </div>
          <aside
            className="today-action-grid__rail"
            aria-label="Dzisiejsze działania"
          >
            <ActionSection
              items={data.actions}
              hiddenCount={data.hiddenActionCount}
            />
            <QuickActions
              readOnly={data.teacher.readOnly}
              onAddLesson={() => openLessonComposer()}
              onAddStudent={() => openStudentComposer()}
            />
          </aside>
          <UpcomingSection lessons={data.upcomingLessons} timezone={timezone} />
          <MonthlySummary
            lessonCount={data.monthlySummary.lessonCount}
            teachingMinutes={data.monthlySummary.teachingMinutes}
            activeStudents={data.monthlySummary.activeStudents}
            unavailable={data.partialErrors.includes("monthly_summary")}
          />
        </div>
      )}
    </div>
  );
}

function NextLessonSection({
  lesson,
  timezone,
  current,
}: {
  lesson?: DashboardLesson & { briefing?: DashboardBriefingPreview };
  timezone: string;
  current: boolean;
}) {
  return (
    <section className="next-lesson-card" aria-labelledby="next-lesson-heading">
      <div className="next-lesson-card__topline">
        <div>
          <p className="eyebrow">{current ? "Teraz" : "Co dalej"}</p>
          <h2 id="next-lesson-heading">
            {current ? "Trwająca lekcja" : "Następna lekcja"}
          </h2>
        </div>
        {lesson && (
          <span
            className={`next-lesson-card__state${current ? " is-current" : ""}`}
          >
            {current ? "Teraz" : "Dzisiaj"}
          </span>
        )}
      </div>
      {lesson ? (
        <div className="next-lesson-card__content">
          <div className="next-lesson-card__identity">
            <p className="next-lesson-card__time">
              <time dateTime={lesson.startsAt}>
                {formatTime(lesson.startsAt, timezone)}
              </time>
              <span aria-hidden="true">–</span>
              <time dateTime={lesson.endsAt}>
                {formatTime(lesson.endsAt, timezone)}
              </time>
            </p>
            <h3>{lesson.participantLabel}</h3>
            <p>{[lesson.level, lesson.topic].filter(Boolean).join(" · ")}</p>
          </div>
          <BriefingPreview preview={lesson.briefing} />
          <Link
            className="button button--primary"
            href={`/app/lekcje/${lesson.id}`}
          >
            Otwórz lekcję <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </div>
      ) : (
        <div className="next-lesson-card__empty">
          <p>Nie masz już dziś kolejnej lekcji.</p>
          <span>Nadchodzący plan znajdziesz niżej.</span>
        </div>
      )}
    </section>
  );
}

function BriefingPreview({ preview }: { preview?: DashboardBriefingPreview }) {
  if (!preview) {
    return (
      <p className="briefing-preview briefing-preview--muted">
        Kontekst przygotowania jest chwilowo niedostępny.
      </p>
    );
  }
  if (preview.kind === "first_lesson") {
    return (
      <p className="briefing-preview">
        <strong>Pierwsza lekcja z tym uczniem.</strong>
      </p>
    );
  }
  if (preview.kind === "group") {
    return (
      <div className="briefing-preview">
        <strong>{preview.participantCount} uczniów</strong>
        <span>
          Kontekst zapisany dla {preview.contextCount} z{" "}
          {preview.participantCount} uczniów
        </span>
      </div>
    );
  }
  if (!preview.lastProgress && !preview.difficulty && !preview.nextStep) {
    return (
      <p className="briefing-preview">
        <strong>Kontekst ucznia jest zapisany.</strong>
      </p>
    );
  }
  return (
    <dl className="briefing-preview briefing-preview--details">
      {preview.lastProgress && (
        <div>
          <dt>Ostatnio</dt>
          <dd>{preview.lastProgress}</dd>
        </div>
      )}
      {preview.difficulty && (
        <div>
          <dt>Problem</dt>
          <dd>{preview.difficulty}</dd>
        </div>
      )}
      {preview.nextStep && (
        <div>
          <dt>Dalej</dt>
          <dd>{preview.nextStep}</dd>
        </div>
      )}
    </dl>
  );
}

function TodayLessonsSection({
  lessons,
  timezone,
  currentLessonId,
  readOnly,
  onAddLesson,
}: {
  lessons: DashboardLesson[];
  timezone: string;
  currentLessonId?: string;
  readOnly: boolean;
  onAddLesson: () => void;
}) {
  return (
    <section className="today-schedule" aria-labelledby="today-heading">
      <div className="dashboard-section-heading">
        <div>
          <p className="eyebrow">Chronologia</p>
          <h2 id="today-heading">Dzisiejsze lekcje</h2>
        </div>
        <span className="dashboard-section-count">
          {lessonCount(lessons.length)}
        </span>
      </div>
      {lessons.length ? (
        <ol className="today-lesson-list">
          {lessons.map((lesson) => (
            <TodayLessonRow
              key={lesson.id}
              lesson={lesson}
              timezone={timezone}
              current={lesson.id === currentLessonId}
            />
          ))}
        </ol>
      ) : (
        <div className="today-empty">
          <span className="today-empty__line" aria-hidden="true" />
          <div>
            <h3>Na dziś nie masz zaplanowanych lekcji.</h3>
            <p>
              Możesz spokojnie przygotować kolejne zajęcia albo dodać nową
              lekcję.
            </p>
          </div>
          <button
            className="button button--secondary"
            disabled={readOnly}
            onClick={onAddLesson}
          >
            <Plus size={17} aria-hidden="true" /> Dodaj lekcję
          </button>
        </div>
      )}
    </section>
  );
}

function TodayLessonRow({
  lesson,
  timezone,
  current,
}: {
  lesson: DashboardLesson;
  timezone: string;
  current: boolean;
}) {
  const actionLabel =
    lesson.status === "needs_completion"
      ? "Zakończ lekcję"
      : lesson.status === "completed" || lesson.status === "no_show"
        ? "Otwórz"
        : "Otwórz lekcję";
  return (
    <li
      className={`today-lesson${current ? " today-lesson--emphasized" : ""}${lesson.status === "completed" ? " today-lesson--completed" : ""}`}
    >
      <div className="today-lesson__time">
        <time dateTime={lesson.startsAt}>
          {formatTime(lesson.startsAt, timezone)}
        </time>
        <span>{formatTime(lesson.endsAt, timezone)}</span>
      </div>
      <span className="today-lesson__rail" aria-hidden="true" />
      <div className="today-lesson__body">
        <div className="today-lesson__identity">
          <div>
            <h3>{lesson.participantLabel}</h3>
            <p>
              {lesson.topic || "Lekcja"}
              {lesson.participantCount > 1
                ? ` · ${lesson.participantCount} uczniów`
                : ""}
            </p>
          </div>
          {current ? (
            <span className="status-badge status-badge--current">
              <Clock3 size={14} aria-hidden="true" />
              Teraz
            </span>
          ) : (
            <LessonStatusBadge status={lesson.status} />
          )}
        </div>
        <div className="today-lesson__actions">
          <Link className="text-link" href={`/app/lekcje/${lesson.id}`}>
            {actionLabel} <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </li>
  );
}

function ActionSection({
  items,
  hiddenCount,
}: {
  items: TodayAction[];
  hiddenCount: number;
}) {
  return (
    <section
      className="dashboard-attention"
      aria-labelledby="attention-heading"
    >
      <div className="dashboard-section-heading">
        <div>
          <p className="eyebrow">Priorytety</p>
          <h2 id="attention-heading">Do zrobienia</h2>
        </div>
        {items.length > 0 && (
          <span
            className="attention-count"
            aria-label={`${items.length + hiddenCount} spraw`}
          >
            {items.length + hiddenCount}
          </span>
        )}
      </div>
      {items.length ? (
        <ul className="attention-list">
          {items.map((item) => {
            const Icon = actionIcon(item.type);
            return (
              <li
                key={item.id}
                className={`attention-item attention-item--${item.severity}`}
              >
                <span className="attention-item__icon" aria-hidden="true">
                  <Icon size={17} />
                </span>
                <div>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </div>
                <Link className="text-link" href={item.href}>
                  {item.actionLabel} <ArrowRight size={15} aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="dashboard-calm-state">
          Nie ma teraz nic pilnego do zrobienia.
        </p>
      )}
      {hiddenCount > 0 && (
        <p className="attention-more">
          + {hiddenCount} kolejnych spraw — najważniejsze są pokazane powyżej.
        </p>
      )}
    </section>
  );
}

function actionIcon(type: TodayAction["type"]) {
  if (type === "package_problem") return PackageX;
  if (type === "overdue_finance") return CircleDollarSign;
  if (type === "google_reconnect") return Link2;
  if (type === "missing_continuity") return NotebookPen;
  return Clock3;
}

function UpcomingSection({
  lessons,
  timezone,
}: {
  lessons: DashboardLesson[];
  timezone: string;
}) {
  return (
    <section
      className="dashboard-rail-section dashboard-upcoming"
      aria-labelledby="upcoming-heading"
    >
      <div className="dashboard-section-heading dashboard-section-heading--compact">
        <div>
          <p className="eyebrow">Następne 14 dni</p>
          <h2 id="upcoming-heading">Nadchodzące</h2>
        </div>
        <Link
          className="icon-link"
          href="/app/kalendarz"
          aria-label="Otwórz kalendarz"
        >
          <CalendarDays size={18} aria-hidden="true" />
        </Link>
      </div>
      {lessons.length ? (
        <ol className="upcoming-list">
          {lessons.slice(0, 5).map((lesson, index) => {
            const day = formatShortDay(lesson.startsAt, timezone);
            const previousDay = index
              ? formatShortDay(lessons[index - 1].startsAt, timezone)
              : null;
            return (
              <li key={lesson.id}>
                {day !== previousDay && (
                  <p className="upcoming-list__day">{capitalize(day)}</p>
                )}
                <Link href={`/app/lekcje/${lesson.id}`}>
                  <time>{formatTime(lesson.startsAt, timezone)}</time>
                  <span>
                    <strong>{lesson.participantLabel}</strong>
                    <small>{lesson.topic || "Lekcja"}</small>
                  </span>
                  <ArrowRight size={15} aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="dashboard-calm-state">
          Brak kolejnych lekcji w najbliższych 14 dniach.
        </p>
      )}
    </section>
  );
}

function QuickActions({
  readOnly,
  onAddLesson,
  onAddStudent,
}: {
  readOnly: boolean;
  onAddLesson: () => void;
  onAddStudent: () => void;
}) {
  return (
    <section
      className="dashboard-rail-section dashboard-quick"
      aria-labelledby="quick-heading"
    >
      <div className="dashboard-section-heading dashboard-section-heading--compact">
        <div>
          <p className="eyebrow">Szybkie działania</p>
          <h2 id="quick-heading">Dodaj</h2>
        </div>
      </div>
      <div className="quick-actions">
        <button disabled={readOnly} onClick={onAddLesson}>
          <Plus size={18} aria-hidden="true" />
          Lekcję
        </button>
        <button disabled={readOnly} onClick={onAddStudent}>
          <UserPlus size={18} aria-hidden="true" />
          Ucznia
        </button>
        <Link
          href="/app/uczniowie/grupy?action=new"
          aria-disabled={readOnly}
          onClick={(event) => readOnly && event.preventDefault()}
        >
          <Users size={18} aria-hidden="true" />
          Grupę
        </Link>
        <Link
          href="/app/kalendarz?action=block"
          aria-disabled={readOnly}
          onClick={(event) => readOnly && event.preventDefault()}
        >
          <Clock3 size={18} aria-hidden="true" />
          Czas
        </Link>
      </div>
    </section>
  );
}

function MonthlySummary({
  lessonCount: count,
  teachingMinutes,
  activeStudents,
  unavailable,
}: {
  lessonCount: number;
  teachingMinutes: number;
  activeStudents: number;
  unavailable: boolean;
}) {
  return (
    <section
      className="dashboard-rail-section monthly-summary"
      aria-labelledby="month-heading"
    >
      <div className="dashboard-section-heading dashboard-section-heading--compact">
        <div>
          <p className="eyebrow">Ten miesiąc</p>
          <h2 id="month-heading">W skrócie</h2>
        </div>
      </div>
      {unavailable ? (
        <p className="dashboard-calm-state">
          Podsumowanie jest chwilowo niedostępne.
        </p>
      ) : (
        <dl>
          <div>
            <dt>Lekcje</dt>
            <dd>{count}</dd>
          </div>
          <div>
            <dt>Czas nauczania</dt>
            <dd>{teachingTime(teachingMinutes)}</dd>
          </div>
          <div>
            <dt>Aktywni uczniowie</dt>
            <dd>{activeStudents}</dd>
          </div>
        </dl>
      )}
      <p className="monthly-summary__note">
        Czas obejmuje tylko zakończone lekcje.
      </p>
    </section>
  );
}

function NewTutorState({
  readOnly,
  onboardingIncomplete,
  onAddStudent,
  onAddLesson,
}: {
  readOnly: boolean;
  onboardingIncomplete: boolean;
  onAddStudent: () => void;
  onAddLesson: () => void;
}) {
  return (
    <section className="new-tutor-state" aria-labelledby="welcome-heading">
      <div className="new-tutor-state__intro">
        <p className="eyebrow">Pierwszy krok</p>
        <h2 id="welcome-heading">Zacznij od pierwszego ucznia</h2>
        <p>
          Dodaj kartę ucznia, a potem zaplanuj pierwszą lekcję. Dzisiaj stanie
          się Twoim codziennym planem pracy.
        </p>
        <div className="new-tutor-state__actions">
          <button
            className="button button--primary"
            disabled={readOnly}
            onClick={onAddStudent}
          >
            <UserPlus size={18} aria-hidden="true" />
            Dodaj ucznia
          </button>
          <button
            className="button button--secondary"
            disabled={readOnly}
            onClick={onAddLesson}
          >
            <Plus size={18} aria-hidden="true" />
            Zaplanuj lekcję
          </button>
          {onboardingIncomplete && (
            <Link className="text-link" href="/app/start">
              Dokończ konfigurację <ArrowRight size={16} aria-hidden="true" />
            </Link>
          )}
        </div>
      </div>
      <ol className="new-tutor-steps">
        <li>
          <span>1</span>
          <strong>Dodaj ucznia</strong>
        </li>
        <li>
          <span>2</span>
          <strong>Zaplanuj lekcję</strong>
        </li>
        <li>
          <span>3</span>
          <strong>Otwieraj plan każdego dnia</strong>
        </li>
      </ol>
    </section>
  );
}

function TodayDashboardLoading() {
  return (
    <div className="today-dashboard-loading" aria-label="Ładowanie planu dnia">
      <div className="skeleton skeleton--title" />
      <div className="today-dashboard-loading__grid">
        <div>
          <div className="skeleton skeleton--wide" />
          <div className="skeleton skeleton--wide" />
        </div>
        <div>
          <div className="skeleton skeleton--card" />
          <div className="skeleton skeleton--wide" />
        </div>
      </div>
    </div>
  );
}

function lessonCount(count: number) {
  if (count === 1) return "1 lekcja";
  const last = count % 10;
  const lastTwo = count % 100;
  return `${count} ${last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14) ? "lekcje" : "lekcji"}`;
}

function teachingTime(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (!hours) return `${remainder} min`;
  return remainder ? `${hours} godz. ${remainder} min` : `${hours} godz.`;
}

function capitalize(value: string) {
  return value.charAt(0).toLocaleUpperCase("pl-PL") + value.slice(1);
}
