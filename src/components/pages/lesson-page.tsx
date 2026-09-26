"use client";

import { formatInTimeZone } from "date-fns-tz";
import { pl } from "date-fns/locale";
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleUserRound,
  ExternalLink,
  FileText,
  Link2,
  LoaderCircle,
  NotebookPen,
  Paperclip,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState, type CSSProperties, type ReactNode } from "react";
import {
  useLessonWorkspace,
  useLessonWorkspaceMutation,
} from "@/hooks/use-app-data";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { useMinuteClock } from "@/hooks/use-minute-clock";
import { ClientApiError } from "@/lib/api-client";
import type {
  LessonWorkspaceAction,
  LessonWorkspaceData,
} from "@/lib/lesson-workspace";
import { formatMoney, localInputToUtc } from "@/lib/format";
import { useSessionTeacher } from "../app-shell";
import { useAppUi } from "../app-ui-context";
import { PageLoading } from "../ui/loading";
import { LessonStatusBadge } from "../ui/status-badge";
import { CalendarColorPicker } from "../calendar-color-picker";
import {
  getCalendarEventSurface,
  getCalendarTint,
} from "@/lib/calendar-colors";
import type { RecurrenceMutationScope } from "@/lib/domain";
import { difficultyLabel } from "@/lib/lesson-completion";
import { LessonCompletionDialog } from "../lesson-completion-dialog";

type SaveState = "idle" | "saving" | "saved" | "error";

export function LessonPage() {
  const { lessonId } = useParams<{ lessonId: string }>();
  const session = useSessionTeacher();
  const query = useLessonWorkspace(session.id, lessonId);
  const data = query.data;

  if (query.isPending) return <PageLoading />;
  if (!data || query.error) {
    return (
      <div className="not-found">
        <h1>Nie znaleziono zajęć</h1>
        <p>
          Zajęcia mogły zostać usunięte albo nie należą do tego obszaru
          roboczego.
        </p>
        <Link className="button button--secondary" href="/app/kalendarz">
          Wróć do kalendarza
        </Link>
      </div>
    );
  }

  return (
    <LessonWorkspaceView
      key={data.lesson.id}
      data={data}
      lessonId={lessonId}
      teacherId={session.id}
    />
  );
}

