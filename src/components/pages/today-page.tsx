"use client";

import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  Clock3,
  ExternalLink,
  Plus,
  UserPlus,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";
import { useDashboardData } from "@/hooks/use-app-data";
import { useMinuteClock } from "@/hooks/use-minute-clock";
import type { DashboardAttentionItem, DashboardLesson } from "@/lib/dashboard";
import { formatDay, formatShortDay, formatTime } from "@/lib/format";
import { useSessionTeacher } from "../app-shell";
import { useAppUi } from "../app-ui-context";
import { LessonStatusBadge } from "../ui/status-badge";

export function TodayPage() {
  const session = useSessionTeacher();
  const { data, isPending, error, refetch } = useDashboardData(session.id);
  const { openLessonComposer, openStudentComposer } = useAppUi();
  const now = useMinuteClock();
  const temporal = useMemo(
    () =>
      data
        ? lessonContext(data.todaysLessons, now, data.teacher.timezone)
        : null,
    [data, now],
  );

  if (isPending) return <TodayDashboardLoading />;
  if (error || !data) {
    return (
      <div className="route-error" role="alert">
        <AlertTriangle size={22} aria-hidden="true" />
        <h1>Nie udało się wczytać planu dnia</h1>
        <p>Spróbuj ponownie. Twoje zapisane dane są bezpieczne.</p>
        <button className="button button--secondary" onClick={() => refetch()}>
          Spróbuj ponownie
        </button>
      </div>
    );
  }

  const timezone = data.teacher.timezone;
  const isNewTutor = data.studentCount === 0;
  const onboardingIncomplete = !session.onboardingCompletedAt;
  const nextUpcoming = data.upcomingLessons[0];
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

      {onboardingIncomplete && (
        <section
          className="onboarding-reminder"
          aria-labelledby="onboarding-reminder-title"
        >
          <div>
            <p className="eyebrow">Pierwsze kroki</p>
            <h2 id="onboarding-reminder-title">
              Dokończ konfigurację easy4tutor
            </h2>
            <p>
              Dodaj ucznia i pierwszą lekcję, żeby uruchomić pełny przepływ
              pracy.
            </p>
          </div>
          <Link className="button button--secondary" href="/app/start">
            Dokończ konfigurację
            <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </section>
      )}

      {data.partialErrors.length > 0 && (
        <div className="dashboard-partial-error" role="status">
          <AlertTriangle size={18} aria-hidden="true" />
          <span>
            Nie udało się wczytać części danych. Główny plan dnia jest aktualny.
          </span>
          <button className="text-link" onClick={() => refetch()}>
            Spróbuj ponownie
          </button>
        </div>
      )}

      {isNewTutor ? (
        <NewTutorState
          readOnly={data.teacher.readOnly}
          showAction={!onboardingIncomplete}
          onAddStudent={() => openStudentComposer()}
        />
      ) : (
        <div className="today-dashboard__layout">
          <main className="today-dashboard__main">
            <section className="today-schedule" aria-labelledby="today-heading">
              <div className="dashboard-section-heading">
                <div>
                  <p className="eyebrow">Dzisiaj</p>
                  <h2 id="today-heading">Plan dnia</h2>
                </div>
                <span className="dashboard-section-count">
                  {lessonCount(data.todaysLessons.length)}
                </span>
              </div>

              {temporal && data.todaysLessons.length > 0 && (
                <div className={`day-context day-context--${temporal.kind}`}>
                  <span className="day-context__pulse" aria-hidden="true" />
                  <div>
                    <strong>{temporal.label}</strong>
                    {temporal.lesson && (
                      <span>{temporal.lesson.participantLabel}</span>
                    )}
                  </div>
                </div>
              )}

              {data.todaysLessons.length > 0 ? (
                <ol className="today-lesson-list">
                  {data.todaysLessons.map((lesson) => (
                    <TodayLessonRow
                      key={lesson.id}
                      lesson={lesson}
                      timezone={timezone}
                      now={now}
                      emphasized={temporal?.lesson?.id === lesson.id}
                    />
                  ))}
                </ol>
              ) : (
                <TodayEmptyState
                  next={nextUpcoming}
                  timezone={timezone}
                  readOnly={data.teacher.readOnly}
                  onAddLesson={() => openLessonComposer()}
                />
              )}
            </section>

            <AttentionSection items={data.attentionItems} />
          </main>

          <aside
            className="today-dashboard__rail"
            aria-label="Dalszy plan dnia"
          >
            <UpcomingSection
              lessons={data.upcomingLessons}
              timezone={timezone}
            />
            <QuickActions
              readOnly={data.teacher.readOnly}
              onAddLesson={() => openLessonComposer()}
              onAddStudent={() => openStudentComposer()}
            />
            <MonthlySummary
              lessonCount={data.monthlySummary.lessonCount}
              teachingMinutes={data.monthlySummary.teachingMinutes}
              activeStudents={data.monthlySummary.activeStudents}
              unavailable={data.partialErrors.includes("monthly_summary")}
            />
          </aside>
        </div>
      )}
    </div>
  );
}

