import { AdminPageHeader, DataTable, EmptyRows, formatDate, Pagination, StatusPill } from "@/components/admin/admin-ui";
import { getAdminCollection } from "@/server/platform-admin";

type AuditRow = { id: number; actor_user_id: string; action: string; target_type: string; target_id: string | null; reason: string; succeeded: boolean; occurred_at: string };

export default async function AdminAuditPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const params = await searchParams; const page = Number(params.page ?? 1);
  const data = await getAdminCollection<AuditRow>("audit.read", "platform_admin_audit_logs", "id,actor_user_id,action,target_type,target_id,reason,succeeded,occurred_at", { page, order: "occurred_at" });
  return <><AdminPageHeader eyebrow="Append-only" title="Dziennik audytu" description="Niezmienialny zapis wrażliwych operacji administracyjnych. Interfejs nie udostępnia edycji ani usuwania wpisów." />
    <DataTable label="Dziennik audytu"><thead><tr><th>Czas</th><th>Aktor</th><th>Akcja</th><th>Cel</th><th>Powód</th><th>Wynik</th></tr></thead>{data.rows.length ? <tbody>{data.rows.map((row) => <tr key={row.id}><td>{formatDate(row.occurred_at)}</td><td><code>{row.actor_user_id}</code></td><td>{row.action}</td><td>{row.target_type}<br/><code>{row.target_id ?? "—"}</code></td><td>{row.reason}</td><td><StatusPill tone={row.succeeded ? "good" : "danger"}>{row.succeeded ? "Sukces" : "Błąd"}</StatusPill></td></tr>)}</tbody> : <EmptyRows colSpan={6}>Brak wpisów audytowych.</EmptyRows>}</DataTable>
    <Pagination page={data.page} hasNext={data.page * 25 < data.count} path="/app/admin/audit" /></>;
}