function LessonWorkspaceView({
  data,
  lessonId,
  teacherId,
}: {
  data: LessonWorkspaceData;
  lessonId: string;
  teacherId: string;
}) {
  const mutation = useLessonWorkspaceMutation(teacherId, lessonId);
  const { showToast } = useAppUi();
  const now = useMinuteClock();
  const [topic, setTopic] = useState(data.lesson.topic);
  const [objectives, setObjectives] = useState(data.lesson.objectives);
  const [agenda, setAgenda] = useState(
    data.lesson.planItems.map((item) => item.text).join("\n"),
  );
  const [privateNote, setPrivateNote] = useState(data.lesson.privateNote);
  const [summary, setSummary] = useState(data.lesson.summary);
  const [homeworkTitle, setHomeworkTitle] = useState(
    data.homework?.title ?? "",
  );
  const [homeworkDescription, setHomeworkDescription] = useState(
    data.homework?.description ?? "",
  );
  const [homeworkDue, setHomeworkDue] = useState(
    data.homework?.dueAt?.slice(0, 10) ?? "",
  );
  const [materialTitle, setMaterialTitle] = useState("");
  const [materialUrl, setMaterialUrl] = useState("");
  const [selectedMaterial, setSelectedMaterial] = useState("");
  const [color, setColor] = useState(data.lesson.color);
  const [colorScope, setColorScope] =
    useState<RecurrenceMutationScope>("single");
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const [error, setError] = useState("");
  const [completionMode, setCompletionMode] = useState<
    "complete" | "edit" | undefined
  >();
  const dirty =
    topic !== data.lesson.topic ||
    objectives !== data.lesson.objectives ||
    agenda !== data.lesson.planItems.map((item) => item.text).join("\n") ||
    privateNote !== data.lesson.privateNote ||
    summary !== data.lesson.summary ||
    homeworkTitle !== (data.homework?.title ?? "") ||
    homeworkDescription !== (data.homework?.description ?? "") ||
    homeworkDue !== (data.homework?.dueAt?.slice(0, 10) ?? "") ||
    color !== data.lesson.color;
  useUnsavedChanges(dirty);

  const lesson = data.lesson;
  const locked = lesson.status === "cancelled" || lesson.status === "no_show";
  const attendanceLocked =
    locked || lesson.status === "completed" || data.teacher.readOnly;
  const beforeStart = now.getTime() < Date.parse(lesson.startsAt);
  const unresolved = data.participants.filter(
    (participant) => participant.attendanceStatus === "unknown",
  ).length;

  async function run(
    key: string,
    action: LessonWorkspaceAction,
    success: string,
  ) {
    setError("");
    setSaveStates((current) => ({ ...current, [key]: "saving" }));
    try {
      const result = await mutation.mutateAsync(action);
      setSaveStates((current) => ({ ...current, [key]: "saved" }));
      showToast({ message: success });
      window.setTimeout(
        () => setSaveStates((current) => ({ ...current, [key]: "idle" })),
        1800,
      );
      return result;
    } catch (caught) {
      setSaveStates((current) => ({ ...current, [key]: "error" }));
      setError(
        caught instanceof ClientApiError
          ? caught.data.message
          : "Nie udało się zapisać zmian. Spróbuj ponownie.",
      );
      return undefined;
    }
  }

  async function savePlan() {
    const lines = agenda
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const result = await run(
      "plan",
      {
        type: "updatePlan",
        topic,
        objectives,
        items: lines.map((text, position) => ({
          id: lesson.planItems[position]?.id ?? crypto.randomUUID(),
          position,
          text,
        })),
        expectedUpdatedAt: lesson.updatedAt,
      },
      "Plan zajęć zapisany",
    );
    if (result) {
      setTopic(result.lesson.topic);
      setObjectives(result.lesson.objectives);
      setAgenda(result.lesson.planItems.map((item) => item.text).join("\n"));
    }
  }

  async function saveNote(kind: "private" | "summary") {
    const result = await run(
      kind,
      {
        type: "saveNote",
        noteType: kind,
        content: kind === "private" ? privateNote : summary,
        expectedUpdatedAt:
          kind === "private"
            ? lesson.privateNoteUpdatedAt
            : lesson.summaryUpdatedAt,
      },
      kind === "private" ? "Notatka zapisana" : "Podsumowanie zapisane",
    );
    if (result) {
      setPrivateNote(result.lesson.privateNote);
      setSummary(result.lesson.summary);
    }
  }

  async function saveHomework() {
    if (!homeworkTitle.trim()) {
      setError("Podaj tytuł pracy domowej.");
      return;
    }
    const result = await run(
      "homework",
      {
        type: "upsertHomework",
        title: homeworkTitle,
        description: homeworkDescription,
        dueAt: homeworkDue
          ? localInputToUtc(homeworkDue, "23:59", data!.teacher.timezone)
          : null,
      },
      "Praca domowa zapisana",
    );
    if (result?.homework) {
      setHomeworkTitle(result.homework.title);
      setHomeworkDescription(result.homework.description);
      setHomeworkDue(result.homework.dueAt?.slice(0, 10) ?? "");
    }
  }

  async function createMaterial() {
    if (!materialTitle.trim() || !materialUrl.trim()) {
      setError("Podaj nazwę i poprawny adres materiału.");
      return;
    }
    const result = await run(
      "material",
      {
        type: "createAndAttachMaterial",
        title: materialTitle,
        url: materialUrl,
      },
      "Materiał dodany do zajęć",
    );
    if (result) {
      setMaterialTitle("");
      setMaterialUrl("");
    }
  }

  async function saveColor() {
    const result = await run(
      "color",
      {
        type: "updateColor",
        color,
        scope: lesson.seriesId ? colorScope : "single",
        expectedUpdatedAt: lesson.updatedAt,
      },
      lesson.seriesId && colorScope !== "single"
        ? "Kolor przyszłych zajęć został zapisany"
        : "Kolor zajęć został zapisany",
    );
    if (result) setColor(result.lesson.color);
  }

  return (
    <main
      className="lesson-page lesson-workspace-page page-enter"
      style={
        {
          "--lesson-color": lesson.color,
          "--lesson-tint": getCalendarTint(lesson.color),
          "--lesson-event-surface": getCalendarEventSurface(lesson.color),
        } as CSSProperties
      }
    >
      <nav className="lesson-breadcrumbs" aria-label="Nawigacja zajęć">
        <Link href="/app/dzisiaj">
          <ArrowLeft size={16} aria-hidden="true" /> Dzisiaj
        </Link>
        <span aria-hidden="true">/</span>
        <Link href="/app/kalendarz">Kalendarz</Link>
      </nav>

      <header className="lesson-hero">
        <div className="lesson-hero__identity">
          <div className="lesson-header-status">
            <LessonStatusBadge status={lesson.status} />
            {data.participants.length > 1 && (
              <span className="group-label">
                <Users size={15} aria-hidden="true" />
                {data.participants.length} uczestników
              </span>
            )}
          </div>
          <h1>{lesson.participantLabel}</h1>
          <p>
            {[lesson.subject, lesson.level].filter(Boolean).join(" · ") ||
              "Zajęcia"}
          </p>
        </div>
        <div className="lesson-hero__when">
          <strong>
            {formatInTimeZone(
              lesson.startsAt,
              data.teacher.timezone,
              "EEEE, d MMMM",
              { locale: pl },
            )}
          </strong>
          <span>
            {formatInTimeZone(lesson.startsAt, data.teacher.timezone, "HH:mm")}–
            {formatInTimeZone(lesson.endsAt, data.teacher.timezone, "HH:mm")}
            <small>{lesson.durationMinutes} min</small>
          </span>
        </div>
        <div className="lesson-hero__actions">
          {lesson.meetingUrl && (
            <a
              className="button button--primary"
              href={lesson.meetingUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Dołącz do zajęć <ExternalLink size={16} aria-hidden="true" />
            </a>
          )}
          <Link className="button button--secondary" href="/app/kalendarz">
            <CalendarDays size={16} aria-hidden="true" /> Kalendarz
          </Link>
        </div>
      </header>

      <LessonStateBanner data={data} />
      {lesson.status === "completed" && (
        <CompletedOutcomes
          data={data}
          onEdit={
            data.teacher.readOnly
              ? undefined
              : () => setCompletionMode("edit")
          }
        />
      )}
      {!data.teacher.readOnly && (
        <section className="lesson-color-panel" aria-label="Kolor zajęć">
          <div className="lesson-color-panel__intro">
            <span className="eyebrow">Kalendarz</span>
            <strong>Kolor zajęć</strong>
            <small>Ten sam akcent łączy kalendarz, lekcję i plan zajęć.</small>
          </div>
          <CalendarColorPicker value={color} onChange={setColor} />
          {lesson.seriesId && (
            <fieldset className="lesson-color-scope">
              <legend>Zakres zmiany</legend>
              {(
                [
                  ["single", "Tylko te zajęcia"],
                  ["future", "Te i kolejne zajęcia"],
                  ["series", "Wszystkie przyszłe w serii"],
                ] as const
              ).map(([scope, label]) => (
                <label key={scope}>
                  <input
                    type="radio"
                    name="lesson-color-scope"
                    value={scope}
                    checked={colorScope === scope}
                    onChange={() => setColorScope(scope)}
                  />
                  {label}
                </label>
              ))}
            </fieldset>
          )}
          <button
            type="button"
            className="button button--secondary"
            disabled={
              mutation.isPending ||
              saveStates.color === "saving" ||
              (color === data.lesson.color &&
                (!lesson.seriesId || colorScope === "single"))
            }
            onClick={() => void saveColor()}
          >
            {saveStates.color === "saving" && (
              <LoaderCircle className="spin" size={16} />
            )}
            Zapisz kolor
          </button>
        </section>
      )}
      {error && (
        <div className="lesson-inline-error" role="alert">
          <AlertTriangle size={18} aria-hidden="true" /> {error}
          <button type="button" onClick={() => setError("")}>
            Zamknij
          </button>
        </div>
      )}

      <div className="lesson-flow-layout">
        <div className="lesson-teaching-thread">
          <WorkspaceSection
            icon={<BookOpen size={19} />}
            step="Przygotowanie"
            title="Plan zajęć"
            description="Temat, cele i prosty przebieg pod ręką podczas lekcji."
            saveState={saveStates.plan}
            actionLabel="Zapisz plan"
            onAction={() => void savePlan()}
            disabled={
              locked || lesson.status === "completed" || data.teacher.readOnly
            }
          >
            <label className="field">
              <span>Temat</span>
              <input
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                placeholder="Np. Present Perfect vs Past Simple"
              />
            </label>
            <label className="field">
              <span>Cele</span>
              <textarea
                rows={3}
                value={objectives}
                onChange={(event) => setObjectives(event.target.value)}
                placeholder="Co uczeń powinien umieć po zajęciach?"
              />
            </label>
            <label className="field">
              <span>Przebieg</span>
              <textarea
                rows={6}
                value={agenda}
                onChange={(event) => setAgenda(event.target.value)}
                placeholder={
                  "Rozgrzewka językowa\nPowtórka reguły\nĆwiczenie w rozmowie"
                }
              />
              <small>Każda linia stanie się osobnym punktem planu.</small>
            </label>
          </WorkspaceSection>

          <WorkspaceSection
            icon={<NotebookPen size={19} />}
            step="Podczas zajęć"
            title="Notatki tutora"
            description="Prywatne informacje widoczne wyłącznie dla Ciebie."
            saveState={saveStates.private}
            actionLabel="Zapisz notatkę"
            onAction={() => void saveNote("private")}
            disabled={locked || data.teacher.readOnly}
            privacy="Prywatne"
          >
            <label className="field">
              <span className="sr-only">Prywatna notatka tutora</span>
              <textarea
                rows={6}
                value={privateNote}
                onChange={(event) => setPrivateNote(event.target.value)}
                placeholder="Co warto zapamiętać przed kolejnymi zajęciami?"
              />
            </label>
          </WorkspaceSection>

          <WorkspaceSection
            icon={<FileText size={19} />}
            step="Po zajęciach"
            title="Podsumowanie dla ucznia"
            description="Oddzielone od prywatnej notatki i gotowe na przyszły portal ucznia."
            saveState={saveStates.summary}
            actionLabel="Zapisz podsumowanie"
            onAction={() => void saveNote("summary")}
            disabled={locked || data.teacher.readOnly}
            privacy="Dla ucznia"
          >
            <label className="field">
              <span className="sr-only">Podsumowanie zajęć</span>
              <textarea
                rows={4}
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
                placeholder="Dziś przećwiczyliśmy…"
              />
            </label>
          </WorkspaceSection>

          <WorkspaceSection
            icon={<BookOpen size={19} />}
            step="Następny krok"
            title="Praca domowa"
            description="Jedno wspólne zadanie dla ucznia lub całej grupy."
            saveState={saveStates.homework}
            actionLabel={data.homework ? "Zapisz zmiany" : "Dodaj pracę domową"}
            onAction={() => void saveHomework()}
            disabled={locked || data.teacher.readOnly}
            secondaryAction={
              data.homework
                ? {
                    label: "Usuń",
                    onClick: () => {
                      if (!window.confirm("Usunąć pracę domową z tych zajęć?"))
                        return;
                      void run(
                        "homework",
                        { type: "deleteHomework" },
                        "Praca domowa usunięta",
                      ).then((result) => {
                        if (!result) return;
                        setHomeworkTitle("");
                        setHomeworkDescription("");
                        setHomeworkDue("");
                      });
                    },
                  }
                : undefined
            }
          >
            <div className="lesson-form-grid">
              <label className="field">
                <span>Tytuł</span>
                <input
                  value={homeworkTitle}
                  onChange={(event) => setHomeworkTitle(event.target.value)}
                  placeholder="Np. Ćwiczenia 4–6"
                />
              </label>
              <label className="field">
                <span>Termin (opcjonalnie)</span>
                <input
                  type="date"
                  value={homeworkDue}
                  onChange={(event) => setHomeworkDue(event.target.value)}
                />
              </label>
            </div>
            <label className="field">
              <span>Opis</span>
              <textarea
                rows={4}
                value={homeworkDescription}
                onChange={(event) => setHomeworkDescription(event.target.value)}
                placeholder="Instrukcja dla ucznia lub grupy"
              />
            </label>
          </WorkspaceSection>

          <section
            className="lesson-flow-section"
            aria-labelledby="section-Materiały"
          >
            <SectionHeading
              icon={<Paperclip size={19} />}
              step="Wsparcie"
              title="Materiały"
              description="Dołącz istniejący materiał lub szybko dodaj link."
            />
            <div className="lesson-material-list">
              {data.materials.map((material) => (
                <div className="lesson-material-row" key={material.id}>
                  <Link2 size={17} aria-hidden="true" />
                  <div>
                    <strong>{material.title}</strong>
                    {material.description && (
                      <small>{material.description}</small>
                    )}
                  </div>
                  {material.url && (
                    <a
                      className="text-link"
                      href={material.url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Otwórz <ExternalLink size={13} />
                    </a>
                  )}
                  {!locked && !data.teacher.readOnly && (
                    <button
                      className="icon-button"
                      type="button"
                      aria-label={`Odłącz ${material.title}`}
                      onClick={() =>
                        void run(
                          "material",
                          {
                            type: "detachMaterial",
                            materialId: material.id,
                          },
                          "Materiał odłączony",
                        )
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
              ))}
              {!data.materials.length && (
                <p className="lesson-quiet-empty">
                  Brak materiałów dołączonych do zajęć.
                </p>
              )}
            </div>
            {!locked && !data.teacher.readOnly && (
              <div className="lesson-material-actions">
                {data.materialLibrary.length > 0 && (
                  <div className="lesson-attach-existing">
                    <label className="field">
                      <span>Biblioteka</span>
                      <select
                        value={selectedMaterial}
                        onChange={(event) =>
                          setSelectedMaterial(event.target.value)
                        }
                      >
                        <option value="">Wybierz materiał</option>
                        {data.materialLibrary.map((material) => (
                          <option value={material.id} key={material.id}>
                            {material.title}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="button button--secondary"
                      type="button"
                      disabled={!selectedMaterial || mutation.isPending}
                      onClick={() =>
                        void run(
                          "material",
                          {
                            type: "attachMaterial",
                            materialId: selectedMaterial,
                          },
                          "Materiał dołączony",
                        ).then(() => setSelectedMaterial(""))
                      }
                    >
                      Dołącz
                    </button>
                  </div>
                )}
                <details className="lesson-quick-material">
                  <summary>
                    <Plus size={16} /> Dodaj nowy link
                  </summary>
                  <div className="lesson-form-grid">
                    <label className="field">
                      <span>Nazwa</span>
                      <input
                        value={materialTitle}
                        onChange={(event) =>
                          setMaterialTitle(event.target.value)
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Adres URL</span>
                      <input
                        type="url"
                        value={materialUrl}
                        onChange={(event) => setMaterialUrl(event.target.value)}
                        placeholder="https://"
                      />
                    </label>
                  </div>
                  <button
                    className="button button--secondary"
                    type="button"
                    onClick={() => void createMaterial()}
                    disabled={mutation.isPending}
                  >
                    Dodaj i dołącz
                  </button>
                </details>
              </div>
            )}
          </section>

          <section
            className="lesson-flow-section"
            aria-labelledby="section-Obecność"
          >
            <SectionHeading
              icon={<Users size={19} />}
              step="Rozliczenie zajęć"
              title="Obecność"
              description={
                data.participants.length > 1
                  ? "Oznacz każdego uczestnika z historycznej listy tej lekcji."
                  : "Oznacz obecność ucznia przed zakończeniem zajęć."
              }
            />
            {data.participants.length > 1 && !attendanceLocked && (
              <button
                className="button button--secondary lesson-mark-all"
                type="button"
                onClick={() =>
                  void run(
                    "attendance",
                    { type: "markAllPresent" },
                    "Wszyscy oznaczeni jako obecni",
                  )
                }
                disabled={mutation.isPending}
              >
                <Check size={16} /> Oznacz wszystkich obecnych
              </button>
            )}
            <div className="lesson-attendance-list">
              {data.participants.map((participant) => (
                <div
                  className="lesson-attendance-row"
                  key={participant.studentId}
                >
                  <div className="lesson-attendance-person">
                    <span className="avatar">{initials(participant.name)}</span>
                    <div>
                      <strong>{participant.name}</strong>
                      <small>
                        {[participant.subject, participant.level]
                          .filter(Boolean)
                          .join(" · ") || "Uczestnik zajęć"}
                        {participant.status === "archived"
                          ? " · archiwalny"
                          : ""}
                      </small>
                    </div>
                  </div>
                  <div
                    className="attendance-choice"
                    role="group"
                    aria-label={`Obecność: ${participant.name}`}
                  >
                    {(["present", "absent", "late"] as const).map((status) => (
                      <button
                        key={status}
                        type="button"
                        aria-pressed={participant.attendanceStatus === status}
                        disabled={attendanceLocked || mutation.isPending}
                        onClick={() =>
                          void run(
                            "attendance",
                            {
                              type: "markAttendance",
                              studentId: participant.studentId,
                              status,
                            },
                            `Obecność: ${attendanceLabel(status)}`,
                          )
                        }
                      >
                        {attendanceLabel(status)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section
            className="lesson-completion-panel"
            aria-labelledby="completion-title"
          >
            <div>
              <span className="eyebrow">Ostatni krok</span>
              <h2 id="completion-title">Zakończ lekcję</h2>
              <p>
                {unresolved
                  ? `Pozostało do oznaczenia: ${unresolved}.`
                  : data.packageContext && !data.packageContext.consumedByLesson
                    ? `Zakończenie wykorzysta 1 lekcję z pakietu „${data.packageContext.name}”.`
                    : "Obecność jest uzupełniona. Możesz zakończyć zajęcia."}
              </p>
            </div>
            {lesson.status !== "completed" && !locked && (
              <div className="lesson-completion-actions">
                <button
                  className="button button--primary"
                  type="button"
                  disabled={
                    mutation.isPending ||
                    unresolved > 0 ||
                    beforeStart ||
                    data.teacher.readOnly
                  }
                  onClick={() => setCompletionMode("complete")}
                >
                  {mutation.isPending ? (
                    <LoaderCircle className="spin" size={18} />
                  ) : (
                    <CheckCircle2 size={18} />
                  )}{" "}
                  Zakończ lekcję
                </button>
                <button
                  className="button button--quiet"
                  type="button"
                  disabled={
                    mutation.isPending || beforeStart || data.teacher.readOnly
                  }
                  onClick={() => {
                    if (
                      window.confirm(
                        "Oznaczyć te zajęcia jako nieobecność? Pakiet nie zostanie wykorzystany.",
                      )
                    )
                      void run(
                        "no-show",
                        { type: "markNoShow" },
                        "Zajęcia oznaczone jako nieobecność",
                      );
                  }}
                >
                  Oznacz nieobecność
                </button>
              </div>
            )}
            {beforeStart && lesson.status !== "completed" && (
              <small>
                Zakończenie i nieobecność będą dostępne od godziny rozpoczęcia.
              </small>
            )}
          </section>
        </div>

        <ContextRail
          data={data}
          busy={mutation.isPending}
          onCancel={() => {
            if (
              window.confirm(
                "Odwołać te zajęcia? Historia zostanie zachowana, a pakiet nie zostanie wykorzystany.",
              )
            )
              void run(
                "cancel",
                {
                  type: "cancelLesson",
                  expectedUpdatedAt: lesson.updatedAt,
                },
                "Zajęcia odwołane",
              );
          }}
        />
      </div>
      {completionMode && (
        <LessonCompletionDialog
          data={data}
          mode={completionMode}
          onOpenChange={(open) => {
            if (!open) setCompletionMode(undefined);
          }}
          onMutate={mutation.mutateAsync}
          onSuccess={(message, result) => {
            showToast({ message });
            setHomeworkTitle(result.homework?.title ?? "");
            setHomeworkDescription(result.homework?.description ?? "");
            setHomeworkDue(result.homework?.dueAt?.slice(0, 10) ?? "");
          }}
        />
      )}
    </main>
  );
}

function CompletedOutcomes({
  data,
  onEdit,
}: {
  data: LessonWorkspaceData;
  onEdit?: () => void;
}) {
  return (
    <section className="completed-outcomes" aria-labelledby="completed-outcomes-title">
      <header>
        <div>
          <span className="eyebrow">Ciągłość nauki</span>
          <h2 id="completed-outcomes-title">Podsumowanie ucznia</h2>
        </div>
        {onEdit && (
          <button className="button button--secondary" type="button" onClick={onEdit}>
            Edytuj podsumowanie
          </button>
        )}
      </header>
      <div className="completed-outcomes__list">
        {data.participants.map((participant) => {
          const outcome = participant.outcome;
          return (
            <article key={participant.studentId}>
              {data.participants.length > 1 && <h3>{participant.name}</h3>}
              {!outcome ? (
                <p className="lesson-quiet-empty">Brak podsumowania ucznia.</p>
              ) : (
                <dl>
                  {outcome.progressSummary && (
                    <div><dt>Co udało się zrobić</dt><dd>{outcome.progressSummary}</dd></div>
                  )}
                  {outcome.difficultyLevel && (
                    <div><dt>Jak poszło</dt><dd>{difficultyLabel(outcome.difficultyLevel)}</dd></div>
                  )}
                  {outcome.difficultyNote && (
                    <div><dt>Problem</dt><dd>{outcome.difficultyNote}</dd></div>
                  )}
                  {outcome.nextStep && (
                    <div><dt>Następny krok</dt><dd>{outcome.nextStep}</dd></div>
                  )}
                </dl>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function LessonStateBanner({ data }: { data: LessonWorkspaceData }) {
  if (data.lesson.status === "completed") {
    return (
      <div className="lesson-state-banner lesson-state-banner--complete">
        <CheckCircle2 size={21} aria-hidden="true" />
        <div>
          <strong>Zajęcia zakończone</strong>
          <p>
            To jest zapis historyczny. Notatki i praca domowa nadal mogą być
            uzupełniane.
          </p>
        </div>
      </div>
    );
  }
  if (data.lesson.status === "cancelled") {
    return (
      <div className="lesson-state-banner" role="status">
        <AlertTriangle size={21} aria-hidden="true" />
        <div>
          <strong>Zajęcia odwołane</strong>
          <p>Historia została zachowana. Zajęć nie można zakończyć.</p>
        </div>
      </div>
    );
  }
  if (data.lesson.status === "no_show") {
    return (
      <div className="lesson-state-banner" role="status">
        <CircleUserRound size={21} aria-hidden="true" />
        <div>
          <strong>Nieobecność</strong>
          <p>
            Uczestnicy zostali oznaczeni jako nieobecni. Pakiet nie został
            wykorzystany.
          </p>
        </div>
      </div>
    );
  }
  return null;
}

function WorkspaceSection({
  icon,
  step,
  title,
  description,
  children,
  saveState = "idle",
  actionLabel,
  onAction,
  disabled,
  privacy,
  secondaryAction,
}: {
  icon: ReactNode;
  step: string;
  title: string;
  description: string;
  children: ReactNode;
  saveState?: SaveState;
  actionLabel: string;
  onAction: () => void;
  disabled?: boolean;
  privacy?: string;
  secondaryAction?: { label: string; onClick: () => void };
}) {
  return (
    <section
      className="lesson-flow-section"
      aria-labelledby={`section-${title}`}
    >
      <SectionHeading
        icon={icon}
        step={step}
        title={title}
        description={description}
        privacy={privacy}
      />
      <fieldset className="lesson-section-fields" disabled={disabled}>
        <legend className="sr-only">{title}</legend>
        {children}
      </fieldset>
      <div className="lesson-section-footer">
        <SaveLabel state={saveState} />
        <div>
          {secondaryAction && (
            <button
              type="button"
              className="button button--quiet"
              disabled={disabled}
              onClick={secondaryAction.onClick}
            >
              {secondaryAction.label}
            </button>
          )}
          <button
            type="button"
            className="button button--secondary"
            disabled={disabled || saveState === "saving"}
            onClick={onAction}
          >
            {saveState === "saving" && (
              <LoaderCircle className="spin" size={16} />
            )}
            {actionLabel}
          </button>
        </div>
      </div>
    </section>
  );
}

function SectionHeading({
  icon,
  step,
  title,
  description,
  privacy,
}: {
  icon: ReactNode;
  step: string;
  title: string;
  description: string;
  privacy?: string;
}) {
  return (
    <div className="lesson-section-heading">
      <span className="lesson-section-icon" aria-hidden="true">
        {icon}
      </span>
      <div>
        <span className="eyebrow">{step}</span>
        <h2 id={`section-${title}`}>{title}</h2>
        <p>{description}</p>
      </div>
      {privacy && <span className="lesson-privacy-badge">{privacy}</span>}
    </div>
  );
}

function SaveLabel({ state }: { state: SaveState }) {
  return (
    <span
      className={`lesson-save-label lesson-save-label--${state}`}
      role="status"
    >
      {state === "saving"
        ? "Zapisywanie…"
        : state === "saved"
          ? "Zapisano"
          : state === "error"
            ? "Nie zapisano"
            : ""}
    </span>
  );
}

function ContextRail({
  data,
  busy,
  onCancel,
}: {
  data: LessonWorkspaceData;
  busy: boolean;
  onCancel: () => void;
}) {
  const lesson = data.lesson;
  const groupLesson = Boolean(lesson.groupId || data.participants.length > 1);
  const locked = ["completed", "cancelled", "no_show"].includes(lesson.status);
  return (
    <aside className="lesson-context-rail" aria-label="Kontekst zajęć">
      <div className="lesson-context-block">
        <span className="eyebrow">{groupLesson ? "Grupa" : "Uczeń"}</span>
        <strong>{lesson.participantLabel}</strong>
        <p>{[lesson.subject, lesson.level].filter(Boolean).join(" · ")}</p>
        {(lesson.groupId || lesson.studentId) && (
          <Link
            className="text-link"
            href={
              lesson.groupId
                ? `/app/uczniowie/grupy/${lesson.groupId}`
                : `/app/uczniowie/${lesson.studentId}`
            }
          >
            Zobacz {lesson.groupId ? "grupę" : "ucznia"}{" "}
            <ChevronRight size={14} />
          </Link>
        )}
      </div>
      {data.financialContext && data.financialContext.mode !== "package" && (
        <div className="lesson-context-block lesson-financial-context">
          <span className="eyebrow">Rozliczenie</span>
          <strong>
            {data.financialContext.amount === undefined
              ? "Lekcja próbna"
              : formatMoney({
                  amount: data.financialContext.amount,
                  currency: data.financialContext.currency,
                })}
          </strong>
          <p>
            {data.financialContext.status === "paid"
              ? "Opłacone"
              : data.financialContext.status === "partial"
                ? `${formatMoney({ amount: data.financialContext.outstanding ?? 0, currency: data.financialContext.currency })} pozostało`
                : data.financialContext.overdue
                  ? "Płatność po terminie"
                  : data.financialContext.status === "unpaid"
                    ? "Do zapłaty"
                    : lesson.status === "completed"
                      ? "Należność jest przygotowywana"
                      : "Należność powstanie po zakończeniu"}
          </p>
        </div>
      )}
      {data.packageContext && (
        <div className="lesson-context-block lesson-package-context">
          <span className="eyebrow">Pakiet</span>
          <strong>
            {data.packageContext.remainingLessons}{" "}
            {lessonCountWord(data.packageContext.remainingLessons)}
          </strong>
          <p>
            {data.packageContext.consumedByLesson
              ? "Ta lekcja została już rozliczona."
              : "Pozostało przed zakończeniem tych zajęć."}
          </p>
        </div>
      )}
      <AdjacentLesson
        title="Poprzednie zajęcia"
        item={data.previousLesson}
        timezone={data.teacher.timezone}
      />
      <AdjacentLesson
        title="Następne zajęcia"
        item={data.nextLesson}
        timezone={data.teacher.timezone}
      />
      {!locked && !data.teacher.readOnly && (
        <div className="lesson-context-block lesson-danger-zone">
          <span className="eyebrow">Zmiana planu</span>
          <Link className="text-link" href="/app/kalendarz">
            Przełóż w kalendarzu
          </Link>
          <button type="button" disabled={busy} onClick={onCancel}>
            Odwołaj zajęcia
          </button>
        </div>
      )}
    </aside>
  );
}

function AdjacentLesson({
  title,
  item,
  timezone,
}: {
  title: string;
  item?: LessonWorkspaceData["previousLesson"];
  timezone: string;
}) {
  return (
    <div className="lesson-context-block">
      <span className="eyebrow">{title}</span>
      {item ? (
        <>
          <strong>
            {formatInTimeZone(item.startsAt, timezone, "d MMM, HH:mm", {
              locale: pl,
            })}
          </strong>
          <p>{item.topic || "Bez tematu"}</p>
          <Link className="text-link" href={`/app/lekcje/${item.id}`}>
            Otwórz <ChevronRight size={14} />
          </Link>
        </>
      ) : (
        <p>Brak zaplanowanych zajęć.</p>
      )}
    </div>
  );
}

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("");
}

function attendanceLabel(status: "present" | "absent" | "late") {
  return status === "present"
    ? "Obecny"
    : status === "absent"
      ? "Nieobecny"
      : "Spóźniony";
}

function lessonCountWord(count: number) {
  if (count === 1) return "lekcja";
  if (count >= 2 && count <= 4) return "lekcje";
  return "lekcji";
}
