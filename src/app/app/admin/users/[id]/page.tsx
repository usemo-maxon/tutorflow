import { AdminPageHeader, DataTable, EmptyRows, formatDate, formatMoney, Panel, StatusPill } from "@/components/admin/admin-ui";
import styles from "@/components/admin/admin.module.css";
import { getAdminUser } from "@/server/platform-admin";

export default async function AdminUserDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getAdminUser(id);
  const canManage = data.admin.can("users.manage");
  const canSubscriptions = data.admin.can("subscriptions.manage");
  return <>
    <AdminPageHeader eyebrow="Konto użytkownika" title={data.user.email ?? "Konto bez adresu e-mail"} description={`UUID: ${data.user.id}`} />
    <Panel title="Informacje o koncie"><dl className={styles.definitionGrid}>
      <div><dt>Imię i nazwisko</dt><dd>{data.profile?.full_name || "—"}</dd></div><div><dt>Rejestracja</dt><dd>{formatDate(data.user.created_at)}</dd></div><div><dt>Weryfikacja e-mail</dt><dd>{data.user.email_confirmed_at ? "Potwierdzony" : "Niepotwierdzony"}</dd></div><div><dt>Ostatnie logowanie</dt><dd>{formatDate(data.user.last_sign_in_at)}</dd></div><div><dt>Aktywni uczniowie</dt><dd>{data.usage.activeStudents}</dd></div><div><dt>Lekcje łącznie</dt><dd>{data.usage.lessons}</dd></div>
    </dl></Panel>
    <Panel title="Subskrypcja"><dl className={styles.definitionGrid}><div><dt>Plan</dt><dd>{data.grants.some((grant) => grant.grant_type === "owner_lifetime" && !grant.revoked_at) ? "Platform Owner — Lifetime Access" : (data.subscription?.tier ?? "—")}</dd></div><div><dt>Status</dt><dd>{data.subscription?.status ?? "—"}</dd></div><div><dt>Odnowienie</dt><dd>{formatDate(data.subscription?.renews_at)}</dd></div><div><dt>Override</dt><dd>{data.override ? `${data.override.tier} do ${formatDate(data.override.expires_at)}` : "Brak"}</dd></div></dl>
      {canSubscriptions && <div className={styles.actions}><form action={`/api/admin/users/${id}/subscription-override`} method="post"><select name="tier" aria-label="Plan"><option value="pro">Pro</option><option value="founder">Founder</option></select><select name="kind" aria-label="Typ"><option value="promotional">Promocyjny</option><option value="support">Wsparcie</option><option value="billing_correction">Korekta</option></select><input name="expiresAt" type="datetime-local" aria-label="Data wygaśnięcia"/><input name="reason" minLength={3} maxLength={500} required placeholder="Powód (wymagany)"/><button className={styles.actionButton} type="submit">Nadaj override</button></form></div>}
    </Panel>
    {canManage && <Panel title="Bezpieczeństwo konta" description="Zawieszenie nie usuwa danych klienta."><div className={styles.actions}><form action={`/api/admin/users/${id}/suspension`} method="post"><input type="hidden" name="action" value={data.suspension ? "restore" : "suspend"}/><input name="reason" minLength={3} maxLength={500} required placeholder="Powód (wymagany)"/><button className={data.suspension ? styles.actionButton : styles.dangerButton} type="submit">{data.suspension ? "Przywróć konto" : "Zawieś konto"}</button></form></div></Panel>}
    <Panel title="Historia płatności"><DataTable label="Historia płatności"><thead><tr><th>Transakcja</th><th>Plan</th><th>Kwota</th><th>Status</th><th>Data</th></tr></thead>{data.orders.length ? <tbody>{data.orders.map((order) => <tr key={order.id}><td><code>{order.ext_order_id}</code></td><td>{order.plan}</td><td>{formatMoney(order.amount_grosz)}</td><td><StatusPill tone={order.status === "completed" ? "good" : "warning"}>{order.status}</StatusPill></td><td>{formatDate(order.created_at)}</td></tr>)}</tbody> : <EmptyRows colSpan={5}>Brak płatności.</EmptyRows>}</DataTable></Panel>
    <Panel title="Historia działań administracyjnych"><DataTable label="Historia działań"><thead><tr><th>Akcja</th><th>Powód</th><th>Wynik</th><th>Czas</th></tr></thead>{data.audits.length ? <tbody>{data.audits.map((audit) => <tr key={audit.id}><td>{audit.action}</td><td>{audit.reason}</td><td><StatusPill tone={audit.succeeded ? "good" : "danger"}>{audit.succeeded ? "Sukces" : "Błąd"}</StatusPill></td><td>{formatDate(audit.occurred_at)}</td></tr>)}</tbody> : <EmptyRows colSpan={4}>Brak działań dotyczących konta.</EmptyRows>}</DataTable></Panel>
  </>;
}

