"use client";

import { Download, TrendingUp } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { useAppData } from "@/hooks/use-app-data";
import { formatMoney, localDateKey } from "@/lib/format";
import { useSessionTeacher } from "../app-shell";
import { PageLoading } from "../ui/loading";

type Period = "week" | "month" | "year";
export function StatisticsPage() {
  const teacher = useSessionTeacher();
  const { data, isPending } = useAppData(teacher.id);
  const searchParams = useSearchParams();
  const router = useRouter();
  const period = (
    ["week", "month", "year"].includes(searchParams.get("period") ?? "")
      ? searchParams.get("period")
      : "month"
  ) as Period;
  const trend = useMemo(() => {
    if (!data) return [];
    const months = Array.from({ length: 6 }, (_, index) => {
      const date = new Date();
      date.setDate(1);
      date.setMonth(date.getMonth() - (5 - index));
      return {
        key: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
        label: new Intl.DateTimeFormat("pl-PL", { month: "short" }).format(
          date,
        ),
        count: 0,
      };
    });
    data.lessons
      .filter((lesson) => lesson.status !== "cancelled")
      .forEach((lesson) => {
        const date = new Date(lesson.startsAt);
        const key = localDateKey(date, data.teacher.timezone).slice(0, 7);
        const bucket = months.find((item) => item.key === key);
        if (bucket) bucket.count += 1;
      });
    return months;
  }, [data]);
  if (isPending || !data) return <PageLoading />;
  const summary = data.financials[period];
  const max = Math.max(...trend.map((item) => item.count), 1);
  function setPeriod(next: Period) {
    const params = new URLSearchParams(searchParams);
    params.set("period", next);
    router.replace(`/app/statystyki?${params}`);
  }
  return (
    <div className="statistics-page page-enter">
      <header className="page-header">
        <div>
          <p className="eyebrow">Rytm pracy</p>
          <h1>Statystyki</h1>
          <p className="page-intro">
            Zobacz rytm swoich lekcji i rozliczenia w wybranym okresie.
          </p>
        </div>
        <div className="export-actions">
          <Link
            prefetch={false}
            className="button button--secondary"
            href="/api/export/lekcje"
          >
            <Download size={17} />
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
      </header>
      <div className="period-switch segmented-control">
        <button
          className={period === "week" ? "selected" : ""}
          aria-pressed={period === "week"}
          onClick={() => setPeriod("week")}
        >
          Tydzień
        </button>
        <button
          className={period === "month" ? "selected" : ""}
          aria-pressed={period === "month"}
          onClick={() => setPeriod("month")}
        >
          Miesiąc
        </button>
        <button
          className={period === "year" ? "selected" : ""}
          aria-pressed={period === "year"}
          onClick={() => setPeriod("year")}
        >
          Rok
        </button>
      </div>
      <section className="stats-ledger">
        <div>
          <small>Lekcje</small>
          <strong>{summary.lessonCount}</strong>
        </div>
        <div>
          <small>Godziny</small>
          <strong>
            {new Intl.NumberFormat("pl-PL", {
              maximumFractionDigits: 1,
            }).format(summary.hours)}
          </strong>
        </div>
        <div>
          <small>Aktywni uczniowie</small>
          <strong>{summary.activeStudents}</strong>
        </div>
      </section>
      <section className="financial-breakdown">
        <div>
          <p className="eyebrow">Przepływ płatności</p>
          <h2>
            {period === "week"
              ? "Ten tydzień"
              : period === "month"
                ? "Ten miesiąc"
                : "Ten rok"}
          </h2>
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
          <TrendingUp size={20} />
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
    </div>
  );
}
