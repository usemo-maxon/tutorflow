"use client";

import { Plus, Search } from "lucide-react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { useDeferredValue, useMemo, useState } from "react";
import { useAppData } from "@/hooks/use-app-data";
import { copy } from "@/lib/copy";
import { formatMoney } from "@/lib/format";
import { useSessionTeacher } from "../app-shell";
import { useAppUi } from "../app-ui-context";
import { EmptyState } from "../ui/empty-state";
import { PageLoading } from "../ui/loading";

export function StudentsPage() {
  const teacher = useSessionTeacher();
  const { data, isPending } = useAppData(teacher.id);
  const { openStudentComposer } = useAppUi();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const deferredSearch = useDeferredValue(search);
  const filter =
    searchParams.get("status") === "archived" ? "archived" : "active";
  const visible = useMemo(
    () =>
      data?.students.filter(
        (student) =>
          student.status === filter &&
          `${student.name} ${student.level} ${student.goal}`
            .toLocaleLowerCase("pl")
            .includes(deferredSearch.toLocaleLowerCase("pl")),
      ) ?? [],
    [data, filter, deferredSearch],
  );
  if (isPending || !data) return <PageLoading />;
  function setFilter(next: string) {
    const params = new URLSearchParams(searchParams);
    params.set("status", next);
    router.replace(`/app/uczniowie?${params}`);
  }
  return (
    <div className="students-page page-enter">
      <header className="page-header">
        <div>
          <p className="eyebrow">Relacje i ciągłość</p>
          <h1>Uczniowie</h1>
          <p className="page-intro">
            Karta ucznia łączy kolejne tematy, lekcje i rozliczenia.
          </p>
        </div>
        <button
          className="button button--primary"
          disabled={data.teacher.subscription.readOnly}
          onClick={() => openStudentComposer()}
        >
          <Plus size={18} />
          {copy.actions.addStudent}
        </button>
      </header>
      <div className="list-toolbar">
        <label className="search-field">
          <Search size={18} aria-hidden="true" />
          <span className="sr-only">Szukaj ucznia</span>
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              const params = new URLSearchParams(searchParams);
              if (event.target.value) params.set("q", event.target.value);
              else params.delete("q");
              window.history.replaceState(null, "", `/app/uczniowie?${params}`);
            }}
            placeholder="Szukaj po imieniu, poziomie lub celu"
          />
        </label>
        <div className="segmented-control segmented-control--compact">
          <button
            className={filter === "active" ? "selected" : ""}
            aria-pressed={filter === "active"}
            onClick={() => setFilter("active")}
          >
            Aktywni
          </button>
          <button
            className={filter === "archived" ? "selected" : ""}
            aria-pressed={filter === "archived"}
            onClick={() => setFilter("archived")}
          >
            Archiwalni
          </button>
        </div>
      </div>
      {visible.length ? (
        <div className="student-grid">
          {visible.map((student) => {
            const future = data.lessons.find(
              (lesson) =>
                lesson.participantIds.includes(student.id) &&
                lesson.status === "scheduled",
            );
            return (
              <article className="student-card" key={student.id}>
                <div className="student-card-top">
                  <span className="avatar">
                    {student.name
                      .split(" ")
                      .map((part) => part[0])
                      .slice(0, 2)
                      .join("")}
                  </span>
                  <span className={`status-dot status-dot--${student.status}`}>
                    {student.status === "active" ? "Aktywny" : "Archiwalny"}
                  </span>
                </div>
                <h2>
                  <Link href={`/app/uczniowie/${student.id}`}>
                    {student.name}
                  </Link>
                </h2>
                <p>
                  {student.level || "Poziom nieustalony"} ·{" "}
                  {student.goal || "Cel do uzupełnienia"}
                </p>
                <dl>
                  <div>
                    <dt>Standard</dt>
                    <dd>
                      {student.defaultDurationMinutes} min ·{" "}
                      {student.defaultFormat === "online"
                        ? "online"
                        : "stacjonarnie"}
                    </dd>
                  </div>
                  <div>
                    <dt>Cena</dt>
                    <dd>{formatMoney(student.defaultPrice)}</dd>
                  </div>
                  <div>
                    <dt>Następna lekcja</dt>
                    <dd>
                      {future
                        ? new Intl.DateTimeFormat("pl-PL", {
                            day: "numeric",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                            timeZone: data.teacher.timezone,
                          }).format(new Date(future.startsAt))
                        : "Nie zaplanowano"}
                    </dd>
                  </div>
                </dl>
                <div className="student-card-actions">
                  <Link
                    className="button button--quiet"
                    href={`/app/uczniowie/${student.id}`}
                  >
                    Otwórz kartę
                  </Link>
                  {student.status === "active" && (
                    <button
                      className="icon-button icon-button--border"
                      disabled={data.teacher.subscription.readOnly}
                      aria-label={`Zaplanuj lekcję dla: ${student.name}`}
                      onClick={() =>
                        router.push(`/app/kalendarz?student=${student.id}`)
                      }
                    >
                      <Plus size={18} />
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title={
            deferredSearch
              ? "Nie znaleziono uczniów pasujących do wyszukiwania."
              : filter === "active"
                ? copy.empty.students
                : "Nie masz archiwalnych uczniów."
          }
          action={
            !deferredSearch && filter === "active" ? (
              <button
                className="button button--primary"
                disabled={data.teacher.subscription.readOnly}
                onClick={() => openStudentComposer()}
              >
                {copy.actions.addStudent}
              </button>
            ) : undefined
          }
        />
      )}
    </div>
  );
}