function TodayLessonRow({
  lesson,
  timezone,
  now,
  emphasized,
}: {
  lesson: DashboardLesson;
  timezone: string;
  now: Date;
  emphasized: boolean;
}) {
  const joinAvailable =
    Boolean(lesson.meetingUrl) &&
    now.getTime() >= Date.parse(lesson.startsAt) - 30 * 60_000 &&
    now.getTime() <= Date.parse(lesson.endsAt);
  const meta = [lesson.subject, lesson.level].filter(Boolean).join(" · ");

  return (
    <li
      className={`today-lesson${emphasized ? " today-lesson--emphasized" : ""}${lesson.status === "completed" ? " today-lesson--completed" : ""}`}
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
              {meta || lesson.topic || "Temat do ustalenia"}
              {lesson.participantCount > 1
                ? ` · ${lesson.participantCount} uczniów`
                : ` · ${lesson.durationMinutes} min`}
            </p>
          </div>
          <LessonStatusBadge status={lesson.status} />
        </div>
        <div className="today-lesson__actions">
          {joinAvailable && lesson.meetingUrl && (
            <a
              className="button button--secondary"
              href={lesson.meetingUrl}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={16} aria-hidden="true" />
              Dołącz
            </a>
          )}
          <Link className="text-link" href={`/app/lekcje/${lesson.id}`}>
            Otwórz lekcję <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </li>
  );
}

