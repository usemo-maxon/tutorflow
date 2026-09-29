import {
  AlertTriangle,
  ArrowRight,
  BookOpenCheck,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  History,
  RotateCw,
  Signal,
} from "lucide-react";
import Link from "next/link";
import type { StudentMemory, StudentMemoryLesson } from "@/lib/student-memory";
import { formatDay, formatShortDay, formatTime } from "@/lib/format";

const difficultyLabels = {
  easy: "Łatwo",
  mixed: "Różnie",
  hard: "Trudno",
} as const;

const attendanceLabels = {
  present: "Obecny",
  late: "Spóźniony",
  absent: "Nieobecny",
  cancelled: "Odwołany",
  unknown: "Brak danych",
} as const;

interface MemorySectionProps {
  memory: StudentMemory;
  timezone: string;
  canSchedule: boolean;
  onSchedule: () => void;
}

export function NextLessonSection({
  memory,
  timezone,
  canSchedule,
  onSchedule,
}: MemorySectionProps) {
  const lesson = memory.upcomingLesson;
  return (
    <section
      className="student-next-lesson panel"
      aria-labelledby="next-lesson-title"
    >
      <div className="student-next-lesson__icon" aria-hidden="true">
        <CalendarClock size={24} />
      </div>
      <div className="student-next-lesson__body">
        <p className="eyebrow">Przed kolejnym spotkaniem</p>
        <h2 id="next-lesson-title">Następna lekcja</h2>
        {lesson ? (
          <>
            <p className="student-next-lesson__date">
              {formatDay(lesson.startsAt, timezone)}
              <strong>{formatTime(lesson.startsAt, timezone)}</strong>
            </p>
            <p className="student-next-lesson__topic">
              {lesson.topic || "Temat do ustalenia"}
            </p>
          </>
        ) : (
          <p className="student-next-lesson__empty">
            Brak zaplanowanej kolejnej lekcji.
          </p>
        )}
      </div>
      <div className="student-next-lesson__action">
        {lesson ? (
          <Link
            className="button button--primary"
            href={`/app/lekcje/${lesson.id}`}
          >
            Otwórz lekcję <ArrowRight size={17} aria-hidden="true" />
          </Link>
        ) : canSchedule ? (
          <button className="button button--primary" onClick={onSchedule}>
            Zaplanuj lekcję
          </button>
        ) : null}
      </div>
    </section>
  );
}

