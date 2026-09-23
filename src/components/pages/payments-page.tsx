"use client";

import { AlertCircle, PackageCheck, Search, WalletCards } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useDeferredValue, useEffect, useState } from "react";
import {
  CreatePackageDialog,
  RecordPaymentDialog,
} from "@/components/finance-dialogs";
import { useFinancialOverview } from "@/hooks/use-app-data";
import { fetchFinancialOverview } from "@/lib/api-client";
import type { FinancialPayment } from "@/lib/finance";
import { formatDateTime, formatMoney } from "@/lib/format";
import {
  parsePaymentsCreateAction,
  removeActionFromUrl,
  type PaymentsCreateAction,
} from "@/lib/global-create";
import { useSessionTeacher } from "../app-shell";
import { useAppUi } from "../app-ui-context";
import { EmptyState } from "../ui/empty-state";
import { PageLoading } from "../ui/loading";

type View = "charges" | "payments" | "packages";

export function PaymentsPage() {
  const teacher = useSessionTeacher();
  const { data, isPending, error } = useFinancialOverview(teacher.id);
  const { openStudentComposer } = useAppUi();
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedAction = parsePaymentsCreateAction(searchParams.get("action"));
  const queryString = searchParams.toString();
  const [view, setView] = useState<View>("charges");
  const [search, setSearch] = useState("");
  const [chargeFilter, setChargeFilter] = useState<"all" | "overdue">("all");
  const [paymentFilter, setPaymentFilter] = useState<"all" | "unallocated">(
    "all",
  );
  const [olderPayments, setOlderPayments] = useState<FinancialPayment[]>([]);
  const [nextCursor, setNextCursor] = useState<number | undefined>();
  const [loadingMore, setLoadingMore] = useState(false);
  const [autoOpenAction, setAutoOpenAction] =
    useState<PaymentsCreateAction | null>(null);
  const [missingStudentAction, setMissingStudentAction] =
    useState<PaymentsCreateAction | null>(null);
  const query = useDeferredValue(search.trim().toLocaleLowerCase("pl"));
  const consumePaymentAutoOpen = useCallback(
    () =>
      setAutoOpenAction((current) => (current === "payment" ? null : current)),
    [],
  );
  const consumePackageAutoOpen = useCallback(
    () =>
      setAutoOpenAction((current) => (current === "package" ? null : current)),
    [],
  );

  useEffect(() => {
    if (!data || !requestedAction) return;
    const timer = window.setTimeout(() => {
      if (data.students.length) {
        setAutoOpenAction(requestedAction);
        setMissingStudentAction(null);
      } else {
        setAutoOpenAction(null);
        setMissingStudentAction(requestedAction);
      }
      router.replace(removeActionFromUrl(pathname, queryString), {
        scroll: false,
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [data, pathname, queryString, requestedAction, router]);

  if (isPending) return <PageLoading />;
  if (error || !data) {
    return (
      <EmptyState
        title="Nie udało się wczytać rozliczeń."
        description="Odśwież stronę i spróbuj ponownie."
      />
    );
  }
  const effectiveNextCursor =
    nextCursor ?? (olderPayments.length ? undefined : data.nextPaymentCursor);
  const matches = (name: string, detail: string) =>
    !query || `${name} ${detail}`.toLocaleLowerCase("pl").includes(query);
  const charges = data.openCharges.filter(
    (charge) =>
      matches(charge.studentName, charge.description) &&
      (chargeFilter === "all" || charge.overdue),
  );
  const payments = [...data.recentPayments, ...olderPayments].filter(
    (payment) =>
      matches(payment.studentName, payment.note ?? "") &&
      (paymentFilter === "all" || payment.unallocated > 0),
  );
  const packages = data.packages.filter((item) =>
    matches(item.studentName, item.name),
  );

  async function loadMore() {
    if (effectiveNextCursor === undefined) return;
    setLoadingMore(true);
    try {
      const next = await fetchFinancialOverview({
        cursor: effectiveNextCursor,
      });
      setOlderPayments((current) => [...current, ...next.recentPayments]);
      setNextCursor(next.nextPaymentCursor);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="payments-page finance-workspace page-enter">
      <header className="page-header finance-page-header">
        <div>
          <p className="eyebrow">Spokojny obraz rozliczeń</p>
          <h1>Płatności</h1>
          <p className="page-intro">
            Należności, faktycznie otrzymane wpłaty i pakiety — bez ręcznych
            obliczeń.
          </p>
        </div>
        <div className="finance-header-actions">
          <CreatePackageDialog
            overview={data}
            autoOpen={autoOpenAction === "package"}
            onAutoOpenConsumed={consumePackageAutoOpen}
          />
          <RecordPaymentDialog
            overview={data}
            autoOpen={autoOpenAction === "payment"}
            onAutoOpenConsumed={consumePaymentAutoOpen}
          />
        </div>
      </header>

      {missingStudentAction && (
        <div className="finance-create-notice" role="status">
          <AlertCircle size={20} aria-hidden="true" />
          <div>
            <strong>
              {missingStudentAction === "payment"
                ? "Najpierw dodaj ucznia, aby zarejestrować płatność."
                : "Najpierw dodaj ucznia, aby utworzyć pakiet."}
            </strong>
            <p>Po utworzeniu ucznia wróć do płatności i spróbuj ponownie.</p>
          </div>
          {!teacher.subscription.readOnly && (
            <button
              type="button"
              className="button button--secondary"
              onClick={() => {
                setMissingStudentAction(null);
                openStudentComposer();
              }}
            >
              Dodaj ucznia
            </button>
          )}
        </div>
      )}

      <section className="finance-metrics" aria-label="Podsumowanie rozliczeń">
        <Metric
          label="Do zapłaty"
          value={formatMoney({
            amount: data.summary.outstanding,
            currency: data.summary.currency,
          })}
          detail="Otwarte pozycje po przypisaniu wpłat"
        />
        <Metric
          label="Po terminie"
          value={formatMoney({
            amount: data.summary.overdue,
            currency: data.summary.currency,
          })}
          detail="Tylko pozycje z minionym terminem"
          attention={data.summary.overdue > 0}
        />
        <Metric
          label="Wpłaty w tym miesiącu"
          value={formatMoney({
            amount: data.summary.receivedThisMonth,
            currency: data.summary.currency,
          })}
          detail="Faktycznie otrzymane płatności"
        />
      </section>

      <div className="finance-toolbar">
        <nav className="tabs" aria-label="Widoki rozliczeń">
          <button
            className={view === "charges" ? "active" : ""}
            onClick={() => setView("charges")}
          >
            Należności
          </button>
          <button
            className={view === "payments" ? "active" : ""}
            onClick={() => setView("payments")}
          >
            Wpłaty
          </button>
          <button
            className={view === "packages" ? "active" : ""}
            onClick={() => setView("packages")}
          >
            Pakiety
          </button>
        </nav>
        <label className="search-field">
          <Search size={18} aria-hidden="true" />
          <span className="sr-only">Szukaj po uczniu</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Szukaj ucznia"
          />
        </label>
      </div>

      {view === "charges" && (
        <section aria-labelledby="charges-heading">
          <div className="section-heading finance-section-heading">
            <div>
              <p className="eyebrow">Otwarte pozycje</p>
              <h2 id="charges-heading">Co pozostaje do zapłaty</h2>
            </div>
            <div className="segmented-control segmented-control--compact">
              <button
                className={chargeFilter === "all" ? "selected" : ""}
                aria-pressed={chargeFilter === "all"}
                onClick={() => setChargeFilter("all")}
              >
                Wszystkie
              </button>
              <button
                className={chargeFilter === "overdue" ? "selected" : ""}
                aria-pressed={chargeFilter === "overdue"}
                onClick={() => setChargeFilter("overdue")}
              >
                Po terminie
              </button>
            </div>
          </div>
          {charges.length ? (
            <div className="finance-list" role="list">
              {charges.map((charge) => (
                <article
                  className="finance-list-row"
                  role="listitem"
                  key={charge.id}
                >
                  <div className="finance-list-icon" aria-hidden="true">
                    <AlertCircle size={18} />
                  </div>
                  <div className="finance-list-main">
                    <strong>
                      <Link
                        href={`/app/uczniowie/${charge.studentId}?tab=payments`}
                      >
                        {charge.studentName}
                      </Link>
                    </strong>
                    <span>{charge.description}</span>
                  </div>
                  <div className="finance-list-meta">
                    <span
                      className={`finance-status ${charge.overdue ? "is-overdue" : ""}`}
                    >
                      {charge.overdue
                        ? "Po terminie"
                        : charge.dueAt
                          ? "Do zapłaty"
                          : "Bez terminu"}
                    </span>
                    <small>
                      {charge.dueAt
                        ? `Termin ${formatDateTime(charge.dueAt, data.workspace.timezone)}`
                        : "Nie ustalono terminu"}
                    </small>
                  </div>
                  <div className="finance-list-amount">
                    <strong>
                      {formatMoney({
                        amount: charge.outstanding,
                        currency: charge.currency,
                      })}
                    </strong>
                    {charge.allocated > 0 && (
                      <small>
                        z{" "}
                        {formatMoney({
                          amount: charge.amount,
                          currency: charge.currency,
                        })}
                      </small>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Brak otwartych należności"
              description="Pozycje pojawią się po zakończeniu lekcji rozliczanej osobno albo utworzeniu płatnego pakietu."
            />
          )}
        </section>
      )}

      {view === "payments" && (
        <section aria-labelledby="payments-heading">
          <div className="section-heading finance-section-heading">
            <div>
              <p className="eyebrow">Historia wpłat</p>
              <h2 id="payments-heading">Otrzymane płatności</h2>
            </div>
            <div className="segmented-control segmented-control--compact">
              <button
                className={paymentFilter === "all" ? "selected" : ""}
                aria-pressed={paymentFilter === "all"}
                onClick={() => setPaymentFilter("all")}
              >
                Wszystkie
              </button>
              <button
                className={paymentFilter === "unallocated" ? "selected" : ""}
                aria-pressed={paymentFilter === "unallocated"}
                onClick={() => setPaymentFilter("unallocated")}
              >
                Nieprzypisane
              </button>
            </div>
          </div>
          {payments.length ? (
            <div className="finance-list" role="list">
              {payments.map((payment) => (
                <article
                  className="finance-list-row"
                  role="listitem"
                  key={payment.id}
                >
                  <div className="finance-list-icon" aria-hidden="true">
                    <WalletCards size={18} />
                  </div>
                  <div className="finance-list-main">
                    <strong>
                      <Link
                        href={`/app/uczniowie/${payment.studentId}?tab=payments`}
                      >
                        {payment.studentName}
                      </Link>
                    </strong>
                    <span>
                      {methodLabel(payment.method)}
                      {payment.note ? ` · ${payment.note}` : ""}
                    </span>
                  </div>
                  <div className="finance-list-meta">
                    <span className="finance-status">Opłacone</span>
                    <small>
                      {payment.paidAt
                        ? formatDateTime(
                            payment.paidAt,
                            data.workspace.timezone,
                          )
                        : "Brak daty"}
                    </small>
                  </div>
                  <div className="finance-list-amount">
                    <strong>
                      {formatMoney({
                        amount: payment.amount,
                        currency: payment.currency,
                      })}
                    </strong>
                    {payment.unallocated > 0 && (
                      <small>
                        {formatMoney({
                          amount: payment.unallocated,
                          currency: payment.currency,
                        })}{" "}
                        nieprzypisane
                      </small>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Brak zarejestrowanych płatności"
              description="Zapisz pierwszą wpłatę, kiedy środki faktycznie dotrą."
            />
          )}
          {effectiveNextCursor !== undefined && (
            <button
              className="button button--quiet finance-load-more"
              disabled={loadingMore}
              onClick={loadMore}
            >
              {loadingMore ? "Wczytywanie…" : "Pokaż starsze wpłaty"}
            </button>
          )}
        </section>
      )}

      {view === "packages" && (
        <section aria-labelledby="packages-heading">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Pakiety</p>
              <h2 id="packages-heading">Zakupione uprawnienia</h2>
            </div>
          </div>
          {packages.length ? (
            <div className="package-grid">
              {packages.map((item) => (
                <article className="package-card" key={item.id}>
                  <div className="package-card-head">
                    <PackageCheck size={20} aria-hidden="true" />
                    <div>
                      <strong>{item.name}</strong>
                      <Link
                        href={`/app/uczniowie/${item.studentId}?tab=payments`}
                      >
                        {item.studentName}
                      </Link>
                    </div>
                    <span className="finance-status">
                      {packageStatus(item.status)}
                    </span>
                  </div>
                  <div
                    className="package-progress"
                    aria-label={`Wykorzystano ${item.usedLessons} z ${item.totalLessons} zajęć`}
                  >
                    <span
                      style={{
                        width: `${Math.min(100, (item.usedLessons / item.totalLessons) * 100)}%`,
                      }}
                    />
                  </div>
                  <dl>
                    <div>
                      <dt>Wykorzystano</dt>
                      <dd>
                        {item.usedLessons} z {item.totalLessons}
                      </dd>
                    </div>
                    <div>
                      <dt>Pozostało</dt>
                      <dd>{item.remainingLessons}</dd>
                    </div>
                    <div>
                      <dt>Wartość</dt>
                      <dd>
                        {formatMoney({
                          amount: item.price,
                          currency: item.currency,
                        })}
                      </dd>
                    </div>
                    <div>
                      <dt>Ważność</dt>
                      <dd>
                        {item.expiresAt
                          ? new Intl.DateTimeFormat("pl-PL", {
                              dateStyle: "medium",
                              timeZone: data.workspace.timezone,
                            }).format(new Date(item.expiresAt))
                          : "Bez terminu"}
                      </dd>
                    </div>
                  </dl>
                  {item.paymentOutstanding > 0 && (
                    <p className="package-payment-due">
                      Płatność do uregulowania:{" "}
                      {formatMoney({
                        amount: item.paymentOutstanding,
                        currency: item.currency,
                      })}
                    </p>
                  )}
                  {item.usage.length > 0 && (
                    <details className="package-history">
                      <summary>Historia wykorzystania</summary>
                      <ul>
                        {item.usage.slice(0, 8).map((usage) => (
                          <li key={usage.id}>
                            <Link href={`/app/lekcje/${usage.lessonId}`}>
                              {usage.lessonLabel}
                            </Link>
                            <span>
                              {usage.kind === "reversal"
                                ? "Przywrócono"
                                : "−1 zajęcie"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Brak pakietów"
              description="Utwórz pakiet, aby rozliczać wykorzystane zajęcia z trwałego rejestru."
            />
          )}
        </section>
      )}
    </div>
  );
}

function Metric({
  label,
  value,
  detail,
  attention = false,
}: {
  label: string;
  value: string;
  detail: string;
  attention?: boolean;
}) {
  return (
    <article className={attention ? "metric-attention" : ""}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function methodLabel(method: FinancialPayment["method"]) {
  return method === "bank_transfer"
    ? "Przelew"
    : method === "cash"
      ? "Gotówka"
      : method === "card_external"
        ? "Karta"
        : "Inna metoda";
}

function packageStatus(status: string) {
  return status === "active"
    ? "Aktywny"
    : status === "exhausted"
      ? "Wykorzystany"
      : status === "expired"
        ? "Wygasł"
        : "Anulowany";
}
