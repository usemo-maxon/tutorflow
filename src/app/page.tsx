import { BrandLogo } from "@/components/brand-logo";
import Link from "next/link";
import {
  ArrowRight,
  CalendarDays,
  Check,
  Circle,
  Diamond,
  ShieldCheck,
} from "lucide-react";
import { currentTeacher } from "@/server/auth";

export default async function LandingPage() {
  const teacher = await currentTeacher();
  return (
    <main className="landing">
      <header className="landing-nav">
        <Link
          className="brand brand--public"
          href="/"
          aria-label="easy4tutor — strona główna"
        >
          <BrandLogo />
        </Link>
        <nav aria-label="Nawigacja publiczna">
          <a href="#jak-dziala">Jak działa</a>
          <a href="#cena">Cena</a>
          <Link className="button button--quiet" href="/logowanie">
            Zaloguj się
          </Link>
          <Link
            className="button button--primary"
            href={teacher ? "/app/dzisiaj" : "/rejestracja"}
          >
            {teacher ? "Przejdź do aplikacji" : "Wypróbuj przez 14 dni"}
          </Link>
        </nav>
      </header>

      <section className="landing-hero">
        <div className="hero-copy">
          <p className="eyebrow">Planer pracy prywatnego nauczyciela</p>
          <h1>
            Mniej organizacji.
            <br />
            <em>Więcej uczenia.</em>
          </h1>
          <p className="hero-lead">
            Twój kalendarz, postępy uczniów i rozliczenia w jednym miejscu.
            Przygotuj kolejną lekcję, pamiętając o poprzedniej.
          </p>
          <div className="hero-actions">
            <Link
              className="button button--primary button--large"
              href="/rejestracja"
            >
              Wypróbuj przez 14 dni <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <Link
              className="button button--quiet button--large"
              href="/logowanie"
            >
              Poznaj swój obszar pracy
            </Link>
          </div>
          <p className="hero-note">
            <ShieldCheck size={16} aria-hidden="true" /> Bez karty płatniczej ·
            dane uczniów pozostają prywatne
          </p>
        </div>

        <div className="hero-product-preview">
          <div className="preview-caption">
            <span>Twój obszar pracy</span>
            <span>Przykładowa lekcja</span>
          </div>
          <div className="hero-workspace" aria-label="Podgląd następnej lekcji">
            <div className="hero-workspace-top">
              <div>
                <span className="eyebrow">Następna lekcja</span>
                <h2>Marta Kowalska</h2>
              </div>
              <time>14:30</time>
            </div>
            <div className="hero-lesson-meta">
              <span>
                <CalendarDays size={16} aria-hidden="true" /> Dzisiaj · 60 min
              </span>
              <span className="status-badge status-badge--warning">
                Nieopłacona
              </span>
            </div>
            <div className="progress-thread progress-thread--hero">
              <div className="thread-node thread-node--done">
                <span className="thread-symbol">
                  <Check size={12} aria-hidden="true" />
                </span>
                <div>
                  <small>Ostatnio</small>
                  <strong>Past Simple</strong>
                  <p>Końcówki -ed wymagają powtórki</p>
                </div>
              </div>
              <div className="thread-node thread-node--now">
                <span className="thread-symbol">
                  <Diamond size={12} aria-hidden="true" />
                </span>
                <div>
                  <small>Teraz</small>
                  <strong>Present Perfect</strong>
                  <p>3 punkty planu</p>
                </div>
              </div>
              <div className="thread-node thread-node--next">
                <span className="thread-symbol">
                  <Circle size={12} aria-hidden="true" />
                </span>
                <div>
                  <small>Następnie</small>
                  <strong>Present Perfect vs Past Simple</strong>
                </div>
              </div>
            </div>
            <Link
              href="/logowanie"
              className="button button--primary hero-open"
            >
              Otwórz lekcję
            </Link>
          </div>
        </div>
      </section>

      <section
        className="feature-ribbon"
        id="jak-dziala"
        aria-label="Najważniejsze możliwości"
      >
        <article>
          <span>01</span>
          <h2>Plan bez przepisywania</h2>
          <p>
            Domyślny czas, format i cena przechodzą z karty ucznia do
            kalendarza.
          </p>
        </article>
        <article>
          <span>02</span>
          <h2>Wątek, nie archiwum</h2>
          <p>
            Nitka postępu łączy ostatnią lekcję, bieżący plan i kolejny temat.
          </p>
        </article>
        <article>
          <span>03</span>
          <h2>Jasne rozliczenia</h2>
          <p>Status płatności należy do konkretnego ucznia, także w grupie.</p>
        </article>
      </section>

      <section className="pricing-section" id="cena">
        <div>
          <p className="eyebrow">Jedna pełna wersja</p>
          <h2>Prosto od pierwszej lekcji.</h2>
          <p>
            14 dni bezpłatnie. Potem wybierasz miesięczne lub roczne
            rozliczenie.
          </p>
        </div>
        <div className="pricing-card">
          <span className="pricing-amount">39 zł</span>
          <span>/ miesiąc</span>
          <p>albo 390 zł za rok</p>
          <Link href="/rejestracja" className="button button--primary">
            Rozpocznij okres próbny
          </Link>
        </div>
      </section>
      <footer className="landing-footer">
        <span>© 2026 easy4tutor</span>
        <Link href="/polityka-prywatnosci">Polityka prywatności</Link>
        <Link href="/regulamin">Regulamin</Link>
      </footer>
    </main>
  );
}
