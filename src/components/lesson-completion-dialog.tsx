"use client";

import * as Dialog from "@radix-ui/react-dialog";
import {
  AlertTriangle,
  Check,
  Circle,
  LoaderCircle,
  UserRound,
  X,
} from "lucide-react";
import { useState, type KeyboardEvent } from "react";
import type {
  LessonWorkspaceAction,
  LessonWorkspaceData,
} from "@/lib/lesson-workspace";
import {
  buildCompletionOutcomes,
  difficultyOptions,
  outcomeDraft,
  participantCompletionStatus,
  type LessonOutcomeDraft,
} from "@/lib/lesson-completion";
import { ClientApiError } from "@/lib/api-client";
import { localInputToUtc } from "@/lib/format";

export function LessonCompletionDialog({
  data,
  mode,
  onOpenChange,
  onMutate,
  onSuccess,
}: {
  data: LessonWorkspaceData;
  mode: "complete" | "edit";
  onOpenChange: (open: boolean) => void;
  onMutate: (action: LessonWorkspaceAction) => Promise<LessonWorkspaceData>;
  onSuccess: (message: string, data: LessonWorkspaceData) => void;
}) {
  const [selectedStudentId, setSelectedStudentId] = useState(
    data.participants[0]?.studentId ?? "",
  );
  const [drafts, setDrafts] = useState<Record<string, LessonOutcomeDraft>>(
    Object.fromEntries(
      data.participants.map((participant) => [
        participant.studentId,
        outcomeDraft(participant.outcome),
      ]),
    ),
  );
  const [homeworkTitle, setHomeworkTitle] = useState(
    data.homework?.title ?? "",
  );
  const [homeworkDescription, setHomeworkDescription] = useState(
    data.homework?.description ?? "",
  );
  const [homeworkDue, setHomeworkDue] = useState(
    data.homework?.dueAt?.slice(0, 10) ?? "",
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const selected =
    data.participants.find(
      (participant) => participant.studentId === selectedStudentId,
    ) ?? data.participants[0];
  const unresolved = data.participants.some(
    (participant) => participant.attendanceStatus === "unknown",
  );

  function updateDraft(patch: Partial<LessonOutcomeDraft>) {
    if (!selected) return;
    setDrafts((current) => ({
      ...current,
      [selected.studentId]: { ...current[selected.studentId], ...patch },
    }));
  }

  async function markAttendance(
    status: "present" | "absent" | "late",
  ) {
    if (!selected) return;
    setError("");
    try {
      await onMutate({
        type: "markAttendance",
        studentId: selected.studentId,
        status,
      });
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  async function submit() {
    setPending(true);
    setError("");
    try {
      if (mode === "edit") {
        let result = data;
        for (const [studentId, draft] of Object.entries(drafts)) {
          result = await onMutate({
            type: "saveStudentOutcome",
            studentId,
            progressSummary: draft.progressSummary,
            difficultyLevel: draft.difficultyLevel,
            difficultyNote: draft.difficultyNote,
            nextStep: draft.nextStep,
          });
        }
        onSuccess("Podsumowanie ucznia zapisane", result);
      } else {
        await persistHomeworkIfChanged();
        const result = await onMutate({
          type: "completeLesson",
          expectedUpdatedAt: data.lesson.updatedAt,
          outcomes: buildCompletionOutcomes(drafts),
        });
        onSuccess("Zajęcia zakończone", result);
      }
      onOpenChange(false);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  async function persistHomeworkIfChanged() {
    const original = {
      title: data.homework?.title ?? "",
      description: data.homework?.description ?? "",
      due: data.homework?.dueAt?.slice(0, 10) ?? "",
    };
    if (
      homeworkTitle === original.title &&
      homeworkDescription === original.description &&
      homeworkDue === original.due
    ) {
      return;
    }
    if (!homeworkTitle.trim() && !homeworkDescription.trim() && !homeworkDue) {
      if (data.homework) await onMutate({ type: "deleteHomework" });
      return;
    }
    if (!homeworkTitle.trim()) {
      throw new Error("Podaj tytuł pracy domowej.");
    }
    await onMutate({
      type: "upsertHomework",
      title: homeworkTitle,
      description: homeworkDescription,
      dueAt: homeworkDue
        ? localInputToUtc(homeworkDue, "23:59", data.teacher.timezone)
        : null,
    });
  }

  function moveParticipant(event: KeyboardEvent<HTMLButtonElement>) {
    if (!data.participants.length) return;
    const currentIndex = data.participants.findIndex(
      (participant) => participant.studentId === selectedStudentId,
    );
    const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const next =
      data.participants[
        (currentIndex + delta + data.participants.length) %
          data.participants.length
      ];
    setSelectedStudentId(next.studentId);
    document.getElementById(`completion-tab-${next.studentId}`)?.focus();
  }

  const selectedDraft = selected ? drafts[selected.studentId] : undefined;

  return (
    <Dialog.Root open onOpenChange={pending ? undefined : onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content dialog-content--medium completion-dialog">
          <header className="dialog-header">
            <div>
              <Dialog.Title>
                {mode === "complete" ? "Zakończ lekcję" : "Edytuj podsumowanie"}
              </Dialog.Title>
              <Dialog.Description>
                {mode === "complete"
                  ? "Krótki zapis ułatwi płynnie zacząć kolejne spotkanie."
                  : "Popraw notatki bez ponownego rozliczania lekcji."}
              </Dialog.Description>
            </div>
            <Dialog.Close className="icon-button" aria-label="Zamknij" disabled={pending}>
              <X size={19} />
            </Dialog.Close>
          </header>

          <div className="dialog-scroll completion-dialog__body">
            {data.participants.length > 1 && (
              <section className="completion-participants" aria-labelledby="completion-students">
                <div className="completion-section-title">
                  <span id="completion-students">Uczniowie</span>
                  <small>Wybierz osobę, aby uzupełnić jej wynik.</small>
                </div>
                <div className="completion-tabs" role="tablist" aria-label="Uczestnicy lekcji">
                  {data.participants.map((participant) => {
                    const status = participantCompletionStatus(
                      participant.attendanceStatus,
                      drafts[participant.studentId],
                    );
                    return (
                      <button
                        id={`completion-tab-${participant.studentId}`}
                        key={participant.studentId}
                        type="button"
                        role="tab"
                        aria-selected={selected?.studentId === participant.studentId}
                        aria-controls="completion-student-panel"
                        tabIndex={selected?.studentId === participant.studentId ? 0 : -1}
                        onKeyDown={moveParticipant}
                        onClick={() => setSelectedStudentId(participant.studentId)}
                      >
                        {status === "attendance-missing" ? (
                          <AlertTriangle size={15} aria-label="Brak obecności" />
                        ) : status === "ready" ? (
                          <Check size={15} aria-label="Gotowe" />
                        ) : (
                          <Circle size={9} aria-label="Notatka opcjonalna" />
                        )}
                        <span>{participant.name}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            )}

            {selected && selectedDraft && (
              <div
                id="completion-student-panel"
                role={data.participants.length > 1 ? "tabpanel" : undefined}
                aria-labelledby={
                  data.participants.length > 1
                    ? `completion-tab-${selected.studentId}`
                    : undefined
                }
                className="completion-student-panel"
              >
                <div className="completion-student-heading">
                  <span className="avatar"><UserRound size={17} /></span>
                  <div>
                    <strong>{selected.name}</strong>
                    <small>{[selected.subject, selected.level].filter(Boolean).join(" · ")}</small>
                  </div>
                </div>

                <fieldset className="completion-fieldset" disabled={mode === "edit" || pending}>
                  <legend>Obecność</legend>
                  <div className="attendance-choice" role="group" aria-label={`Obecność: ${selected.name}`}>
                    {(["present", "absent", "late"] as const).map((status) => (
                      <button
                        key={status}
                        type="button"
                        aria-pressed={selected.attendanceStatus === status}
                        onClick={() => void markAttendance(status)}
                      >
                        {attendanceLabel(status)}
                      </button>
                    ))}
                  </div>
                  {selected.attendanceStatus === "unknown" && (
                    <small className="completion-required">
                      Wybierz obecność, aby zakończyć lekcję.
                    </small>
                  )}
                </fieldset>

                <label className="field completion-field">
                  <span>Co udało się zrobić?</span>
                  <textarea
                    rows={3}
                    maxLength={2_000}
                    value={selectedDraft.progressSummary}
                    onChange={(event) => updateDraft({ progressSummary: event.target.value })}
                    placeholder="Przećwiczyliśmy pytania w Past Simple i uczeń poprawnie używał did w większości przykładów."
                  />
                </label>

                <fieldset className="completion-fieldset">
                  <legend>Jak poszło?</legend>
                  <div className="completion-difficulty" role="group" aria-label={`Poziom trudności: ${selected.name}`}>
                    {difficultyOptions.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={selectedDraft.difficultyLevel === option.value}
                        onClick={() =>
                          updateDraft({
                            difficultyLevel:
                              selectedDraft.difficultyLevel === option.value
                                ? undefined
                                : option.value,
                          })
                        }
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </fieldset>

                <label className="field completion-field">
                  <span>Z czym był problem?</span>
                  <textarea
                    rows={2}
                    maxLength={2_000}
                    value={selectedDraft.difficultyNote}
                    onChange={(event) => updateDraft({ difficultyNote: event.target.value })}
                    placeholder="Mylił did z was/were w pytaniach."
                  />
                </label>

                <label className="field completion-field">
                  <span>Co robimy dalej?</span>
                  <textarea
                    rows={3}
                    maxLength={2_000}
                    value={selectedDraft.nextStep}
                    onChange={(event) => updateDraft({ nextStep: event.target.value })}
                    placeholder="Na początku następnej lekcji powtórzyć pytania i przejść do krótkich dialogów."
                  />
                </label>

                {!buildCompletionOutcomes({ [selected.studentId]: selectedDraft }).length && (
                  <p className="completion-encouragement">
                    Dodaj krótką notatkę, żeby łatwiej wrócić do kontekstu na następnej lekcji.
                  </p>
                )}
              </div>
            )}

            {mode === "complete" && (
              <details className="completion-homework" open={Boolean(data.homework)}>
                <summary>Praca domowa</summary>
                <p>Wspólna dla ucznia lub całej grupy.</p>
                <div className="lesson-form-grid">
                  <label className="field">
                    <span>Tytuł</span>
                    <input value={homeworkTitle} onChange={(event) => setHomeworkTitle(event.target.value)} placeholder="Np. Ćwiczenia 4–6" />
                  </label>
                  <label className="field">
                    <span>Termin (opcjonalnie)</span>
                    <input type="date" value={homeworkDue} onChange={(event) => setHomeworkDue(event.target.value)} />
                  </label>
                </div>
                <label className="field">
                  <span>Opis</span>
                  <textarea rows={2} value={homeworkDescription} onChange={(event) => setHomeworkDescription(event.target.value)} placeholder="Instrukcja dla ucznia lub grupy" />
                </label>
              </details>
            )}

            {error && (
              <div className="completion-error" role="alert">
                <AlertTriangle size={17} aria-hidden="true" /> {error}
              </div>
            )}
          </div>

          <footer className="dialog-footer completion-dialog__footer">
            <Dialog.Close className="button button--quiet" disabled={pending}>Anuluj</Dialog.Close>
            <button
              className="button button--primary"
              type="button"
              disabled={pending || (mode === "complete" && unresolved)}
              onClick={() => void submit()}
            >
              {pending && <LoaderCircle className="spin" size={18} />}
              {pending
                ? mode === "complete"
                  ? "Zakańczam…"
                  : "Zapisuję…"
                : mode === "complete"
                  ? "Zakończ lekcję"
                  : "Zapisz podsumowanie"}
            </button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function attendanceLabel(status: "present" | "absent" | "late") {
  return status === "present" ? "Obecny" : status === "absent" ? "Nieobecny" : "Spóźniony";
}

function errorMessage(error: unknown) {
  if (error instanceof ClientApiError) return error.data.message;
  if (error instanceof Error && error.message) return error.message;
  return "Nie udało się zakończyć lekcji. Sprawdź dane i spróbuj ponownie.";
}
