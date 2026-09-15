"use client";

import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  ExternalLink,
  MapPin,
  Plus,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useAppData } from "@/hooks/use-app-data";
import { useMinuteClock } from "@/hooks/use-minute-clock";
import { copy } from "@/lib/copy";
import {
  formatDay,
  formatMoney,
  formatTime,
  lessonCountLabel,
  localDateKey,
} from "@/lib/format";
import { useSessionTeacher } from "../app-shell";
import { useAppUi } from "../app-ui-context";
import { ProgressThread } from "../progress-thread";
import { EmptyState } from "../ui/empty-state";
import { PageLoading } from "../ui/loading";
import { LessonStatusBadge, PaymentBadge } from "../ui/status-badge";

export function TodayPage() {
  const session = useSessionTeacher();
  const { data, isPending, error, refetch } = useAppData(session.id);
  const { openLessonComposer, openStudentComposer } = useAppUi();
  const [showAllPending, setShowAllPending] = useState(false);
  const now = useMinuteClock();
  const timezone = data?.teacher.timezone ?? session.timezone;

  const derived = useMemo(() => {
    if (!data) return null;
    const todayKey = localDateKey(now, timezone);
    const today = data.lessons.filter(
      (lesson) =>
        localDateKey(lesson.startsAt, timezone) === todayKey &&
        lesson.status !== "cancelled",
    );
    const next = data.lessons.find(
      (lesson) =>
        lesson.status === "scheduled" && new Date(lesson.startsAt) > now,
    );
    const pending = data.lessons.filter(
      (lesson) => lesson.status === "needs_completion",
    );
    const unpaid = data.lessons.flatMap((lesson) =>
      lesson.participants.filter(
        (participant) => participant.paymentStatus === "unpaid",
      ),
    ).length;
    return { today, next, pending, unpaid };
  }, [data, timezone, now]);

  if (isPending) return <PageLoading />;
  if (error || !data || !derived)
    return (
      <div className="route-error" role="alert">
        <AlertTriangle size={22} />
        <h1>Nie udało się wczytać planu dnia.</h1>
        <button className="button button--secondary" onClick={() => refetch()}>
          {copy.actions.retry}
        </button>
      </div>
    );

  const nextStudent = derived.next
    ? data.students.find(
        (student) => student.id === derived.next?.participantIds[0],
      )
    : undefined;
  const hasActiveStudents = data.students.some(
    (student) => student.status === "active",
  );
  const startPlanning = () =>
    hasActiveStudents ? openLessonComposer() : openStudentComposer();
  return (
    <div
      className={`today-page page-enter${data.students.length === 0 ? " today-page--new" : !derived.next ? " today-page--no-next" : ""}`}
    >
      <header className="page-header">
        <div>
          <p className="eyebrow">Dzisiaj, po Twojemu</p>
          <h1>{capitalize(formatDay(now, timezone))}</h1>
        </div>
        <button
          className="button button--primary desktop-primary"
          disabled={data.teacher.subscription.readOnly}
          onClick={startPlanning}
        >
          <Plus size={18} />
          {hasActiveStudents ? copy.actions.addLesson : "Dodaj ucznia"}
        </button>
      </header>
      <div className="today-grid">
        {data.students.length > 0 && (
          <aside className="next-lesson-card" aria-labelledby="next-title">
            <div className="section-heading">
              <span className="eyebrow" id="next-title">
                Następna lekcja
              </span>
              {derived.next && (
                <LessonStatusBadge status={derived.next.status} />
              )}
            </div>
            {derived.next && nextStudent ? (
              <>
                <div className="next-identity">
                  <time>{formatTime(derived.next.startsAt, timezone)}</time>
                  <div>
                    <h2>
                      {derived.next.participantIds.length > 1
                        ? `Grupa · ${derived.next.participantIds.length} osoby`
                        : nextStudent.name}
                    </h2>
                    {derived.next.participantIds.length > 1 && (
                      <p className="next-participants">
                        {derived.next.participantIds
                          .map(
                            (id) =>
                              data.students.find((s) => s.id === id)?.name,
                          )
                          .join(", ")}
                      </p>
                    )}
                    <p>{derived.next.topic || "Temat do ustalenia"}</p>
                  </div>
                </div>
                <div className="lesson-facts">
                  <span>
                    <CalendarDays size={16} />
                    {formatDay(derived.next.startsAt, timezone)}
                  </span>
                  <span>
                    {derived.next.format === "online" ? (
                      <ExternalLink size={16} />
                    ) : (
                      <MapPin size={16} />
                    )}
                    {derived.next.format === "online"
                      ? "Online"
                      : "Stacjonarnie"}
                  </span>
                  <span>{formatMoney(derived.next.price)}</span>
                  {derived.next.participants.length > 1 ? (
                    <span>
                      {
                        derived.next.participants.filter(
                          (p) => p.paymentStatus === "paid",
                        ).length
                      }
                      /{derived.next.participants.length} opłacono
                    </span>
                  ) : (
                    <PaymentBadge
                      status={
                        derived.next.participants[0]?.paymentStatus ?? "unpaid"
                      }
                    />
                  )}
                </div>
                <ProgressThread
                  student={nextStudent}
                  lessons={data.lessons}
                  currentLessonId={derived.next.id}
                  compact
                />
                <Link
                  href={`/app/lekcje/${derived.next.id}`}
                  className="button button--primary button--full"
                >
                  {copy.actions.openLesson}
                </Link>
              </>
            ) : (
              <EmptyState
                title={
                  hasActiveStudents
                    ? "Nie masz kolejnej lekcji. Zaplanuj termin z wybranym uczniem."
                    : "Dodaj pierwszego ucznia, aby rozpocząć planowanie."
                }
                action={
                  <button
                    className="button button--primary"
                    disabled={data.teacher.subscription.readOnly}
                    onClick={startPlanning}
                  >
                    {hasActiveStudents
                      ? copy.actions.planLesson
                      : "Dodaj ucznia"}
                  </button>
                }
              />
            )}
          </aside>
        )}
        <section className="day-plan panel" aria-labelledby="day-plan-title">
          <div className="section-heading">
            <div>
              <span className="eyebrow" id="day-plan-title">
                Dzisiejszy plan
              </span>
              <h2>{lessonCountLabel(derived.today.length)}</h2>
            </div>
            <Link className="text-link" href="/app/kalendarz">
              Pełny kalendarz <ArrowRight size={16} />
            </Link>
          </div>
          {derived.today.length ? (
            <ol className="agenda-list">
              {derived.today.map((lesson) => {
                const names = lesson.participantIds
                  .map(
                    (id) =>
                      data.students.find((student) => student.id === id)?.name,
                  )
                  .filter(Boolean);
                return (
                  <li key={lesson.id}>
                    <time>{formatTime(lesson.startsAt, timezone)}</time>
                    <span className="agenda-line" aria-hidden="true" />
                    <Link
                      href={`/app/lekcje/${lesson.id}`}
                      className="agenda-card"
                    >
                      <span>
                        <strong>{names.join(", ")}</strong>
                        <small>
                          {lesson.topic || "Temat do ustalenia"} ·{" "}
                          {lesson.durationMinutes} min
                        </small>
                      </span>
                      <LessonStatusBadge status={lesson.status} />
                    </Link>
                  </li>
                );
              })}
            </ol>
          ) : (
            <EmptyState
              title={
                hasActiveStudents
                  ? "Dziś nie masz lekcji. Wybierz wolny termin i zaplanuj kolejną."
                  : "Zacznij od karty pierwszego ucznia. Potem od razu zaplanujesz lekcję."
              }
              action={
                <button
                  className="button button--secondary"
                  disabled={data.teacher.subscription.readOnly}
                  onClick={startPlanning}
                >
                  {hasActiveStudents ? copy.actions.addLesson : "Dodaj ucznia"}
                </button>
              }
            />
          )}
        </section>
      </div>

      <section
        className="completion-section"
        aria-labelledby="completion-title"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">Po lekcjach</p>
            <h2 id="completion-title">Do uzupełnienia</h2>
          </div>
          {derived.pending.length > 0 && (
            <span className="attention-count">{derived.pending.length}</span>
          )}
        </div>
        {derived.pending.length ? (
          <div className="completion-list">
            {derived.pending
              .slice(0, showAllPending ? undefined : 4)
              .map((lesson) => (
                <Link key={lesson.id} href={`/app/lekcje/${lesson.id}`}>
                  <span className="completion-marker" aria-hidden="true" />
                  <span>
                    <strong>
                      {lesson.participantIds
                        .map(
                          (id) =>
                            data.students.find((student) => student.id === id)
                              ?.name,
                        )
                        .join(", ")}
                    </strong>
                    <small>
                      {lesson.topic || "Temat do uzupełnienia"} ·{" "}
                      {formatDay(lesson.startsAt, timezone)}
                    </small>
                  </span>
                  <span className="completion-action">
                    Uzupełnij <ArrowRight size={16} />
                  </span>
                </Link>
              ))}
          </div>
        ) : (
          <EmptyState title={copy.empty.completed} />
        )}
        {derived.pending.length > 4 && (
          <button
            className="text-link"
            onClick={() => setShowAllPending(!showAllPending)}
          >
            {showAllPending
              ? "Pokaż mniej"
              : `Pokaż wszystkie (${derived.pending.length})`}
          </button>
        )}
      </section>

      <section className="quiet-metrics" aria-label="Podsumowanie">
        <div>
          <small>Lekcje dzisiaj</small>
          <strong>{derived.today.length}</strong>
        </div>
        <div>
          <small>Nieopłacone</small>
          <strong>{derived.unpaid}</strong>
        </div>
        <div>
          <small>Aktywni uczniowie</small>
          <strong>
            {
              data.students.filter((student) => student.status === "active")
                .length
            }
          </strong>
        </div>
        {data.integrations.google.status === "error" && (
          <Link href="/app/ustawienia/integracje" className="metric-warning">
            <AlertTriangle size={18} />
            <span>
              <small>Google Calendar</small>
              <strong>1 problem</strong>
            </span>
          </Link>
        )}
      </section>
    </div>
  );
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
