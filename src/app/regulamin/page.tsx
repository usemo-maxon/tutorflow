import type { Metadata } from "next";
import Link from "next/link";
import {
  LegalPage,
  Paragraphs,
  type LegalSection,
} from "@/components/legal-page";
import { LEGAL_CONTACT_EMAIL } from "@/lib/legal/config";

export const metadata: Metadata = {
  title: "Regulamin Easy4Tutor",
  description: "Regulamin korzystania z platformy Easy4Tutor.",
};

const sections: LegalSection[] = [
  {
    id: "ogolne",
    title: "1. Postanowienia ogólne",
    content: (
      <Paragraphs>
        <p>
          Niniejszy Regulamin określa zasady korzystania z platformy
          internetowej Easy4Tutor dostępnej pod adresem easy4tutor.pl, w tym
          zasady tworzenia Konta, korzystania z funkcji platformy, zawierania i
          rozwiązywania umów o świadczenie usług drogą elektroniczną,
          korzystania z planów płatnych oraz składania reklamacji.
        </p>
        <p>
          Operatorem i usługodawcą jest podmiot wskazany w{" "}
          <Link href="/dane-uslugodawcy">Danych usługodawcy</Link>. Kontakt:{" "}
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>.
          Regulamin można nieodpłatnie zapisać i odtworzyć. Założenie Konta
          wymaga jego akceptacji. Polityka prywatności jest informacją, a nie
          ogólną zgodą.
        </p>
      </Paragraphs>
    ),
  },
  {
    id: "definicje",
    title: "2. Definicje",
    content: (
      <Paragraphs>
        <p>
          <strong>Easy4Tutor</strong> — platforma SaaS;{" "}
          <strong>Użytkownik/Tutor</strong> — pełnoletnia osoba posiadająca
          Konto; <strong>Workspace</strong> — jej przestrzeń robocza;{" "}
          <strong>Treści Użytkownika</strong> — wprowadzone dane i materiały;{" "}
          <strong>Plan</strong> — bezpłatny lub odpłatny wariant usługi;{" "}
          <strong>Konsument</strong> i{" "}
          <strong>Przedsiębiorca na prawach konsumenta</strong> — osoby
          chronione w zakresie wynikającym z prawa.
        </p>
      </Paragraphs>
    ),
  },
  {
    id: "usluga",
    title: "3. Zakres usługi i wymagania",
    content: (
      <Paragraphs>
        <p>
          Easy4Tutor organizuje pracę korepetytorów i nauczycieli. Zależnie od
          Planu obejmuje uczniów, kontakty, grupy, kalendarz, lekcje cykliczne,
          obecność, plany i notatki, zadania domowe, materiały, pakiety,
          rozliczenia, dostępność, strony publiczne, rezerwacje i integracje.
        </p>
        <p>
          Easy4Tutor nie jest szkołą ani stroną umowy o zajęcia pomiędzy Tutorem
          a jego klientem. Wymagane są Internet, aktualna przeglądarka, aktywny
          e-mail oraz — dla integracji — konto właściwego dostawcy.
        </p>
      </Paragraphs>
    ),
  },
  {
    id: "konto",
    title: "4. Konto i zasady korzystania",
    content: (
      <ol>
        <li>
          Konto Tutora może założyć osoba pełnoletnia; nie jest ono przeznaczone
          do samodzielnego zakładania przez dzieci.
        </li>
        <li>Użytkownik podaje prawdziwe dane i chroni dostęp do Konta.</li>
        <li>
          Zabronione są: obchodzenie zabezpieczeń i limitów, udostępnianie Konta
          osobom nieuprawnionym, działalność bezprawna i naruszanie praw innych
          osób.
        </li>
        <li>
          Podejrzenie nieuprawnionego dostępu należy zgłosić na{" "}
          {LEGAL_CONTACT_EMAIL}.
        </li>
      </ol>
    ),
  },
  {
    id: "dane",
    title: "5. Dane uczniów i Treści Użytkownika",
    content: (
      <Paragraphs>
        <p>
          Tutor odpowiada za podstawę prawną, obowiązki informacyjne i
          minimalizację danych uczniów, klientów, rodziców i opiekunów. W
          zakresie przetwarzania na jego polecenie obowiązuje{" "}
          <Link href="/powierzenie-danych">Umowa powierzenia</Link>. Danych
          szczególnych kategorii nie należy wprowadzać bez rzeczywistej
          konieczności i właściwej podstawy.
        </p>
        <p>
          Użytkownik zachowuje prawa do swoich treści i pozwala przetwarzać je
          technicznie wyłącznie dla świadczenia, synchronizacji, ochrony i
          backupu usługi. Easy4Tutor nie nabywa prawa do ich sprzedaży.
        </p>
      </Paragraphs>
    ),
  },
  {
    id: "publiczne",
    title: "6. Profil publiczny i rezerwacje",
    content: (
      <Paragraphs>
        <p>
          Tutor odpowiada za profil, ofertę, ceny, zasady zajęć i własne
          obowiązki. Rezerwacja nie tworzy umowy o usługę edukacyjną z
          operatorem Easy4Tutor. Treści bezprawne można zgłaszać przez{" "}
          <Link href="/zglos-nielegalna-tresc">formularz</Link> lub na{" "}
          {LEGAL_CONTACT_EMAIL}. Dostęp do treści albo Konta może zostać
          ograniczony, gdy wymaga tego prawo, bezpieczeństwo lub uzasadnione
          naruszenie Regulaminu.
        </p>
      </Paragraphs>
    ),
  },
  {
    id: "google",
    title: "7. Google",
    content: (
      <Paragraphs>
        <p>
          Google Sign-In i Google Calendar są dobrowolnymi, rozdzielonymi
          funkcjami. Calendar żąda tylko zakresu potrzebnego do synchronizacji i
          może odczytywać dane niezbędne do dostępności oraz tworzyć,
          aktualizować lub usuwać synchronizowane zdarzenia. Integrację można
          odłączyć w ustawieniach. Danych Google API nie sprzedajemy ani nie
          używamy do reklamy behawioralnej; stosujemy Google API Services User
          Data Policy, w tym Limited Use.
        </p>
      </Paragraphs>
    ),
  },
  {
    id: "platnosci",
    title: "8. Plany i płatności",
    content: (
      <Paragraphs>
        <p>
          Przed zakupem prezentujemy Plan, cenę brutto, okres rozliczeniowy,
          główne funkcje i informację o odnowieniu. Umowa odpłatna zostaje
          zawarta dopiero po działaniu jednoznacznie wskazującym obowiązek
          zapłaty. Aktywną subskrypcję trzeba anulować w udostępniony sposób;
          samo wylogowanie jej nie anuluje. Płatności obsługuje PayU.
        </p>
      </Paragraphs>
    ),
  },
  {
    id: "odstapienie",
    title: "9. Prawo odstąpienia",
    content: (
      <Paragraphs>
        <p>
          Konsument oraz, gdy przepisy tak stanowią, przedsiębiorca na prawach
          konsumenta, może co do zasady odstąpić od umowy zawartej na odległość
          w ciągu 14 dni. Oświadczenie można wysłać na {LEGAL_CONTACT_EMAIL}.
          Formularz poniżej jest opcjonalny. Rozpoczęcie usługi na żądanie przed
          końcem terminu może skutkować rozliczeniem wykonanej części zgodnie z
          prawem.
        </p>
      </Paragraphs>
    ),
  },
  {
    id: "zgodnosc",
    title: "10. Zgodność usługi i reklamacje",
    content: (
      <Paragraphs>
        <p>
          Easy4Tutor odpowiada za zgodność usługi cyfrowej z umową zgodnie z
          bezwzględnie obowiązującym prawem. Uprawniona osoba może żądać
          doprowadzenia usługi do zgodności, a w ustawowych przypadkach
          obniżenia ceny lub odstąpienia. Reklamacje przyjmujemy na{" "}
          {LEGAL_CONTACT_EMAIL} i rozpatrujemy bez zbędnej zwłoki w terminach
          ustawowych.
        </p>
      </Paragraphs>
    ),
  },
  {
    id: "bezpieczenstwo",
    title: "11. Dostępność, bezpieczeństwo i zakończenie",
    content: (
      <Paragraphs>
        <p>
          Stosujemy rozsądne środki ciągłości i bezpieczeństwa. Przerwy mogą
          wynikać z prac, aktualizacji, awarii dostawców lub działań ochronnych;
          bez odrębnego SLA nie gwarantujemy 100% dostępności. Użytkownik może
          zakończyć korzystanie w Koncie. Dostęp może zostać ograniczony przy
          istotnym naruszeniu prawa lub Regulaminu, oszustwie, rzeczywistym
          zagrożeniu albo nakazie organu.
        </p>
      </Paragraphs>
    ),
  },
  {
    id: "eksport",
    title: "12. Eksport i usunięcie danych",
    content: (
      <Paragraphs>
        <p>
          Użytkownik może otrzymać przenośne dane w formacie maszynowym. Eksport
          nie obejmuje tajemnic, danych bezpieczeństwa ani danych innych
          użytkowników. Po zakończeniu dane są usuwane lub anonimizowane, z
          wyjątkiem danych wymaganych prawem, rozliczeniami, bezpieczeństwem lub
          roszczeniami; kopie zapasowe mogą zawierać je przez ograniczony cykl
          backupu.
        </p>
      </Paragraphs>
    ),
  },
  {
    id: "zmiany",
    title: "13. Zmiany i odpowiedzialność",
    content: (
      <Paragraphs>
        <p>
          Zmiany usługi lub Regulaminu mogą wynikać z prawa, bezpieczeństwa,
          technologii, napraw błędów lub rozwoju. Istotne zmiany komunikujemy z
          odpowiednim wyprzedzeniem, a gdy trzeba — wymagamy ponownej
          akceptacji. Easy4Tutor odpowiada zgodnie z prawem, lecz nie za jakość
          usług edukacyjnych Tutora ani prawdziwość jego treści. Nie ogranicza
          to odpowiedzialności, której nie można prawnie wyłączyć.
        </p>
      </Paragraphs>
    ),
  },
  {
    id: "prawo",
    title: "14. Prawo właściwe",
    content: (
      <Paragraphs>
        <p>
          Stosuje się prawo polskie z zachowaniem bezwzględnej ochrony
          Konsumenta. Właściwość sądu ustalają przepisy. Nieważność pojedynczego
          postanowienia nie unieważnia automatycznie pozostałych.
        </p>
      </Paragraphs>
    ),
  },
  {
    id: "formularz",
    title: "15. Formularz odstąpienia",
    content: (
      <blockquote>
        <p>
          <strong>WZÓR FORMULARZA ODSTĄPIENIA OD UMOWY</strong>
        </p>
        <p>
          Adresat: operator Easy4Tutor, dane dostępne na stronie
          easy4tutor.pl/dane-uslugodawcy
          <br />
          E-mail: support@easy4tutor.pl
        </p>
        <p>
          Niniejszym informuję o odstąpieniu od umowy dotyczącej korzystania z
          płatnego planu Easy4Tutor.
        </p>
        <p>
          Adres e-mail Konta Easy4Tutor:
          <br />
          Data zawarcia umowy:
          <br />
          Imię i nazwisko:
          <br />
          Data złożenia oświadczenia:
        </p>
        <p>
          Użycie formularza nie jest obowiązkowe. Wystarczy inne jednoznaczne
          oświadczenie.
        </p>
      </blockquote>
    ),
  },
];

export default function Page() {
  return (
    <LegalPage title="Regulamin platformy Easy4Tutor" sections={sections} />
  );
}
