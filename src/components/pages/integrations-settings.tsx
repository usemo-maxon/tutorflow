"use client";

import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  MessageCircle,
  Settings2,
} from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useAppData } from "@/hooks/use-app-data";
import { useSessionTeacher } from "../app-shell";
import { PageLoading } from "../ui/loading";

export function IntegrationsSettings() {
  const session = useSessionTeacher();
  const { data, isPending } = useAppData(session.id);
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
          Lekcja zawsze zapisuje się najpierw w TutorFlow. Problemy z dostawcą
          nie blokują kalendarza.
        </p>
      </div>
      <div className="integration-list">
        <IntegrationCard
          icon={<CalendarDays />}
          name="Google Calendar"
          state={data.integrations.google.status}
          label={data.integrations.google.label}
          description="Jednokierunkowa synchronizacja lekcji z wybranym kalendarzem."
          error={data.integrations.google.lastError}
        >
          {data.integrations.google.status !== "connected" &&
            data.integrations.google.status !== "not_configured" && (
              <a
                className="button button--secondary"
                href="/api/integrations/google/connect"
              >
                Połącz Google Calendar
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
          description="Płatność za subskrypcję TutorFlow. Nie służy do pobierania opłat od uczniów."
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
  state: "connected" | "not_connected" | "not_configured" | "error";
  label?: string;
  description: string;
  error?: string;
  children?: ReactNode;
}) {
  const status =
    state === "connected"
      ? "Połączono"
      : state === "error"
        ? "Wymaga uwagi"
        : state === "not_configured"
          ? "Jeszcze niedostępne"
          : "Nie połączono";
  return (
    <article className="integration-card">
      <span className="integration-icon">{icon}</span>
      <div>
        <div className="integration-title">
          <h3>{name}</h3>
          <span className={`status-badge status-badge--integration-${state}`}>
            {state === "connected" ? (
              <CheckCircle2 size={14} />
            ) : state === "error" ? (
              <AlertTriangle size={14} />
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
            zapisywać wyniki w TutorFlow.
          </div>
        )}
        {children}
      </div>
    </article>
  );
}
