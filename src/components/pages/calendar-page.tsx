"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import {
  addDays,
  addMonths,
  addWeeks,
  endOfMonth,
  format,
  startOfMonth,
  subMonths,
  subWeeks,
} from "date-fns";
import { pl } from "date-fns/locale";
import { formatInTimeZone } from "date-fns-tz";
import {
  AlertTriangle,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Plus,
  Trash2,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { useAppData, useAppMutation } from "@/hooks/use-app-data";
import { useMinuteClock } from "@/hooks/use-minute-clock";
import { ClientApiError } from "@/lib/api-client";
import {
  blockDragEntry,
  blockPresetFromCalendarRange,
  buildCalendarMoveAction,
  calendarBounds,
  calendarMinuteFromPointer,
  calendarMinuteFromTime,
  calendarQueryRange,
  calendarRangeFromMinutes,
  calendarTimeFromMinute,
  canDragCalendarLesson,
  dragDurationMinutes,
  isCalendarRangeDrag,
  lessonDragEntry,
  lessonPresetFromCalendarRange,
  moveCalendarEntryOptimistically,
  runOptimisticCalendarMove,
  type CalendarDragEntry,
  type CalendarLessonDragEntry,
  type CalendarRangeSelection,
  type CalendarView,
} from "@/lib/calendar-interactions";
import { copy } from "@/lib/copy";
import {
  getCalendarEventSurface,
  getReadableForeground,
} from "@/lib/calendar-colors";
import type {
  AppData,
  ExternalGoogleEvent,
  Lesson,
  RecurrenceMutationScope,
} from "@/lib/domain";
import {
  formatTime,
  getWeekDays,
  lessonCountLabel,
  localDateKey,
  localInputToUtc,
} from "@/lib/format";
import { useSessionTeacher } from "../app-shell";
import { useAppUi } from "../app-ui-context";
import { PageLoading } from "../ui/loading";
import { LessonStatusBadge } from "../ui/status-badge";
import { CalendarColorPicker } from "../calendar-color-picker";

function externalEventOccursOn(
  event: ExternalGoogleEvent,
  dayKey: string,
  timezone: string,
) {
  return event.allDay
    ? Boolean(
        event.startDate &&
        event.endDate &&
        event.startDate <= dayKey &&
        event.endDate > dayKey,
      )
    : Boolean(
        event.startsAt && localDateKey(event.startsAt, timezone) === dayKey,
      );
}
const hourHeight = 68;

function availabilityForDay(data: AppData, day: Date, timezone: string) {
  const dayKey = localDateKey(day, timezone);
  const weekday = Number(formatInTimeZone(day, timezone, "i"));
  return data.availability.filter(
    (rule) =>
      (rule.kind === "recurring" && rule.weekday === weekday) ||
      (rule.kind === "single" && localDateKey(rule.start, timezone) === dayKey),
  );
}

function isAllDayUnavailable(data: AppData, day: Date, timezone: string) {
  return availabilityForDay(data, day, timezone).some(
    (rule) => rule.allDay && !rule.isAvailable,
  );
}

export function CalendarPage() {
  const session = useSessionTeacher();
  const [view, setView] = useState<CalendarView>("week");
  const [anchor, setAnchor] = useState(new Date());
  const queryRange = useMemo(
    () => calendarQueryRange(anchor, view, session.timezone),
    [anchor, session.timezone, view],
  );
  const { data, isPending } = useAppData(session.id, queryRange);
  const mutation = useAppMutation(session.id);
  const queryClient = useQueryClient();
  const { openLessonComposer, showToast, showError } = useAppUi();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [planningStudentId, setPlanningStudentId] = useState(
    searchParams.get("student") ?? "",
  );
  const [dragged, setDragged] = useState<CalendarDragEntry | null>(null);
  const [rangeChoice, setRangeChoice] = useState<
    | (CalendarRangeSelection & {
        point: { x: number; y: number };
      })
    | null
  >(null);
  const [availabilityMove, setAvailabilityMove] = useState<{
    entry: CalendarDragEntry;
    startsAt: string;
    scope?: RecurrenceMutationScope;
  } | null>(null);
  const [recurrenceMove, setRecurrenceMove] = useState<{
    entry: CalendarLessonDragEntry;
    startsAt: string;
    kind: "scope" | "historical";
    scope: Extract<RecurrenceMutationScope, "single" | "future">;
  } | null>(null);
  const [conflict, setConflict] = useState<{
    lesson: Lesson;
    date: string;
    time: string;
  } | null>(null);
  const [blockForm, setBlockForm] = useState({
    open: false,
    title: "Prywatne",
    date: localDateKey(new Date(), session.timezone),
    start: "12:00",
    end: "13:00",
    color: "#7F8A9A",
  });
  useEffect(() => {
    const action = searchParams.get("action");
    if (!action) return;
    const timer = window.setTimeout(() => {
      if (action === "lesson") openLessonComposer();
      if (action === "block") {
        setBlockForm((current) => ({
          ...current,
          open: true,
          date: localDateKey(anchor, session.timezone),
        }));
      }
      router.replace("/app/kalendarz", { scroll: false });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [anchor, openLessonComposer, router, searchParams, session.timezone]);
  useEffect(() => {
    const saved = window.localStorage.getItem(
      "easy4tutor-calendar-view",
    ) as CalendarView | null;
    const mobile = window.matchMedia("(max-width: 720px)").matches;
    const validSaved = ["day", "week", "month", "agenda"].includes(saved ?? "");
    const preferred =
      mobile && (!validSaved || saved === "week")
        ? "day"
        : validSaved
          ? saved!
          : "week";
    const timer = window.setTimeout(() => setView(preferred), 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    window.localStorage.setItem("easy4tutor-calendar-view", view);
  }, [view]);
  const timezone = data?.teacher.timezone ?? session.timezone;
  const weekDays = useMemo(
    () => getWeekDays(anchor, timezone),
    [anchor, timezone],
  );
  const rangeDays = useMemo(
    () => (view === "day" ? [anchor] : weekDays),
    [view, anchor, weekDays],
  );
  const rangeLessons = useMemo(() => {
    if (!data) return [];
    const keys = new Set(rangeDays.map((day) => localDateKey(day, timezone)));
    return data.lessons.filter((lesson) =>
      keys.has(localDateKey(lesson.startsAt, timezone)),
    );
  }, [data, rangeDays, timezone]);

  if (isPending || !data) return <PageLoading />;
  const readOnly = data.teacher.subscription.readOnly;
  const planningStudent = data.students.find(
    (student) => student.id === planningStudentId,
  );
  function move(direction: -1 | 1) {
    setAnchor((current) =>
      view === "month"
        ? direction === 1
          ? addMonths(current, 1)
          : subMonths(current, 1)
        : view === "day"
          ? addDays(current, direction)
          : direction === 1
            ? addWeeks(current, 1)
            : subWeeks(current, 1),
    );
  }
  function handleSlot(day: Date, time: string, occupied?: Lesson) {
    if (readOnly) return;
    const date = localDateKey(day, timezone);
    if (
      occupied &&
      planningStudentId &&
      !occupied.participantIds.includes(planningStudentId)
    ) {
      setConflict({ lesson: occupied, date, time });
      return;
    }
    if (occupied && occupied.status !== "cancelled") return;
    openLessonComposer({
      studentIds: planningStudentId ? [planningStudentId] : undefined,
      date,
      time,
    });
  }
  async function moveCalendarEntry(
    entry: CalendarDragEntry,
    startsAt: string,
    allowOutsideAvailability = false,
    scope?: RecurrenceMutationScope,
  ) {
    if (readOnly || mutation.isPending) return;
    const queryKey = ["app", session.id] as const;
    await queryClient.cancelQueries({ queryKey });
    const snapshots = queryClient.getQueriesData<AppData>({ queryKey });
    const action = buildCalendarMoveAction(
      entry,
      startsAt,
      timezone,
      allowOutsideAvailability,
      scope,
    );
    try {
      if (scope === "future") {
        await mutation.mutateAsync(action);
      } else {
        await runOptimisticCalendarMove({
          apply: () => {
            queryClient.setQueriesData<AppData>({ queryKey }, (current) =>
              current
                ? moveCalendarEntryOptimistically(current, entry, startsAt)
                : current,
            );
          },
          persist: () => mutation.mutateAsync(action),
          rollback: () => {
            snapshots.forEach(([key, value]) =>
              queryClient.setQueryData(key as QueryKey, value),
            );
          },
        });
      }
    } catch (error) {
      if (
        entry.kind === "lesson" &&
        !allowOutsideAvailability &&
        error instanceof ClientApiError &&
        error.data.code === "OUTSIDE_AVAILABILITY"
      ) {
        setAvailabilityMove({ entry, startsAt, scope });
      } else {
        showError(error);
      }
    } finally {
      setDragged(null);
    }
  }
  function dropCalendarEntry(day: Date, time: string) {
    if (!dragged) return;
    const startsAt = localInputToUtc(
      localDateKey(day, timezone),
      time,
      timezone,
    );
    if (dragged.kind === "lesson" && dragged.seriesId) {
      setRecurrenceMove({
        entry: dragged,
        startsAt,
        kind: dragged.status === "completed" ? "historical" : "scope",
        scope: dragged.status === "completed" ? "future" : "single",
      });
      setDragged(null);
      return;
    }
    void moveCalendarEntry(dragged, startsAt);
  }
  async function createBlock(event: React.FormEvent) {
    event.preventDefault();
    try {
      await mutation.mutateAsync({
        type: "createCalendarBlock",
        block: {
          title: blockForm.title.trim(),
          startsAt: localInputToUtc(blockForm.date, blockForm.start, timezone),
          endsAt: localInputToUtc(blockForm.date, blockForm.end, timezone),
          timezone,
          color: blockForm.color,
        },
      });
      setBlockForm((current) => ({ ...current, open: false }));
      showToast({ message: "Czas został zablokowany" });
    } catch (error) {
      showError(error);
    }
  }
  async function deleteBlock(blockId: string) {
    if (!window.confirm("Usunąć tę blokadę czasu?")) return;
    try {
      await mutation.mutateAsync({ type: "deleteCalendarBlock", blockId });
      showToast({ message: "Blokada czasu usunięta" });
    } catch (error) {
      showError(error);
    }
  }

  return (
    <div className="calendar-page page-enter">
      <header className="page-header calendar-header">
        <div>
          <p className="eyebrow">Czas pod kontrolą</p>
          <h1>Kalendarz</h1>
        </div>
        <div className="calendar-header-actions">
          <button
            className="button button--secondary"
            disabled={readOnly}
            onClick={() =>
              setBlockForm((current) => ({
                ...current,
                open: true,
                date: localDateKey(anchor, timezone),
              }))
            }
          >
            Zablokuj czas
          </button>
          <button
            className="button button--primary"
            disabled={readOnly}
            onClick={() =>
              openLessonComposer({
                studentIds: planningStudentId ? [planningStudentId] : undefined,
              })
            }
          >
            <Plus size={18} />
            {copy.actions.addLesson}
          </button>
        </div>
      </header>
      <div className="calendar-toolbar">
        <div className="calendar-nav">
          <button
            className="icon-button icon-button--border"
            onClick={() => move(-1)}
            aria-label="Poprzedni okres"
          >
            <ChevronLeft size={19} />
          </button>
          <button
            className="button button--quiet"
            onClick={() => setAnchor(new Date())}
          >
            Dzisiaj
          </button>
          <button
            className="icon-button icon-button--border"
            onClick={() => move(1)}
            aria-label="Następny okres"
          >
            <ChevronRight size={19} />
          </button>
          <strong>
            {view === "month"
              ? formatInTimeZone(anchor, timezone, "LLLL yyyy", { locale: pl })
              : `${formatInTimeZone(rangeDays[0], timezone, "d MMM", { locale: pl })} – ${formatInTimeZone(rangeDays.at(-1)!, timezone, "d MMM yyyy", { locale: pl })}`}
          </strong>
        </div>
        <div className="segmented-control segmented-control--compact view-switch">
          {(
            [
              ["day", "Dzień"],
              ["week", "Tydzień"],
              ["month", "Miesiąc"],
              ["agenda", "Agenda"],
            ] as const
          ).map(([value, label]) => (
            <button
              className={view === value ? "selected" : ""}
              key={value}
              data-view={value}
              aria-pressed={view === value}
              onClick={() => setView(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {data.lessons.some((lesson) =>
        ["failed", "deleted_in_google"].includes(lesson.syncStatus),
      ) && (
        <div className="calendar-sync-notice" role="status">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>
            Nie wszystkie lekcje są widoczne w Google Calendar. Tutaj Twój plan
            jest zapisany.
          </span>
          <Link href="/app/ustawienia/integracje">Sprawdź połączenie</Link>
        </div>
      )}
      <div className="planning-bar">
        <label>
          <Users size={17} aria-hidden="true" />
          <span>
            {planningStudent ? "Planujesz lekcję dla:" : "Tryb planowania:"}
          </span>
          <select
            value={planningStudentId}
            onChange={(event) => setPlanningStudentId(event.target.value)}
          >
            <option value="">Wybierz ucznia</option>
            {data.students
              .filter((student) => student.status === "active")
              .map((student) => (
                <option value={student.id} key={student.id}>
                  {student.name}
                </option>
              ))}
          </select>
        </label>
        {planningStudent && (
          <button
            className="text-link"
            onClick={() => setPlanningStudentId("")}
          >
            Zakończ planowanie <X size={15} />
          </button>
        )}
      </div>
      {(view === "week" || view === "day") && (
        <CalendarGrid
          days={rangeDays}
          lessons={rangeLessons}
          data={data}
          timezone={timezone}
          planning={Boolean(planningStudentId)}
          onSlot={handleSlot}
          dragged={dragged}
          onDrag={setDragged}
          onDrop={dropCalendarEntry}
          selectedRange={rangeChoice}
          onRangeSelect={(range, point) => setRangeChoice({ ...range, point })}
          readOnly={readOnly || mutation.isPending}
          onDragEnd={() => setDragged(null)}
          onDeleteBlock={deleteBlock}
        />
      )}
      {view === "month" && (
        <MonthView
          anchor={anchor}
          data={data}
          timezone={timezone}
          onDay={(day) => {
            setAnchor(day);
            setView("day");
          }}
        />
      )}
      {view === "agenda" && (
        <AgendaView
          days={rangeDays}
          data={data}
          timezone={timezone}
          openLessonComposer={(preset) =>
            openLessonComposer({
              ...preset,
              studentIds: planningStudentId ? [planningStudentId] : undefined,
            })
          }
          onDeleteBlock={deleteBlock}
        />
      )}
      <div className="mobile-calendar-agenda">
        <AgendaView
          days={rangeDays}
          data={data}
          timezone={timezone}
          openLessonComposer={(preset) =>
            openLessonComposer({
              ...preset,
              studentIds: planningStudentId ? [planningStudentId] : undefined,
            })
          }
          onDeleteBlock={deleteBlock}
        />
      </div>

      {rangeChoice && (
        <RangeActionMenu
          selection={rangeChoice}
          onCancel={() => setRangeChoice(null)}
          onLesson={() => {
            openLessonComposer(
              lessonPresetFromCalendarRange(
                rangeChoice,
                planningStudentId ? [planningStudentId] : undefined,
              ),
            );
            setRangeChoice(null);
          }}
          onBlock={() => {
            setBlockForm((current) => ({
              ...current,
              open: true,
              ...blockPresetFromCalendarRange(rangeChoice),
            }));
            setRangeChoice(null);
          }}
        />
      )}

      <Dialog.Root
        open={Boolean(recurrenceMove)}
        onOpenChange={(open) => {
          if (!open) setRecurrenceMove(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content dialog-content--alert">
            {recurrenceMove?.kind === "historical" ? (
              <>
                <Dialog.Title>Te zajęcia zostały już zakończone.</Dialog.Title>
                <Dialog.Description>
                  Możesz przenieść przyszłe zajęcia z tej serii.
                </Dialog.Description>
                <footer className="dialog-footer">
                  <button
                    className="button button--quiet"
                    onClick={() => setRecurrenceMove(null)}
                  >
                    Anuluj
                  </button>
                  <button
                    className="button button--primary"
                    disabled={mutation.isPending}
                    onClick={() => {
                      if (!recurrenceMove) return;
                      const pending = recurrenceMove;
                      setRecurrenceMove(null);
                      void moveCalendarEntry(
                        pending.entry,
                        pending.startsAt,
                        false,
                        "future",
                      );
                    }}
                  >
                    Przenieś przyszłe zajęcia
                  </button>
                </footer>
              </>
            ) : (
              <>
                <Dialog.Title>Przenieś:</Dialog.Title>
                <Dialog.Description>
                  Wybierz, których zajęć ma dotyczyć nowy termin.
                </Dialog.Description>
                <fieldset className="scope-choice">
                  <legend>Zakres zmiany</legend>
                  <label>
                    <input
                      type="radio"
                      name="calendar-recurrence-scope"
                      value="single"
                      checked={recurrenceMove?.scope === "single"}
                      onChange={() =>
                        setRecurrenceMove((current) =>
                          current ? { ...current, scope: "single" } : current,
                        )
                      }
                    />
                    Tylko te zajęcia
                  </label>
                  <label>
                    <input
                      type="radio"
                      name="calendar-recurrence-scope"
                      value="future"
                      checked={recurrenceMove?.scope === "future"}
                      onChange={() =>
                        setRecurrenceMove((current) =>
                          current ? { ...current, scope: "future" } : current,
                        )
                      }
                    />
                    Te i kolejne zajęcia
                  </label>
                </fieldset>
                <footer className="dialog-footer">
                  <button
                    className="button button--quiet"
                    onClick={() => setRecurrenceMove(null)}
                  >
                    Anuluj
                  </button>
                  <button
                    className="button button--primary"
                    disabled={mutation.isPending}
                    onClick={() => {
                      if (!recurrenceMove) return;
                      const pending = recurrenceMove;
                      setRecurrenceMove(null);
                      void moveCalendarEntry(
                        pending.entry,
                        pending.startsAt,
                        false,
                        pending.scope,
                      );
                    }}
                  >
                    Przenieś
                  </button>
                </footer>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root
        open={Boolean(availabilityMove)}
        onOpenChange={(open) => {
          if (!open) setAvailabilityMove(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content dialog-content--alert">
            <Dialog.Title>Termin poza dostępnością</Dialog.Title>
            <Dialog.Description>
              Ten termin jest poza Twoją regularną dostępnością. Możesz zachować
              go jako ręczny wyjątek.
            </Dialog.Description>
            <div className="dialog-alert-icon">
              <AlertTriangle size={24} />
            </div>
            <footer className="dialog-footer">
              <button
                className="button button--quiet"
                onClick={() => setAvailabilityMove(null)}
              >
                Wybierz inny termin
              </button>
              <button
                className="button button--primary"
                disabled={mutation.isPending}
                onClick={() => {
                  if (!availabilityMove) return;
                  const pending = availabilityMove;
                  setAvailabilityMove(null);
                  void moveCalendarEntry(
                    pending.entry,
                    pending.startsAt,
                    true,
                    pending.scope,
                  );
                }}
              >
                Przenieś mimo to
              </button>
            </footer>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root
        open={Boolean(conflict)}
        onOpenChange={(open) => {
          if (!open) setConflict(null);
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content dialog-content--alert">
            <Dialog.Title>Ten termin jest już zajęty</Dialog.Title>
            <Dialog.Description>
              {conflict
                ? `W tym czasie trwa lekcja: ${conflict.lesson.participantIds.map((id) => data.students.find((student) => student.id === id)?.name).join(", ")}. Utworzyć lekcję grupową?`
                : ""}
            </Dialog.Description>
            <div className="dialog-alert-icon">
              <AlertTriangle size={24} />
            </div>
            <footer className="dialog-footer">
              <button
                className="button button--quiet"
                onClick={() => setConflict(null)}
              >
                Wybierz inny termin
              </button>
              <button
                className="button button--primary"
                onClick={() => {
                  if (conflict)
                    openLessonComposer({
                      studentIds: [planningStudentId],
                      date: conflict.date,
                      time: conflict.time,
                    });
                  setConflict(null);
                }}
              >
                <Users size={17} />
                Sprawdź lekcję grupową
              </button>
            </footer>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root
        open={blockForm.open}
        onOpenChange={(open) =>
          setBlockForm((current) => ({ ...current, open }))
        }
      >
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content className="dialog-content dialog-content--alert">
            <Dialog.Title>Zablokuj czas</Dialog.Title>
            <Dialog.Description>
              Blokada zajmuje termin, ale nie tworzy lekcji ani płatności.
            </Dialog.Description>
            <form className="form-stack" onSubmit={createBlock}>
              <label className="field">
                <span>Tytuł</span>
                <input
                  required
                  value={blockForm.title}
                  onChange={(event) =>
                    setBlockForm((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="field">
                <span>Data</span>
                <input
                  type="date"
                  required
                  value={blockForm.date}
                  onChange={(event) =>
                    setBlockForm((current) => ({
                      ...current,
                      date: event.target.value,
                    }))
                  }
                />
              </label>
              <div className="form-row">
                <label className="field">
                  <span>Od</span>
                  <input
                    type="time"
                    required
                    value={blockForm.start}
                    onChange={(event) =>
                      setBlockForm((current) => ({
                        ...current,
                        start: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Do</span>
                  <input
                    type="time"
                    required
                    min={blockForm.start}
                    value={blockForm.end}
                    onChange={(event) =>
                      setBlockForm((current) => ({
                        ...current,
                        end: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
              <CalendarColorPicker
                value={blockForm.color}
                onChange={(color) =>
                  setBlockForm((current) => ({ ...current, color }))
                }
              />
              <footer className="dialog-footer">
                <button
                  type="button"
                  className="button button--quiet"
                  onClick={() =>
                    setBlockForm((current) => ({ ...current, open: false }))
                  }
                >
                  Anuluj
                </button>
                <button
                  className="button button--primary"
                  disabled={
                    mutation.isPending || blockForm.end <= blockForm.start
                  }
                >
                  Zablokuj czas
                </button>
              </footer>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

function RangeActionMenu({
  selection,
  onLesson,
  onBlock,
  onCancel,
}: {
  selection: CalendarRangeSelection & { point: { x: number; y: number } };
  onLesson: () => void;
  onBlock: () => void;
  onCancel: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const closeOnPointer = (event: globalThis.PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onCancel();
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("pointerdown", closeOnPointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [onCancel]);
  const left = Math.max(
    12,
    Math.min(selection.point.x, window.innerWidth - 268),
  );
  const top = Math.max(
    12,
    Math.min(selection.point.y + 10, window.innerHeight - 220),
  );
  return (
    <div
      ref={menuRef}
      className="calendar-range-menu"
      role="dialog"
      aria-label="Działanie dla zaznaczonego czasu"
      style={{ left, top }}
    >
      <strong>Co chcesz zrobić?</strong>
      <span>
        {selection.start}–{selection.end}
      </span>
      <button className="button button--primary" onClick={onLesson}>
        Dodaj lekcję
      </button>
      <button className="button button--secondary" onClick={onBlock}>
        Zablokuj czas
      </button>
      <button className="button button--quiet" onClick={onCancel}>
        Anuluj
      </button>
    </div>
  );
}

function CalendarGrid({
  days,
  lessons,
  data,
  timezone,
  planning,
  onSlot,
  dragged,
  onDrag,
  onDrop,
  selectedRange,
  onRangeSelect,
  readOnly,
  onDragEnd,
  onDeleteBlock,
}: {
  days: Date[];
  lessons: Lesson[];
  data: import("@/lib/domain").AppData;
  timezone: string;
  planning: boolean;
  readOnly: boolean;
  onDragEnd: () => void;
  onDeleteBlock: (blockId: string) => void;
  onSlot: (day: Date, time: string, lesson?: Lesson) => void;
  dragged: CalendarDragEntry | null;
  onDrag: (entry: CalendarDragEntry) => void;
  onDrop: (day: Date, time: string) => void;
  selectedRange: CalendarRangeSelection | null;
  onRangeSelect: (
    range: CalendarRangeSelection,
    point: { x: number; y: number },
  ) => void;
}) {
  const now = useMinuteClock();
  const [hoverSlot, setHoverSlot] = useState<{
    day: string;
    minute: number;
  } | null>(null);
  const [dragHover, setDragHover] = useState<{
    day: string;
    minute: number;
  } | null>(null);
  const [selectionDraft, setSelectionDraft] =
    useState<CalendarRangeSelection | null>(null);
  const selectionGesture = useRef<{
    day: string;
    pointerId: number;
    startY: number;
    anchorMinute: number;
  } | null>(null);
  const suppressClick = useRef(false);
  const { startHour, endHour } = calendarBounds(lessons, timezone, data);
  const hours = Array.from(
    { length: endHour - startHour },
    (_, i) => startHour + i,
  );
  return (
    <div
      className={`calendar-grid-shell${days.length === 1 ? " calendar-grid-shell--day" : ""}`}
      style={
        {
          "--calendar-height": `${hours.length * hourHeight}px`,
          "--calendar-hour-height": `${hourHeight}px`,
        } as CSSProperties
      }
    >
      <div className="calendar-corner" />
      <div className="calendar-day-heads">
        {days.map((day) => {
          const today =
            localDateKey(day, timezone) === localDateKey(now, timezone);
          const allDayUnavailable = isAllDayUnavailable(data, day, timezone);
          const count = lessons.filter(
            (lesson) =>
              localDateKey(lesson.startsAt, timezone) ===
              localDateKey(day, timezone),
          ).length;
          const allDayGoogle = data.externalGoogleEvents.filter(
            (event) =>
              event.allDay &&
              externalEventOccursOn(
                event,
                localDateKey(day, timezone),
                timezone,
              ),
          );
          return (
            <div
              key={day.toISOString()}
              className={`${today ? "today" : ""}${allDayUnavailable ? " calendar-day-head--unavailable" : ""}`}
            >
              <span>
                {formatInTimeZone(day, timezone, "EEE", { locale: pl })}
              </span>
              <strong>{formatInTimeZone(day, timezone, "d")}</strong>
              <small>{lessonCountLabel(count)}</small>
              {allDayUnavailable && (
                <span className="calendar-day-status">Niedostępny</span>
              )}
              {allDayGoogle.length > 0 && !allDayUnavailable && (
                <span
                  className="calendar-day-status calendar-day-status--google"
                  title={allDayGoogle.map((event) => event.title).join(", ")}
                >
                  Google · cały dzień
                </span>
              )}
              <button
                className="calendar-add-day"
                disabled={readOnly}
                aria-label={`Dodaj lekcję: ${formatInTimeZone(day, timezone, "d MMMM", { locale: pl })}`}
                onClick={() => onSlot(day, "09:00")}
              >
                <Plus size={15} />
              </button>
            </div>
          );
        })}
      </div>
      <div className="calendar-times">
        {hours.map((hour) => (
          <time key={hour}>{String(hour).padStart(2, "0")}:00</time>
        ))}
      </div>
      <div className="calendar-columns">
        {days.map((day) => {
          const dayKey = localDateKey(day, timezone);
          const dayLessons = lessons.filter(
            (lesson) => localDateKey(lesson.startsAt, timezone) === dayKey,
          );
          const dayBlocks = data.calendarBlocks.filter(
            (block) => localDateKey(block.startsAt, timezone) === dayKey,
          );
          const dayExternalEvents = data.externalGoogleEvents.filter(
            (event) =>
              !event.allDay && externalEventOccursOn(event, dayKey, timezone),
          );
          const availability = availabilityForDay(data, day, timezone);
          const allDayUnavailable = availability.some(
            (rule) => rule.allDay && !rule.isAvailable,
          );
          const today = dayKey === localDateKey(now, timezone);
          const nowMinutes =
            Number(formatInTimeZone(now, timezone, "H")) * 60 +
            Number(formatInTimeZone(now, timezone, "m"));
          const visibleSelection =
            selectionDraft?.date === dayKey
              ? selectionDraft
              : selectedRange?.date === dayKey
                ? selectedRange
                : null;
          return (
            <div
              className={`calendar-day-column${today ? " today" : ""}${allDayUnavailable ? " calendar-day-column--unavailable" : ""}`}
              key={dayKey}
              onDragOver={(event) => {
                event.preventDefault();
                if (!dragged) return;
                const minute = calendarMinuteFromPointer({
                  clientY: event.clientY,
                  columnTop: event.currentTarget.getBoundingClientRect().top,
                  startHour,
                  endHour,
                  durationMinutes: dragDurationMinutes(dragged),
                });
                setDragHover({ day: dayKey, minute });
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (!dragged) return;
                const minute = calendarMinuteFromPointer({
                  clientY: event.clientY,
                  columnTop: event.currentTarget.getBoundingClientRect().top,
                  startHour,
                  endHour,
                  durationMinutes: dragDurationMinutes(dragged),
                });
                setDragHover(null);
                onDrop(day, calendarTimeFromMinute(minute));
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node))
                  setDragHover(null);
              }}
              onMouseLeave={() => setHoverSlot(null)}
              onMouseMove={(event) => {
                if (
                  readOnly ||
                  dragged ||
                  selectionGesture.current ||
                  (event.target as HTMLElement).closest("[data-event]")
                ) {
                  setHoverSlot(null);
                  return;
                }
                const minute = calendarMinuteFromPointer({
                  clientY: event.clientY,
                  columnTop: event.currentTarget.getBoundingClientRect().top,
                  startHour,
                  endHour,
                });
                setHoverSlot({ day: dayKey, minute });
              }}
              onPointerDown={(event) => {
                if (
                  readOnly ||
                  event.pointerType !== "mouse" ||
                  event.button !== 0 ||
                  (event.target as HTMLElement).closest(
                    "[data-event], button, a, input, select",
                  )
                )
                  return;
                event.preventDefault();
                const anchorMinute = calendarMinuteFromPointer({
                  clientY: event.clientY,
                  columnTop: event.currentTarget.getBoundingClientRect().top,
                  startHour,
                  endHour,
                });
                selectionGesture.current = {
                  day: dayKey,
                  pointerId: event.pointerId,
                  startY: event.clientY,
                  anchorMinute,
                };
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                const gesture = selectionGesture.current;
                if (
                  !gesture ||
                  gesture.day !== dayKey ||
                  gesture.pointerId !== event.pointerId ||
                  !isCalendarRangeDrag(gesture.startY, event.clientY)
                )
                  return;
                const currentMinute = calendarMinuteFromPointer({
                  clientY: event.clientY,
                  columnTop: event.currentTarget.getBoundingClientRect().top,
                  startHour,
                  endHour,
                  durationMinutes: 0,
                });
                setHoverSlot(null);
                setSelectionDraft(
                  calendarRangeFromMinutes(
                    dayKey,
                    gesture.anchorMinute,
                    currentMinute,
                  ),
                );
              }}
              onPointerUp={(event) => {
                const gesture = selectionGesture.current;
                if (
                  !gesture ||
                  gesture.day !== dayKey ||
                  gesture.pointerId !== event.pointerId
                )
                  return;
                selectionGesture.current = null;
                if (event.currentTarget.hasPointerCapture(event.pointerId))
                  event.currentTarget.releasePointerCapture(event.pointerId);
                if (!isCalendarRangeDrag(gesture.startY, event.clientY)) {
                  suppressClick.current = true;
                  setSelectionDraft(null);
                  onSlot(day, calendarTimeFromMinute(gesture.anchorMinute));
                  return;
                }
                const currentMinute = calendarMinuteFromPointer({
                  clientY: event.clientY,
                  columnTop: event.currentTarget.getBoundingClientRect().top,
                  startHour,
                  endHour,
                  durationMinutes: 0,
                });
                const range = calendarRangeFromMinutes(
                  dayKey,
                  gesture.anchorMinute,
                  currentMinute,
                );
                suppressClick.current = true;
                setSelectionDraft(null);
                onRangeSelect(range, { x: event.clientX, y: event.clientY });
              }}
              onPointerCancel={(event) => {
                selectionGesture.current = null;
                setSelectionDraft(null);
                if (event.currentTarget.hasPointerCapture(event.pointerId))
                  event.currentTarget.releasePointerCapture(event.pointerId);
              }}
              onClick={(event) => {
                if (suppressClick.current) {
                  suppressClick.current = false;
                  return;
                }
                if (
                  readOnly ||
                  selectedRange ||
                  (event.target as HTMLElement).closest("[data-event]")
                )
                  return;
                const minute = calendarMinuteFromPointer({
                  clientY: event.clientY,
                  columnTop: event.currentTarget.getBoundingClientRect().top,
                  startHour,
                  endHour,
                });
                onSlot(day, calendarTimeFromMinute(minute));
              }}
            >
              {allDayUnavailable && (
                <div className="calendar-full-day-block" aria-hidden="true">
                  <span>Cały dzień niedostępny</span>
                </div>
              )}
              {!allDayUnavailable && hoverSlot?.day === dayKey && (
                <span
                  aria-hidden="true"
                  className="calendar-slot-preview"
                  style={{
                    top:
                      ((hoverSlot.minute - startHour * 60) / 60) * hourHeight,
                  }}
                >
                  <Plus size={12} />
                  {calendarTimeFromMinute(hoverSlot.minute)}
                </span>
              )}
              {visibleSelection && (
                <span
                  aria-hidden="true"
                  className="calendar-range-selection"
                  style={{
                    top:
                      ((calendarMinuteFromTime(visibleSelection.start) -
                        startHour * 60) /
                        60) *
                      hourHeight,
                    height:
                      (visibleSelection.durationMinutes / 60) * hourHeight,
                  }}
                >
                  {visibleSelection.start}–{visibleSelection.end}
                </span>
              )}
              {dragged && dragHover?.day === dayKey && (
                <span
                  aria-hidden="true"
                  className={`calendar-drag-preview calendar-drag-preview--${dragged.kind}`}
                  style={{
                    top:
                      ((dragHover.minute - startHour * 60) / 60) * hourHeight,
                    height:
                      (dragDurationMinutes(dragged) / 60) * hourHeight - 3,
                  }}
                >
                  {calendarTimeFromMinute(dragHover.minute)}–
                  {calendarTimeFromMinute(
                    dragHover.minute + dragDurationMinutes(dragged),
                  )}
                </span>
              )}
              {hours.map((hour) => (
                <span
                  key={hour}
                  className="hour-line"
                  style={{ top: (hour - startHour) * hourHeight }}
                />
              ))}
              {availability
                .filter((rule) => !rule.allDay && !rule.isAvailable)
                .map((rule) => {
                  const start =
                    Number(formatInTimeZone(rule.start, timezone, "H")) * 60 +
                    Number(formatInTimeZone(rule.start, timezone, "m"));
                  const end =
                    Number(formatInTimeZone(rule.end, timezone, "H")) * 60 +
                    Number(formatInTimeZone(rule.end, timezone, "m"));
                  return (
                    <div
                      key={rule.id}
                      className="availability-block"
                      style={{
                        top:
                          ((Math.max(start, startHour * 60) - startHour * 60) /
                            60) *
                          hourHeight,
                        height:
                          (Math.max(
                            0,
                            Math.min(end, endHour * 60) -
                              Math.max(start, startHour * 60),
                          ) /
                            60) *
                          hourHeight,
                      }}
                    >
                      <span>{rule.label}</span>
                    </div>
                  );
                })}
              {dayBlocks.map((block) => {
                const startMinutes =
                  Number(formatInTimeZone(block.startsAt, timezone, "H")) * 60 +
                  Number(formatInTimeZone(block.startsAt, timezone, "m"));
                const endMinutes =
                  Number(formatInTimeZone(block.endsAt, timezone, "H")) * 60 +
                  Number(formatInTimeZone(block.endsAt, timezone, "m"));
                return (
                  <div
                    data-event
                    className="calendar-block"
                    key={block.id}
                    draggable={!readOnly}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", block.id);
                      onDrag(blockDragEntry(block));
                    }}
                    onDragEnd={() => {
                      setDragHover(null);
                      onDragEnd();
                    }}
                    style={{
                      ...calendarColorStyle(block.color),
                      top: ((startMinutes - startHour * 60) / 60) * hourHeight,
                      height: Math.max(
                        30,
                        ((endMinutes - startMinutes) / 60) * hourHeight - 3,
                      ),
                    }}
                    title={`${block.title} · ${formatTime(block.startsAt, timezone)}–${formatTime(block.endsAt, timezone)}`}
                  >
                    <time>{formatTime(block.startsAt, timezone)}</time>
                    <strong>{block.title}</strong>
                    <small>Blokada czasu</small>
                    {!readOnly && (
                      <button
                        type="button"
                        className="calendar-block-delete"
                        aria-label={`Usuń blokadę: ${block.title}`}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          onDeleteBlock(block.id);
                        }}
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                );
              })}
              {dayExternalEvents.map((external) => {
                const startMinutes =
                  Number(formatInTimeZone(external.startsAt!, timezone, "H")) *
                    60 +
                  Number(formatInTimeZone(external.startsAt!, timezone, "m"));
                const endMinutes =
                  Number(formatInTimeZone(external.endsAt!, timezone, "H")) *
                    60 +
                  Number(formatInTimeZone(external.endsAt!, timezone, "m"));
                return (
                  <div
                    data-event
                    role="group"
                    aria-label={`Wydarzenie Google: ${external.title}`}
                    className={`calendar-external-event${external.transparency === "transparent" ? " calendar-external-event--free" : ""}`}
                    key={external.id}
                    style={{
                      ...calendarColorStyle(external.color),
                      top: ((startMinutes - startHour * 60) / 60) * hourHeight,
                      height: Math.max(
                        30,
                        ((endMinutes - startMinutes) / 60) * hourHeight - 3,
                      ),
                    }}
                    title={`${external.title} · ${formatTime(external.startsAt!, timezone)}–${formatTime(external.endsAt!, timezone)} · tylko do odczytu`}
                  >
                    <CalendarClock size={12} aria-hidden="true" />
                    <time>{formatTime(external.startsAt!, timezone)}</time>
                    <strong>{external.title}</strong>
                    <small>
                      Google Calendar
                      {external.transparency === "transparent"
                        ? " · wolny"
                        : " · zajęty"}
                    </small>
                  </div>
                );
              })}
              {dayLessons.map((lesson) => {
                const localHour = Number(
                  formatInTimeZone(lesson.startsAt, timezone, "H"),
                );
                const localMinute = Number(
                  formatInTimeZone(lesson.startsAt, timezone, "m"),
                );
                const top =
                  ((localHour * 60 + localMinute - startHour * 60) / 60) *
                  hourHeight;
                const group = lesson.groupId
                  ? data.groups.find((item) => item.id === lesson.groupId)
                  : undefined;
                const names = lesson.participantIds
                  .map(
                    (id) =>
                      data.students.find((student) => student.id === id)?.name,
                  )
                  .filter(Boolean);
                const label = group?.name ?? names.join(", ");
                return (
                  <Link
                    data-event
                    data-compact={lesson.durationMinutes < 60 || undefined}
                    href={`/app/lekcje/${lesson.id}`}
                    key={lesson.id}
                    draggable={canDragCalendarLesson(lesson, readOnly)}
                    onDragEnd={() => {
                      setDragHover(null);
                      onDragEnd();
                    }}
                    title={`${label} · ${lesson.subject || lesson.topic || "Temat do ustalenia"} · ${lesson.durationMinutes} min · ${copy.status[lesson.status]}`}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", lesson.id);
                      onDrag(lessonDragEntry(lesson));
                    }}
                    className={`calendar-event calendar-event--${lesson.status}${["failed", "deleted_in_google"].includes(lesson.syncStatus) ? " calendar-event--sync-error" : ""}`}
                    style={{
                      ...calendarColorStyle(lesson.color),
                      top: Math.max(0, top),
                      height: Math.max(
                        36,
                        Math.min(
                          (lesson.durationMinutes / 60) * hourHeight,
                          hours.length * hourHeight - Math.max(0, top),
                        ) - 3,
                      ),
                    }}
                    onClick={(event) => {
                      if (planning && lesson.status !== "cancelled") {
                        event.preventDefault();
                        onSlot(
                          day,
                          formatTime(lesson.startsAt, timezone),
                          lesson,
                        );
                      }
                    }}
                  >
                    <GripVertical
                      className="event-grip"
                      size={13}
                      aria-hidden="true"
                    />
                    <time>
                      {formatTime(lesson.startsAt, timezone)}
                      {["failed", "deleted_in_google"].includes(
                        lesson.syncStatus,
                      ) && (
                        <AlertTriangle
                          size={12}
                          aria-label="Błąd Google Calendar"
                        />
                      )}
                      {lesson.participantIds.length > 1 && (
                        <span> · {lesson.participantIds.length} os.</span>
                      )}
                    </time>
                    <strong>{label}</strong>
                    <small>
                      {(group || lesson.participantIds.length > 1) && (
                        <Users size={12} aria-hidden="true" />
                      )}{" "}
                      {lesson.status === "cancelled"
                        ? "Anulowana"
                        : lesson.status === "needs_completion"
                          ? "Do uzupełnienia"
                          : lesson.status === "completed"
                            ? "Uzupełniona"
                            : group
                              ? `${lesson.participantIds.length} uczniów`
                              : lesson.subject
                                ? lesson.subject
                                : lesson.format === "online"
                                  ? "Online"
                                  : "Stacjonarnie"}
                      {["failed", "deleted_in_google"].includes(
                        lesson.syncStatus,
                      )
                        ? " · Błąd Google"
                        : ""}
                    </small>
                  </Link>
                );
              })}
              {today &&
                nowMinutes >= startHour * 60 &&
                nowMinutes < endHour * 60 && (
                  <span
                    className="current-time-line"
                    style={{
                      top: ((nowMinutes - startHour * 60) / 60) * hourHeight,
                    }}
                  >
                    <i />
                  </span>
                )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AgendaView({
  days,
  data,
  timezone,
  openLessonComposer,
  onDeleteBlock,
}: {
  days: Date[];
  data: import("@/lib/domain").AppData;
  timezone: string;
  openLessonComposer: (preset?: { date?: string; time?: string }) => void;
  onDeleteBlock: (blockId: string) => void;
}) {
  return (
    <div className="calendar-agenda">
      {days.map((day) => {
        const key = localDateKey(day, timezone);
        const lessons = data.lessons.filter(
          (lesson) => localDateKey(lesson.startsAt, timezone) === key,
        );
        const blocks = data.calendarBlocks.filter(
          (block) => localDateKey(block.startsAt, timezone) === key,
        );
        const externalEvents = data.externalGoogleEvents.filter((event) =>
          externalEventOccursOn(event, key, timezone),
        );
        const unavailable = availabilityForDay(data, day, timezone);
        const allDayUnavailable = unavailable.some(
          (rule) => rule.allDay && !rule.isAvailable,
        );
        return (
          <section
            key={key}
            className={allDayUnavailable ? "agenda-day--unavailable" : ""}
          >
            <div className="agenda-day-head">
              <span>
                <strong>
                  {formatInTimeZone(day, timezone, "EEEE", { locale: pl })}
                </strong>
                <small>
                  {formatInTimeZone(day, timezone, "d MMMM", { locale: pl })}
                </small>
              </span>
              <button
                className="icon-button icon-button--border"
                disabled={data.teacher.subscription.readOnly}
                aria-label={`Dodaj lekcję: ${formatInTimeZone(day, timezone, "d MMMM", { locale: pl })}`}
                onClick={() => openLessonComposer({ date: key })}
              >
                <Plus size={17} />
              </button>
            </div>
            {unavailable.map((rule) => (
              <p
                className={`agenda-unavailable${rule.allDay ? " agenda-unavailable--all-day" : ""}`}
                key={rule.id}
              >
                <time>
                  {rule.allDay
                    ? "Cały dzień"
                    : `${formatTime(rule.start, timezone)}–${formatTime(rule.end, timezone)}`}
                </time>
                <span>{rule.label || "Czas niedostępny"}</span>
              </p>
            ))}
            {blocks.map((block) => (
              <div
                className="agenda-event-row agenda-event-row--block"
                key={block.id}
                style={calendarColorStyle(block.color)}
              >
                <time>{formatTime(block.startsAt, timezone)}</time>
                <span>
                  <strong>{block.title}</strong>
                  <small>
                    Blokada czasu · {formatTime(block.startsAt, timezone)}–
                    {formatTime(block.endsAt, timezone)}
                  </small>
                </span>
                {!data.teacher.subscription.readOnly && (
                  <button
                    className="icon-button"
                    aria-label={`Usuń blokadę: ${block.title}`}
                    onClick={() => onDeleteBlock(block.id)}
                  >
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            ))}
            {externalEvents.map((event) => (
              <div
                className={`agenda-event-row agenda-event-row--external${event.transparency === "transparent" ? " agenda-event-row--free" : ""}`}
                key={event.id}
                style={calendarColorStyle(event.color)}
              >
                <time>
                  {event.allDay
                    ? "Cały dzień"
                    : formatTime(event.startsAt!, timezone)}
                </time>
                <span>
                  <strong>{event.title}</strong>
                  <small>
                    Google Calendar · tylko do odczytu
                    {event.transparency === "transparent"
                      ? " · oznaczono jako wolny"
                      : ""}
                  </small>
                </span>
                <CalendarClock size={16} aria-hidden="true" />
              </div>
            ))}
            {lessons.length ? (
              lessons.map((lesson) => {
                const group = lesson.groupId
                  ? data.groups.find((item) => item.id === lesson.groupId)
                  : undefined;
                return (
                  <Link
                    className="agenda-event-row"
                    href={`/app/lekcje/${lesson.id}`}
                    key={lesson.id}
                    style={calendarColorStyle(lesson.color)}
                  >
                    <time>{formatTime(lesson.startsAt, timezone)}</time>
                    <span>
                      <strong>
                        {group?.name ??
                          lesson.participantIds
                            .map(
                              (id) =>
                                data.students.find(
                                  (student) => student.id === id,
                                )?.name,
                            )
                            .join(", ")}
                      </strong>
                      <small>
                        {lesson.subject || lesson.topic || "Temat do ustalenia"}{" "}
                        · {lesson.durationMinutes} min
                      </small>
                      {["failed", "deleted_in_google"].includes(
                        lesson.syncStatus,
                      ) && (
                        <small className="agenda-sync-error">
                          <AlertTriangle size={13} />
                          {lesson.syncStatus === "deleted_in_google"
                            ? "Usunięta w Google Calendar"
                            : "Błąd synchronizacji"}
                        </small>
                      )}
                    </span>
                    <LessonStatusBadge status={lesson.status} />
                  </Link>
                );
              })
            ) : (
              <p className="agenda-empty">
                {unavailable.length || blocks.length || externalEvents.length
                  ? "Brak lekcji"
                  : "Wolny dzień"}
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}

function calendarColorStyle(color: string): CSSProperties {
  return {
    "--calendar-color": color,
    "--calendar-surface": getCalendarEventSurface(color),
    "--calendar-foreground": getReadableForeground(
      getCalendarEventSurface(color),
    ),
  } as CSSProperties;
}

function MonthView({
  anchor,
  data,
  timezone,
  onDay,
}: {
  anchor: Date;
  data: import("@/lib/domain").AppData;
  timezone: string;
  onDay: (day: Date) => void;
}) {
  const start = startOfMonth(anchor);
  const end = endOfMonth(anchor);
  const offset = Number(formatInTimeZone(start, timezone, "i")) - 1;
  const cells = Array.from(
    { length: offset + Number(format(end, "d")) },
    (_, index) => (index < offset ? null : addDays(start, index - offset)),
  );
  return (
    <div className="month-view">
      <div className="month-weekdays">
        {["Pon", "Wt", "Śr", "Czw", "Pt", "Sob", "Niedz"].map((day) => (
          <span key={day}>{day}</span>
        ))}
      </div>
      <div className="month-grid">
        {cells.map((day, index) => {
          if (!day) return <span key={`empty-${index}`} />;
          const dayKey = localDateKey(day, timezone);
          const dayLessons = data.lessons.filter(
            (lesson) =>
              localDateKey(lesson.startsAt, timezone) === dayKey &&
              lesson.status !== "cancelled",
          );
          const dayExternalEvents = data.externalGoogleEvents.filter((event) =>
            externalEventOccursOn(event, dayKey, timezone),
          );
          const allDayUnavailable = isAllDayUnavailable(data, day, timezone);
          const today = dayKey === localDateKey(new Date(), timezone);
          return (
            <button
              key={day.toISOString()}
              aria-label={`${formatInTimeZone(day, timezone, "d MMMM yyyy", { locale: pl })} · ${lessonCountLabel(dayLessons.length)} · ${dayExternalEvents.length} wydarzeń Google${allDayUnavailable ? " · Niedostępny cały dzień" : ""}`}
              className={`${today ? "today" : ""}${allDayUnavailable ? " month-day--unavailable" : ""}`}
              onClick={() => onDay(day)}
            >
              <strong>{formatInTimeZone(day, timezone, "d")}</strong>
              {allDayUnavailable ? (
                <small className="month-unavailable-label">Niedostępny</small>
              ) : (
                <small className="month-count">
                  {dayLessons.length || "—"}
                  <span> lekcji</span>
                </small>
              )}
              {dayLessons.slice(0, 3).map((lesson) => (
                <span key={lesson.id} style={calendarColorStyle(lesson.color)}>
                  {formatTime(lesson.startsAt, timezone)} ·{" "}
                  {
                    data.students.find(
                      (student) => student.id === lesson.participantIds[0],
                    )?.name
                  }
                </span>
              ))}
              {dayExternalEvents
                .slice(0, Math.max(0, 3 - dayLessons.length))
                .map((event) => (
                  <span
                    className="month-google-event"
                    key={event.id}
                    style={calendarColorStyle(event.color)}
                  >
                    {event.allDay
                      ? "Cały dzień"
                      : formatTime(event.startsAt!, timezone)}{" "}
                    · {event.title}
                  </span>
                ))}
            </button>
          );
        })}
      </div>
    </div>
  );
}
