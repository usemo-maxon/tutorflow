import Link from "next/link";
import { AdminPageHeader, DataTable, EmptyRows, formatDate, Pagination, StatusPill } from "@/components/admin/admin-ui";
import { getAdminCollection } from "@/server/platform-admin";

type SubscriptionRow = { teacher_id: string; status: string; tier: string; plan: string; billing_interval: string | null; trial_ends_at: string | null; renews_at: string | null; read_only: boolean; updated_at: string };

export default async function AdminSubscriptionsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const params = await searchParams; const page = Number(params.page ?? 1);
  const data = await getAdminCollection<SubscriptionRow>("subscriptions.read", "subscriptions", "teacher_id,status,tier,plan,billing_interval,trial_ends_at,renews_at,read_only,updated_at", { page, order: "updated_at" });
  return <><AdminPageHeader eyebrow="Rozliczenia" title="Subskrypcje" description="Bieżący stan domeny subskrypcyjnej. Ręczne nadania są przechowywane osobno i nie modyfikują rekordów PayU." />
    <DataTable label="Subskrypcje"><thead><tr><th>Użytkownik</th><th>Plan</th><th>Status</th><th>Okres</th><th>Odnowienie</th><th>Tryb</th></tr></thead>{data.rows.length ? <tbody>{data.rows.map((row) => <tr key={row.teacher_id}><td><Link href={`/app/admin/users/${row.teacher_id}`}><code>{row.teacher_id}</code></Link></td><td>{row.tier} · {row.plan}</td><td><StatusPill tone={row.status === "active" ? "good" : row.status === "past_due" ? "danger" : "warning"}>{row.status}</StatusPill></td><td>{row.billing_interval ?? "—"}</td><td>{formatDate(row.renews_at ?? row.trial_ends_at)}</td><td>{row.read_only ? "Tylko odczyt" : "Pełny dostęp"}</td></tr>)}</tbody> : <EmptyRows colSpan={6}>Brak subskrypcji.</EmptyRows>}</DataTable>
    <Pagination page={data.page} hasNext={data.page * 25 < data.count} path="/app/admin/subscriptions" /></>;
}

