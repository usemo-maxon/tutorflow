import Link from "next/link";
import { AdminFilters, AdminPageHeader, DataTable, EmptyRows, formatDate, Pagination, StatusPill } from "@/components/admin/admin-ui";
import { getAdminUsers } from "@/server/platform-admin";

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q : undefined;
  const plan = typeof params.plan === "string" ? params.plan : undefined;
  const status = typeof params.status === "string" ? params.status : undefined;
  const page = typeof params.page === "string" ? Number(params.page) : 1;
  const data = await getAdminUsers({ page, query, plan, status });
  return <>
    <AdminPageHeader eyebrow="Konta" title="Użytkownicy" description="Minimalny widok konta i zagregowanego użycia. Dane uczniów, notatki oraz materiały nie są tutaj udostępniane." />
    <AdminFilters query={query}>
      <select name="plan" defaultValue={plan ?? "all"} aria-label="Plan"><option value="all">Wszystkie plany</option><option value="free">Free</option><option value="pro">Pro</option><option value="founder">Founder</option><option value="lifetime">Lifetime</option></select>
      <select name="status" defaultValue={status ?? "all"} aria-label="Status konta"><option value="all">Każdy status</option><option value="active">Aktywne</option><option value="suspended">Zawieszone</option></select>
    </AdminFilters>
    <DataTable label="Użytkownicy"><thead><tr><th>Użytkownik</th><th>Rejestracja</th><th>Plan</th><th>Status</th><th>Użycie</th><th>Ostatnia aktywność</th></tr></thead>{data.users.length ? <tbody>{data.users.map((user) => <tr key={user.id}><td><Link href={`/app/admin/users/${user.id}`}>{user.email}</Link><br/><code>{user.id}</code></td><td>{formatDate(user.createdAt)}<br/><StatusPill tone={user.confirmedAt ? "good" : "warning"}>{user.confirmedAt ? "Zweryfikowany" : "Niezweryfikowany"}</StatusPill></td><td>{user.ownerLifetime ? <StatusPill tone="info">Lifetime</StatusPill> : (user.subscription?.tier ?? "—")}</td><td><StatusPill tone={user.suspended ? "danger" : "good"}>{user.suspended ? "Zawieszone" : "Aktywne"}</StatusPill></td><td>{user.activeStudents} uczniów<br/>{user.lessons} lekcji</td><td>{formatDate(user.lastActivityAt)}</td></tr>)}</tbody> : <EmptyRows colSpan={6}>Brak kont spełniających kryteria.</EmptyRows>}</DataTable>
    <Pagination page={data.page} hasNext={data.hasNextPage} path="/app/admin/users" query={{ q: query, plan, status }} />
  </>;
}

