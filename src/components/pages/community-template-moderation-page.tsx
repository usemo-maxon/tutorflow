"use client";

import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowLeft,
  Check,
  Clock3,
  Flag,
  LoaderCircle,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  communityStatusLabel,
  type CommunityTemplateSubmission,
} from "@/lib/community-templates";
import {
  reportReasonLabel,
  type CommunityTemplateReport,
} from "@/lib/community-quality";
import { ClientApiError } from "@/lib/api-client";
import { useAppUi } from "../app-ui-context";
import { EmptyState } from "../ui/empty-state";
import { PageLoading } from "../ui/loading";

export function CommunityTemplateModerationPage() {
  const { showError, showToast } = useAppUi();
  const [submissions, setSubmissions] = useState<
    CommunityTemplateSubmission[] | null
  >(null);
  const [selected, setSelected] = useState<CommunityTemplateSubmission | null>(
    null,
  );
  const [reports, setReports] = useState<CommunityTemplateReport[] | null>(
    null,
  );
  const [selectedReport, setSelectedReport] =
    useState<CommunityTemplateReport | null>(null);
  const [forbidden, setForbidden] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [data, reportData] = await Promise.all([
        api<{ submissions: CommunityTemplateSubmission[] }>(
          "/api/admin/community-templates",
          { cache: "no-store" },
        ),
        api<{ reports: CommunityTemplateReport[] }>(
          "/api/admin/community-template-reports",
          { cache: "no-store" },
        ),
      ]);
      setSubmissions(data.submissions);
      setReports(reportData.reports);
      setForbidden(false);
      return data.submissions;
    } catch (error) {
      if (error instanceof ClientApiError && error.status === 403) {
        setForbidden(true);
        setSubmissions([]);
        setReports([]);
        return [];
      }
      throw error;
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh().catch(showError);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh, showError]);

  if (submissions === null || reports === null) return <PageLoading />;
  if (forbidden) {
    return (
      <div className="moderation-page page-enter">
        <EmptyState
          title="Brak dostępu do moderacji"
          description="Ten obszar wymaga serwerowo nadanej roli administratora platformy Easy4Tutor. Rola właściciela workspace nie wystarcza."
          action={
            <Link className="button button--secondary" href="/app">
              Wróć do aplikacji
            </Link>
          }
        />
      </div>
    );
  }
  const pendingCount = submissions.filter(
    (item) => item.status === "pending_review",
  ).length;
  return (
    <div className="moderation-page page-enter">
      <header className="page-header moderation-header">
        <div>
          <Link className="template-back" href="/app">
            <ArrowLeft size={15} /> Aplikacja
          </Link>
          <p className="eyebrow">Bezpieczna kolejka platformowa</p>
          <h1>Moderacja szablonów</h1>
          <p className="page-intro">
            Zatwierdzaj wyłącznie dokładny, odseparowany snapshot widoczny
            poniżej.
          </p>
        </div>
        <div className="shared-template-hero__seal">
          <ShieldCheck size={26} />
          <span>
            <strong>{pendingCount}</strong>oczekuje
          </span>
        </div>
      </header>
      <section className="moderation-list" aria-label="Zgłoszenia szablonów">
        {submissions.length ? (
          submissions.map((submission) => (
            <button key={submission.id} onClick={() => setSelected(submission)}>
              <span
                className={`community-status community-status--${submission.status}`}
              >
                {communityStatusLabel(submission.status)}
              </span>
              <strong>{submission.title}</strong>
              <small>
                <UserRound size={13} /> {submission.authorName}
              </small>
              <small>
                <Clock3 size={13} /> {submission.estimatedDurationMinutes} min ·{" "}
                {submission.subject} · {submission.level}
              </small>
            </button>
          ))
        ) : (
          <EmptyState
            title="Brak zgłoszeń"
            description="Nowe snapshoty społeczności pojawią się tutaj."
          />
        )}
      </section>
      <section className="moderation-reports" aria-label="Zgłoszenia treści">
        <div className="moderation-section-heading">
          <div>
            <p className="eyebrow">Zgłoszenia</p>
            <h2>Zgłoszenia treści</h2>
          </div>
          <span>
            {reports.filter((report) => report.status === "open").length}{" "}
            otwarte
          </span>
        </div>
        <div className="moderation-list">
          {reports.length ? (
            reports.map((report) => (
              <button key={report.id} onClick={() => setSelectedReport(report)}>
                <span
                  className={`community-status community-status--${report.status}`}
                >
                  <Flag size={12} />{" "}
                  {report.status === "open"
                    ? "Do sprawdzenia"
                    : report.status === "dismissed"
                      ? "Oddalone"
                      : "Wycofano"}
                </span>
                <strong>{report.publicationTitle}</strong>
                <small>{reportReasonLabel(report.reason)}</small>
                <small>
                  <UserRound size={13} /> Autor: {report.authorName}
                </small>
              </button>
            ))
          ) : (
            <EmptyState
              title="Brak zgłoszeń treści"
              description="Zgłoszone przez tutorów szablony pojawią się tutaj."
            />
          )}
        </div>
      </section>
      <ModerationDialog
        submission={selected}
        onClose={() => setSelected(null)}
        onChanged={async (message) => {
          setSelected(null);
          await refresh();
          showToast({ message });
        }}
      />
      <ReportModerationDialog
        report={selectedReport}
        onClose={() => setSelectedReport(null)}
        onChanged={async (message) => {
          setSelectedReport(null);
          await refresh();
          showToast({ message });
        }}
      />
    </div>
  );
}

