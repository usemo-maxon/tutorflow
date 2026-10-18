import Link from "next/link";
import {
  AdminPageHeader,
  DataTable,
  EmptyRows,
  formatDate,
  formatMoney,
  MetricCard,
  Panel,
  StatusPill,
} from "@/components/admin/admin-ui";
import styles from "@/components/admin/admin.module.css";
import { getAdminOverview } from "@/server/platform-admin";

export default async function AdminOverviewPage() {
  const { metrics, recentAudits, recentEvents, recentTickets } = await getAdminOverview();
  const distribution = [
    ["Free", metrics.free], ["Pro", metrics.pro], ["Founder", metrics.founder], ["Lifetime", metrics.lifetime],
  ] as const;
  const max = Math.max(1, ...distribution.map(([, value]) => value));
  return <>
    <AdminPageHeader eyebrow="Stan platformy" title="Przegląd operacyjny" description="Aktualne dane kont, płatności i incydentów. Przychód cykliczny nie obejmuje dostępu właścicielskiego ani nieukończonych transakcji." />
    <div className={styles.metricGrid}>
      <MetricCard label="Użytkownicy" value={metrics.totalUsers} note={`+${metrics.todayUsers} dzisiaj · +${metrics.sevenDayUsers} / 7 dni`} />
      <MetricCard label="Aktywne płatne" value={metrics.activePaid} note="Status active, bez Lifetime" />
      <MetricCard label="MRR" value={formatMoney(metrics.mrrGrosz)} note="Roczne plany / 12" />
      <MetricCard label="ARR" value={formatMoney(metrics.arrGrosz)} note="MRR × 12" />
      <MetricCard label="Rejestracje / 30 dni" value={metrics.thirtyDayUsers} />
      <MetricCard label="Udane płatności" value={metrics.successfulPayments} />
      <MetricCard label="Nieudane / anulowane" value={metrics.failedPayments} />
      <MetricCard label="Aktywni użytkownicy" value="—" note="Brak wiarygodnej telemetrii aktywności" />
    </div>
    <p className={styles.notice}>Definicje: MRR to miesięczny ekwiwalent aktywnych subskrypcji Pro/Founder; ARR = MRR × 12. Lifetime nie generuje przychodu. Konwersja trial → paid pozostaje niewyliczana do czasu wdrożenia historii zdarzeń subskrypcyjnych.</p>
    <div className={styles.gridTwo}>
      <Panel title="Rozkład planów" description="Bieżące rekordy subskrypcji">
        <ul className={styles.barList}>{distribution.map(([label, value]) => <li key={label}><span>{label}</span><div className={styles.bar}><i style={{ width: `${(value / max) * 100}%` }} /></div><strong>{value}</strong></li>)}</ul>
      </Panel>
      <Panel title="Ostatnia aktywność administracyjna">
        <DataTable label="Ostatnia aktywność administracyjna"><thead><tr><th>Akcja</th><th>Cel</th><th>Czas</th></tr></thead>{recentAudits.length ? <tbody>{recentAudits.map((item) => <tr key={item.id}><td><StatusPill tone={item.succeeded ? "good" : "danger"}>{item.action}</StatusPill></td><td>{item.target_type}</td><td>{formatDate(item.occurred_at)}</td></tr>)}</tbody> : <EmptyRows colSpan={3}>Brak zarejestrowanych operacji.</EmptyRows>}</DataTable>
      </Panel>
      <Panel title="Otwarte zgłoszenia" description="Najświeższe sprawy wymagające uwagi">
        <DataTable label="Otwarte zgłoszenia"><thead><tr><th>Temat</th><th>Status</th><th>Aktualizacja</th></tr></thead>{recentTickets.length ? <tbody>{recentTickets.map((ticket) => <tr key={ticket.id}><td><Link href="/app/admin/support">{ticket.subject}</Link></td><td><StatusPill tone={ticket.priority === "urgent" ? "danger" : "info"}>{ticket.status}</StatusPill></td><td>{formatDate(ticket.updated_at)}</td></tr>)}</tbody> : <EmptyRows colSpan={3}>Brak zgłoszeń.</EmptyRows>}</DataTable>
      </Panel>
      <Panel title="Zdarzenia systemowe" description="Otwarte błędy i ostrzeżenia">
        <DataTable label="Zdarzenia systemowe"><thead><tr><th>Usługa</th><th>Zdarzenie</th><th>Czas</th></tr></thead>{recentEvents.length ? <tbody>{recentEvents.map((event) => <tr key={event.id}><td><StatusPill tone={event.severity === "critical" || event.severity === "error" ? "danger" : "warning"}>{event.service}</StatusPill></td><td>{event.summary}</td><td>{formatDate(event.occurred_at)}</td></tr>)}</tbody> : <EmptyRows colSpan={3}>Brak otwartych zdarzeń.</EmptyRows>}</DataTable>
      </Panel>
    </div>
  </>;
}

