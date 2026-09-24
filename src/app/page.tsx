import { BrandLogo } from "@/components/brand-logo";
import Link from "next/link";
import {
  ArrowRight,
  BookOpenText,
  CalendarDays,
  Check,
  Circle,
  Diamond,
  ShieldCheck,
  UsersRound,
  WalletCards,
} from "lucide-react";
import {
  ANNUAL_SAVING_GROSZ,
  formatPrice,
  FREE_FEATURES,
  monthlyAnnualEquivalentGrosz,
  PRO_ANNUAL_PRICE_GROSZ,
  PRO_FEATURES,
  PRO_MONTHLY_PRICE_GROSZ,
  TRIAL_DAYS,
} from "@/lib/pricing";
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
          <a href="#cena">Cennik</a>
          <Link className="button button--quiet" href="/logowanie">
            Zaloguj się
          </Link>
          <Link
            className="button button--primary"
            href={teacher ? "/app/dzisiaj" : "/rejestracja"}
          >
            {teacher
              ? "Przejdź do aplikacji"
              : `Wypróbuj Pro przez ${TRIAL_DAYS} dni`}
          </Link>
        </nav>
      </header>

      <section className="landing-hero">
        <div className="hero-copy">
          <p className="eyebrow">easy4tutor pamięta każdego ucznia za Ciebie</p>
          <h1>
            Pamiętaj każdego ucznia.
            <br />
            <em>Skup się na nauczaniu.</em>
          </h1>
          <p className="hero-lead">
            Kalendarz, historia lekcji, notatki, zadania i płatności w jednym
            miejscu dla korepetytora.
          </p>
          <div className="hero-actions">
            <Link
              className="button button--primary button--large"
              href="/rejestracja"
            >
              Wypróbuj Pro przez {TRIAL_DAYS} dni{" "}
              <ArrowRight size={18} aria-hidden="true" />
            </Link>
            <Link
              className="button button--quiet button--large"
              href="/logowanie"
            >
              Zaloguj się
            </Link>
          </div>
          <p className="hero-note">
            <ShieldCheck size={16} aria-hidden="true" /> Bez karty płatniczej ·
            potem możesz zostać na Free
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
              href="/rejestracja"
              className="button button--primary hero-open"
            >
              Zacznij bezpłatnie
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
          <BookOpenText size={22} aria-hidden="true" />
          <h2>Wszystko przed lekcją</h2>
          <p>Od razu widzisz, gdzie skończyliście i co jest następne.</p>
        </article>
        <article>
          <CalendarDays size={22} aria-hidden="true" />
          <h2>Kalendarz bez chaosu</h2>
          <p>Lekcje, dostępność i Google Calendar w jednym widoku.</p>
        </article>
        <article>
          <WalletCards size={22} aria-hidden="true" />
          <h2>Rozliczenia pod kontrolą</h2>
          <p>Wiesz, kto zapłacił, kto zalega i ile zajęć zostało w pakiecie.</p>
        </article>
        <article>
          <UsersRound size={22} aria-hidden="true" />
          <h2>Uczniowie w jednym miejscu</h2>
          <p>
            Historia, notatki, cele i zadania bez szukania w kilku aplikacjach.
          </p>
        </article>
      </section>

      <section className="pricing-section" id="cena">
        <div className="pricing-intro">
          <p className="eyebrow">Prosty cennik</p>
          <h2>Zacznij od Free. Pro włącz wtedy, gdy go potrzebujesz.</h2>
          <p>
            Na początek otrzymujesz {TRIAL_DAYS} dni Pro za darmo, bez karty
            płatniczej. Potem możesz zostać na Free.
          </p>
        </div>
        <div className="landing-pricing-grid">
          <article className="pricing-card">
            <span className="plan-card-label">Free</span>
            <strong className="pricing-amount">0 zł</strong>
            <p>Dla korepetytorów, którzy chcą uporządkować codzienną pracę.</p>
            <ul>
              {FREE_FEATURES.slice(0, 4).map((feature) => (
                <li key={feature}>
                  <Check size={15} aria-hidden="true" /> {feature}
                </li>
              ))}
            </ul>
          </article>
          <article className="pricing-card pricing-card--pro">
            <span className="plan-card-label">Pro</span>
            <strong className="pricing-amount">
              {formatPrice(PRO_MONTHLY_PRICE_GROSZ)}
            </strong>
            <span>/ miesiąc</span>
            <p>
              {formatPrice(PRO_ANNUAL_PRICE_GROSZ)} / rok · od{" "}
              {formatPrice(monthlyAnnualEquivalentGrosz())} / mies.
            </p>
            <p className="pricing-saving">
              Rocznie oszczędzasz {formatPrice(ANNUAL_SAVING_GROSZ)}.
            </p>
            <ul>
              {PRO_FEATURES.slice(0, 4).map((feature) => (
                <li key={feature}>
                  <Check size={15} aria-hidden="true" /> {feature}
                </li>
              ))}
            </ul>
            <Link href="/rejestracja" className="button button--primary">
              Wypróbuj Pro przez {TRIAL_DAYS} dni
            </Link>
          </article>
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
