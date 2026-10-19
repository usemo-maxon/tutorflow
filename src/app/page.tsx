import type { Metadata } from "next";
import { resolveEntitlements } from "@/lib/entitlements";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  CheckCircle2,
  CircleUserRound,
  Clock3,
  CreditCard,
  ExternalLink,
  FileText,
  Link2,
  Menu,
  NotebookPen,
  Sparkles,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { CookieSettingsButton } from "@/components/cookie-settings";
import { LandingReveal } from "@/components/landing-reveal";
import {
  FREE_PRICE_GROSZ,
  formatPrice,
  monthlyAnnualEquivalentGrosz,
  PRO_ANNUAL_PRICE_GROSZ,
  PRO_MONTHLY_PRICE_GROSZ,
  TRIAL_DAYS,
} from "@/lib/pricing";
import { currentTeacher } from "@/server/auth";
import styles from "./marketing.module.css";

export const metadata: Metadata = {
  title: { absolute: "Easy4Tutor — program dla korepetytorów i lektorów" },
  description:
    "Kalendarz korepetytora, rezerwacja korepetycji, materiały, zarządzanie uczniami i rozliczenia w jednym miejscu. Wypróbuj Easy4Tutor bezpłatnie.",
  alternates: { canonical: "https://easy4tutor.pl" },
  openGraph: {
    type: "website",
    locale: "pl_PL",
    url: "https://easy4tutor.pl",
    siteName: "Easy4Tutor",
    title: "Więcej czasu na nauczanie. Mniej na organizację.",
    description:
      "Od pierwszej rezerwacji po przygotowanie lekcji i rozliczenie. Poznaj Easy4Tutor — program dla korepetytorów.",
  },
};
const freePlan = resolveEntitlements({ status: "active", tier: "free" });
const days = ["Pon", "Wt", "Śr", "Czw", "Pt"];
function CalendarPreview({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`${styles.calendar} ${compact ? styles.calendarCompact : ""}`}
    >
      <div className={styles.windowBar}>
        <div>
          <span />
          <span />
          <span />
        </div>
        <strong>Twój tydzień · październik</strong>
        <span className={styles.todayPill}>Dzisiaj</span>
      </div>
      <div className={styles.calendarHead}>
        <span />
        {days.map((d, i) => (
          <span key={d} className={i === 2 ? styles.activeDay : ""}>
            {d}
            <b>{12 + i}</b>
          </span>
        ))}
      </div>
      <div className={styles.allDay}>
        <span>Cały dzień</span>
        <b>Google · Dzień nauczyciela</b>
      </div>
      <div className={styles.calendarGrid}>
        <div className={styles.hours}>
          <span>10:00</span>
          <span>12:00</span>
          <span>14:00</span>
          <span>16:00</span>
        </div>
        {days.map((d, i) => (
          <div className={styles.dayColumn} key={d}>
            {i === 0 && (
              <div
                className={`${styles.lesson} ${styles.lessonMint}`}
                style={{ top: "12%", height: "26%" }}
              >
                <b>Ola</b>
                <small>Matematyka</small>
              </div>
            )}
            {i === 1 && (
              <div
                className={`${styles.lesson} ${styles.lessonBlue}`}
                style={{ top: "48%", height: "28%" }}
              >
                <b>Grupa B1</b>
                <small>Angielski</small>
              </div>
            )}
            {i === 2 && (
              <div
                className={`${styles.lesson} ${styles.lessonCoral}`}
                style={{ top: "60%", height: "28%" }}
              >
                <b>Marta</b>
                <small>14:30 · 60 min</small>
              </div>
            )}
            {i === 3 && (
              <div
                className={`${styles.lesson} ${styles.lessonBlue}`}
                style={{ top: "8%", height: "24%" }}
              >
                <b>Adam</b>
                <small>Fizyka</small>
              </div>
            )}
            {i === 4 && (
              <div
                className={`${styles.lesson} ${styles.lessonMint}`}
                style={{ top: "58%", height: "27%" }}
              >
                <b>Zosia</b>
                <small>Egzamin 8-kl.</small>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
function HeroProduct() {
  return (
    <div
      className={styles.heroStage}
      aria-label="Podgląd kalendarza i organizacji pracy w Easy4Tutor"
    >
      <div className={styles.heroGlow} />
      <CalendarPreview />
      <div className={`${styles.floatCard} ${styles.studentFloat}`}>
        <span className={styles.avatar}>MK</span>
        <span>
          <small>UCZENNICA</small>
          <b>Marta Kowalska</b>
          <em>Angielski · B1</em>
        </span>
      </div>
      <div className={`${styles.floatCard} ${styles.paymentFloat}`}>
        <span className={styles.iconBox}>
          <WalletCards size={18} />
        </span>
        <span>
          <small>PAKIET LEKCJI</small>
          <b>6 z 8 wykorzystano</b>
          <i>
            <span />
          </i>
        </span>
      </div>
      <div className={`${styles.floatCard} ${styles.bookingFloat}`}>
        <CheckCircle2 size={20} />
        <span>
          <small>NOWA REZERWACJA</small>
          <b>Wtorek, 17:00</b>
          <em>Angielski · spotkanie online</em>
        </span>
      </div>
      <div className={`${styles.floatCard} ${styles.noteFloat}`}>
        <span className={styles.iconBox}>
          <NotebookPen size={18} />
        </span>
        <span>
          <small>GOTOWE NA LEKCJĘ</small>
          <b>Plan, materiały i zadanie</b>
          <em>Następny krok: rozmowa w podróży</em>
        </span>
      </div>
    </div>
  );
}
function StudentPreview() {
  return (
    <div className={styles.productPanel}>
      <div className={styles.panelTop}>
        <span className={styles.avatarLarge}>AK</span>
        <div>
          <small>UCZEŃ</small>
          <h3>Adam Kowalski</h3>
          <p>Matematyka · klasa 8</p>
        </div>
        <span className={styles.status}>Aktywny</span>
      </div>
      <div className={styles.statRow}>
        <div>
          <small>NAJBLIŻSZA LEKCJA</small>
          <b>Jutro, 16:00</b>
        </div>
        <div>
          <small>PAKIET</small>
          <b>4 lekcje</b>
        </div>
        <div>
          <small>SALDO</small>
          <b className={styles.green}>Opłacone</b>
        </div>
      </div>
      <div className={styles.memory}>
        <span>
          <Check size={15} />
        </span>
        <div>
          <small>OSTATNIO</small>
          <b>Równania z jedną niewiadomą</b>
          <p>
            Rozwiązuje równania samodzielnie. Następny krok: zadania tekstowe.
          </p>
        </div>
      </div>
      <div className={styles.miniPeople}>
        <div>
          <span>JM</span>
          <b>Grupa: egzamin 8-klasisty</b>
        </div>
        <div>
          <span>+3</span>
          <b>pozostałych uczniów</b>
        </div>
      </div>
    </div>
  );
}
function LessonPreview() {
  return (
    <div className={`${styles.productPanel} ${styles.lessonPanel}`}>
      <div className={styles.lessonNav}>
        <span>← Poprzednia lekcja</span>
        <b>Dzisiejsza lekcja</b>
        <span>Następna →</span>
      </div>
      <div className={styles.lessonTitle}>
        <div>
          <small>MATEMATYKA · ADAM</small>
          <h3>Równania z jedną niewiadomą</h3>
        </div>
        <span className={styles.status}>W toku</span>
      </div>
      <div className={styles.tabs}>
        <b>Plan lekcji</b>
        <span>Notatki</span>
        <span>Materiały</span>
      </div>
      <div className={styles.checkList}>
        <p>
          <CheckCircle2 size={17} /> Powtórka: działania na wyrażeniach
        </p>
        <p>
          <CheckCircle2 size={17} /> Równania krok po kroku
        </p>
        <p>
          <span className={styles.emptyCheck} /> Zadania tekstowe
        </p>
      </div>
      <div className={styles.homework}>
        <NotebookPen size={18} />
        <span>
          <small>PRACA DOMOWA</small>
          <b>Zadania 6–10 ze zbioru</b>
        </span>
        <span className={styles.saved}>Zapisano</span>
      </div>
    </div>
  );
}
function BookingPreview() {
  return (
    <div className={styles.bookingScene}>
      <div className={styles.phone}>
        <div className={styles.phoneTop}>
          <span className={styles.avatarLarge}>AN</span>
          <div>
            <b>Anna Nowak</b>
            <small>Angielski · online</small>
          </div>
        </div>
        <p className={styles.tutorIntro}>
          Pomagam swobodniej mówić po angielsku. Zajęcia dla dorosłych, poziomy
          A2–B2.
        </p>
        <h3>Porozmawiajmy po angielsku</h3>
        <p>Konwersacje · 60 min · 90 zł</p>
        <div className={styles.dateStrip}>
          <span>
            <small>PON</small>12
          </span>
          <span className={styles.selectedDate}>
            <small>WT</small>13
          </span>
          <span>
            <small>ŚR</small>14
          </span>
          <span>
            <small>CZW</small>15
          </span>
        </div>
        <div className={styles.timeSlots}>
          <span>15:00</span>
          <b>16:30</b>
          <span>18:00</span>
        </div>
        <details className={styles.demoBooking}>
          <summary>
            Zobacz potwierdzenie <ArrowRight size={14} />
          </summary>
          <p>
            <CheckCircle2 size={18} /> Termin wybrany: wtorek, 16:30.
            <br />
            To tylko demonstracja — nie tworzy rezerwacji.
          </p>
        </details>
      </div>
      <div className={styles.confirmCard}>
        <CheckCircle2 size={23} />
        <span>
          <small>GOTOWE</small>
          <b>Termin zarezerwowany</b>
          <em>13 października · 16:30</em>
        </span>
      </div>
      <div className={styles.shareCard}>
        <Link2 size={17} />
        <span>
          <small>PRZYKŁADOWY LINK</small>
          <b>easy4tutor.pl/anna</b>
        </span>
        <ExternalLink size={14} />
      </div>
    </div>
  );
}
const audience = [
  [
    CalendarDays,
    "Spokojniejszy tydzień",
    "Lekcje i dostępność w jednym kalendarzu.",
  ],
  [Link2, "Łatwiejsze zapisy", "Własny profil i link do rezerwacji."],
  [BookOpen, "Gotowość do lekcji", "Plan, materiały i poprzednie notatki."],
  [WalletCards, "Jasne rozliczenia", "Wpłaty, zaległości i pakiety uczniów."],
] as const;
const stories = [
  {
    icon: CalendarDays,
    kicker: "KALENDARZ I DOSTĘPNOŚĆ",
    title: "Plan, który nadąża za Twoim tygodniem.",
    text: "Zaplanuj lekcje indywidualne i grupowe, cykle spotkań oraz blokady czasu. Połącz Google Calendar, aby widzieć zewnętrzne wydarzenia i łatwiej unikać kolizji. Synchronizacja działa w tle.",
    points: [
      "Google Calendar w Pro · także kilka kalendarzy",
      "Powtarzalne lekcje i blokady czasu",
      "Wydarzenia całodniowe poza siatką godzin",
    ],
    tone: "blue",
    visual: (
      <>
        <CalendarPreview compact />
        <div className={styles.detailFloat}>
          <Clock3 size={18} />
          <span>
            <small>ŚRODA · 14:30</small>
            <b>Marta · Angielski B1</b>
            <em>60 min · online</em>
          </span>
        </div>
      </>
    ),
  },
  {
    icon: UsersRound,
    kicker: "UCZNIOWIE I GRUPY",
    title: "Pamiętasz więcej, zanim zacznie się lekcja.",
    text: "Kontakt, poziom, cele, historia spotkań i stan pakietu tworzą jeden profil. Gdy uczeń wraca, cały kontekst już na Ciebie czeka.",
    points: [
      "Profile uczniów i grup",
      "Historia lekcji i postępów",
      "Najbliższy termin i saldo",
    ],
    tone: "mint",
    visual: <StudentPreview />,
  },
  {
    icon: BookOpen,
    kicker: "OBSZAR LEKCJI",
    title: "Przygotuj raz. Wykorzystaj na kolejnych lekcjach.",
    text: "Sięgnij po własny szablon lub scenariusz ze wspólnej biblioteki. Dodaj materiały, prowadź notatki i zaznacz obecność. Poprzednia lekcja daje punkt wyjścia do kolejnej.",
    points: [
      "Plan, notatki i materiały",
      "Szablony i wspólna biblioteka scenariuszy",
      "Praca domowa oraz kolejny krok",
    ],
    tone: "peach",
    visual: <LessonPreview />,
  },
  {
    icon: Link2,
    kicker: "PUBLICZNE REZERWACJE",
    title: "Twój profil. Ich pierwszy krok.",
    text: "Udostępnij własny link w bio, na stronie lub w wiadomości. Nowa osoba wybierze rodzaj spotkania i dostępny termin samodzielnie.",
    points: [
      "Publiczny profil i rezerwacje także w Free",
      "Własne typy spotkań i dostępność",
      "Potwierdzenie i zarządzanie rezerwacją",
    ],
    tone: "navy",
    visual: <BookingPreview />,
  },
] as const;
export default async function LandingPage() {
  const teacher = await currentTeacher();
  const appHref = teacher ? "/app/dzisiaj" : "/rejestracja";
  const appLabel = teacher ? "Przejdź do aplikacji" : "Zacznij bezpłatnie";
  return (
    <main className={styles.page}>
      <a href="#tresc" className={styles.skipLink}>
        Przejdź do treści
      </a>
      <LandingReveal>
        <header className={styles.header}>
          <div className={styles.navShell}>
            <Link
              className="brand brand--public"
              href="/"
              aria-label="easy4tutor — strona główna"
            >
              <BrandLogo />
            </Link>
            <nav className={styles.desktopNav} aria-label="Główna nawigacja">
              <a href="#funkcje">Funkcje</a>
              <a href="#dla-kogo">Dla korepetytorów</a>
              <a href="#cennik">Cennik</a>
            </nav>
            <div className={styles.navActions}>
              <Link className={styles.login} href="/logowanie">
                Zaloguj się
              </Link>
              <Link className={styles.navCta} href={appHref}>
                {appLabel}
                <ArrowRight size={15} />
              </Link>
            </div>
            <details className={styles.mobileMenu}>
              <summary aria-label="Otwórz menu">
                <Menu size={22} />
              </summary>
              <div>
                <a href="#funkcje">Funkcje</a>
                <a href="#dla-kogo">Dla korepetytorów</a>
                <a href="#cennik">Cennik</a>
                <Link href="/logowanie">Zaloguj się</Link>
                <Link href={appHref}>{appLabel}</Link>
              </div>
            </details>
          </div>
        </header>
        <section className={styles.hero} id="tresc">
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>
              <Sparkles size={14} /> Program dla korepetytorów i lektorów
            </p>
            <h1>
              Więcej czasu
              <br />
              na <em>nauczanie.</em>
              <br />
              <span>Mniej na organizację.</span>
            </h1>
            <p className={styles.lead}>
              Od pierwszej rezerwacji po plan lekcji, postępy ucznia i
              rozliczenie. Połącz codzienną pracę w jednym miejscu i wracaj do
              zajęć z gotowym kontekstem.
            </p>
            <div className={styles.heroActions}>
              <Link className={styles.primaryButton} href={appHref}>
                {appLabel}
                <ArrowRight size={18} />
              </Link>
              <a className={styles.secondaryButton} href="#funkcje">
                Zobacz, jak działa
              </a>
            </div>
            {!teacher && (
              <p className={styles.trust}>
                <Check size={15} />
                {TRIAL_DAYS} dni Pro bez karty · potem możesz zostać na Free
              </p>
            )}
          </div>
          <div>
            <HeroProduct />
            <p className={styles.demoCaption}>
              Przykładowy tydzień w Easy4Tutor · fikcyjne dane demonstracyjne
            </p>
          </div>
        </section>
        <section className={styles.audience} id="dla-kogo" data-reveal>
          <p className={styles.audienceLead}>
            Dla korepetytorów, lektorów i nauczycieli prywatnych.
            <br />
            <strong>Cała organizacja. Jeden punkt odniesienia.</strong>
          </p>
          <div className={styles.audienceItems}>
            {audience.map(([Icon, title, text]) => (
              <article key={title}>
                <Icon size={22} />
                <span>
                  <b>{title}</b>
                  <small>{text}</small>
                </span>
              </article>
            ))}
          </div>
        </section>
        <section className={styles.story} id="funkcje">
          <div className={styles.sectionHeading} data-reveal>
            <p className={styles.eyebrow}>Jeden system, cały dzień</p>
            <h2>
              Każdy element pracy
              <br />
              łączy się z następnym.
            </h2>
            <p>
              Bez przepisywania terminów, szukania notatek i sprawdzania kilku
              aplikacji przed zajęciami.
            </p>
          </div>
          {[stories[0], stories[3], stories[2], stories[1]].map((s, i) => (
            <article
              className={`${styles.feature} ${i % 2 ? styles.reverse : ""}`}
              data-reveal
              key={s.kicker}
            >
              <div className={styles.featureCopy}>
                <span className={styles.featureIcon}>
                  <s.icon size={20} />
                </span>
                <p className={styles.kicker}>{s.kicker}</p>
                <h2>{s.title}</h2>
                <p>{s.text}</p>
                <ul>
                  {s.points.map((p) => (
                    <li key={p}>
                      <Check />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
              <div
                className={`${styles.featureVisual} ${styles[`${s.tone}Visual`]}`}
              >
                {s.visual}
              </div>
            </article>
          ))}
          <article className={styles.feature} data-reveal>
            <div className={styles.featureCopy}>
              <span className={styles.featureIcon}>
                <WalletCards size={20} />
              </span>
              <p className={styles.kicker}>PŁATNOŚCI I PAKIETY</p>
              <h2>
                Wiesz, co opłacone.
                <br />I co jeszcze czeka.
              </h2>
              <p>
                Zapisuj otrzymane wpłaty, przypisuj je do lekcji i sprawdzaj
                saldo ucznia. Pakiety pokazują wykorzystane i pozostałe zajęcia
                — bez osobnego arkusza.
              </p>
              <ul>
                <li>
                  <Check />
                  Rozróżnienie wpłat i należności
                </li>
                <li>
                  <Check />
                  Widoczne zaległości i częściowe wpłaty
                </li>
                <li>
                  <Check />
                  Historia i liczba lekcji w pakiecie
                </li>
              </ul>
              <p className={styles.finePrint}>
                Wpłaty rejestrujesz samodzielnie. Easy4Tutor nie pobiera
                pieniędzy od uczniów.
              </p>
            </div>
            <div className={styles.financeVisual}>
              <div className={styles.financePanel}>
                <div className={styles.financeHeader}>
                  <WalletCards size={20} />
                  <b>Rozliczenia uczniów</b>
                  <span>Październik</span>
                </div>
                <div className={styles.financeTotal}>
                  <small>DO ROZLICZENIA</small>
                  <strong>180 zł</strong>
                  <span>2 lekcje · Anna Nowak</span>
                </div>
                <div className={styles.financeRow}>
                  <span>Konwersacje · 12 paź</span>
                  <b className={styles.pending}>Do zapłaty · 90 zł</b>
                </div>
                <div className={styles.financeRow}>
                  <span>Konwersacje · 15 paź</span>
                  <b className={styles.pending}>Do zapłaty · 90 zł</b>
                </div>
                <div className={styles.financeRow}>
                  <span>Pakiet · Marta Kowalska</span>
                  <b className={styles.green}>Opłacony</b>
                </div>
                <div className={styles.packageMeter}>
                  <span>Wykorzystano 6 z 8 lekcji</span>
                  <div>
                    <i />
                  </div>
                  <b>2 lekcje przed Wami</b>
                </div>
              </div>
            </div>
          </article>
        </section>
        <section className={styles.workflow} data-reveal>
          <div className={styles.workflowIntro}>
            <p className={styles.eyebrow}>Jeden przepływ</p>
            <h2>
              Od pierwszej rezerwacji
              <br />
              do rozliczonej lekcji.
            </h2>
            <p>
              Pięć etapów, jeden ciąg informacji. Od zaplanowania terminu po
              przygotowanie następnego spotkania.
            </p>
          </div>
          <div className={styles.flowLine}>
            {[
              [CircleUserRound, "Ustaw podstawy", "Uczniowie i dostępność"],
              [CalendarDays, "Udostępnij link", "Profil i wolne terminy"],
              [BookOpen, "Lekcja", "Plan i obecność"],
              [FileText, "Notatki", "Postęp i praca domowa"],
              [CreditCard, "Rozliczenie", "Płatność lub pakiet"],
            ].map(([Icon, title, text], i) => (
              <div className={styles.flowStep} key={title as string}>
                <span className={styles.flowNumber}>0{i + 1}</span>
                <span className={styles.flowIcon}>
                  <Icon size={20} />
                </span>
                <b>{title as string}</b>
                <small>{text as string}</small>
              </div>
            ))}
          </div>
        </section>
        <section className={styles.pricing} id="cennik" data-reveal>
          <div className={styles.pricingCopy}>
            <p className={styles.eyebrow}>Prosty cennik</p>
            <h2>
              Zacznij bez presji.
              <br />
              Rozwijaj się we własnym tempie.
            </h2>
            <p>
              Najpierw {TRIAL_DAYS} dni pełnego planu Pro bez karty. Później
              wybierasz: bezpłatny plan Free albo Pro bez limitu uczniów.
            </p>
            <Link className={styles.textLink} href={appHref}>
              {appLabel} <ArrowRight size={16} />
            </Link>
          </div>
          <div className={styles.priceCards}>
            <article>
              <span>FREE</span>
              <h3>{formatPrice(FREE_PRICE_GROSZ)}</h3>
              <p>
                Na start i do {freePlan.maxActiveStudents} aktywnych uczniów.
              </p>
              <ul>
                <li>
                  <Check />
                  Kalendarz i dostępność
                </li>
                <li>
                  <Check />
                  Lekcje, notatki i zadania
                </li>
                <li>
                  <Check />
                  Płatności i pakiety
                </li>
                <li>
                  <Check />
                  Publiczny profil i rezerwacje
                </li>
                <li>
                  <Check />
                  Materiały i szablony lekcji
                </li>
              </ul>
              <Link className={styles.secondaryButton} href={appHref}>
                {appLabel}
              </Link>
            </article>
            <article className={styles.proCard}>
              <span>PRO · {TRIAL_DAYS} DNI GRATIS</span>
              <h3>
                {formatPrice(PRO_MONTHLY_PRICE_GROSZ)} <small>/ mies.</small>
              </h3>
              <p>Dla rozwijającej się praktyki nauczycielskiej.</p>
              <ul>
                <li>
                  <Check />
                  Wszystko z planu Free
                </li>
                <li>
                  <Check />
                  Bez limitu aktywnych uczniów
                </li>
                <li>
                  <Check />
                  Integracja Google Calendar
                </li>
                <li>
                  <Check />
                  Od {formatPrice(monthlyAnnualEquivalentGrosz())}/mies. przy
                  płatności {formatPrice(PRO_ANNUAL_PRICE_GROSZ)}/rok
                </li>
              </ul>
              <Link href={appHref}>
                {appLabel} <ArrowRight size={16} />
              </Link>
            </article>
          </div>
        </section>
        <section className={styles.faq} id="pytania" data-reveal>
          <div>
            <p className={styles.eyebrow}>Przed pierwszą lekcją</p>
            <h2>
              Dobre pytania.
              <br />
              Proste odpowiedzi.
            </h2>
            <p>
              Potrzebujesz pomocy?{" "}
              <a href="mailto:support@easy4tutor.pl">Napisz do nas</a>.
            </p>
          </div>
          <div>
            {[
              [
                "Czy mogę korzystać z Easy4Tutor bezpłatnie?",
                `Tak. Plan Free jest bezpłatny i pozwala prowadzić do ${freePlan.maxActiveStudents} aktywnych uczniów. Obejmuje kalendarz, lekcje, notatki, materiały, rozliczenia oraz publiczne rezerwacje. Nowe konto otrzymuje ${TRIAL_DAYS} dni Pro bez podawania karty.`,
              ],
              [
                "Czy mogę połączyć Google Calendar?",
                "Tak, w planie Pro i podczas okresu próbnego. Możesz wybrać kalendarze Google i widzieć ich wydarzenia obok lekcji. Synchronizacja działa w tle, więc zmiany mogą pojawić się z opóźnieniem.",
              ],
              [
                "Czy moi uczniowie mogą samodzielnie rezerwować lekcje?",
                "Tak. Po opublikowaniu profilu i ustawieniu oferty oraz dostępności udostępniasz swój link. Uczeń wybiera rodzaj spotkania i termin. Publiczne rezerwacje są dostępne również w Free.",
              ],
              [
                "Czy Easy4Tutor nadaje się do lekcji online i stacjonarnych?",
                "Tak. Możesz organizować oba rodzaje zajęć i zapisać miejsce spotkania lub link do rozmowy. Lekcję online prowadzisz w wybranym narzędziu do wideorozmów.",
              ],
              [
                "Czy mogę prowadzić zajęcia grupowe?",
                "Tak. Możesz tworzyć grupy, planować dla nich lekcje, zaznaczać obecność oraz zapisywać wyniki poszczególnych uczniów. W Free obowiązuje limit aktywnych uczniów całego konta.",
              ],
              [
                "Co dzieje się po zakończeniu okresu próbnego?",
                "Jeśli nie wykupisz Pro, konto przejdzie na Free. Dane pozostają zachowane. Gdy masz więcej niż limit aktywnych uczniów Free, nie dodasz ani nie przywrócisz kolejnych aktywnych uczniów do czasu zwolnienia miejsca lub wyboru Pro.",
              ],
            ].map(([question, answer]) => (
              <details key={question}>
                <summary>
                  {question}
                  <span aria-hidden="true">+</span>
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>
        <section className={styles.finalCta} data-reveal>
          <div>
            <p className={styles.eyebrow}>
              Twój następny dzień może być prostszy
            </p>
            <h2>
              Zostaw więcej miejsca
              <br />
              na nauczanie.
            </h2>
            <p>
              Zacznij od uporządkowania kalendarza. Reszta połączy się po
              drodze.
            </p>
          </div>
          <Link href={appHref}>
            {appLabel}
            <ArrowRight size={19} />
          </Link>
        </section>
        <footer className={styles.footer}>
          <div>
            <Link
              className="brand brand--public"
              href="/"
              aria-label="easy4tutor — strona główna"
            >
              <BrandLogo />
            </Link>
            <p>Jedno miejsce do prowadzenia korepetycji.</p>
            <a
              className={styles.supportLink}
              href="mailto:support@easy4tutor.pl"
            >
              support@easy4tutor.pl
            </a>
          </div>
          <nav aria-label="Stopka">
            <div>
              <b>Produkt</b>
              <a href="#funkcje">Funkcje</a>
              <a href="#cennik">Cennik</a>
              <Link href="/logowanie">Logowanie</Link>
            </div>
            <div>
              <b>Informacje prawne</b>
              <Link href="/regulamin">Regulamin</Link>
              <Link href="/polityka-prywatnosci">Polityka prywatności</Link>
              <Link href="/powierzenie-danych">Powierzenie danych</Link>
              <Link href="/podprocesorzy">Podprocesorzy</Link>
              <Link href="/dane-uslugodawcy">Dane usługodawcy</Link>
              <Link href="/zglos-nielegalna-tresc">Zgłoś nielegalną treść</Link>
              <CookieSettingsButton />
            </div>
          </nav>
          <p className={styles.copyright}>© 2026 easy4tutor</p>
        </footer>
      </LandingReveal>
    </main>
  );
}
