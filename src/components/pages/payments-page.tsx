"use client";

import { Check, Download, Search, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useDeferredValue, useMemo, useState } from "react";
import { useAppData, useAppMutation } from "@/hooks/use-app-data";
import { copy } from "@/lib/copy";
import {
  formatDateTime,
  formatMoney,
  localDateKey,
  getWeekDays,
} from "@/lib/format";
import { useSessionTeacher } from "../app-shell";
import { useAppUi } from "../app-ui-context";
import { EmptyState } from "../ui/empty-state";
import { PageLoading } from "../ui/loading";
import { PaymentBadge } from "../ui/status-badge";

export function PaymentsPage() {
  const teacher = useSessionTeacher();
  const { data, isPending } = useAppData(teacher.id);
  const mutation = useAppMutation(teacher.id);
  const { showToast, showError } = useAppUi();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const query = useDeferredValue(search).toLocaleLowerCase("pl");
  const [period, setPeriod] = useState<"week" | "month" | "year" | "all">(
    "month",
  );
  const [pendingRow, setPendingRow] = useState<string | null>(null);
  const status = searchParams.get("status") ?? "all";
  const rows = useMemo(
    () =>
      data?.lessons
        .flatMap((lesson) =>
          lesson.participants.map((participant) => ({
            lesson,
            participant,
            student: data.students.find(
              (student) => student.id === participant.studentId,
            ),
          })),
        )
        .filter(
          (row) =>
            row.student &&
            (period === "all" ||
              (period === "week"
                ? getWeekDays(new Date(), data.teacher.timezone).some(
                    (day) =>
                      localDateKey(day, data.teacher.timezone) ===
                      localDateKey(row.lesson.startsAt, data.teacher.timezone),
                  )
                : localDateKey(
                    row.lesson.startsAt,
                    data.teacher.timezone,
                  ).startsWith(
                    localDateKey(new Date(), data.teacher.timezone).slice(
                      0,
                      period === "month" ? 7 : 4,
                    ),
                  ))) &&
            (status === "all" || row.participant.paymentStatus === status) &&
            `${row.student?.name} ${row.lesson.topic}`
              .toLocaleLowerCase("pl")
              .includes(query),
        )
        .sort((a, b) => b.lesson.startsAt.localeCompare(a.lesson.startsAt)) ??
      [],
    [data, status, query, period],
  );
  if (isPending || !data) return <PageLoading />;
  function setStatus(next: string) {
    const params = new URLSearchParams(searchParams);
    if (next === "all") params.delete("status");
    else params.set("status", next);
    router.replace(`/app/platnosci?${params}`);
  }
  async function togglePayment(
    lessonId: string,
    studentId: string,
    current: "unpaid" | "paid" | "cancelled",
  ) {
    if (pendingRow || data?.teacher.subscription.readOnly) return;
    const next = current === "paid" ? "unpaid" : "paid";
    setPendingRow(`${lessonId}-${studentId}`);
    try {
      await mutation.mutateAsync({
        type: "setPayment",
        lessonId,
        studentId,
        status: next,
      });
      showToast({
        message: copy.toasts.paymentChanged,
        actionLabel: "Cofnij",
        onAction: async () => {
          try {
            await mutation.mutateAsync({
              type: "setPayment",
              lessonId,
              studentId,
              status: current,
            });
            showToast({ message: "Przywrócono poprzedni status płatności" });
          } catch (error) {
            showError(error);
          }
        },
      });
    } catch (error) {
      showError(error);
    } finally {
      setPendingRow(null);
    }
  }
  const summary = data.financials[period === "all" ? "month" : period];
  return (
    <div className="payments-page page-enter">
      <header className="page-header">
        <div>
          <p className="eyebrow">Rozliczenia uczniów</p>
          <h1>Płatności</h1>
          <p className="page-intro">
            Każda osoba ma własny status płatności, także podczas lekcji
            grupowej.
          </p>
        </div>
        <Link
          prefetch={false}
          className="button button--secondary"
          href="/api/export/platnosci"
        >
          <Download size={17} />
          {copy.actions.exportCsv}
        </Link>
      </header>
      <label className="payment-period">
        <span>Okres rozliczenia</span>
        <select
          value={period}
          onChange={(event) => setPeriod(event.target.value as typeof period)}
        >
          <option value="week">Bieżący tydzień</option>
          <option value="month">Bieżący miesiąc</option>
          <option value="year">Bieżący rok</option>
          <option value="all">Wszystkie terminy</option>
        </select>
        <span>
          {new Intl.DateTimeFormat("pl-PL", {
            month: "long",
            year: "numeric",
            timeZone: data.teacher.timezone,
          }).format(new Date())}
          {period === "all" ? " · podsumowanie miesiąca" : ""}
        </span>
      </label>
      <section
        className="finance-strip"
        aria-label={`Podsumowanie: ${period === "week" ? "bieżący tydzień" : period === "year" ? "bieżący rok" : "bieżący miesiąc"}`}
      >
        <div>
          <small>Planowane</small>
          <strong>
            {formatMoney({ amount: summary.plannedAmount, currency: "PLN" })}
          </strong>
        </div>
        <div className="finance-due">
          <small>Do otrzymania</small>
          <strong>
            {formatMoney({ amount: summary.receivableAmount, currency: "PLN" })}
          </strong>
        </div>
        <div>
          <small>Otrzymane</small>
          <strong>
            {formatMoney({ amount: summary.receivedAmount, currency: "PLN" })}
          </strong>
        </div>
      </section>
      <div className="list-toolbar">
        <label className="search-field">
          <Search size={18} />
          <span className="sr-only">Szukaj płatności</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Szukaj ucznia lub tematu"
          />
        </label>
        <div className="segmented-control segmented-control--compact">
          <button
            className={status === "all" ? "selected" : ""}
            aria-pressed={status === "all"}
            onClick={() => setStatus("all")}
          >
            Wszystkie
          </button>
          <button
            className={status === "unpaid" ? "selected" : ""}
            aria-pressed={status === "unpaid"}
            onClick={() => setStatus("unpaid")}
          >
            Nieopłacone
          </button>
          <button
            className={status === "paid" ? "selected" : ""}
            aria-pressed={status === "paid"}
            onClick={() => setStatus("paid")}
          >
            Opłacone
          </button>
          <button
            className={status === "cancelled" ? "selected" : ""}
            aria-pressed={status === "cancelled"}
            onClick={() => setStatus("cancelled")}
          >
            Anulowane
          </button>
        </div>
      </div>
      {rows.length ? (
        <div
          className="data-table payment-table"
          role="table"
          aria-label="Płatności uczniów"
        >
          <div className="data-table-head" role="row">
            <span role="columnheader">Uczeń</span>
            <span role="columnheader">Lekcja</span>
            <span role="columnheader" className="money-value">
              Kwota
            </span>
            <span role="columnheader">Status</span>
            <span role="columnheader">Akcja</span>
          </div>
          {rows.map(({ lesson, participant, student }) => (
            <div
              className="data-table-row"
              role="row"
              key={`${lesson.id}-${participant.studentId}`}
            >
              <span role="cell" data-label="Uczeń">
                <Link href={`/app/uczniowie/${student!.id}`}>
                  {student!.name}
                </Link>
                <small>{student!.level}</small>
              </span>
              <span role="cell" data-label="Lekcja">
                <Link href={`/app/lekcje/${lesson.id}`}>
                  {lesson.topic || "Lekcja bez tematu"}
                </Link>
                <small>
                  {formatDateTime(lesson.startsAt, data.teacher.timezone)}
                </small>
              </span>
              <span role="cell" data-label="Kwota" className="money-value">
                {formatMoney(lesson.price)}
              </span>
              <span role="cell" data-label="Status">
                <PaymentBadge status={participant.paymentStatus} />
              </span>
              <span role="cell" data-label="Akcja">
                {participant.paymentStatus !== "cancelled" && (
                  <button
                    className="button button--quiet button--small"
                    disabled={
                      pendingRow !== null || data.teacher.subscription.readOnly
                    }
                    aria-label={`${participant.paymentStatus === "paid" ? "Cofnij opłacenie" : "Oznacz jako opłaconą"}: ${student!.name}, ${formatDateTime(lesson.startsAt, data.teacher.timezone)}`}
                    onClick={() =>
                      togglePayment(
                        lesson.id,
                        participant.studentId,
                        participant.paymentStatus,
                      )
                    }
                  >
                    {pendingRow === `${lesson.id}-${participant.studentId}` && (
                      <LoaderCircle size={16} className="spin" />
                    )}
                    {participant.paymentStatus === "paid" ? (
                      "Cofnij opłacenie"
                    ) : (
                      <>
                        <Check size={15} />
                        Oznacz jako opłaconą
                      </>
                    )}
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState
          title={
            query || status !== "all"
              ? "Nie ma płatności pasujących do tych filtrów."
              : "Brak płatności w wybranym okresie."
          }
          action={
            <button
              className="button button--secondary"
              onClick={() => {
                setSearch("");
                setStatus("all");
                setPeriod("all");
              }}
            >
              Pokaż wszystkie płatności
            </button>
          }
        />
      )}
    </div>
  );
}
