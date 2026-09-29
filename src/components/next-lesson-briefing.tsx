"use client";

import { formatInTimeZone } from "date-fns-tz";
import { pl } from "date-fns/locale";
import { ArrowUpRight, BookOpenCheck, CircleDot, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useNextLessonBriefing } from "@/hooks/use-app-data";
import type {
  NextLessonBriefing,
  NextLessonParticipantBriefing,
} from "@/lib/next-lesson-briefing";

export function NextLessonBriefingPanel({
  teacherId,
  lessonId,
  timezone,
}: {
  teacherId: string;
  lessonId: string;
  timezone: string;
}) {
  const query = useNextLessonBriefing(teacherId, lessonId);

  if (query.isPending) return <BriefingSkeleton />;
  if (!query.data || query.error) {
    return (
      <section className="lesson-briefing lesson-briefing--error" aria-labelledby="briefing-title">
        <div>
          <span className="eyebrow">Przygotowanie</span>
          <h2 id="briefing-title">Przed lekcją</h2>
          <p>Nie udało się wczytać przygotowania do lekcji.</p>
        </div>
        <button className="button button--secondary" type="button" onClick={() => void query.refetch()}>
          <RotateCcw size={15} aria-hidden="true" /> Spróbuj ponownie
        </button>
      </section>
    );
  }
  return <NextLessonBriefingView briefing={query.data} timezone={timezone} />;
}

export function NextLessonBriefingView({
  briefing,
  timezone,
}: {
  briefing: NextLessonBriefing;
  timezone: string;
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const participants = briefing.participants;
  const selected = participants[selectedIndex] ?? participants[0];
  const isGroup = participants.length > 1;

  if (!selected) return null;

  function selectFromKeyboard(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!isGroup) return;
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % participants.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + participants.length) % participants.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = participants.length - 1;
    else return;
    event.preventDefault();
    setSelectedIndex(next);
    tabRefs.current[next]?.focus();
  }

  return (
    <section className="lesson-briefing" aria-labelledby="briefing-title">
      <header className="lesson-briefing__header">
        <span className="lesson-briefing__mark" aria-hidden="true"><BookOpenCheck size={19} /></span>
        <div>
          <span className="eyebrow">Przygotowanie</span>
          <h2 id="briefing-title">
            Przed lekcją{isGroup ? ` · ${participants.length} uczniów` : ""}
          </h2>
        </div>
        {!isGroup && <StudentIdentity participant={selected} />}
      </header>

      {isGroup && (
        <div className="lesson-briefing__tabs" role="tablist" aria-label="Uczniowie na lekcji">
          {participants.map((participant, index) => (
            <button
              key={participant.student.id}
              ref={(node) => { tabRefs.current[index] = node; }}
              id={`briefing-tab-${participant.student.id}`}
              role="tab"
              type="button"
              aria-selected={selectedIndex === index}
              aria-controls={`briefing-panel-${participant.student.id}`}
              tabIndex={selectedIndex === index ? 0 : -1}
              onClick={() => setSelectedIndex(index)}
              onKeyDown={(event) => selectFromKeyboard(event, index)}
            >
              <span>{participant.student.name}</span>
              <small><CircleDot size={11} aria-hidden="true" />{hasHistory(participant) ? "Jest kontekst" : "Pierwsza lekcja"}</small>
            </button>
          ))}
        </div>
      )}

      <div
        className="lesson-briefing__panel"
        id={`briefing-panel-${selected.student.id}`}
        role={isGroup ? "tabpanel" : undefined}
        aria-labelledby={isGroup ? `briefing-tab-${selected.student.id}` : undefined}
      >
        {isGroup && <StudentIdentity participant={selected} heading />}
        <ParticipantBriefing participant={selected} timezone={timezone} />
      </div>
    </section>
  );
}

