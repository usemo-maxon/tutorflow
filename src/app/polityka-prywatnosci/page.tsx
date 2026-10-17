import type { Metadata } from "next";
import Link from "next/link";
import {
  LegalPage,
  Paragraphs,
  type LegalSection,
} from "@/components/legal-page";
import { LEGAL_CONTACT_EMAIL } from "@/lib/legal/config";
export const metadata: Metadata = {
  title: "Polityka prywatności",
  description: "Informacje o przetwarzaniu danych osobowych w Easy4Tutor.",
};
const sections: LegalSection[] = [
  {
    id: "administrator",
    title: "1. Administrator i role",
    content: (
      <Paragraphs>
        <p>
          Administratorem danych Konta, bezpieczeństwa, rozliczeń i kontaktu
          jest operator wskazany w{" "}
          <Link href="/dane-uslugodawcy">Danych usługodawcy</Link>. Kontakt w
          sprawach RODO:{" "}
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>.
        </p>
        <p>
          Dla danych uczniów i klientów wprowadzanych przez Tutora
          administratorem jest Tutor, a Easy4Tutor działa jako podmiot
          przetwarzający na podstawie{" "}
          <Link href="/powierzenie-danych">Umowy powierzenia</Link>.
        </p>
      </Paragraphs>
    ),
  },
  {
    id: "dane",
    title: "2. Dane i źródła",
    content: (
      <ul>
        <li>dane Konta, profil, e-mail, ustawienia i identyfikatory;</li>
        <li>
          dane Workspace: uczniowie, kontakty, grupy, lekcje, obecność, notatki,
          zadania, materiały, pakiety i rozliczenia;
        </li>
        <li>publiczny profil i dane rezerwacji;</li>
        <li>dane Google Calendar w dobrowolnie przyznanym zakresie;</li>
        <li>zamówienia i statusy płatności PayU;</li>
        <li>dane techniczne i bezpieczeństwa niezbędne do działania.</li>
      </ul>
    ),
  },
  {
    id: "cele",
    title: "3. Cele i podstawy",
    content: (
      <Paragraphs>
        <p>
          Przetwarzamy dane dla wykonania umowy (art. 6 ust. 1 lit. b RODO),
          obowiązków prawnych, w tym księgowych (lit. c), oraz uzasadnionych
          interesów: bezpieczeństwa, zapobiegania nadużyciom, obrony roszczeń i
          pomiaru działania własnej usługi (lit. f). Gdy operacja wymaga zgody,
          podstawą jest lit. a; zgodę można wycofać. Utworzenie Konta nie
          oznacza zgody marketingowej.
        </p>
      </Paragraphs>
    ),
  },
  {
    id: "rezerwacje",
    title: "4. Rezerwacje",
    content: (
      <Paragraphs>
        <p>
          Administratorem danych podanych przy rezerwacji jest Tutor wskazany na
          stronie. Easy4Tutor przetwarza je w jego imieniu dla technicznej
          obsługi rezerwacji. Przy rezerwacji dla małoletniego należy podać
          kontakt rodzica lub opiekuna, gdy jest to właściwe.
        </p>
      </Paragraphs>
    ),
  },
  {
    id: "google",
    title: "5. Google",
    content: (
      <Paragraphs>
        <p>
          Google Sign-In nie przyznaje dostępu do kalendarza. Calendar łączy się
          osobno, po wyraźnej akcji, z zakresami <code>calendar.events</code> i{" "}
          <code>calendar.calendarlist.readonly</code>. Tokeny są zaszyfrowane po
          stronie serwera i niewidoczne dla przeglądarki. Po odłączeniu
          zatrzymujemy nową synchronizację i usuwamy dane uwierzytelniające w
          zakresie technicznie możliwym.
        </p>
      </Paragraphs>
    ),
  },
  {
    id: "odbiorcy",
    title: "6. Odbiorcy i transfery",
    content: (
      <Paragraphs>
        <p>
          Używamy dostawców niezbędnych do usługi; aktualna lista jest na
          stronie <Link href="/podprocesorzy">Podprocesorzy</Link>. Przy
          transferach poza EOG stosowany jest właściwy mechanizm prawny, np.
          decyzja adekwatności lub SCC. Dane mogą zostać przekazane organom,
          jeśli wymaga tego prawo.
        </p>
      </Paragraphs>
    ),
  },
  {
    id: "retencja",
    title: "7. Retencja",
    content: (
      <Paragraphs>
        <p>
          Dane Konta pozostają przez czas korzystania z usługi. Po zakończeniu
          część może być zachowana dla obowiązków prawnych, rozliczeń,
          bezpieczeństwa lub roszczeń. Dokumentacja księgowa podlega terminom
          ustawowym. Tokeny Google pozostają do odłączenia, usunięcia Konta lub
          wygaśnięcia. Backup może zawierać usunięte dane przez ograniczony
          cykl.
        </p>
        <p>
          Repozytorium nie określa gwarantowanej rotacji backupów i logów
          infrastruktury; obowiązują rzeczywiste ustawienia produkcyjnych usług
          Supabase i Vercel.
        </p>
      </Paragraphs>
    ),
  },
  {
    id: "prawa",
    title: "8. Prawa osób",
    content: (
      <Paragraphs>
        <p>
          Zależnie od sytuacji przysługują: dostęp, kopia, sprostowanie,
          usunięcie, ograniczenie, przenoszenie, sprzeciw i cofnięcie zgody.
          Żądania kieruj na {LEGAL_CONTACT_EMAIL}. Możemy poprosić o informacje
          potrzebne do potwierdzenia tożsamości. Skargę można złożyć do Prezesa
          UODO.
        </p>
      </Paragraphs>
    ),
  },
  {
    id: "cookies",
    title: "9. Cookies i pamięć przeglądarki",
    content: (
      <Paragraphs>
        <p>
          Używamy technologii koniecznych dla sesji, uwierzytelniania i
          bezpieczeństwa. Pamięć lokalna przechowuje ustawienia funkcjonalne,
          np. widok kalendarza. Obecnie nie ładujemy zewnętrznych cookies
          analitycznych ani marketingowych. Opcjonalne preferencje można zmienić
          w „Ustawieniach cookies”, a odmowa nie blokuje podstawowych funkcji.
        </p>
      </Paragraphs>
    ),
  },
  {
    id: "bezpieczenstwo",
    title: "10. Bezpieczeństwo i decyzje",
    content: (
      <Paragraphs>
        <p>
          Stosujemy środki dostosowane do ryzyka: kontrolę dostępu, RLS,
          szyfrowanie transmisji, minimalne uprawnienia i ochronę danych
          uwierzytelniających. Żaden system nie eliminuje całkowicie ryzyka. Nie
          podejmujemy wobec Użytkowników istotnych decyzji wyłącznie
          automatycznie.
        </p>
      </Paragraphs>
    ),
  },
  {
    id: "zmiany",
    title: "11. Zmiany Polityki",
    content: (
      <Paragraphs>
        <p>
          Polityka może się zmieniać wskutek zmian prawa, technologii, dostawców
          lub funkcji. Istotne zmiany będą komunikowane. Nowa wersja nie
          zastępuje zgody, gdy jest ona prawnie wymagana.
        </p>
      </Paragraphs>
    ),
  },
];
export default function Page() {
  return (
    <LegalPage title="Polityka prywatności Easy4Tutor" sections={sections} />
  );
}