function ModerationDialog({
  submission,
  onClose,
  onChanged,
}: {
  submission: CommunityTemplateSubmission | null;
  onClose: () => void;
  onChanged: (message: string) => Promise<void>;
}) {
  const { showError } = useAppUi();
  const [feedback, setFeedback] = useState("");
  const [pending, setPending] = useState(false);
  const [featuredOrder, setFeaturedOrder] = useState(
    submission?.featuredOrder ?? 0,
  );
  if (!submission) return null;
  async function moderate(action: "approve" | "reject" | "withdraw") {
    setPending(true);
    try {
      await api(`/api/admin/community-templates/${submission!.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, feedback }),
      });
      await onChanged(
        action === "approve"
          ? "Szablon został opublikowany."
          : action === "reject"
            ? "Zgłoszenie zostało odrzucone."
            : "Publikacja została wycofana.",
      );
    } catch (error) {
      showError(error);
    } finally {
      setPending(false);
    }
  }
  async function feature(featured: boolean) {
    setPending(true);
    try {
      await api(`/api/admin/community-templates/${submission!.id}/featured`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          featured,
          order: featured ? featuredOrder : undefined,
        }),
      });
      await onChanged(
        featured
          ? "Szablon dodano do polecanych."
          : "Szablon usunięto z polecanych.",
      );
    } catch (error) {
      showError(error);
    } finally {
      setPending(false);
    }
  }
  return (
    <Dialog.Root open onOpenChange={(open) => !open && !pending && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content shared-template-preview moderation-dialog">
          <header className="dialog-header">
            <div>
              <span
                className={`community-status community-status--${submission.status}`}
              >
                {communityStatusLabel(submission.status)}
              </span>
              <Dialog.Title>{submission.title}</Dialog.Title>
              <Dialog.Description>
                Autor: {submission.authorName}
              </Dialog.Description>
            </div>
            <Dialog.Close
              className="icon-button"
              aria-label="Zamknij"
              disabled={pending}
            >
              <X size={19} />
            </Dialog.Close>
          </header>
          <div className="shared-template-preview__scroll">
            <dl className="shared-template-facts">
              <div>
                <dt>Przedmiot</dt>
                <dd>{submission.subject}</dd>
              </div>
              <div>
                <dt>Poziom</dt>
                <dd>{submission.level}</dd>
              </div>
              <div>
                <dt>Czas</dt>
                <dd>{submission.estimatedDurationMinutes} min</dd>
              </div>
              <div>
                <dt>Sekcje</dt>
                <dd>{submission.sections.length}</dd>
              </div>
            </dl>
            <section className="shared-template-objective">
              <span>
                <ShieldCheck size={18} /> Cel lekcji
              </span>
              <p>{submission.objective}</p>
            </section>
            <p>{submission.description}</p>
            <ol className="shared-template-section-list">
              {submission.sections.map((section) => (
                <li key={section.id}>
                  <span>{section.position + 1}</span>
                  <div>
                    <strong>{section.title}</strong>
                    <p>{section.content}</p>
                  </div>
                  {section.estimatedMinutes && (
                    <small>{section.estimatedMinutes} min</small>
                  )}
                </li>
              ))}
            </ol>
            <aside className="shared-template-safety">
              <ShieldCheck size={20} />
              <div>
                <strong>To jest odseparowany snapshot</strong>
                <p>
                  Widok nie zawiera workspace, uczniów, notatek prywatnych ani
                  materiałów i plików źródłowych.
                </p>
              </div>
            </aside>
            {submission.status === "approved" && (
              <section className="moderation-curation">
                <div>
                  <Sparkles size={19} />
                  <div>
                    <strong>Polecane przez Easy4Tutor</strong>
                    <p>Ręczna rekomendacja nie zmienia szablonu w oficjalny.</p>
                  </div>
                </div>
                <label className="field">
                  <span>Kolejność</span>
                  <input
                    type="number"
                    min={0}
                    max={10000}
                    value={featuredOrder}
                    onChange={(event) =>
                      setFeaturedOrder(Number(event.target.value))
                    }
                  />
                </label>
                <button
                  className="button button--secondary"
                  disabled={pending}
                  onClick={() => void feature(!submission.isFeatured)}
                >
                  <Sparkles size={16} />{" "}
                  {submission.isFeatured
                    ? "Usuń z polecanych"
                    : "Dodaj do polecanych"}
                </button>
              </section>
            )}
            <label className="field">
              <span>
                Wyjaśnienie moderacji <small>opcjonalne</small>
              </span>
              <textarea
                value={feedback}
                onChange={(event) => setFeedback(event.target.value)}
                maxLength={2000}
                rows={3}
                placeholder="Widoczne dla autora po odrzuceniu lub wycofaniu"
              />
            </label>
          </div>
          <footer className="dialog-footer moderation-actions">
            {submission.status === "pending_review" && (
              <>
                <button
                  className="button button--quiet"
                  disabled={pending}
                  onClick={() => void moderate("reject")}
                >
                  <XCircle size={17} /> Odrzuć
                </button>
                <button
                  className="button button--primary"
                  disabled={pending}
                  onClick={() => void moderate("approve")}
                >
                  {pending ? (
                    <LoaderCircle className="spin" size={17} />
                  ) : (
                    <Check size={17} />
                  )}{" "}
                  Zatwierdź
                </button>
              </>
            )}
            {submission.status === "approved" && (
              <button
                className="button button--secondary"
                disabled={pending}
                onClick={() => void moderate("withdraw")}
              >
                <XCircle size={17} /> Wycofaj publikację
              </button>
            )}
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ReportModerationDialog({
  report,
  onClose,
  onChanged,
}: {
  report: CommunityTemplateReport | null;
  onClose: () => void;
  onChanged: (message: string) => Promise<void>;
}) {
  const { showError } = useAppUi();
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  if (!report) return null;
  async function resolve(action: "dismiss" | "withdraw") {
    if (!reason.trim()) return;
    setPending(true);
    try {
      await api(`/api/admin/community-template-reports/${report!.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });
      await onChanged(
        action === "dismiss"
          ? "Zgłoszenie zostało oddalone."
          : "Publikacja została wycofana.",
      );
    } catch (error) {
      showError(error);
    } finally {
      setPending(false);
    }
  }
  return (
    <Dialog.Root open onOpenChange={(open) => !open && !pending && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-content shared-template-preview moderation-dialog">
          <header className="dialog-header">
            <div>
              <span className="community-status community-status--open">
                <Flag size={12} /> {reportReasonLabel(report.reason)}
              </span>
              <Dialog.Title>{report.publicationTitle}</Dialog.Title>
              <Dialog.Description>
                Autor: {report.authorName}
              </Dialog.Description>
            </div>
            <Dialog.Close
              className="icon-button"
              aria-label="Zamknij"
              disabled={pending}
            >
              <X size={19} />
            </Dialog.Close>
          </header>
          <div className="shared-template-preview__scroll">
            <section className="moderation-report-reason">
              <strong>Treść zgłoszenia</strong>
              <p>{report.explanation || "Reporter nie dodał wyjaśnienia."}</p>
            </section>
            <dl className="shared-template-facts">
              <div>
                <dt>Przedmiot</dt>
                <dd>{report.subject}</dd>
              </div>
              <div>
                <dt>Poziom</dt>
                <dd>{report.level}</dd>
              </div>
              <div>
                <dt>Czas</dt>
                <dd>{report.estimatedDurationMinutes} min</dd>
              </div>
              <div>
                <dt>Sekcje</dt>
                <dd>{report.sections.length}</dd>
              </div>
            </dl>
            <section className="shared-template-objective">
              <span>
                <ShieldCheck size={18} /> Cel lekcji
              </span>
              <p>{report.objective}</p>
            </section>
            <p>{report.description}</p>
            <ol className="shared-template-section-list">
              {report.sections.map((section) => (
                <li key={section.id}>
                  <span>{section.position + 1}</span>
                  <div>
                    <strong>{section.title}</strong>
                    <p>{section.content}</p>
                  </div>
                  {section.estimatedMinutes && (
                    <small>{section.estimatedMinutes} min</small>
                  )}
                </li>
              ))}
            </ol>
            {report.status === "open" && (
              <label className="field">
                <span>Wewnętrzny powód decyzji</span>
                <textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  maxLength={1000}
                  rows={3}
                  placeholder="Krótka notatka moderacyjna (wymagana)"
                />
              </label>
            )}
          </div>
          {report.status === "open" && (
            <footer className="dialog-footer moderation-actions">
              <button
                className="button button--quiet"
                disabled={pending || !reason.trim()}
                onClick={() => void resolve("dismiss")}
              >
                Oddal zgłoszenie
              </button>
              <button
                className="button button--secondary"
                disabled={pending || !reason.trim()}
                onClick={() => void resolve("withdraw")}
              >
                <XCircle size={17} /> Wycofaj publikację
              </button>
            </footer>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const body = (await response.json()) as T | { code: string; message: string };
  if (!response.ok) throw new ClientApiError(response.status, body as never);
  return body as T;
}
