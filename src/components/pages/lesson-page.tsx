"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { formatInTimeZone } from "date-fns-tz";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  GripVertical,
  LoaderCircle,
  MapPin,
  Plus,
  RotateCw,
  Trash2,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { useAppData, useAppMutation } from "@/hooks/use-app-data";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { copy } from "@/lib/copy";
import type { LessonParticipant, PlanItem } from "@/lib/domain";
import { formatDateTime, formatMoney, localInputToUtc } from "@/lib/format";
import { useSessionTeacher } from "../app-shell";
import { useAppUi } from "../app-ui-context";
import { PageLoading } from "../ui/loading";
import { LessonStatusBadge } from "../ui/status-badge";

const schema = z.object({
  topic: z.string(),
  homework: z.string(),
  generalNotes: z.string(),
  planItems: z.array(
    z.object({ id: z.string(), position: z.number(), text: z.string() }),
  ),
  participants: z.array(
    z.object({
      studentId: z.string(),
      attendanceStatus: z.enum(["unknown", "present", "absent", "cancelled"]),
      paymentStatus: z.enum(["unpaid", "paid", "cancelled"]),
      results: z.array(
        z.object({
          planItemId: z.string(),
          completed: z.boolean(),
          score: z.number().int().min(1).max(10).optional(),
          note: z.string().optional(),
        }),
      ),
    }),
  ),
});
type Values = z.infer<typeof schema>;

