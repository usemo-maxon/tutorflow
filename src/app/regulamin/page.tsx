import Link from "next/link";
export default function TermsPage() {
  return (
    <main className="legal-page">
      <Link className="brand brand--public" href="/">
        <span className="brand-mark" aria-hidden="true">
          <span />
        </span>
        TutorFlow
      </Link>
      <article>
        <p className="eyebrow">Dokument roboczy</p>
        <h1>Regulamin</h1>
        <p>
          Warunki świadczenia usługi, zasady okresu próbnego, płatności i
          rezygnacji zostaną opublikowane przed produkcyjnym uruchomieniem
          TutorFlow. Ten ekran nie stanowi jeszcze oferty handlowej.
        </p>
      </article>
    </main>
  );
}
