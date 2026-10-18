import { AdminPageHeader, DataTable, EmptyRows, formatDate, Pagination, StatusPill } from "@/components/admin/admin-ui";
import { getAdminCollection } from "@/server/platform-admin";

type EventRow = { id: string; event_type: string; severity: string; service: string; status: string; summary: string; retry_count: number; occurred_at: string; resolved_at: string | null };

export default async function AdminSystemPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const params = await searchParams; const page = Number(params.page ?? 1);
  const data = await getAdminCollection<EventRow>("system.read", "platform_operational_events", "id,event_type,severity,service,status,summary,retry_count,occurred_at,resolved_at", { page, order: "occurred_at" });
  return <><AdminPageHeader eyebrow="Operacje" title="Stan systemu" description="Sanityzowane zdarzenia integracji, webhooków i zadań. Tokeny, klucze oraz pełne payloady nie są przechowywane w tym widoku." />
    <DataTable label="Zdarzenia systemowe"><thead><tr><th>Usługa</th><th>Typ</th><th>Opis</th><th>Waga</th><th>Status</th><th>Próby</th><th>Czas</th></tr></thead>{data.rows.length ? <tbody>{data.rows.map((row) => <tr key={row.id}><td>{row.service}</td><td><code>{row.event_type}</code></td><td>{row.summary}</td><td><StatusPill tone={row.severity === "critical" || row.severity === "error" ? "danger" : row.severity === "warning" ? "warning" : "info"}>{row.severity}</StatusPill></td><td>{row.status}</td><td>{row.retry_count}</td><td>{formatDate(row.occurred_at)}</td></tr>)}</tbody> : <EmptyRows colSpan={7}>Brak zdarzeń operacyjnych.</EmptyRows>}</DataTable>
    <Pagination page={data.page} hasNext={data.page * 25 < data.count} path="/app/admin/system" /></>;
}