export function ContinuitySection({
  memory,
  timezone,
  canSchedule,
  onSchedule,
}: MemorySectionProps) {
  if (!memory.recentLessons.length) {
    return (
      <section
        className="student-now panel"
        aria-labelledby="student-now-title"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">Ciągłość nauki</p>
            <h2 id="student-now-title">Na teraz</h2>
          </div>
        </div>
        <div className="student-memory-empty">
          <BookOpenCheck size={26} aria-hidden="true" />
          <div>
            <strong>Nie było jeszcze żadnej lekcji.</strong>
            <p>
              Zaplanuj pierwszą lekcję, aby easy4tutor zaczął budować historię
              ucznia.
            </p>
          </div>
          {canSchedule && (
            <button className="button button--secondary" onClick={onSchedule}>
              Zaplanuj pierwszą lekcję
            </button>
          )}
        </div>
      </section>
    );
  }

  const latest = memory.latestLesson;
  return (
    <section className="student-now" aria-labelledby="student-now-title">
      <div className="section-heading student-360-section-heading">
        <div>
          <p className="eyebrow">Przygotowanie do lekcji</p>
          <h2 id="student-now-title">Na teraz</h2>
        </div>
        <Signal size={20} aria-hidden="true" />
      </div>
      <div className="continuity-grid">
        <article className="continuity-card panel continuity-card--latest">
          <div className="continuity-card__heading">
            <History size={18} aria-hidden="true" />
            <h3>Ostatnio</h3>
          </div>
          {latest && (
            <>
              <strong className="continuity-card__lead">
                {latest.topic || "Lekcja bez tematu"}
              </strong>
              <span className="continuity-card__meta">
                {formatShortDay(latest.startsAt, timezone)}
              </span>
              {latest.outcome?.progressSummary && (
                <ExpandableText text={latest.outcome.progressSummary} />
              )}
              <Link
                className="text-link"
                href={`/app/lekcje/${latest.lessonId}`}
              >
                Otwórz lekcję <ArrowRight size={15} aria-hidden="true" />
              </Link>
            </>
          )}
        </article>

        <article className="continuity-card panel continuity-card--next">
          <div className="continuity-card__heading">
            <ArrowRight size={18} aria-hidden="true" />
            <h3>Następny krok</h3>
          </div>
          {memory.currentNextStep ? (
            <>
              <ExpandableText
                text={memory.currentNextStep.text}
                className="continuity-card__lead"
              />
              <span className="continuity-card__meta">
                Z lekcji{" "}
                {formatShortDay(
                  memory.currentNextStep.sourceLessonStartsAt,
                  timezone,
                )}
              </span>
            </>
          ) : (
            <>
              <p className="continuity-card__empty">
                Brak zapisanego następnego kroku.
              </p>
              {latest && (
                <Link
                  className="text-link"
                  href={`/app/lekcje/${latest.lessonId}`}
                >
                  Otwórz ostatnią lekcję
                </Link>
              )}
            </>
          )}
        </article>

        <article className="continuity-card panel continuity-card--difficulty">
          <div className="continuity-card__heading">
            <AlertTriangle size={18} aria-hidden="true" />
            <h3>Trudność</h3>
          </div>
          {memory.currentDifficulty ? (
            <>
              <strong
                className={`difficulty-label difficulty-label--${memory.currentDifficulty.level}`}
              >
                {difficultyLabels[memory.currentDifficulty.level]}
              </strong>
              {memory.currentDifficulty.note && (
                <ExpandableText text={memory.currentDifficulty.note} />
              )}
            </>
          ) : (
            <p className="continuity-card__empty">Brak zapisanej trudności.</p>
          )}
        </article>

        <article className="continuity-card panel continuity-card--homework">
          <div className="continuity-card__heading">
            <ClipboardList size={18} aria-hidden="true" />
            <h3>Praca domowa</h3>
          </div>
          {memory.homework ? (
            <>
              <ExpandableText
                text={memory.homework.title}
                className="continuity-card__lead"
              />
              {memory.homework.dueAt && (
                <span className="continuity-card__meta">
                  Termin: {formatDay(memory.homework.dueAt, timezone)}
                </span>
              )}
              <Link
                className="text-link"
                href={`/app/lekcje/${memory.homework.sourceLessonId}`}
              >
                Lekcja źródłowa
              </Link>
            </>
          ) : (
            <p className="continuity-card__empty">
              Brak zapisanej pracy domowej.
            </p>
          )}
        </article>
      </div>
    </section>
  );
}

export function RecentLessonsSection({
  memory,
  timezone,
}: Pick<MemorySectionProps, "memory" | "timezone">) {
  return (
    <section
      className="recent-memory panel"
      aria-labelledby="recent-lessons-title"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">Ostatnie 5 zakończonych</p>
          <h2 id="recent-lessons-title">Ostatnie lekcje</h2>
        </div>
      </div>
      {memory.recentLessons.length ? (
        <ol className="memory-timeline">
          {memory.recentLessons.map((lesson) => (
            <MemoryLessonItem
              key={lesson.lessonId}
              lesson={lesson}
              timezone={timezone}
            />
          ))}
        </ol>
      ) : (
        <p className="memory-section-empty">
          Historia pojawi się po pierwszej zakończonej lekcji.
        </p>
      )}
    </section>
  );
}

