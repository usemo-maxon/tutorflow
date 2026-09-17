"use client";

import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  MessageCircle,
  Settings2,
} from "lucide-react";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useAppData } from "@/hooks/use-app-data";
import { useSessionTeacher } from "../app-shell";
import { PageLoading } from "../ui/loading";

export function IntegrationsSettings() {
  const [syncing, setSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);
  const session = useSessionTeacher();
  const { data, isPending, refetch } = useAppData(session.id);
  if (isPending || !data) return <PageLoading />;
  const failedLesson = data.lessons.find(
    (lesson) =>
      lesson.syncStatus === "failed" ||
      lesson.syncStatus === "deleted_in_google",
  );
  return (
    <section className="settings-panel settings-panel--stack">
      <div className="settings-copy">
        <p className="eyebrow">Połączenia</p>
        <h2>Integracje</h2>
        <p>
          Lekcja zawsze zapisuje się najpierw w easy4tutor. Problemy z dostawcą
          nie blokują kalendarza.
        </p>
      </div>
      <div className="integration-list">
        <IntegrationCard
          icon={<CalendarDays />}
          name="Google Calendar"
          state={data.integrations.google.status}
          label={data.integrations.google.label}
          description="Dwukierunkowa synchronizacja lekcji i podgląd zajętości z wybranego kalendarza."
          error={data.integrations.google.lastError}
        >
          {data.integrations.google.status === "connected" && (
            <button
              type="button"
              className="button button--secondary"
              disabled={syncing}
              aria-describedby={
                syncFeedback ? "google-sync-feedback" : undefined
              }
              onClick={async () => {
                setSyncFeedback(null);
                setSyncing(true);
                try {
                  const response = await fetch(
                    "/api/integrations/google/sync",
                    {
                      method: "POST",
                    },
                  );
                  const payload = (await response.json().catch(() => null)) as {
                    message?: string;
                  } | null;
                  if (!response.ok) {
                    throw new Error(
                      payload?.message ??
                        "Nie udało się rozpocząć synchronizacji.",
                    );
                  }
                  setSyncFeedback({
                    kind: "success",
                    message:
                      "Synchronizacja została uruchomiona. Dane odświeżą się automatycznie.",
                  });
                  void refetch();
                } catch (error) {
                  setSyncFeedback({
                    kind: "error",
                    message:
                      error instanceof Error
                        ? error.message
                        : "Nie udało się rozpocząć synchronizacji.",
                  });
                } finally {
                  setSyncing(false);
                }
              }}
            >
              {syncing ? "Synchronizuję…" : "Synchronizuj teraz"}
            </button>
          )}
          {data.integrations.google.status !== "connected" &&
            data.integrations.google.status !== "not_configured" && (
              <a
                className="button button--secondary"
                href="/api/integrations/google/connect"
              >
                {data.integrations.google.status === "reconnect_required"
                  ? "Połącz ponownie"
                  : "Połącz Google Calendar"}
              </a>
            )}
          {failedLesson && (
            <Link
              className="button button--secondary"
              href={`/app/lekcje/${failedLesson.id}`}
            >
              Otwórz lekcję z problemem
            </Link>
          )}
          {syncFeedback && (
            <div
              className={`integration-feedback integration-feedback--${syncFeedback.kind}`}
              id="google-sync-feedback"
              role={syncFeedback.kind === "error" ? "alert" : "status"}
            >
              {syncFeedback.kind === "error" ? (
                <AlertTriangle size={16} aria-hidden="true" />
              ) : (
                <CheckCircle2 size={16} aria-hidden="true" />
              )}
              <span>{syncFeedback.message}</span>
            </div>
          )}
        </IntegrationCard>
        <IntegrationCard
          icon={<MessageCircle />}
          name="Telegram"
          state={data.integrations.telegram.status}
          description="Przypomnienia dla nauczyciela 24 godziny i 1 godzinę przed lekcją."
        >
          {data.integrations.telegram.status !== "connected" &&
            data.integrations.telegram.status !== "not_configured" && (
              <a
                className="button button--secondary"
                href="/api/integrations/telegram/connect"
              >
                Połącz Telegram
              </a>
            )}
        </IntegrationCard>
        <IntegrationCard
          icon={<Settings2 />}
          name="PayU"
          state={data.integrations.payu.status}
          description="Płatność za subskrypcję easy4tutor. Nie służy do pobierania opłat od uczniów."
        />
      </div>
    </section>
  );
}
function IntegrationCard({
  icon,
  name,
  state,
  label,
  description,
  error,
  children,
}: {
  icon: ReactNode;
  name: string;
  state:
    | "connected"
    | "not_connected"
    | "not_configured"
    | "error"
    | "reconnect_required";
  label?: string;
  description: string;
  error?: string;
  children?: ReactNode;
}) {
  const status =
    state === "connected"
      ? "Połączono"
      : state === "error" || state === "reconnect_required"
        ? "Wymaga uwagi"
        : state === "not_configured"
          ? "Jeszcze niedostępne"
          : "Nie połączono";
  return (
    <article className="integration-card">
      <span className="integration-icon" aria-hidden="true">
        {icon}
      </span>
      <div>
        <div className="integration-title">
          <h3>{name}</h3>
          <span className={`status-badge status-badge--integration-${state}`}>
            {state === "connected" ? (
              <CheckCircle2 size={14} aria-hidden="true" />
            ) : state === "error" || state === "reconnect_required" ? (
              <AlertTriangle size={14} aria-hidden="true" />
            ) : null}
            {status}
          </span>
        </div>
        <p>{description}</p>
        {label && <small>Połączenie: {label}</small>}
        {error && <div className="integration-error">{error}</div>}
        {state === "not_configured" && (
          <div className="integration-note">
            Połączenie nie jest jeszcze dostępne. Możesz nadal planować lekcje i
            zapisywać wyniki w easy4tutor.
          </div>
        )}
        {children && <div className="integration-actions">{children}</div>}
      </div>
    </article>
  );
}
