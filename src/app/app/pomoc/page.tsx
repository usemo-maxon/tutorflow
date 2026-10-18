import { redirect } from "next/navigation";
import { currentTeacher } from "@/server/auth";
import { createSupabaseServerClient } from "@/server/supabase";

export default async function SupportPage({ searchParams }: { searchParams: Promise<{ sent?: string }> }) {
  const teacher = await currentTeacher(); if (!teacher) redirect("/logowanie");
  const params = await searchParams;
  const supabase = await createSupabaseServerClient();
  const { data: tickets } = await supabase.from("support_tickets").select("id,subject,category,priority,status,created_at,updated_at").order("updated_at", { ascending: false }).limit(30);
  return <div className="page-enter"><header className="page-header"><div><p className="eyebrow">Wsparcie Easy4Tutor</p><h1>Jak możemy pomóc?</h1><p className="page-intro">Opisz sprawę bez danych uczniów, notatek z lekcji ani innych informacji, których nie potrzebujemy do rozwiązania problemu.</p></div></header>
    {params.sent === "1" && <div className="form-alert form-alert--success" role="status">Zgłoszenie zostało zapisane. Odpowiedź pojawi się w historii sprawy.</div>}
    <section className="settings-panel"><div className="settings-copy"><p className="eyebrow">Nowe zgłoszenie</p><h2>Napisz do nas</h2><p>Kontakt: support@easy4tutor.pl. Formularz tworzy wewnętrzne zgłoszenie; nie potwierdzamy wysyłki e-mail.</p></div><form className="settings-content" action="/api/support/tickets" method="post"><label className="field"><span>Temat</span><input name="subject" required minLength={3} maxLength={160}/></label><label className="field"><span>Kategoria</span><select name="category" defaultValue="other"><option value="account">Konto</option><option value="billing">Rozliczenia</option><option value="calendar">Kalendarz</option><option value="lessons">Lekcje</option><option value="other">Inne</option></select></label><label className="field"><span>Priorytet</span><select name="priority" defaultValue="normal"><option value="low">Niski</option><option value="normal">Normalny</option><option value="high">Wysoki</option><option value="urgent">Pilny</option></select></label><label className="field"><span>Opis</span><textarea name="description" required minLength={10} maxLength={5000} rows={7}/></label><button className="button button--primary" type="submit">Utwórz zgłoszenie</button></form></section>
    <section className="settings-panel"><div className="settings-copy"><p className="eyebrow">Historia</p><h2>Twoje zgłoszenia</h2></div><div className="settings-content">{tickets?.length ? <div className="table-wrap"><table><thead><tr><th>Temat</th><th>Kategoria</th><th>Status</th><th>Aktualizacja</th></tr></thead><tbody>{tickets.map((ticket) => <tr key={ticket.id}><td>{ticket.subject}</td><td>{ticket.category}</td><td>{ticket.status}</td><td>{new Intl.DateTimeFormat("pl-PL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(ticket.updated_at))}</td></tr>)}</tbody></table></div> : <p>Nie masz jeszcze żadnych zgłoszeń.</p>}</div></section>
  </div>;
}