export function AttendanceSection({
  memory,
}: Pick<MemorySectionProps, "memory">) {
  const attendance = memory.attendance;
  return (
    <section
      className="student-side-card panel"
      aria-labelledby="attendance-title"
    >
      <div className="student-side-card__heading">
        <CheckCircle2 size={19} aria-hidden="true" />
        <h2 id="attendance-title">Obecność</h2>
      </div>
      <p className="student-side-card__hint">
        Ostatnie {attendance.recentTotal || 0} odnotowane
      </p>
      <dl className="attendance-facts">
        <div>
          <dt>Obecny</dt>
          <dd>{attendance.recentPresent}</dd>
        </div>
        <div>
          <dt>Nieobecny</dt>
          <dd>{attendance.recentAbsent}</dd>
        </div>
        <div>
          <dt>No-show</dt>
          <dd>{attendance.recentNoShow}</dd>
        </div>
      </dl>
    </section>
  );
}

export function MemoryLoadingState() {
  return (
    <section
      className="memory-state panel"
      aria-label="Wczytywanie historii ucznia"
      aria-busy="true"
    >
      <div className="skeleton skeleton--title" />
      <div className="skeleton skeleton--wide" />
      <div className="memory-state__grid">
        <div className="skeleton skeleton--card" />
        <div className="skeleton skeleton--card" />
      </div>
    </section>
  );
}

export function MemoryErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <section className="memory-state memory-state--error panel" role="alert">
      <AlertTriangle size={22} aria-hidden="true" />
      <div>
        <h2>Nie udało się wczytać historii ucznia.</h2>
        <p>Profil i pozostałe informacje nadal są dostępne.</p>
      </div>
      <button className="button button--secondary" onClick={onRetry}>
        <RotateCw size={16} aria-hidden="true" /> Spróbuj ponownie
      </button>
    </section>
  );
}

function MemoryLessonItem({
  lesson,
  timezone,
}: {
  lesson: StudentMemoryLesson;
  timezone: string;
}) {
  const outcome = lesson.outcome;
  return (
    <li className="memory-timeline__item">
      <div className="memory-timeline__marker" aria-hidden="true" />
      <article>
        <div className="memory-timeline__head">
          <div>
            <time dateTime={lesson.startsAt}>
              {formatShortDay(lesson.startsAt, timezone)}
            </time>
            <h3>{lesson.topic || "Lekcja bez tematu"}</h3>
          </div>
          {lesson.attendance && (
            <span
              className={`attendance-label attendance-label--${lesson.attendance}`}
            >
              {attendanceLabels[lesson.attendance]}
            </span>
          )}
        </div>
        {outcome ? (
          <div className="memory-outcome">
            {outcome.progressSummary && (
              <ExpandableText text={outcome.progressSummary} compact />
            )}
            {(outcome.difficultyLevel || outcome.difficultyNote) && (
              <div className="memory-outcome__row">
                {outcome.difficultyLevel && (
                  <strong>{difficultyLabels[outcome.difficultyLevel]}</strong>
                )}
                {outcome.difficultyNote && (
                  <ExpandableText text={outcome.difficultyNote} compact />
                )}
              </div>
            )}
            {outcome.nextStep && (
              <div className="memory-outcome__next">
                <span>Dalej</span>
                <ExpandableText text={outcome.nextStep} compact />
              </div>
            )}
          </div>
        ) : (
          <p className="legacy-outcome">Brak podsumowania ucznia.</p>
        )}
        <Link className="text-link" href={`/app/lekcje/${lesson.lessonId}`}>
          Otwórz <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </article>
    </li>
  );
}

function ExpandableText({
  text,
  compact = false,
  className = "",
}: {
  text: string;
  compact?: boolean;
  className?: string;
}) {
  const expandable = text.length > (compact ? 220 : 320);
  return (
    <div className={`expandable-copy ${className}`.trim()}>
      <p
        className={
          compact ? "memory-clamp memory-clamp--compact" : "memory-clamp"
        }
      >
        {text}
      </p>
      {expandable && (
        <details>
          <summary>Pokaż więcej</summary>
          <p>{text}</p>
        </details>
      )}
    </div>
  );
}
