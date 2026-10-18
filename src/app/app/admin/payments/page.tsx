import Link from "next/link";
import { AdminPageHeader, DataTable, EmptyRows, formatDate, formatMoney, Pagination, StatusPill } from "@/components/admin/admin-ui";
import { getAdminCollection } from "@/server/platform-admin";

type PaymentRow = { id: string; teacher_id: string; ext_order_id: string; payu_order_id: string | null; amount_grosz: number; status: string; plan: string; created_at: string; updated_at: string };

export default async function AdminPaymentsPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const params = await searchParams; const page = Number(params.page ?? 1);
  const data = await getAdminCollection<PaymentRow>("payments.read", "payu_orders", "id,teacher_id,ext_order_id,payu_order_id,amount_grosz,status,plan,created_at,updated_at", { page, order: "created_at" });
  return <><AdminPageHeader eyebrow="PayU · tylko odczyt" title="Płatności i przychód" description="Historia autorytatywnych transakcji PayU. Panel nie umożliwia modyfikacji płatności ani wykonywania zwrotów." />
    <DataTable label="Płatności"><thead><tr><th>Transakcja</th><th>Użytkownik</th><th>Kwota</th><th>Plan</th><th>Status</th><th>Referencja dostawcy</th><th>Data</th></tr></thead>{data.rows.length ? <tbody>{data.rows.map((row) => <tr key={row.id}><td><code>{row.ext_order_id}</code></td><td><Link href={`/app/admin/users/${row.teacher_id}`}><code>{row.teacher_id}</code></Link></td><td>{formatMoney(row.amount_grosz)}</td><td>{row.plan}</td><td><StatusPill tone={row.status === "completed" ? "good" : row.status === "failed" ? "danger" : "warning"}>{row.status}</StatusPill></td><td><code>{row.payu_order_id ?? "—"}</code></td><td>{formatDate(row.created_at)}</td></tr>)}</tbody> : <EmptyRows colSpan={7}>Brak transakcji.</EmptyRows>}</DataTable>
    <Pagination page={data.page} hasNext={data.page * 25 < data.count} path="/app/admin/payments" /></>;
}

