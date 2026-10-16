"use client";

import { formatInTimeZone } from "date-fns-tz";
import { pl } from "date-fns/locale";
import {
  ArrowUpRight,
  BookOpenCheck,
  CircleDot,
  ExternalLink,
  FileText,
  Layers3,
  Link2,
  Plus,
  RotateCcw,
  StickyNote,
} from "lucide-react";
import Link from "next/link";
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useNextLessonBriefing } from "@/hooks/use-app-data";
import type {
  NextLessonBriefing,
  NextLessonParticipantBriefing,
} from "@/lib/next-lesson-briefing";
import { homeworkStatusLabels } from "@/lib/homework";
import type {
  LessonPreparationContext,
  PreparationMaterial,
  PreparationMaterialSource,
} from "@/lib/preparation-context";

export function NextLessonBriefingPanel({
  teacherId,
  lessonId,
  timezone,
  briefing,
  resources,
  readOnly = false,
  pendingMaterialId,
  onAttach,
  onOpen,
  onUseTemplate,
  onReusePreviousLesson,
}: {
  teacherId: string;
  lessonId: string;
  timezone: string;
  briefing?: NextLessonBriefing;
  resources?: LessonPreparationContext;
  readOnly?: boolean;
  pendingMaterialId?: string;
  onAttach?: (materialId: string) => void;
  onOpen?: (material: PreparationMaterial) => void;
  onUseTemplate?: () => void;
  onReusePreviousLesson?: () => void;
}) {
  const query = useNextLessonBriefing(teacherId, lessonId, !briefing);

  if (briefing)
    return (
      <NextLessonBriefingView
        briefing={briefing}
        timezone={timezone}
        resources={resources}
        readOnly={readOnly}
        pendingMaterialId={pendingMaterialId}
        onAttach={onAttach}
        onOpen={onOpen}
        onUseTemplate={onUseTemplate}
        onReusePreviousLesson={onReusePreviousLesson}
      />
    );

  if (query.isPending) return <BriefingSkeleton />;
  if (!query.data || query.error) {
    return (
      <section
        className="lesson-briefing lesson-briefing--error"
        aria-labelledby="briefing-title"
      >
        <div>
          <span className="eyebrow">Przygotowanie</span>
          <h2 id="briefing-title">Przed lekcją</h2>
          <p>Nie udało się wczytać przygotowania do lekcji.</p>
        </div>
        <button
          className="button button--secondary"
          type="button"
          onClick={() => void query.refetch()}
        >
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
  resources,
  readOnly = false,
  pendingMaterialId,
  onAttach,
  onOpen,
  onUseTemplate,
  onReusePreviousLesson,
}: {
  briefing: NextLessonBriefing;
  timezone: string;
  resources?: LessonPreparationContext;
  readOnly?: boolean;
  pendingMaterialId?: string;
  onAttach?: (materialId: string) => void;
  onOpen?: (material: PreparationMaterial) => void;
  onUseTemplate?: () => void;
  onReusePreviousLesson?: () => void;
}) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const participants = briefing.participants;
  const selected = participants[selectedIndex] ?? participants[0];
  const isGroup = participants.length > 1;

  if (!selected) return null;

  function selectFromKeyboard(
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) {
    if (!isGroup) return;
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % participants.length;
    else if (event.key === "ArrowLeft")
      next = (index - 1 + participants.length) % participants.length;
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
        <span className="lesson-briefing__mark" aria-hidden="true">
          <BookOpenCheck size={19} />
        </span>
        <div>
          <span className="eyebrow">Przygotowanie</span>
          <h2 id="briefing-title">Kontekst do przygotowania lekcji</h2>
        </div>
        {!isGroup && <StudentIdentity participant={selected} />}
      </header>

      {isGroup && (
        <div
          className="lesson-briefing__tabs"
          role="tablist"
          aria-label="Uczniowie na lekcji"
        >
          {participants.map((participant, index) => (
            <button
              key={participant.student.id}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
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
              <small>
                <CircleDot size={11} aria-hidden="true" />
                {hasHistory(participant) ? "Jest kontekst" : "Pierwsza lekcja"}
              </small>
            </button>
          ))}
        </div>
      )}

      <div
        className="lesson-briefing__panel"
        id={`briefing-panel-${selected.student.id}`}
        role={isGroup ? "tabpanel" : undefined}
        aria-labelledby={
          isGroup ? `briefing-tab-${selected.student.id}` : undefined
        }
      >
        {isGroup && <StudentIdentity participant={selected} heading />}
        <ParticipantBriefing participant={selected} timezone={timezone} />
      </div>
      {resources && (
        <PreparationResources
          resources={resources}
          timezone={timezone}
          readOnly={readOnly}
          pendingMaterialId={pendingMaterialId}
          onAttach={onAttach}
          onOpen={onOpen}
        />
      )}
      {(onUseTemplate || onReusePreviousLesson) && !readOnly && (
        <div
          className="lesson-preparation-actions"
          aria-label="Szybkie przygotowanie"
        >
          {onUseTemplate && (
            <button
              className="button button--quiet"
              type="button"
              onClick={onUseTemplate}
            >
              <Layers3 size={15} aria-hidden="true" /> Użyj szablonu
            </button>
          )}
          {onReusePreviousLesson && (
            <button
              className="button button--quiet"
              type="button"
              onClick={onReusePreviousLesson}
            >
              <RotateCcw size={15} aria-hidden="true" /> Bazuj na poprzedniej
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function PreparationResources({
  resources,
  timezone,
  readOnly,
  pendingMaterialId,
  onAttach,
  onOpen,
}: {
  resources: LessonPreparationContext;
  timezone: string;
  readOnly: boolean;
  pendingMaterialId?: string;
  onAttach?: (materialId: string) => void;
  onOpen?: (material: PreparationMaterial) => void;
}) {
  return (
    <div className="lesson-preparation-resources">
      <PreparationMaterialList
        title="Materiały z poprzednich lekcji"
        empty="Brak materiałów w ostatnich lekcjach."
        materials={resources.historicalMaterials}
        timezone={timezone}
        readOnly={readOnly}
        pendingMaterialId={pendingMaterialId}
        onAttach={onAttach}
        onOpen={onOpen}
      />
      <PreparationMaterialList
        title="Materiały dostępne"
        empty="Brak przypisanych materiałów lub materiałów z poprzednich lekcji."
        materials={resources.availableMaterials}
        timezone={timezone}
        readOnly={readOnly}
        pendingMaterialId={pendingMaterialId}
        onAttach={onAttach}
        onOpen={onOpen}
      />
    </div>
  );
}

function PreparationMaterialList({
  title,
  empty,
  materials,
  timezone,
  readOnly,
  pendingMaterialId,
  onAttach,
  onOpen,
}: {
  title: string;
  empty: string;
  materials: PreparationMaterial[];
  timezone: string;
  readOnly: boolean;
  pendingMaterialId?: string;
  onAttach?: (materialId: string) => void;
  onOpen?: (material: PreparationMaterial) => void;
}) {
  return (
    <section className="lesson-preparation-resource-group" aria-label={title}>
      <h3>{title}</h3>
      {materials.length ? (
        <div className="lesson-preparation-resource-list">
          {materials.map((material) => {
            const Icon =
              material.type === "file"
                ? FileText
                : material.type === "link"
                  ? Link2
                  : StickyNote;
            const attached = material.sources.some(
              (source) => source.kind === "current_lesson",
            );
            return (
              <article key={material.id}>
                <Icon size={16} aria-hidden="true" />
                <div>
                  <strong>{material.title}</strong>
                  <small>
                    {materialTypeLabel(material.type)}
                    {material.archived ? " · Archiwalny" : ""}
                  </small>
                  <span>
                    {material.sources.map((source) => (
                      <SourceLabel
                        key={sourceKey(source)}
                        source={source}
                        timezone={timezone}
                      />
                    ))}
                  </span>
                </div>
                <div className="lesson-preparation-resource-actions">
                  {material.available && (material.url || onOpen) ? (
                    material.url ? (
                      <a
                        className="text-link"
                        href={material.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Otwórz <ExternalLink size={12} aria-hidden="true" />
                      </a>
                    ) : (
                      <button
                        className="text-link"
                        type="button"
                        onClick={() => onOpen?.(material)}
                      >
                        Otwórz
                      </button>
                    )
                  ) : (
                    <small>Niedostępny</small>
                  )}
                  {attached ? (
                    <span className="lesson-preparation-attached">
                      W planie lekcji
                    </span>
                  ) : (
                    <button
                      className="button button--quiet"
                      type="button"
                      disabled={
                        readOnly ||
                        !material.available ||
                        !onAttach ||
                        pendingMaterialId === material.id
                      }
                      onClick={() => onAttach?.(material.id)}
                    >
                      <Plus size={14} aria-hidden="true" /> Dodaj do planu
                      lekcji
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="lesson-preparation-empty">{empty}</p>
      )}
    </section>
  );
}

function SourceLabel({
  source,
  timezone,
}: {
  source: PreparationMaterialSource;
  timezone: string;
}) {
  if (source.kind === "previous_lesson") {
    return (
      <Link href={`/app/lekcje/${source.lessonId}`}>
        {source.label} ·{" "}
        {formatInTimeZone(source.lessonStartsAt, timezone, "dd.MM")}
      </Link>
    );
  }
  return <em>{source.label}</em>;
}

function sourceKey(source: PreparationMaterialSource) {
  return `${source.kind}:${"lessonId" in source ? source.lessonId : source.label}`;
}

function materialTypeLabel(type: PreparationMaterial["type"]) {
  return type === "file" ? "Plik" : type === "link" ? "Link" : "Notatka";
}

function ParticipantBriefing({
  participant,
  timezone,
}: {
  participant: NextLessonParticipantBriefing;
  timezone: string;
}) {
  const sourceLessonId =
    participant.lastLesson?.lessonId ??
    participant.nextStep?.sourceLessonId ??
    participant.difficulty?.sourceLessonId ??
    participant.homework?.sourceLessonId;
  const hasMemory = hasHistory(participant);
  return (
    <>
      {!hasMemory && (
        <div className="lesson-briefing__first">
          <strong>To pierwsza lekcja z tym uczniem.</strong>
          {participant.student.goal && (
            <p>
              <span>Cel ucznia:</span> {participant.student.goal}
            </p>
          )}
        </div>
      )}
      <dl className="lesson-briefing__grid">
        {participant.lastLesson && (
          <BriefingField label="Ostatnio">
            <small>
              {formatInTimeZone(
                participant.lastLesson.startsAt,
                timezone,
                "d MMMM",
                { locale: pl },
              )}
            </small>
            {participant.lastLesson.topic && (
              <strong>{participant.lastLesson.topic}</strong>
            )}
            {participant.lastLesson.progressSummary && (
              <ClampText text={participant.lastLesson.progressSummary} />
            )}
          </BriefingField>
        )}
        {participant.difficulty && (
          <BriefingField label="Problem">
            <span
              className={`lesson-briefing__difficulty lesson-briefing__difficulty--${participant.difficulty.level}`}
            >
              {difficultyLabel(participant.difficulty.level)}
            </span>
            {participant.difficulty.note && (
              <ClampText text={participant.difficulty.note} />
            )}
          </BriefingField>
        )}
        {participant.homework && (
          <BriefingField
            label={
              participant.homework.status === "completed"
                ? "Praca domowa do sprawdzenia"
                : "Praca domowa"
            }
          >
            <ClampText text={participant.homework.title} />
            {participant.homework.dueAt && (
              <small>
                Termin:{" "}
                {formatInTimeZone(
                  participant.homework.dueAt,
                  timezone,
                  "d MMMM",
                  { locale: pl },
                )}
              </small>
            )}
            <strong>
              Status:{" "}
              {homeworkStatusLabels[participant.homework.status ?? "assigned"]}
            </strong>
            <Link
              className="text-link"
              href={`/app/lekcje/${participant.homework.sourceLessonId}`}
            >
              Otwórz zadanie <ArrowUpRight size={13} aria-hidden="true" />
            </Link>
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
        <Link
          className="lesson-briefing__source"
          href={`/app/lekcje/${sourceLessonId}`}
        >
          Otwórz poprzednią lekcję <ArrowUpRight size={14} aria-hidden="true" />
        </Link>
      )}
    </>
  );
}

function BriefingField({
  label,
  prominent,
  children,
}: {
  label: string;
  prominent?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={
        prominent
          ? "lesson-briefing__field lesson-briefing__field--prominent"
          : "lesson-briefing__field"
      }
    >
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function ClampText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const expandable = text.length > 170;
  return (
    <>
      <p
        className={
          !expanded && expandable ? "lesson-briefing__clamp" : undefined
        }
      >
        {text}
      </p>
      {expandable && (
        <button
          className="lesson-briefing__more"
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Pokaż mniej" : "Pokaż więcej"}
        </button>
      )}
    </>
  );
}

function StudentIdentity({
  participant,
  heading = false,
}: {
  participant: NextLessonParticipantBriefing;
  heading?: boolean;
}) {
  const content = (
    <>
      {participant.student.name}
      {participant.student.level ? (
        <small>{participant.student.level}</small>
      ) : null}
    </>
  );
  return heading ? (
    <h3 className="lesson-briefing__student">{content}</h3>
  ) : (
    <div className="lesson-briefing__student">{content}</div>
  );
}

function BriefingSkeleton() {
  return (
    <section
      className="lesson-briefing lesson-briefing--loading"
      aria-label="Ładowanie przygotowania do lekcji"
      aria-busy="true"
    >
      <div className="briefing-skeleton briefing-skeleton--title" />
      <div className="briefing-skeleton" />
      <div className="briefing-skeleton" />
    </section>
  );
}

function hasHistory(participant: NextLessonParticipantBriefing) {
  return Boolean(
    participant.lastLesson ||
    participant.difficulty ||
    participant.homework ||
    participant.nextStep,
  );
}

function difficultyLabel(level: "easy" | "mixed" | "hard") {
  return level === "easy" ? "Łatwo" : level === "mixed" ? "Różnie" : "Trudno";
}