export function LessonPage() {
  const { lessonId } = useParams<{ lessonId: string }>();
  const session = useSessionTeacher();
  const router = useRouter();
  const { data, isPending } = useAppData(session.id);
  const mutation = useAppMutation(session.id);
  const { showToast, showError } = useAppUi();
  const lesson = data?.lessons.find((candidate) => candidate.id === lessonId);
  const draftLessonId = useRef<string | null>(null);
  const [saveError, setSaveError] = useState("");
  const [activeStudentId, setActiveStudentId] = useState("");
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");
  const [seriesScope, setSeriesScope] = useState<"single" | "future">("single");
  const {
    control,
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { isDirty, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: lesson ? lessonValues(lesson) : undefined,
  });
  const values = useWatch({ control }) as Values;

  useEffect(() => {
    if (lesson && (draftLessonId.current !== lesson.id || !isDirty)) {
      draftLessonId.current = lesson.id;
      reset(lessonValues(lesson));
    }
  }, [lesson, reset, isDirty]);
  useUnsavedChanges(isDirty);

  const participantIndex = useMemo(() => {
    const found =
      values.participants?.findIndex(
        (participant) => participant?.studentId === activeStudentId,
      ) ?? -1;
    return found >= 0 ? found : 0;
  }, [values.participants, activeStudentId]);
  if (isPending || !data) return <PageLoading />;
  if (!lesson)
    return (
      <div className="not-found">
        <h1>Nie znaleziono lekcji</h1>
        <p>Lekcja mogła zostać usunięta albo nie należy do tego konta.</p>
        <Link className="button button--secondary" href="/app/kalendarz">
          Wróć do kalendarza
        </Link>
      </div>
    );
  const readOnly = data.teacher.subscription.readOnly;
  const busy = isSubmitting || mutation.isPending;
  const safeLesson = lesson;
  const safeData = data;
  const students = lesson.participantIds
    .map((id) => data.students.find((student) => student.id === id))
    .filter(Boolean) as import("@/lib/domain").Student[];
  const activeStudent =
    students.find((student) => student.id === activeStudentId) ?? students[0];
  const activeParticipant = values.participants?.[participantIndex];

  const save = (complete: boolean) =>
    handleSubmit(async (formValues) => {
      if (readOnly || mutation.isPending) return;
      setSaveError("");
      try {
        const response = await mutation.mutateAsync({
          type: "saveLesson",
          lessonId: lesson.id,
          ...formValues,
          complete,
        });
        const saved = response.data.lessons.find((l) => l.id === lesson.id);
        if (saved) reset(lessonValues(saved));
        showToast({
          message: complete
            ? copy.toasts.lessonCompleted
            : copy.toasts.changesSaved,
        });
        if (complete && activeStudent)
          router.push(`/app/uczniowie/${activeStudent.id}?tab=progress`);
      } catch (error) {
        setSaveError(
          "Nie udało się zapisać lekcji. Twoje zmiany pozostają na ekranie. Spróbuj ponownie.",
        );
        showError(error);
      }
    });

  function addPlanItem() {
    const item: PlanItem = {
      id: crypto.randomUUID(),
      position: values.planItems?.length ?? 0,
      text: "",
    };
    setValue("planItems", [...(values.planItems ?? []), item], {
      shouldDirty: true,
    });
    setValue(
      "participants",
      (values.participants ?? []).map((participant) => ({
        ...participant!,
        results: [
          ...(participant?.results ?? []),
          { planItemId: item.id, completed: false, note: "" },
        ],
      })) as LessonParticipant[],
      { shouldDirty: true },
    );
  }
  function removePlanItem(index: number) {
    const item = values.planItems?.[index];
    if (!item) return;
    if (
      (item.text ||
        values.participants?.some((p) =>
          p.results.some(
            (r) =>
              r.planItemId === item.id && (r.completed || r.score || r.note),
          ),
        )) &&
      !window.confirm(
        "Usunąć ten punkt i wyniki uczestników? Zmiana zostanie zapisana razem z lekcją.",
      )
    )
      return;
    setValue(
      "planItems",
      (values.planItems ?? [])
        .filter((_, candidate) => candidate !== index)
        .map((entry, position) => ({ ...entry!, position })) as PlanItem[],
      { shouldDirty: true },
    );
    setValue(
      "participants",
      (values.participants ?? []).map((participant) => ({
        ...participant!,
        results: (participant?.results ?? []).filter(
          (result) => result?.planItemId !== item.id,
        ),
      })) as LessonParticipant[],
      { shouldDirty: true },
    );
  }
  function movePlanItem(index: number, direction: -1 | 1) {
    const target = index + direction;
    const list = [...(values.planItems ?? [])];
    if (target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target], list[index]];
    setValue(
      "planItems",
      list.map((entry, position) => ({ ...entry!, position })) as PlanItem[],
      { shouldDirty: true },
    );
  }
  async function retrySync(disable = false) {
    try {
      await mutation.mutateAsync({
        type: disable ? "disableSync" : "retrySync",
        lessonId: safeLesson.id,
      });
      showToast({
        message: disable
          ? "Synchronizacja wyłączona dla tej lekcji"
          : "Ponowiono synchronizację",
      });
    } catch (error) {
      showError(error);
    }
  }
  async function reschedule() {
    try {
      await mutation.mutateAsync({
        type: "rescheduleLesson",
        lessonId: safeLesson.id,
        startsAt: localInputToUtc(newDate, newTime, safeData.teacher.timezone),
        scope: safeLesson.seriesId ? seriesScope : "single",
      });
      setRescheduleOpen(false);
      showToast({ message: copy.toasts.dateChanged });
    } catch (error) {
      showError(error);
    }
  }
  async function cancelLesson() {
    if (
      !window.confirm(
        safeLesson.seriesId && seriesScope === "future"
          ? "Anulować tę i wszystkie kolejne lekcje serii? Statusy płatności pozostaną bez zmian."
          : "Anulować tylko tę lekcję? Statusy płatności pozostaną bez zmian.",
      )
    )
      return;
    try {
      await mutation.mutateAsync({
        type: "cancelLesson",
        lessonId: safeLesson.id,
        scope: safeLesson.seriesId ? seriesScope : "single",
      });
      showToast({ message: "Lekcja anulowana" });
    } catch (error) {
      showError(error);
    }
  }
  function openReschedule() {
    setNewDate(
      formatInTimeZone(
        safeLesson.startsAt,
        safeData.teacher.timezone,
        "yyyy-MM-dd",
      ),
    );
    setNewTime(
      formatInTimeZone(safeLesson.startsAt, safeData.teacher.timezone, "HH:mm"),
    );
    setSeriesScope("single");
    setRescheduleOpen((open) => !open);
  }

  return (
    <div className="lesson-page page-enter">
      <Link className="back-link" href="/app/kalendarz">
        <ArrowLeft size={17} />
        Wróć do kalendarza
      </Link>
      <header className="lesson-header">
        <div>
          <div className="lesson-header-status">
            <LessonStatusBadge status={lesson.status} />
            {lesson.participantIds.length > 1 && (
              <span className="group-label">
                <Users size={15} />
                Grupa · {lesson.participantIds.length}
              </span>
            )}
          </div>
          <h1>{lesson.topic || "Lekcja bez tematu"}</h1>
          {students.length > 3 ? (
            <details className="lesson-roster">
              <summary>{students.length} uczestników · pokaż listę</summary>
              <ul>
                {students.map((student) => (
                  <li key={student.id}>{student.name}</li>
                ))}
              </ul>
            </details>
          ) : (
            <p>{students.map((student) => student.name).join(", ")}</p>
          )}
        </div>
        <div className="lesson-header-facts">
          <span>
            <CalendarClock size={18} />
            {formatDateTime(lesson.startsAt, data.teacher.timezone)} ·{" "}
            {lesson.durationMinutes} min
          </span>
          <span>
            {lesson.format === "online" ? (
              <ExternalLink size={18} />
            ) : (
              <MapPin size={18} />
            )}
            {lesson.format === "online" &&
            /^https?:\/\//i.test(lesson.location) ? (
              <a
                className="text-link"
                href={lesson.location}
                target="_blank"
                rel="noopener noreferrer"
              >
                Dołącz do spotkania <ExternalLink size={14} />
              </a>
            ) : (
              lesson.location
            )}
          </span>
          <span>{formatMoney(lesson.price)}</span>
        </div>
      </header>
      {(lesson.syncStatus === "failed" ||
        lesson.syncStatus === "deleted_in_google") && (
        <div className="sync-alert" role="alert">
          <AlertTriangle size={21} />
          <div>
            <strong>
              {lesson.syncStatus === "deleted_in_google"
                ? copy.status.deletedGoogle
                : "Nie udało się zsynchronizować wydarzenia z Google Calendar."}
            </strong>
            <p>Lekcja jest bezpiecznie zapisana w TutorFlow.</p>
          </div>
          <div>
            <button
              className="button button--secondary"
              disabled={busy || readOnly}
              onClick={() => retrySync()}
            >
              <RotateCw size={16} />
              {lesson.syncStatus === "deleted_in_google"
                ? "Przywróć w Google"
                : copy.actions.retry}
            </button>
            <button
              className="button button--quiet"
              disabled={busy || readOnly}
              onClick={() => retrySync(true)}
            >
              Pozostaw bez synchronizacji
            </button>
          </div>
        </div>
      )}
      <form
        className="lesson-workspace"
        onSubmit={(event) => event.preventDefault()}
      >
        <div className="lesson-context-bar">
          <span>Wyniki ucznia</span>{" "}
          {students.length > 3 ? (
            <label className="participant-select">
              <span className="sr-only">Wyniki ucznia</span>
              <select
                value={activeStudent?.id ?? ""}
                onChange={(event) => setActiveStudentId(event.target.value)}
              >
                {students.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div
              className="participant-tabs"
              role="group"
              aria-label="Uczestnicy lekcji"
            >
              {students.map((student) => (
                <button
                  key={student.id}
                  type="button"

                  aria-pressed={activeStudent?.id === student.id}
                  className={activeStudent?.id === student.id ? "active" : ""}
                  onClick={() => setActiveStudentId(student.id)}
                >
                  {student.name}
                </button>
              ))}
            </div>
          )}
          <small>
            {activeParticipant?.results.filter((r) => r.completed).length ?? 0}/
            {values.planItems?.length ?? 0} punktów zrealizowano
          </small>
        </div>
        <fieldset
          className="lesson-content"
          disabled={readOnly || isSubmitting}
        >
          <legend className="sr-only">Plan i wyniki lekcji</legend>
          <label className="field field--topic">
            <span>Temat lekcji</span>
            <textarea rows={2} {...register("topic")} />
          </label>
          <div className="plan-heading">
            <div>
              <p className="eyebrow">Wspólny plan</p>
              <h2>Przebieg lekcji</h2>
            </div>
            <button
              type="button"
              className="button button--secondary"
              onClick={addPlanItem}
            >
              <Plus size={17} />
              Dodaj punkt
            </button>
          </div>
          <div className="plan-list">
            {(values.planItems ?? []).map((item, index) => {
              const resultIndex =
                activeParticipant?.results?.findIndex(
                  (result) => result?.planItemId === item?.id,
                ) ?? -1;
              const score =
                resultIndex >= 0
                  ? activeParticipant?.results?.[resultIndex]?.score
                  : undefined;
              const updateScore = (value: string) => {
                if (resultIndex >= 0)
                  setValue(
                    `participants.${participantIndex}.results.${resultIndex}.score`,
                    Number(value),
                    { shouldDirty: true },
                  );
              };
              return (
                <article
                  className={`plan-item${resultIndex >= 0 && activeParticipant?.results?.[resultIndex]?.completed ? " plan-item--done" : ""}`}
                  key={item?.id}
                >
                  <div className="plan-reorder">
                    <GripVertical size={17} aria-hidden="true" />
                    <button
                      type="button"
                      onClick={() => movePlanItem(index, -1)}
                      disabled={index === 0}
                      aria-label="Przesuń punkt wyżej"
                    >
                      <ChevronUp size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => movePlanItem(index, 1)}
                      disabled={index === (values.planItems?.length ?? 0) - 1}
                      aria-label="Przesuń punkt niżej"
                    >
                      <ChevronDown size={15} />
                    </button>
                  </div>
                  <div className="plan-main">
                    <label className="check-row">
                      <input
                        key={`completed-${activeStudent?.id}-${item?.id}`}
                        type="checkbox"
                        disabled={resultIndex < 0}
                        {...(resultIndex >= 0
                          ? register(
                              `participants.${participantIndex}.results.${resultIndex}.completed`,
                            )
                          : {})}
                      />
                      <span>Zrealizowano</span>
                    </label>
                    <label className="field">
                      <span className="sr-only">Treść punktu {index + 1}</span>
                      <textarea
                        rows={2}
                        className="plan-text-input"
                        {...register(`planItems.${index}.text`)}
                        placeholder="Np. ćwiczenie rozmowy"
                      />
                    </label>
                    <div className="score-control">
                      <label htmlFor={`score-${item?.id}`}>
                        Ocena <strong>{score ?? "—"}</strong>
                      </label>
                      <input
                        id={`score-${item?.id}`}
                        type="range"
                        min="1"
                        max="10"
                        value={score ?? 1}
                        aria-valuetext={score ? `${score} z 10` : "Brak oceny"}
                        disabled={resultIndex < 0}
                        onInput={(event) =>
                          updateScore(event.currentTarget.value)
                        }
                        onChange={(event) =>
                          updateScore(event.currentTarget.value)
                        }
                      />
                    </div>
                    {resultIndex >= 0 && (
                      <details className="plan-note">
                        <summary>
                          Notatka · {activeStudent?.name.split(" ")[0]}
                        </summary>
                        <textarea
                          key={`note-${activeStudent?.id}-${item?.id}`}
                          rows={2}
                          aria-label={`Notatka dla ${activeStudent?.name ?? "ucznia"} do punktu ${index + 1}`}
                          {...register(
                            `participants.${participantIndex}.results.${resultIndex}.note`,
                          )}
                        />
                      </details>
                    )}
                  </div>
                  <button
                    type="button"
                    className="icon-button plan-delete"
                    onClick={() => removePlanItem(index)}
                    aria-label={`Usuń punkt ${index + 1}`}
                  >
                    <Trash2 size={17} />
                  </button>
                </article>
              );
            })}
            {!values.planItems?.length && (
              <div className="inline-empty">
                Plan jest pusty. Możesz zapisać lekcję teraz i uzupełnić plan
                później.
              </div>
            )}
          </div>
          <label className="field lesson-textarea">
            <span>Praca domowa</span>
            <textarea rows={4} {...register("homework")} />
          </label>
          <label className="field lesson-textarea">
            <span>Notatka ogólna</span>
            <textarea rows={4} {...register("generalNotes")} />
          </label>
        </fieldset>
        <aside className="lesson-sidebar">
          {activeParticipant && (
            <fieldset
              key={activeStudent.id}
              className="participant-panel"
              disabled={readOnly || isSubmitting}
            >
              <legend className="sr-only">
                Obecność i płatność uczestnika
              </legend>
              <div className="participant-title">
                <span className="avatar">
                  {activeStudent.name
                    .split(" ")
                    .map((part) => part[0])
                    .slice(0, 2)
                    .join("")}
                </span>
                <div>
                  <h2>{activeStudent.name}</h2>
                  <p>{activeStudent.level} · wynik indywidualny</p>
                </div>
              </div>
              <label className="field">
                <span>Obecność</span>
                <select
                  {...register(
                    `participants.${participantIndex}.attendanceStatus`,
                  )}
                >
                  <option value="unknown">Nie oznaczono</option>
                  <option value="present">Obecny/a</option>
                  <option value="absent">Nieobecny/a</option>
                  <option value="cancelled">Odwołana</option>
                </select>
              </label>
              <label className="field">
                <span>Płatność</span>
                <select
                  {...register(
                    `participants.${participantIndex}.paymentStatus`,
                  )}
                >
                  <option value="unpaid">Nieopłacona</option>
                  <option value="paid">Opłacona</option>
                  <option value="cancelled">Anulowana</option>
                </select>
              </label>
            </fieldset>
          )}
          <div className="lesson-side-actions">
            {" "}
            {lesson.seriesId && (
              <fieldset className="scope-choice">
                <legend>Zakres zmiany</legend>
                <label>
                  <input
                    type="radio"
                    checked={seriesScope === "single"}
                    onChange={() => setSeriesScope("single")}
                  />
                  Tylko ta lekcja
                </label>
                <label>
                  <input
                    type="radio"
                    checked={seriesScope === "future"}
                    onChange={() => setSeriesScope("future")}
                  />
                  Ta i kolejne lekcje
                </label>
              </fieldset>
            )}
            <button
              type="button"
              className="button button--secondary button--full"
              disabled={busy || readOnly}
              aria-expanded={rescheduleOpen}
              onClick={openReschedule}
            >
              {copy.actions.changeDate}
            </button>
            {rescheduleOpen && (
              <div className="reschedule-box">
                <div className="form-row">
                  <label className="field">
                    <span>Data</span>
                    <input
                      type="date"
                      value={newDate}
                      onChange={(event) => setNewDate(event.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>Godzina</span>
                    <input
                      type="time"
                      value={newTime}
                      onChange={(event) => setNewTime(event.target.value)}
                    />
                  </label>
                </div>
                <button
                  type="button"
                  className="button button--primary button--full"
                  disabled={busy || readOnly || !newDate || !newTime}
                  onClick={reschedule}
                >
                  Zmień termin
                </button>
              </div>
            )}
            <button
              type="button"
              className="button button--quiet button--full"
              disabled={busy || readOnly || lesson.status === "cancelled"}
              onClick={cancelLesson}
            >
              Anuluj lekcję
            </button>
          </div>
          <div className="lesson-save">
            <p className="save-status" role="status">
              {isSubmitting
                ? "Zapisywanie…"
                : isDirty
                  ? "Niezapisane zmiany"
                  : "Wszystkie zmiany zapisane"}
            </p>
            {saveError && (
              <p className="form-alert" role="alert">
                {saveError}
              </p>
            )}
            <button
              type="button"
              className="button button--secondary button--full"
              onClick={save(false)}
              disabled={busy || readOnly || !isDirty}
            >
              {isSubmitting && <LoaderCircle className="spin" size={17} />}
              Zapisz wersję roboczą
            </button>
            <button
              type="button"
              className="button button--primary button--full"
              onClick={save(true)}
              disabled={busy || readOnly || lesson.status === "cancelled"}
            >
              <CheckCircle2 size={18} />
              {copy.actions.completeLesson}
            </button>
          </div>
        </aside>
      </form>
    </div>
  );
}

function lessonValues(lesson: import("@/lib/domain").Lesson): Values {
  return {
    topic: lesson.topic,
    homework: lesson.homework,
    generalNotes: lesson.generalNotes,
    planItems: lesson.planItems,
    participants: lesson.participants,
  };
}
