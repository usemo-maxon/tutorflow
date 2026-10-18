import Link from "next/link";
import { AdminPageHeader, DataTable, EmptyRows, formatDate, Pagination, StatusPill } from "@/components/admin/admin-ui";
import { getAdminCollection } from "@/server/platform-admin";

type TicketRow = { id: string; user_id: string; subject: string; category: string; priority: string; status: string; assigned_to: string | null; created_at: string; updated_at: string };

export default async function AdminSupportPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const params = await searchParams; const page = Number(params.page ?? 1);
  const data = await getAdminCollection<TicketRow>("support.read", "support_tickets", "id,user_id,subject,category,priority,status,assigned_to,created_at,updated_at", { page, order: "updated_at" });
  return <><AdminPageHeader eyebrow="support@easy4tutor.pl" title="Centrum wsparcia" description="Wewnętrzna kolejka zgłoszeń. Wysyłka e-mail pozostaje wyłączona, dopóki nie zostanie skonfigurowany zweryfikowany dostawca poczty." />
    <DataTable label="Zgłoszenia wsparcia"><thead><tr><th>Temat</th><th>Użytkownik</th><th>Kategoria</th><th>Priorytet</th><th>Status</th><th>Aktualizacja</th></tr></thead>{data.rows.length ? <tbody>{data.rows.map((row) => <tr key={row.id}><td><Link href={`/app/admin/support/${row.id}`}>{row.subject}</Link></td><td><code>{row.user_id}</code></td><td>{row.category}</td><td><StatusPill tone={row.priority === "urgent" ? "danger" : row.priority === "high" ? "warning" : "neutral"}>{row.priority}</StatusPill></td><td>{row.status}</td><td>{formatDate(row.updated_at)}</td></tr>)}</tbody> : <EmptyRows colSpan={6}>Brak zgłoszeń.</EmptyRows>}</DataTable>
    <Pagination page={data.page} hasNext={data.page * 25 < data.count} path="/app/admin/support" /></>;
}