function AttentionSection({ items }: { items: DashboardAttentionItem[] }) {
  return (
    <section
      className="dashboard-attention"
      aria-labelledby="attention-heading"
    >
      <div className="dashboard-section-heading">
        <div>
          <p className="eyebrow">Wymaga uwagi</p>
          <h2 id="attention-heading">Do zrobienia</h2>
        </div>
        {items.length > 0 && (
          <span
            className="attention-count"
            aria-label={`${items.length} spraw`}
          >
            {items.length}
          </span>
        )}
      </div>
      {items.length > 0 ? (
        <ul className="attention-list">
          {items.map((item) => (
            <li
              key={item.id}
              className={`attention-item attention-item--${item.type}`}
            >
              <span className="attention-item__marker" aria-hidden="true" />
              <div>
                <strong>{item.title}</strong>
                <p>{item.detail}</p>
              </div>
              <Link className="text-link" href={item.href}>
                {item.actionLabel} <ArrowRight size={15} aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="dashboard-calm-state">Wszystko jest na bieżąco.</p>
      )}
    </section>
  );
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
      className="dashboard-rail-section"
      aria-labelledby="upcoming-heading"
    >
      <div className="dashboard-section-heading dashboard-section-heading--compact">
        <div>
          <p className="eyebrow">Nadchodzące</p>
          <h2 id="upcoming-heading">Co dalej</h2>
        </div>
        <Link
          className="icon-link"
          href="/app/kalendarz"
          aria-label="Otwórz kalendarz"
        >
          <CalendarDays size={18} aria-hidden="true" />
        </Link>
      </div>
      {lessons.length > 0 ? (
        <ol className="upcoming-list">
          {lessons.slice(0, 5).map((lesson, index) => {
            const previous = lessons[index - 1];
            const day = formatShortDay(lesson.startsAt, timezone);
            const previousDay = previous
              ? formatShortDay(previous.startsAt, timezone)
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
                    <small>
                      {[lesson.subject, lesson.level]
                        .filter(Boolean)
                        .join(" · ")}
                    </small>
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
      <Link className="text-link dashboard-rail-link" href="/app/kalendarz">
        Otwórz kalendarz <ArrowRight size={15} aria-hidden="true" />
      </Link>
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
    <section className="dashboard-rail-section" aria-labelledby="quick-heading">
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
  lessonCount,
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
            <dd>{lessonCount}</dd>
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
        Czas obejmuje tylko uzupełnione lekcje.
      </p>
    </section>
  );
}

function TodayEmptyState({
  next,
  timezone,
  readOnly,
  onAddLesson,
}: {
  next?: DashboardLesson;
  timezone: string;
  readOnly: boolean;
  onAddLesson: () => void;
}) {
  return (
    <div className="today-empty">
      <span className="today-empty__line" aria-hidden="true" />
      <div>
        <h3>Brak lekcji na dziś</h3>
        <p>
          {next
            ? `Następna: ${capitalize(formatShortDay(next.startsAt, timezone))} o ${formatTime(next.startsAt, timezone)} — ${next.participantLabel}.`
            : "Najbliższe 14 dni są jeszcze wolne."}
        </p>
      </div>
      <button
        className="button button--secondary"
        disabled={readOnly}
        onClick={onAddLesson}
      >
        <Plus size={17} aria-hidden="true" />
        Dodaj lekcję
      </button>
    </div>
  );
}

function NewTutorState({
  readOnly,
  showAction,
  onAddStudent,
}: {
  readOnly: boolean;
  showAction: boolean;
  onAddStudent: () => void;
}) {
  return (
    <section className="new-tutor-state" aria-labelledby="welcome-heading">
      <div className="new-tutor-state__intro">
        <p className="eyebrow">Pierwszy krok</p>
        <h2 id="welcome-heading">Zacznij od pierwszego ucznia</h2>
        <p>
          Dodaj kartę ucznia, a potem od razu zaplanuj pierwszą lekcję. Resztę
          dnia ułożysz już w kalendarzu.
        </p>
        {showAction && (
          <button
            className="button button--primary"
            disabled={readOnly}
            onClick={onAddStudent}
          >
            <UserPlus size={18} aria-hidden="true" />
            Dodaj pierwszego ucznia
          </button>
        )}
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

function lessonContext(
  lessons: DashboardLesson[],
  now: Date,
  timezone: string,
) {
  const current = lessons.find(
    (lesson) =>
      lesson.status !== "completed" &&
      now.getTime() >= Date.parse(lesson.startsAt) &&
      now.getTime() < Date.parse(lesson.endsAt),
  );
  if (current) {
    return {
      kind: "current" as const,
      label: `Lekcja trwa do ${formatTime(current.endsAt, timezone)}`,
      lesson: current,
    };
  }
  const next = lessons.find(
    (lesson) =>
      lesson.status === "scheduled" &&
      Date.parse(lesson.startsAt) > now.getTime(),
  );
  if (next) {
    const minutes = Math.max(
      1,
      Math.round((Date.parse(next.startsAt) - now.getTime()) / 60_000),
    );
    return {
      kind: "next" as const,
      label:
        minutes < 60
          ? `Następna lekcja za ${minutes} min`
          : `Następna lekcja o ${formatTime(next.startsAt, timezone)}`,
      lesson: next,
    };
  }
  return {
    kind: "done" as const,
    label: "Na dziś to już wszystko",
    lesson: undefined,
  };
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