function ParticipantBriefing({ participant, timezone }: { participant: NextLessonParticipantBriefing; timezone: string }) {
  const sourceLessonId = participant.lastLesson?.lessonId ?? participant.nextStep?.sourceLessonId ?? participant.difficulty?.sourceLessonId ?? participant.homework?.sourceLessonId;
  const hasMemory = hasHistory(participant);
  return (
    <>
      {!hasMemory && (
        <div className="lesson-briefing__first">
          <strong>To pierwsza lekcja z tym uczniem.</strong>
          {participant.student.goal && <p><span>Cel ucznia:</span> {participant.student.goal}</p>}
        </div>
      )}
      <dl className="lesson-briefing__grid">
        {participant.lastLesson && (
          <BriefingField label="Ostatnio">
            <small>{formatInTimeZone(participant.lastLesson.startsAt, timezone, "d MMMM", { locale: pl })}</small>
            {participant.lastLesson.topic && <strong>{participant.lastLesson.topic}</strong>}
            {participant.lastLesson.progressSummary && <ClampText text={participant.lastLesson.progressSummary} />}
          </BriefingField>
        )}
        {participant.difficulty && (
          <BriefingField label="Problem">
            <span className={`lesson-briefing__difficulty lesson-briefing__difficulty--${participant.difficulty.level}`}>
              {difficultyLabel(participant.difficulty.level)}
            </span>
            {participant.difficulty.note && <ClampText text={participant.difficulty.note} />}
          </BriefingField>
        )}
        {participant.homework && (
          <BriefingField label="Praca domowa">
            <ClampText text={participant.homework.title} />
            {participant.homework.dueAt && <small>Termin: {formatInTimeZone(participant.homework.dueAt, timezone, "d MMMM", { locale: pl })}</small>}
          </BriefingField>
        )}
        {participant.nextStep && (
          <BriefingField label="Następny krok" prominent>
            <ClampText text={participant.nextStep.text} />
          </BriefingField>
        )}
        {participant.todayGoal && (
          <BriefingField label="Cel na dziś">
            <ClampText text={participant.todayGoal} />
          </BriefingField>
        )}
      </dl>
      {sourceLessonId && (
        <Link className="lesson-briefing__source" href={`/app/lekcje/${sourceLessonId}`}>
          Otwórz poprzednią lekcję <ArrowUpRight size={14} aria-hidden="true" />
        </Link>
      )}
    </>
  );
}

function BriefingField({ label, prominent, children }: { label: string; prominent?: boolean; children: ReactNode }) {
  return <div className={prominent ? "lesson-briefing__field lesson-briefing__field--prominent" : "lesson-briefing__field"}><dt>{label}</dt><dd>{children}</dd></div>;
}

function ClampText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const expandable = text.length > 170;
  return (
    <>
      <p className={!expanded && expandable ? "lesson-briefing__clamp" : undefined}>{text}</p>
      {expandable && <button className="lesson-briefing__more" type="button" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}>{expanded ? "Pokaż mniej" : "Pokaż więcej"}</button>}
    </>
  );
}

function StudentIdentity({ participant, heading = false }: { participant: NextLessonParticipantBriefing; heading?: boolean }) {
  const content = <>{participant.student.name}{participant.student.level ? <small>{participant.student.level}</small> : null}</>;
  return heading ? <h3 className="lesson-briefing__student">{content}</h3> : <div className="lesson-briefing__student">{content}</div>;
}

function BriefingSkeleton() {
  return <section className="lesson-briefing lesson-briefing--loading" aria-label="Ładowanie przygotowania do lekcji" aria-busy="true"><div className="briefing-skeleton briefing-skeleton--title" /><div className="briefing-skeleton" /><div className="briefing-skeleton" /></section>;
}

function hasHistory(participant: NextLessonParticipantBriefing) {
  return Boolean(participant.lastLesson || participant.difficulty || participant.homework || participant.nextStep);
}

function difficultyLabel(level: "easy" | "mixed" | "hard") {
  return level === "easy" ? "Łatwo" : level === "mixed" ? "Różnie" : "Trudno";
}
