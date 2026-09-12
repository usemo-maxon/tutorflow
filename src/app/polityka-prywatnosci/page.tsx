import Link from "next/link";
export default function PrivacyPage() {
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
        <h1>Polityka prywatności</h1>
        <p>
          Ta instalacja jest środowiskiem rozwojowym TutorFlow. Przed
          uruchomieniem usługi publicznej dokument zostanie uzupełniony o
          administratora danych, podstawy przetwarzania, okresy retencji i prawa
          użytkownika.
        </p>
        <h2>Założenia produktu</h2>
        <p>
          Dane nauczycieli są izolowane. Administrator SaaS nie otrzymuje
          dostępu do treści lekcji, kontaktów uczniów ani materiałów. Eksport i
          usuwanie danych będą realizowane jako kontrolowane procesy.
        </p>
      </article>
    </main>
  );
}
