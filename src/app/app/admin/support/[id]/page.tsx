import { AdminPageHeader, formatDate, Panel, StatusPill } from "@/components/admin/admin-ui";
import styles from "@/components/admin/admin.module.css";
import { getAdminSupportTicket } from "@/server/platform-admin";

export default async function AdminSupportDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const data = await getAdminSupportTicket(id);
  return <><AdminPageHeader eyebrow={`Zgłoszenie ${data.ticket.id}`} title={data.ticket.subject} description={`${data.ticket.category} · utworzone ${formatDate(data.ticket.created_at)}`} />
    <Panel title="Stan sprawy"><dl className={styles.definitionGrid}><div><dt>Status</dt><dd><StatusPill tone="info">{data.ticket.status}</StatusPill></dd></div><div><dt>Priorytet</dt><dd>{data.ticket.priority}</dd></div><div><dt>Użytkownik</dt><dd><code>{data.ticket.user_id}</code></dd></div></dl></Panel>
    <Panel title="Rozmowa"><div className={styles.settingsList}>{data.messages.map((message) => <article className={styles.setting} key={message.id}><div><strong>{message.internal_note ? "Notatka wewnętrzna" : message.author_user_id === data.ticket.user_id ? "Użytkownik" : "Wsparcie"}</strong><p>{formatDate(message.created_at)}</p></div><p>{message.body}</p></article>)}</div></Panel>
    {data.admin.can("support.manage") && <Panel title="Działanie"><div className={styles.actions}><form action={`/api/admin/support/${id}`} method="post"><select name="action" aria-label="Działanie"><option value="message">Dodaj odpowiedź</option><option value="status">Zmień status</option><option value="assign">Przypisz do mnie</option></select><select name="value" aria-label="Nowy status"><option value="in_progress">W toku</option><option value="waiting_for_user">Oczekuje na użytkownika</option><option value="resolved">Rozwiązane</option><option value="closed">Zamknięte</option><option value="open">Otwarte</option></select><textarea name="body" maxLength={5000} placeholder="Odpowiedź lub notatka"/><label><input type="checkbox" name="internal"/> Notatka wewnętrzna</label><input name="reason" minLength={3} maxLength={500} required placeholder="Powód operacji"/><button className={styles.actionButton} type="submit">Zapisz działanie</button></form></div></Panel>}
  </>;
}

