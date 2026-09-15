"use client";

import {
  CalendarCheck,
  Clock3,
  Download,
  GraduationCap,
  Target,
  TrendingUp,
  Upload,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { useAppData, useAppMutation } from "@/hooks/use-app-data";
import type {
  AppData,
  AttendanceStatus,
  Lesson,
  StudentStatImport,
} from "@/lib/domain";
import { formatMoney } from "@/lib/format";
import { useSessionTeacher } from "../app-shell";
import { PageLoading } from "../ui/loading";

type Period = "week" | "month" | "year";
type View = "teacher" | "student";
type StatEvent = {
  id: string;
  occurredAt: string;
  topic: string;
  skill: string;
  score?: number;
  durationMinutes: number;
  attendanceStatus: AttendanceStatus;
  source: "lesson" | "import";
};

export function StatisticsPage() {
  const teacher = useSessionTeacher();
  const { data, isPending } = useAppData(teacher.id);
  const mutation = useAppMutation(teacher.id);
  const searchParams = useSearchParams();
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [importMessage, setImportMessage] = useState("");
  const period = getParam<Period>(
    searchParams.get("period"),
    ["week", "month", "year"],
    "month",
  );
  const view = getParam<View>(
    searchParams.get("view"),
    ["teacher", "student"],
    "teacher",
  );
  const selectedId =
    searchParams.get("student") ??
    data?.students.find((student) => student.status === "active")?.id ??
    "";
  const teacherTrend = useMemo(
    () =>
      data
        ? monthBuckets(
            data.lessons.filter((lesson) => lesson.status !== "cancelled"),
          )
        : [],
    [data],
  );

  if (isPending || !data) return <PageLoading />;
  const selectedStudent =
    data.students.find((student) => student.id === selectedId) ??
    data.students[0];
  const updateParams = (patch: Record<string, string>) => {
    const params = new URLSearchParams(searchParams);
    Object.entries(patch).forEach(([key, value]) => params.set(key, value));
    router.replace(`/app/statystyki?${params}`, { scroll: false });
  };
  const importCsv = async (file?: File) => {
    if (!file || !selectedStudent) return;
    setImportMessage("");
    try {
      const records = parseStudentCsv(await file.text());
      const response = await mutation.mutateAsync({
        type: "importStudentStats",
        studentId: selectedStudent.id,
        sourceFile: file.name,
        records,
      });
      setImportMessage(
        `Zaimportowano ${response.result?.ids?.length ?? records.length} rekordów z pliku ${file.name}.`,
      );
    } catch (error) {
      setImportMessage(
        error instanceof Error
          ? error.message
          : "Nie udało się zaimportować pliku.",
      );
    } finally {
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  return (
    <div className="statistics-page page-enter">
      <header className="page-header statistics-header">
        <div>
          <p className="eyebrow">Analityka pracy</p>
          <h1>Statystyki</h1>
          <p className="page-intro">
            Wyniki pracy nauczyciela i pełny obraz postępów każdego ucznia.
          </p>
        </div>
        {view === "teacher" ? (
          <div className="export-actions">
            <Link
              prefetch={false}
              className="button button--secondary"
              href="/api/export/lekcje"
            >
              <Download size={17} aria-hidden="true" />
              Lekcje CSV
            </Link>
            <Link
              prefetch={false}
              className="button button--quiet"
              href="/api/export/uczniowie"
            >
              Uczniowie CSV
            </Link>
          </div>
        ) : (
          <>
            <input
              ref={fileInput}
              className="sr-only"
              type="file"
              accept=".csv,text/csv"
              aria-label="Wybierz plik CSV ze statystykami ucznia"
              onChange={(event) => void importCsv(event.target.files?.[0])}
            />
            <button
              className="button button--secondary"
              disabled={
                !selectedStudent ||
                mutation.isPending ||
                data.teacher.subscription.readOnly
              }
              onClick={() => fileInput.current?.click()}
            >
              <Upload size={17} aria-hidden="true" />
              {mutation.isPending ? "Importowanie…" : "Importuj CSV"}
            </button>
          </>
        )}
      </header>
      <div className="statistics-toolbar">
        <div
          className="segmented-control statistics-view-switch"
          aria-label="Rodzaj statystyk"
        >
          <button
            className={view === "teacher" ? "selected" : ""}
            aria-pressed={view === "teacher"}
            onClick={() => updateParams({ view: "teacher" })}
          >
            <UserRound size={16} aria-hidden="true" />
            Moja praca
          </button>
          <button
            className={view === "student" ? "selected" : ""}
            aria-pressed={view === "student"}
            onClick={() => updateParams({ view: "student" })}
          >
            <GraduationCap size={16} aria-hidden="true" />
            Wyniki ucznia
          </button>
        </div>
        <PeriodSwitch
          period={period}
          setPeriod={(next) => updateParams({ period: next })}
        />
      </div>
      {view === "teacher" ? (
        <TeacherStatistics data={data} period={period} trend={teacherTrend} />
      ) : selectedStudent ? (
        <StudentStatistics
          student={selectedStudent}
          students={data.students}
          lessons={data.lessons}
          imports={data.studentStatImports}
          period={period}
          timezone={data.teacher.timezone}
          onStudentChange={(student) => updateParams({ student })}
          importMessage={importMessage}
        />
      ) : (
        <section className="panel statistics-empty">
          <GraduationCap size={28} aria-hidden="true" />
          <h2>Najpierw dodaj ucznia</h2>
          <p>
            Statystyki pojawią się po dodaniu ucznia i pierwszej lekcji lub
            imporcie CSV.
          </p>
          <Link className="button button--primary" href="/app/uczniowie">
            Przejdź do uczniów
          </Link>
        </section>
      )}
    </div>
  );
}

function PeriodSwitch({
  period,
  setPeriod,
}: {
  period: Period;
  setPeriod: (period: Period) => void;
}) {
  return (
    <div className="period-switch segmented-control" aria-label="Zakres czasu">
      {(["week", "month", "year"] as const).map((key) => (
        <button
          key={key}
          className={period === key ? "selected" : ""}
          aria-pressed={period === key}
          onClick={() => setPeriod(key)}
        >
          {key === "week" ? "Tydzień" : key === "month" ? "Miesiąc" : "Rok"}
        </button>
      ))}
    </div>
  );
}

function TeacherStatistics({
  data,
  period,
  trend,
}: {
  data: AppData;
  period: Period;
  trend: { key: string; label: string; count: number }[];
}) {
  const summary = data.financials[period];
  const max = Math.max(...trend.map((item) => item.count), 1);
  return (
    <>
      <section className="stats-ledger">
        <Metric label="Lekcje" value={summary.lessonCount} />
        <Metric
          label="Godziny"
          value={new Intl.NumberFormat("pl-PL", {
            maximumFractionDigits: 1,
          }).format(summary.hours)}
        />
        <Metric label="Aktywni uczniowie" value={summary.activeStudents} />
      </section>
      <section className="financial-breakdown">
        <div>
          <p className="eyebrow">Przepływ płatności</p>
          <h2>{periodLabel(period)}</h2>
        </div>
        <dl>
          <div>
            <dt>Planowane</dt>
            <dd>
              {formatMoney({ amount: summary.plannedAmount, currency: "PLN" })}
            </dd>
          </div>
          <div className="due">
            <dt>Do otrzymania</dt>
            <dd>
              {formatMoney({
                amount: summary.receivableAmount,
                currency: "PLN",
              })}
            </dd>
          </div>
          <div className="received">
            <dt>Otrzymane</dt>
            <dd>
              {formatMoney({ amount: summary.receivedAmount, currency: "PLN" })}
            </dd>
          </div>
        </dl>
      </section>
      <section className="trend-panel panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Ostatnie 6 miesięcy</p>
            <h2>Liczba lekcji</h2>
          </div>
          <TrendingUp size={20} aria-hidden="true" />
        </div>
        <div
          className="bar-chart"
          role="img"
          aria-label={`Liczba lekcji w ostatnich sześciu miesiącach: ${trend.map((item) => `${item.label} ${item.count}`).join(", ")}`}
        >
          {trend.map((item) => (
            <div key={item.key}>
              <span className="bar-value">{item.count}</span>
              <span
                className="bar"
                style={{ height: `${(item.count / max) * 100}%` }}
              />
              <small>{item.label}</small>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function StudentStatistics({
  student,
  students,
  lessons,
  imports,
  period,
  timezone,
  onStudentChange,
  importMessage,
}: {
  student: { id: string; name: string; level: string; goal: string };
  students: { id: string; name: string; status: string }[];
  lessons: Lesson[];
  imports: StudentStatImport[];
  period: Period;
  timezone: string;
  onStudentChange: (id: string) => void;
  importMessage: string;
}) {
  const related = lessons.filter(
    (lesson) =>
      lesson.participantIds.includes(student.id) &&
      lesson.status !== "cancelled",
  );
  const studentImports = imports.filter(
    (item) => item.studentId === student.id,
  );
  const events = buildStudentEvents(related, studentImports, student.id);
  const periodEvents = events.filter(
    (event) => new Date(event.occurredAt) >= periodStart(period),
  );
  const attended = periodEvents.filter(
    (event) => event.attendanceStatus === "present",
  ).length;
  const absent = periodEvents.filter(
    (event) => event.attendanceStatus === "absent",
  ).length;
  const scored = periodEvents.filter((event) => event.score !== undefined);
  const average = scored.length
    ? scored.reduce((sum, event) => sum + event.score!, 0) / scored.length
    : undefined;
  const minutes = periodEvents.reduce(
    (sum, event) => sum + event.durationMinutes,
    0,
  );
  const skills = buildSkills(related, studentImports, period, student.id);
  const trend = scoreBuckets(events);
  const homeworkLessons = related.filter(
    (lesson) =>
      lesson.status === "completed" &&
      new Date(lesson.startsAt) >= periodStart(period),
  );
  const homeworkRate = homeworkLessons.length
    ? Math.round(
        (homeworkLessons.filter((lesson) => lesson.homework.trim()).length /
          homeworkLessons.length) *
          100,
      )
    : 0;
  const knownAttendance = attended + absent;

  return (
    <>
      <section className="student-stat-hero">
        <label className="field student-stat-picker">
          <span>Uczeń</span>
          <select
            value={student.id}
            onChange={(event) => onStudentChange(event.target.value)}
          >
            {students.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
                {item.status === "archived" ? " — archiwalny" : ""}
              </option>
            ))}
          </select>
        </label>
        <div className="student-stat-identity">
          <span className="avatar" aria-hidden="true">
            {initials(student.name)}
          </span>
          <div>
            <strong>{student.name}</strong>
            <p>
              {student.level || "Poziom nieustalony"} ·{" "}
              {student.goal || "Cel do uzupełnienia"}
            </p>
          </div>
        </div>
        <Link
          className="text-link"
          href={`/app/uczniowie/${student.id}?tab=progress`}
        >
          Otwórz kartę ucznia
        </Link>
      </section>
      {importMessage && (
        <div className="import-status" role="status">
          {importMessage}
        </div>
      )}
      <p className="csv-hint">
        Import CSV: kolumny{" "}
        <code>date, topic, skill, score, duration, attendance</code>. Wynik
        0–10, attendance: present/absent.
      </p>
      <section
        className="student-metrics"
        aria-label={`Najważniejsze wyniki — ${periodLabel(period).toLowerCase()}`}
      >
        <Metric
          icon={<CalendarCheck size={18} />}
          label="Odbyte sesje"
          value={attended}
          note={`${periodEvents.length} wszystkich zapisów`}
        />
        <Metric
          icon={<Clock3 size={18} />}
          label="Czas nauki"
          value={formatDuration(minutes)}
          note={`${Math.round(minutes / Math.max(attended, 1))} min średnio`}
        />
        <Metric
          icon={<Target size={18} />}
          label="Średni wynik"
          value={average === undefined ? "—" : `${average.toFixed(1)}/10`}
          note={`${scored.length} ocenionych sesji`}
        />
        <Metric
          icon={<UserRound size={18} />}
          label="Frekwencja"
          value={
            knownAttendance
              ? `${Math.round((attended / knownAttendance) * 100)}%`
              : "—"
          }
          note={knownAttendance ? `${absent} nieobecności` : "Brak oznaczeń"}
        />
      </section>
      <div className="student-analytics-grid">
        <section className="panel score-trend-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Tempo rozwoju</p>
              <h2>Wynik i regularność</h2>
            </div>
            <TrendingUp size={20} aria-hidden="true" />
          </div>
          <div
            className="score-chart"
            role="img"
            aria-label={`Średnie wyniki z ostatnich sześciu miesięcy: ${trend.map((item) => `${item.label}: ${item.score ?? "brak"}`).join(", ")}`}
          >
            {trend.map((item) => (
              <div key={item.key}>
                <span className="score-chart-value">
                  {item.score?.toFixed(1) ?? "—"}
                </span>
                <span className="score-track">
                  <span style={{ height: `${(item.score ?? 0) * 10}%` }} />
                </span>
                <small>
                  {item.label}
                  <b>{item.count} ses.</b>
                </small>
              </div>
            ))}
          </div>
        </section>
        <aside className="panel learning-rhythm">
          <p className="eyebrow">Nawyki</p>
          <h2>Rytm nauki</h2>
          <dl>
            <div>
              <dt>Aktywne tygodnie</dt>
              <dd>{activeWeeks(periodEvents)}</dd>
            </div>
            <div>
              <dt>Lekcje z pracą domową</dt>
              <dd>{homeworkRate}%</dd>
            </div>
            <div>
              <dt>Dane z importu</dt>
              <dd>
                {
                  periodEvents.filter((event) => event.source === "import")
                    .length
                }
              </dd>
            </div>
            <div>
              <dt>Ostatnia aktywność</dt>
              <dd>
                {periodEvents[0]
                  ? formatShortDate(periodEvents[0].occurredAt, timezone)
                  : "—"}
              </dd>
            </div>
          </dl>
        </aside>
      </div>
      <section className="panel skills-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Obszary pracy</p>
            <h2>Opanowanie umiejętności</h2>
          </div>
          <span className="section-note">{skills.length} obszarów</span>
        </div>
        {skills.length ? (
          <div className="skills-table">
            <div className="skills-table-head">
              <span>Umiejętność</span>
              <span>Postęp</span>
              <span>Próby</span>
              <span>Wynik</span>
            </div>
            {skills.slice(0, 8).map((skill) => (
              <div className="skills-table-row" key={skill.name}>
                <strong>{skill.name}</strong>
                <span
                  className="mastery-track"
                  aria-label={`${skill.score}% opanowania`}
                >
                  <span style={{ width: `${skill.score}%` }} />
                </span>
                <span>{skill.count}</span>
                <b>{skill.score}%</b>
              </div>
            ))}
          </div>
        ) : (
          <p className="analytics-empty">
            Uzupełnij wyniki planu lekcji lub zaimportuj plik, aby zobaczyć
            mocne strony ucznia.
          </p>
        )}
      </section>
      <section className="panel activity-log">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Dane źródłowe</p>
            <h2>Ostatnie aktywności</h2>
          </div>
          <span className="section-note">{periodEvents.length} rekordów</span>
        </div>
        {periodEvents.length ? (
          <div className="activity-table">
            <div className="activity-table-head">
              <span>Data i temat</span>
              <span>Źródło</span>
              <span>Frekwencja</span>
              <span>Czas</span>
              <span>Wynik</span>
            </div>
            {periodEvents.slice(0, 10).map((event) => (
              <div className="activity-table-row" key={event.id}>
                <span>
                  <strong>
                    {event.topic || event.skill || "Nauka własna"}
                  </strong>
                  <small>{formatShortDate(event.occurredAt, timezone)}</small>
                </span>
                <span>
                  <em className={`source-badge source-badge--${event.source}`}>
                    {event.source === "lesson" ? "Lekcja" : "Import"}
                  </em>
                </span>
                <span>{attendanceLabel(event.attendanceStatus)}</span>
                <span>{event.durationMinutes} min</span>
                <b>
                  {event.score === undefined
                    ? "—"
                    : `${event.score.toFixed(1)}/10`}
                </b>
              </div>
            ))}
          </div>
        ) : (
          <p className="analytics-empty">
            Brak aktywności w wybranym okresie. Zmień zakres czasu lub
            zaimportuj historię ucznia.
          </p>
        )}
      </section>
    </>
  );
}

function Metric({
  label,
  value,
  note,
  icon,
}: {
  label: string;
  value: string | number;
  note?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="metric-card">
      {icon && (
        <span className="metric-icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <span>
        <small>{label}</small>
        <strong>{value}</strong>
        {note && <em>{note}</em>}
      </span>
    </div>
  );
}

function buildStudentEvents(
  lessons: Lesson[],
  imports: StudentStatImport[],
  studentId: string,
): StatEvent[] {
  const lessonEvents = lessons
    .filter((lesson) => lesson.status === "completed")
    .map((lesson) => {
      const participant = lesson.participants.find(
        (item) => item.studentId === studentId,
      );
      const scores =
        participant?.results.flatMap((result) =>
          result.score === undefined ? [] : [result.score],
        ) ?? [];
      return {
        id: lesson.id,
        occurredAt: lesson.startsAt,
        topic: lesson.topic,
        skill: lesson.planItems.map((item) => item.text).join(", "),
        score: scores.length
          ? scores.reduce((sum, score) => sum + score, 0) / scores.length
          : undefined,
        durationMinutes: lesson.durationMinutes,
        attendanceStatus: participant?.attendanceStatus ?? "unknown",
        source: "lesson" as const,
      };
    });
  return [
    ...lessonEvents,
    ...imports.map((item) => ({
      id: item.id,
      occurredAt: item.occurredAt,
      topic: item.topic,
      skill: item.skill,
      score: item.score,
      durationMinutes: item.durationMinutes,
      attendanceStatus: item.attendanceStatus,
      source: "import" as const,
    })),
  ].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
}

function buildSkills(
  lessons: Lesson[],
  imports: StudentStatImport[],
  period: Period,
  studentId: string,
) {
  const entries: { name: string; score: number }[] = [];
  lessons
    .filter(
      (lesson) =>
        lesson.status === "completed" &&
        new Date(lesson.startsAt) >= periodStart(period),
    )
    .forEach((lesson) => {
      const participant = lesson.participants.find(
        (item) => item.studentId === studentId,
      );
      participant?.results.forEach((result) => {
        const item = lesson.planItems.find(
          (planItem) => planItem.id === result.planItemId,
        );
        if (item && result.score !== undefined)
          entries.push({ name: item.text, score: result.score * 10 });
      });
    });
  imports
    .filter(
      (item) =>
        item.skill &&
        item.score !== undefined &&
        new Date(item.occurredAt) >= periodStart(period),
    )
    .forEach((item) =>
      entries.push({ name: item.skill, score: item.score! * 10 }),
    );
  const groups = new Map<string, { total: number; count: number }>();
  entries.forEach((entry) => {
    const current = groups.get(entry.name) ?? { total: 0, count: 0 };
    current.total += entry.score;
    current.count += 1;
    groups.set(entry.name, current);
  });
  return [...groups.entries()]
    .map(([name, value]) => ({
      name,
      count: value.count,
      score: Math.round(value.total / value.count),
    }))
    .sort((a, b) => b.count - a.count || b.score - a.score);
}

function scoreBuckets(events: StatEvent[]) {
  const buckets = lastSixMonths().map((item) => ({
    ...item,
    scores: [] as number[],
    count: 0,
  }));
  events.forEach((event) => {
    const bucket = buckets.find(
      (item) => item.key === event.occurredAt.slice(0, 7),
    );
    if (!bucket) return;
    bucket.count += 1;
    if (event.score !== undefined) bucket.scores.push(event.score);
  });
  return buckets.map((item) => ({
    key: item.key,
    label: item.label,
    count: item.count,
    score: item.scores.length
      ? item.scores.reduce((sum, score) => sum + score, 0) / item.scores.length
      : undefined,
  }));
}
function monthBuckets(lessons: Lesson[]) {
  const buckets = lastSixMonths().map((item) => ({ ...item, count: 0 }));
  lessons.forEach((lesson) => {
    const bucket = buckets.find(
      (item) => item.key === lesson.startsAt.slice(0, 7),
    );
    if (bucket) bucket.count += 1;
  });
  return buckets;
}
function lastSixMonths() {
  return Array.from({ length: 6 }, (_, index) => {
    const date = new Date();
    date.setDate(1);
    date.setMonth(date.getMonth() - (5 - index));
    return {
      key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      label: new Intl.DateTimeFormat("pl-PL", { month: "short" }).format(date),
    };
  });
}
function periodStart(period: Period) {
  const date = new Date();
  if (period === "week") date.setDate(date.getDate() - 7);
  if (period === "month") date.setMonth(date.getMonth() - 1);
  if (period === "year") date.setFullYear(date.getFullYear() - 1);
  return date;
}
function activeWeeks(events: StatEvent[]) {
  return new Set(
    events.map((event) => {
      const date = new Date(event.occurredAt);
      const first = new Date(date.getFullYear(), 0, 1);
      return `${date.getFullYear()}-${Math.ceil(((date.getTime() - first.getTime()) / 86400000 + first.getDay() + 1) / 7)}`;
    }),
  ).size;
}

function parseStudentCsv(text: string) {
  const rows = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((line) => line.trim());
  if (rows.length < 2)
    throw new Error("Plik CSV nie zawiera żadnych rekordów.");
  const delimiter =
    (rows[0].match(/;/g)?.length ?? 0) > (rows[0].match(/,/g)?.length ?? 0)
      ? ";"
      : ",";
  const headers = parseCsvRow(rows[0], delimiter).map((value) =>
    value.trim().toLowerCase(),
  );
  const find = (...names: string[]) =>
    names.map((name) => headers.indexOf(name)).find((value) => value >= 0) ??
    -1;
  const dateIndex = find("date", "data");
  if (dateIndex < 0)
    throw new Error("Brakuje wymaganej kolumny date (lub data).");
  const topicIndex = find("topic", "temat"),
    skillIndex = find("skill", "umiejętność", "umiejetnosc"),
    scoreIndex = find("score", "wynik", "ocena"),
    durationIndex = find("duration", "durationminutes", "czas", "minuty"),
    attendanceIndex = find("attendance", "frekwencja", "obecność", "obecnosc");
  return rows.slice(1).map((line, rowIndex) => {
    const cells = parseCsvRow(line, delimiter).map((value) => value.trim());
    const rawDate = cells[dateIndex];
    let occurredAt: string;
    try {
      occurredAt = /^\d{4}-\d{2}-\d{2}$/.test(rawDate)
        ? `${rawDate}T12:00:00.000Z`
        : new Date(rawDate).toISOString();
    } catch {
      throw new Error(`Nieprawidłowa data w wierszu ${rowIndex + 2}.`);
    }
    const rawScore =
      scoreIndex >= 0 ? cells[scoreIndex]?.replace(",", ".") : "";
    const score = rawScore ? Number(rawScore) : undefined;
    const durationMinutes =
      durationIndex >= 0 && cells[durationIndex]
        ? Number(cells[durationIndex])
        : 0;
    if (
      (score !== undefined && !Number.isFinite(score)) ||
      !Number.isFinite(durationMinutes)
    )
      throw new Error(`Nieprawidłowa liczba w wierszu ${rowIndex + 2}.`);
    const attendance =
      attendanceIndex >= 0 ? cells[attendanceIndex]?.toLowerCase() : "present";
    return {
      occurredAt,
      topic: topicIndex >= 0 ? (cells[topicIndex] ?? "") : "",
      skill: skillIndex >= 0 ? (cells[skillIndex] ?? "") : "",
      score,
      durationMinutes,
      attendanceStatus: ["absent", "nieobecny", "nieobecna", "nie"].includes(
        attendance,
      )
        ? ("absent" as const)
        : ("present" as const),
    };
  });
}
function parseCsvRow(line: string, delimiter: string) {
  const cells: string[] = [];
  let current = "",
    quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"' && quoted) {
      current += '"';
      index += 1;
    } else if (char === '"') quoted = !quoted;
    else if (char === delimiter && !quoted) {
      cells.push(current);
      current = "";
    } else current += char;
  }
  cells.push(current);
  return cells;
}

function getParam<T extends string>(
  value: string | null,
  allowed: readonly T[],
  fallback: T,
): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}
function periodLabel(period: Period) {
  return period === "week"
    ? "Ostatnie 7 dni"
    : period === "month"
      ? "Ostatnie 30 dni"
      : "Ostatnie 12 miesięcy";
}
function formatDuration(minutes: number) {
  return minutes < 60
    ? `${minutes} min`
    : `${new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 1 }).format(minutes / 60)} godz.`;
}
function formatShortDate(date: string, timezone: string) {
  return new Intl.DateTimeFormat("pl-PL", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: timezone,
  }).format(new Date(date));
}
function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("");
}
function attendanceLabel(status: AttendanceStatus) {
  return status === "present"
    ? "Obecny"
    : status === "absent"
      ? "Nieobecny"
      : "Nieoznaczona";
}
