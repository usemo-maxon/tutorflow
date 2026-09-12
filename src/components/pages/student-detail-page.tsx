"use client";

import {
  Archive,
  ArrowLeft,
  BookOpen,
  CalendarDays,
  Mail,
  Pencil,
  RotateCcw,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useAppData, useAppMutation } from "@/hooks/use-app-data";
import { copy } from "@/lib/copy";
import { formatDateTime, formatMoney } from "@/lib/format";
import { useSessionTeacher } from "../app-shell";
import { useAppUi } from "../app-ui-context";
import { ProgressThread } from "../progress-thread";
import { EmptyState } from "../ui/empty-state";
import { PageLoading } from "../ui/loading";
import { LessonStatusBadge, PaymentBadge } from "../ui/status-badge";

const tabs = [
  ["overview", "Przegląd"],
  ["lessons", "Lekcje"],
  ["progress", "Postęp"],
  ["payments", "Płatności"],
  ["materials", "Materiały"],
] as const;

export function StudentDetailPage() {
  const { studentId } = useParams<{ studentId: string }>();
  const session = useSessionTeacher();
  const { data, isPending } = useAppData(session.id);
  const mutation = useAppMutation(session.id);
  const { openStudentComposer, showToast, showError } = useAppUi();
  const searchParams = useSearchParams();
  const router = useRouter();
  if (isPending || !data) return <PageLoading />;
  const student = data.students.find((candidate) => candidate.id === studentId);
  if (!student)
    return (
      <div className="not-found">
        <h1>Nie znaleziono ucznia</h1>
        <p>Uczeń mógł zostać usunięty albo nie należy do tego konta.</p>
        <Link className="button button--secondary" href="/app/uczniowie">
          Wróć do listy
        </Link>
      </div>
    );
  const safeStudent = student;
  const related = data.lessons.filter((lesson) =>
    lesson.participantIds.includes(student.id),
  );
  const upcoming = related.filter((lesson) => lesson.status === "scheduled");
  const completed = related
    .filter((lesson) => lesson.status === "completed")
    .reverse();
  const activeTab = tabs.some(([key]) => key === searchParams.get("tab"))
    ? searchParams.get("tab")!
    : "overview";
  async function toggleArchive() {
    const next = safeStudent.status === "active" ? "archived" : "active";
    if (
      next === "archived" &&
      !window.confirm(
        "Archiwizacja ukryje ucznia podczas planowania nowych lekcji, ale zachowa całą historię. Kontynuować?",
      )
    )
      return;
    try {
      await mutation.mutateAsync({
        type: "setStudentStatus",
        studentId: safeStudent.id,
        status: next,
      });
      showToast({
        message:
          next === "archived"
            ? copy.toasts.studentArchived
            : copy.toasts.studentRestored,
      });
    } catch (error) {
      showError(error);
    }
  }
  function selectTab(tab: string) {
    const params = new URLSearchParams(searchParams);
    params.set("tab", tab);
    router.replace(`/app/uczniowie/${safeStudent.id}?${params}`, {
      scroll: false,
    });
  }
  return (
    <div className="student-detail page-enter">
      <Link className="back-link" href="/app/uczniowie">
        <ArrowLeft size={17} />
        Wszyscy uczniowie
      </Link>
      <header className="student-hero">
        <div className="student-hero-main">
          <span className="avatar avatar--large">
            {student.name
              .split(" ")
              .map((part) => part[0])
              .slice(0, 2)
              .join("")}
          </span>
          <div>
            <span className={`status-dot status-dot--${student.status}`}>
              {student.status === "active"
                ? "Aktywny uczeń"
                : "Archiwalny uczeń"}
            </span>
            <h1>{student.name}</h1>
            <p>
              {student.level || "Poziom nieustalony"} ·{" "}
              {student.goal || "Cel do uzupełnienia"}
            </p>
          </div>
        </div>
        <div className="student-hero-actions">
          {student.status === "active" && (
            <button
              className="button button--primary"
              disabled={data.teacher.subscription.readOnly}
              onClick={() =>
                router.push(`/app/kalendarz?student=${student.id}`)
              }
            >
              <CalendarDays size={18} />
              {copy.actions.planLesson}
            </button>
          )}
          <button
            className="button button--secondary"
            disabled={data.teacher.subscription.readOnly}
            onClick={() => openStudentComposer(student)}
          >
            <Pencil size={17} />
            Edytuj
          </button>
          <details className="context-actions">
            <summary aria-label="Więcej działań ucznia">Więcej</summary>
            <button
              className="button button--quiet"
              disabled={
                mutation.isPending || data.teacher.subscription.readOnly
              }
              onClick={toggleArchive}
            >
              {student.status === "active" ? (
                <Archive size={18} />
              ) : (
                <RotateCcw size={18} />
              )}
              {student.status === "active"
                ? copy.actions.archive
                : copy.actions.restore}
            </button>
          </details>
        </div>
      </header>
      <nav className="tabs" aria-label="Sekcje karty ucznia">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            className={activeTab === key ? "active" : ""}
            onClick={() => selectTab(key)}
            aria-current={activeTab === key ? "page" : undefined}
          >
            {label}
          </button>
        ))}
      </nav>
      {activeTab === "overview" && (
        <div className="student-overview">
          <section className="progress-panel panel">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Nitka postępu</p>
                <h2>Ciągłość nauki</h2>
              </div>
              <BookOpen size={21} />
            </div>
            <ProgressThread student={student} lessons={related} />
          </section>
          <aside className="student-facts panel">
            <p className="eyebrow">Profil lekcji</p>
            <dl>
              <div>
                <dt>Kontakt</dt>
                <dd>
                  <Mail size={16} aria-hidden="true" />
                  {student.contact || "Nie podano"}
                </dd>
              </div>
              <div>
                <dt>Standardowy czas</dt>
                <dd>{student.defaultDurationMinutes} min</dd>
              </div>
              <div>
                <dt>Format</dt>
                <dd>
                  {student.defaultFormat === "online"
                    ? "Online"
                    : "Stacjonarnie"}
                </dd>
              </div>
              <div>
                <dt>Cena</dt>
                <dd>{formatMoney(student.defaultPrice)}</dd>
              </div>
              <div>
                <dt>Link lub adres</dt>
                <dd className="breakable">
                  {student.defaultLocation || "Nie podano"}
                </dd>
              </div>
            </dl>
            {student.notes && (
              <div className="student-note">
                <strong>Notatka</strong>
                <p>{student.notes}</p>
              </div>
            )}
          </aside>
          <section className="upcoming-panel">
            <div className="section-heading">
              <h2>Najbliższe lekcje</h2>
              <button
                className="text-link"
                onClick={() => selectTab("lessons")}
              >
                Zobacz wszystkie
              </button>
            </div>
            {upcoming.length ? (
              <div className="lesson-rows">
                {upcoming.slice(0, 3).map((lesson) => (
                  <LessonRow
                    key={lesson.id}
                    lesson={lesson}
                    timezone={data.teacher.timezone}
                  />
                ))}
              </div>
            ) : (
              <EmptyState title="Nie ma zaplanowanych lekcji dla tego ucznia." />
            )}
          </section>
        </div>
      )}
      {activeTab === "lessons" && (
        <section className="tab-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Pełna historia</p>
              <h2>Lekcje</h2>
            </div>
          </div>
          {related.length ? (
            <div className="lesson-rows">
              {[...related].reverse().map((lesson) => (
                <LessonRow
                  key={lesson.id}
                  lesson={lesson}
                  timezone={data.teacher.timezone}
                />
              ))}
            </div>
          ) : (
            <EmptyState title={copy.empty.lessons} />
          )}
        </section>
      )}
      {activeTab === "progress" && (
        <section className="tab-panel progress-history">
          <ProgressThread student={student} lessons={related} />
          <div className="topic-history">
            <h2>Ocenione tematy</h2>
            {completed.length ? (
              completed.map((lesson) => {
                const results =
                  lesson.participants.find(
                    (part) => part.studentId === student.id,
                  )?.results ?? [];
                const scores = results.flatMap((result) => result.score ?? []);
                const score = scores.length
                  ? Math.round(
                      scores.reduce((a, b) => a + b, 0) / scores.length,
                    )
                  : null;
                return (
                  <Link href={`/app/lekcje/${lesson.id}`} key={lesson.id}>
                    <span>
                      <strong>{lesson.topic || "Lekcja bez tematu"}</strong>
                      <small>
                        {formatDateTime(lesson.startsAt, data.teacher.timezone)}
                      </small>
                    </span>
                    <span className="score-number">
                      {score ? `${score}/10` : "—"}
                    </span>
                  </Link>
                );
              })
            ) : (
              <EmptyState title="Oceny pojawią się po uzupełnieniu wyników lekcji." />
            )}
          </div>
        </section>
      )}
      {activeTab === "payments" && (
        <section className="tab-panel">
          <div className="section-heading">
            <h2>Rozliczenia ucznia</h2>
            <Link
              prefetch={false}
              className="button button--secondary"
              href="/api/export/platnosci"
            >
              {copy.actions.exportCsv}
            </Link>
          </div>
          <div className="payment-rows">
            {related.length ? (
              [...related].reverse().map((lesson) => {
                const payment =
                  lesson.participants.find(
                    (entry) => entry.studentId === student.id,
                  )?.paymentStatus ?? "unpaid";
                return (
                  <Link href={`/app/lekcje/${lesson.id}`} key={lesson.id}>
                    <span>
                      <strong>{lesson.topic || "Lekcja bez tematu"}</strong>
                      <small>
                        {formatDateTime(lesson.startsAt, data.teacher.timezone)}
                      </small>
                    </span>
                    <span className="money-value">
                      {formatMoney(lesson.price)}
                    </span>
                    <PaymentBadge status={payment} />
                  </Link>
                );
              })
            ) : (
              <EmptyState title={copy.empty.payments} />
            )}
          </div>
        </section>
      )}
      {activeTab === "materials" && (
        <section className="tab-panel">
          <div className="section-heading">
            <h2>Materiały</h2>
          </div>
          <EmptyState
            title="Dodawanie plików nie jest jeszcze dostępne. Plan, pracę domową i notatki znajdziesz w każdej lekcji."
            action={
              <button
                className="button button--secondary"
                onClick={() => selectTab("lessons")}
              >
                Przejdź do lekcji
              </button>
            }
          />
        </section>
      )}
    </div>
  );
}

function LessonRow({
  lesson,
  timezone,
}: {
  lesson: import("@/lib/domain").Lesson;
  timezone: string;
}) {
  return (
    <Link href={`/app/lekcje/${lesson.id}`}>
      <span className="lesson-date">
        <strong>{formatDateTime(lesson.startsAt, timezone)}</strong>
        <small>
          {lesson.durationMinutes} min ·{" "}
          {lesson.format === "online" ? "online" : "stacjonarnie"}
        </small>
      </span>
      <span className="lesson-topic">
        <strong>{lesson.topic || "Temat do ustalenia"}</strong>
        <small>{lesson.planItems.length} punktów planu</small>
      </span>
      <LessonStatusBadge status={lesson.status} />
    </Link>
  );
}
