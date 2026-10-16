"use client";

import { CheckCircle2, Clock3, ExternalLink, FileText } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  homeworkFilter,
  homeworkStatusLabels,
  type HomeworkFilter,
  type HomeworkStatus,
  type StudentHomeworkItem,
  type StudentHomeworkUpdate,
} from "@/lib/homework";
import { formatDay } from "@/lib/format";

const filters: Array<[HomeworkFilter, string]> = [
  ["todo", "Do zrobienia"],
  ["overdue", "Po terminie"],
  ["finished", "Zakończone"],
];

export function StudentHomeworkSection({
  items,
  timezone,
  readOnly,
  pending,
  onUpdate,
}: {
  items: StudentHomeworkItem[];
  timezone: string;
  readOnly: boolean;
  pending: boolean;
  onUpdate: (input: StudentHomeworkUpdate) => Promise<unknown>;
}) {
  const [filter, setFilter] = useState<HomeworkFilter>("todo");
  const [feedback, setFeedback] = useState<Record<string, string>>(
    Object.fromEntries(
      items.map((item) => [item.homeworkId, item.feedback ?? ""]),
    ),
  );
  const [error, setError] = useState("");
  const visible = useMemo(
    () => items.filter((item) => homeworkFilter(item) === filter),
    [filter, items],
  );

  async function update(item: StudentHomeworkItem, status: HomeworkStatus) {
    setError("");
    try {
      await onUpdate({
        homeworkId: item.homeworkId,
        status,
        feedback: feedback[item.homeworkId],
      });
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Nie udało się zapisać pracy domowej.",
      );
    }
  }

  return (
    <section
      className="student-homework panel"
      aria-labelledby="student-homework-title"
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">Bieżące i historia</p>
          <h2 id="student-homework-title">Praca domowa</h2>
        </div>
        <FileText size={21} aria-hidden="true" />
      </div>
      <div
        className="student-homework__filters"
        role="group"
        aria-label="Filtr pracy domowej"
      >
        {filters.map(([value, label]) => {
          const count = items.filter(
            (item) => homeworkFilter(item) === value,
          ).length;
          return (
            <button
              type="button"
              key={value}
              className={filter === value ? "active" : ""}
              aria-pressed={filter === value}
              onClick={() => setFilter(value)}
            >
              {label} <span>{count}</span>
            </button>
          );
        })}
      </div>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      {visible.length ? (
        <div className="student-homework__list">
          {visible.map((item) => (
            <article className="student-homework-card" key={item.id}>
              <header>
                <div>
                  <span
                    className={`homework-status homework-status--${item.status}`}
                  >
                    {item.overdue
                      ? "Po terminie"
                      : homeworkStatusLabels[item.status]}
                  </span>
                  <h3>{item.title}</h3>
                  <p>
                    {item.sourceLessonTopic || "Lekcja"} ·{" "}
                    {formatDay(item.sourceLessonStartsAt, timezone)}
                  </p>
                </div>
                <Link
                  className="text-link"
                  href={`/app/lekcje/${item.sourceLessonId}`}
                >
                  Otwórz zadanie <ExternalLink size={13} aria-hidden="true" />
                </Link>
              </header>
              {item.description ? <p>{item.description}</p> : null}
              {item.dueAt ? (
                <p className="student-homework-card__due">
                  <Clock3 size={15} aria-hidden="true" /> Termin:{" "}
                  {formatDay(item.dueAt, timezone)}
                </p>
              ) : null}
              {item.materials.length ? (
                <div className="student-homework-card__materials">
                  {item.materials.map((material) =>
                    material.url ? (
                      <a
                        key={material.id}
                        href={material.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {material.title}
                        {material.archived ? " · archiwalny" : ""}
                      </a>
                    ) : (
                      <span key={material.id}>{material.title}</span>
                    ),
                  )}
                </div>
              ) : null}
              <div className="student-homework-card__review">
                <label className="field">
                  <span>Status</span>
                  <select
                    value={item.status}
                    disabled={readOnly || pending}
                    onChange={(event) =>
                      void update(item, event.target.value as HomeworkStatus)
                    }
                  >
                    {Object.entries(homeworkStatusLabels).map(
                      ([value, label]) => (
                        <option value={value} key={value}>
                          {label}
                        </option>
                      ),
                    )}
                  </select>
                </label>
                <label className="field student-homework-card__feedback">
                  <span>Informacja zwrotna</span>
                  <textarea
                    rows={2}
                    maxLength={2_000}
                    value={feedback[item.homeworkId] ?? item.feedback ?? ""}
                    disabled={readOnly || pending}
                    onChange={(event) =>
                      setFeedback((current) => ({
                        ...current,
                        [item.homeworkId]: event.target.value,
                      }))
                    }
                    placeholder="Np. Dobrze opanowane podstawy."
                  />
                </label>
                <button
                  className="button button--secondary"
                  type="button"
                  disabled={readOnly || pending}
                  onClick={() => void update(item, item.status)}
                >
                  <CheckCircle2 size={16} aria-hidden="true" /> Zapisz
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="memory-section-empty">Brak prac domowych w tym widoku.</p>
      )}
    </section>
  );
}
