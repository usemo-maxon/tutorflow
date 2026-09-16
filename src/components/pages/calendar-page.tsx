"use client";

import * as Dialog from "@radix-ui/react-dialog";
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
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Plus,
  Trash2,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  useEffect,
  useMemo,
  useState,
  type DragEvent,
  type CSSProperties,
} from "react";
import { useAppData, useAppMutation } from "@/hooks/use-app-data";
import { useMinuteClock } from "@/hooks/use-minute-clock";
import { copy } from "@/lib/copy";
import type { AppData, Lesson } from "@/lib/domain";
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

type CalendarView = "day" | "week" | "month" | "agenda";
function calendarBounds(lessons: Lesson[], timezone: string, data?: AppData) {
  const starts = lessons.map(
    (l) =>
      Number(formatInTimeZone(l.startsAt, timezone, "H")) +
      Number(formatInTimeZone(l.startsAt, timezone, "m")) / 60,
  );
  const available = (data?.availability ?? [])
    .filter((rule) => rule.isAvailable && !rule.allDay)
    .flatMap((rule) => [
      Number(formatInTimeZone(rule.start, timezone, "H")),
      Number(formatInTimeZone(rule.end, timezone, "H")),
    ]);
  const blockStarts = (data?.calendarBlocks ?? []).map((block) =>
    Number(formatInTimeZone(block.startsAt, timezone, "H")),
  );
  const blockEnds = (data?.calendarBlocks ?? []).map(
    (block) => Number(formatInTimeZone(block.endsAt, timezone, "H")) + 1,
  );
  return {
    startHour: Math.floor(Math.min(7, ...starts, ...available, ...blockStarts)),
    endHour: Math.min(
      24,
      Math.ceil(
        Math.max(
          22,
          ...available,
          ...blockEnds,
          ...lessons.map((l, i) => starts[i] + l.durationMinutes / 60),
        ),
      ),
    ),
  };
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
  const queryRange = useMemo(() => {
    const days = getWeekDays(anchor, session.timezone);
    const startDay =
      view === "day"
        ? anchor
        : view === "month"
          ? startOfMonth(anchor)
          : days[0];
    const endDay =
      view === "day"
        ? addDays(anchor, 1)
        : view === "month"
          ? addDays(endOfMonth(anchor), 1)
          : addDays(days[0], 7);
    return {
      start: localInputToUtc(
        localDateKey(startDay, session.timezone),
        "00:00",
        session.timezone,
      ),
      end: localInputToUtc(
        localDateKey(endDay, session.timezone),
        "00:00",
        session.timezone,
      ),
    };
  }, [anchor, session.timezone, view]);
  const { data, isPending } = useAppData(session.id, queryRange);
  const mutation = useAppMutation(session.id);
  const { openLessonComposer, showToast, showError } = useAppUi();
  const searchParams = useSearchParams();
  const [planningStudentId, setPlanningStudentId] = useState(
    searchParams.get("student") ?? "",
  );
  const [dragged, setDragged] = useState<{
    id: string;
    startsAt: string;
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
  });
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
  const calendarData = data;
  const { startHour, endHour } = calendarBounds(
    rangeLessons,
    timezone,
    calendarData,
  );
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
  async function dropLesson(event: DragEvent<HTMLDivElement>, day: Date) {
    event.preventDefault();
    if (!dragged || readOnly || mutation.isPending) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const minute = Math.max(
      0,
      Math.min(
        (endHour - startHour) * 60 - 30,
        Math.round(((event.clientY - rect.top) / hourHeight) * 2) * 30,
      ),
    );
    const hour = startHour + Math.floor(minute / 60);
    const minutes = minute % 60;
    const time = `${String(hour).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
    const startsAt = localInputToUtc(
      localDateKey(day, timezone),
      time,
      timezone,
    );
    try {
      await mutation.mutateAsync({
        type: "rescheduleLesson",
        lessonId: dragged.id,
        startsAt,
      });
      showToast({
        message: copy.toasts.dateChanged,
        actionLabel: copy.actions.undo,
        onAction: async () => {
          try {
            await mutation.mutateAsync({
              type: "rescheduleLesson",
              lessonId: dragged.id,
              startsAt: dragged.startsAt,
            });
          } catch (error) {
            showError(error);
          }
        },
      });
    } catch (error) {
      showError(error);
    }
    setDragged(null);
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
          onDrag={(lesson) => {
            if (lesson.mode !== "recurring")
              setDragged({ id: lesson.id, startsAt: lesson.startsAt });
          }}
          onDrop={dropLesson}
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

function CalendarGrid({
  days,
  lessons,
  data,
  timezone,
  planning,
  onSlot,
  onDrag,
  onDrop,
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
  onDrag: (lesson: Lesson) => void;
  onDrop: (event: DragEvent<HTMLDivElement>, day: Date) => void;
}) {
  const now = useMinuteClock();
  const [hoverSlot, setHoverSlot] = useState<{
    day: string;
    minute: number;
  } | null>(null);
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
          const availability = availabilityForDay(data, day, timezone);
          const allDayUnavailable = availability.some((rule) => rule.allDay);
          const today = dayKey === localDateKey(now, timezone);
          const nowMinutes =
            Number(formatInTimeZone(now, timezone, "H")) * 60 +
            Number(formatInTimeZone(now, timezone, "m"));
          return (
            <div
              className={`calendar-day-column${today ? " today" : ""}${allDayUnavailable ? " calendar-day-column--unavailable" : ""}`}
              key={dayKey}
              onDragOver={(event) => {
                event.preventDefault();
              }}
              onDrop={(event) => {
                onDrop(event, day);
              }}
              onMouseLeave={() => setHoverSlot(null)}
              onMouseMove={(event) => {
                if (
                  readOnly ||
                  (event.target as HTMLElement).closest("[data-event]")
                ) {
                  setHoverSlot(null);
                  return;
                }
                const minute = Math.max(
                  0,
                  Math.min(
                    (endHour - startHour) * 60 - 30,
                    Math.floor(
                      ((event.clientY -
                        event.currentTarget.getBoundingClientRect().top) /
                        hourHeight) *
                        2,
                    ) * 30,
                  ),
                );
                setHoverSlot({ day: dayKey, minute });
              }}
              onClick={(event) => {
                if (
                  readOnly ||
                  (event.target as HTMLElement).closest("[data-event]")
                )
                  return;
                const rect = event.currentTarget.getBoundingClientRect();
                const minute = Math.max(
                  0,
                  Math.min(
                    (endHour - startHour) * 60 - 30,
                    Math.floor(((event.clientY - rect.top) / hourHeight) * 2) *
                      30,
                  ),
                );
                const hour = startHour + Math.floor(minute / 60);
                onSlot(
                  day,
                  `${String(hour).padStart(2, "0")}:${minute % 60 === 30 ? "30" : "00"}`,
                );
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
                  style={{ top: (hoverSlot.minute / 60) * hourHeight }}
                >
                  <Plus size={12} />
                  {String(
                    startHour + Math.floor(hoverSlot.minute / 60),
                  ).padStart(2, "0")}
                  :{hoverSlot.minute % 60 === 30 ? "30" : "00"}
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
                    style={{
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
                    draggable={
                      !readOnly &&
                      lesson.mode !== "recurring" &&
                      lesson.status !== "cancelled"
                    }
                    onDragEnd={onDragEnd}
                    title={`${label} · ${lesson.subject || lesson.topic || "Temat do ustalenia"} · ${lesson.durationMinutes} min · ${copy.status[lesson.status]}`}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      onDrag(lesson);
                    }}
                    className={`calendar-event calendar-event--${lesson.status}${["failed", "deleted_in_google"].includes(lesson.syncStatus) ? " calendar-event--sync-error" : ""}`}
                    style={{
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
        const unavailable = availabilityForDay(data, day, timezone);
        const allDayUnavailable = unavailable.some((rule) => rule.allDay);
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
                {unavailable.length || blocks.length
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
          const allDayUnavailable = isAllDayUnavailable(data, day, timezone);
          const today = dayKey === localDateKey(new Date(), timezone);
          return (
            <button
              key={day.toISOString()}
              aria-label={`${formatInTimeZone(day, timezone, "d MMMM yyyy", { locale: pl })} · ${lessonCountLabel(dayLessons.length)}${allDayUnavailable ? " · Niedostępny cały dzień" : ""}`}
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
                <span key={lesson.id}>
                  {formatTime(lesson.startsAt, timezone)} ·{" "}
                  {
                    data.students.find(
                      (student) => student.id === lesson.participantIds[0],
                    )?.name
                  }
                </span>
              ))}
            </button>
          );
        })}
      </div>
    </div>
  );
}
