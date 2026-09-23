"use client";

import { Filter, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useAppData } from "@/hooks/use-app-data";
import { copy } from "@/lib/copy";
import { formatMoney } from "@/lib/format";
import { resolveEntitlements } from "@/lib/entitlements";
import type { Lesson, Student } from "@/lib/domain";
import { useSessionTeacher } from "../app-shell";
import { useAppUi } from "../app-ui-context";
import { EmptyState } from "../ui/empty-state";
import { PageLoading } from "../ui/loading";

type SortKey = "name" | "next" | "recent";

export function StudentsPage() {
  const teacher = useSessionTeacher();
  const { data, isPending } = useAppData(teacher.id);
  const { openStudentComposer } = useAppUi();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const status =
    searchParams.get("status") === "archived" ? "archived" : "active";
  const subject = searchParams.get("subject") ?? "";
  const level = searchParams.get("level") ?? "";
  const groupId = searchParams.get("group") ?? "";
  const sort = (
    ["name", "next", "recent"].includes(searchParams.get("sort") ?? "")
      ? searchParams.get("sort")
      : "name"
  ) as SortKey;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search);
      const params = new URLSearchParams(window.location.search);
      if (search.trim()) params.set("q", search.trim());
      else params.delete("q");
      window.history.replaceState(null, "", `/app/uczniowie?${params}`);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const subjects = useMemo(
    () =>
      [
        ...new Set(
          data?.students.map((item) => item.subject).filter(Boolean) ?? [],
        ),
      ].sort(),
    [data],
  );
  const levels = useMemo(
    () =>
      [
        ...new Set(
          data?.students.map((item) => item.level).filter(Boolean) ?? [],
        ),
      ].sort(),
    [data],
  );
  const visible = useMemo(() => {
    if (!data) return [];
    const query = debouncedSearch.trim().toLocaleLowerCase("pl");
    const nextLesson = (student: Student) =>
      getNextLesson(student, data.lessons);
    return data.students
      .filter((student) => {
        const searchable = [
          student.firstName,
          student.lastName,
          student.displayName,
          student.email,
          student.phone,
        ]
          .join(" ")
          .toLocaleLowerCase("pl");
        return (
          student.status === status &&
          (!query || searchable.includes(query)) &&
          (!subject || student.subject === subject) &&
          (!level || student.level === level) &&
          (!groupId || student.groupIds.includes(groupId))
        );
      })
      .sort((a, b) => {
        if (sort === "recent") return b.createdAt.localeCompare(a.createdAt);
        if (sort === "next") {
          return (
            (nextLesson(a)?.startsAt ?? "9999").localeCompare(
              nextLesson(b)?.startsAt ?? "9999",
            ) || a.name.localeCompare(b.name, "pl")
          );
        }
        return a.name.localeCompare(b.name, "pl");
      });
  }, [data, debouncedSearch, status, subject, level, groupId, sort]);

  if (isPending || !data) return <PageLoading />;
  const studentLimit = resolveEntitlements(
    data.teacher.subscription,
  ).maxActiveStudents;
  const activeStudentCount = data.students.filter(
    (student) => student.status === "active",
  ).length;
  const studentLimitReached =
    studentLimit !== null && activeStudentCount >= studentLimit;

  function updateParam(key: string, value?: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.replace(`/app/uczniowie?${params}`, { scroll: false });
  }

  const activeFilters = [
    subject && { key: "subject", label: subject },
    level && { key: "level", label: level },
    groupId && {
      key: "group",
      label: data.groups.find((group) => group.id === groupId)?.name ?? "Grupa",
    },
  ].filter(Boolean) as Array<{ key: string; label: string }>;

  return (
    <div className="students-page page-enter">
      <header className="page-header">
        <div>
          <p className="eyebrow">Baza uczniów</p>
          <h1>Uczniowie</h1>
          <p className="page-intro">
            Kontakty, najbliższe lekcje i rozliczenia w jednym miejscu.
          </p>
          {studentLimit !== null && (
            <p className="student-limit-usage">
              <span>
                {activeStudentCount} z {studentLimit} aktywnych uczniów
              </span>
              {studentLimitReached && (
                <Link href="/app/ustawienia/subskrypcja">Zobacz plan Pro</Link>
              )}
            </p>
          )}
        </div>
        <button
          className="button button--primary"
          disabled={data.teacher.subscription.readOnly || studentLimitReached}
          onClick={() => openStudentComposer()}
        >
          <Plus size={18} aria-hidden="true" />
          {copy.actions.addStudent}
        </button>
      </header>

      <nav className="module-switch" aria-label="Uczniowie i grupy">
        <Link className="active" href="/app/uczniowie" aria-current="page">
          Uczniowie
        </Link>
        <Link href="/app/uczniowie/grupy">Grupy</Link>
      </nav>

      <div className="list-toolbar list-toolbar--crm">
        <label className="search-field">
          <Search size={18} aria-hidden="true" />
          <span className="sr-only">Szukaj ucznia</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Szukaj po imieniu, e-mailu lub telefonie"
          />
        </label>
        <div className="segmented-control segmented-control--compact">
          <button
            className={status === "active" ? "selected" : ""}
            aria-pressed={status === "active"}
            onClick={() => updateParam("status", "active")}
          >
            Aktywni
          </button>
          <button
            className={status === "archived" ? "selected" : ""}
            aria-pressed={status === "archived"}
            onClick={() => updateParam("status", "archived")}
          >
            Archiwalni
          </button>
        </div>
        <details className="filter-menu">
          <summary className="button button--secondary">
            <Filter size={17} aria-hidden="true" /> Filtry
          </summary>
          <div className="filter-popover">
            <label className="field">
              <span>Przedmiot</span>
              <select
                value={subject}
                onChange={(event) => updateParam("subject", event.target.value)}
              >
                <option value="">Wszystkie</option>
                {subjects.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Poziom</span>
              <select
                value={level}
                onChange={(event) => updateParam("level", event.target.value)}
              >
                <option value="">Wszystkie</option>
                {levels.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Grupa</span>
              <select
                value={groupId}
                onChange={(event) => updateParam("group", event.target.value)}
              >
                <option value="">Wszystkie</option>
                {data.groups
                  .filter((group) => group.status === "active")
                  .map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>
        </details>
        <label className="sort-field">
          <span>Sortuj</span>
          <select
            value={sort}
            onChange={(event) => updateParam("sort", event.target.value)}
          >
            <option value="name">Nazwa</option>
            <option value="next">Najbliższa lekcja</option>
            <option value="recent">Ostatnio dodani</option>
          </select>
        </label>
      </div>

      {activeFilters.length > 0 && (
        <div className="filter-chips" aria-label="Aktywne filtry">
          {activeFilters.map((filter) => (
            <button key={filter.key} onClick={() => updateParam(filter.key)}>
              {filter.label} <span aria-hidden="true">×</span>
              <span className="sr-only">Usuń filtr</span>
            </button>
          ))}
          <button
            className="filter-clear"
            onClick={() => {
              const params = new URLSearchParams(searchParams.toString());
              ["subject", "level", "group"].forEach((key) =>
                params.delete(key),
              );
              router.replace(`/app/uczniowie?${params}`, { scroll: false });
            }}
          >
            Wyczyść
          </button>
        </div>
      )}

      {visible.length ? (
        <div className="student-list">
          {visible.map((student) => (
            <StudentRow
              key={student.id}
              student={student}
              lessons={data.lessons}
              groups={data.groups}
              timezone={data.teacher.timezone}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          title={
            debouncedSearch || activeFilters.length
              ? "Nie znaleziono uczniów pasujących do wyszukiwania."
              : status === "active"
                ? "Nie masz jeszcze uczniów. Dodaj pierwszą osobę, aby planować lekcje i śledzić postępy."
                : "Nie masz archiwalnych uczniów."
          }
          action={
            !debouncedSearch && !activeFilters.length && status === "active" ? (
              <button
                className="button button--primary"
                disabled={studentLimitReached}
                onClick={() => openStudentComposer()}
              >
                Dodaj pierwszego ucznia
              </button>
            ) : undefined
          }
        />
      )}
    </div>
  );
}

function StudentRow({
  student,
  lessons,
  groups,
  timezone,
}: {
  student: Student;
  lessons: Lesson[];
  groups: import("@/lib/domain").StudentGroup[];
  timezone: string;
}) {
  const next = getNextLesson(student, lessons);
  const groupNames = groups
    .filter((group) => student.groupIds.includes(group.id))
    .map((group) => group.name);
  return (
    <article className="student-row">
      <Link
        className="student-row__identity"
        href={`/app/uczniowie/${student.id}`}
      >
        <span className="avatar" aria-hidden="true">
          {student.name
            .split(" ")
            .map((part) => part[0])
            .slice(0, 2)
            .join("")}
        </span>
        <span>
          <strong>{student.name}</strong>
          <small>
            {[student.subject, student.level].filter(Boolean).join(" · ") ||
              "Profil do uzupełnienia"}
          </small>
        </span>
      </Link>
      <dl className="student-row__facts">
        <div>
          <dt>Następna lekcja</dt>
          <dd>
            {next
              ? new Intl.DateTimeFormat("pl-PL", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                  timeZone: timezone,
                }).format(new Date(next.startsAt))
              : "Nie zaplanowano"}
          </dd>
        </div>
        <div>
          <dt>Tryb</dt>
          <dd>{groupNames.length ? groupNames.join(", ") : "Indywidualnie"}</dd>
        </div>
        <div>
          <dt>Pakiet</dt>
          <dd>
            {student.packageRemainingLessons === null
              ? "Brak pakietu"
              : `${student.packageRemainingLessons} lekcji`}
          </dd>
        </div>
        <div>
          <dt>Rozliczenie</dt>
          <dd
            className={
              student.balanceDue.amount > 0 ? "amount-due" : "amount-paid"
            }
          >
            {student.balanceDue.amount > 0
              ? `${formatMoney(student.balanceDue)} do zapłaty`
              : "Rozliczone"}
          </dd>
        </div>
      </dl>
      <Link
        className="student-row__open"
        href={`/app/uczniowie/${student.id}`}
        aria-label={`Otwórz profil: ${student.name}`}
      >
        <span aria-hidden="true">›</span>
      </Link>
    </article>
  );
}

function getNextLesson(student: Student, lessons: Lesson[]) {
  return lessons
    .filter(
      (lesson) =>
        lesson.status === "scheduled" &&
        lesson.participantIds.includes(student.id),
    )
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
}
