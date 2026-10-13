import type { Metadata } from "next";
import Link from "next/link";
import {
  LegalPage,
  Paragraphs,
  type LegalSection,
} from "@/components/legal-page";
export const metadata: Metadata = {
  title: "Umowa powierzenia danych",
  description: "Umowa powierzenia przetwarzania danych osobowych w Easy4Tutor.",
};
const s: LegalSection[] = [
  {
    id: "role",
    title: "1. Role stron",
    content: (
      <Paragraphs>
        <p>
          Użytkownik wprowadzający do Workspace dane uczniów, klientów,
          rodziców, opiekunów lub innych osób działa jako Administrator.
          Operator Easy4Tutor jest Podmiotem przetwarzającym w rozumieniu art.
          28 RODO. Umowa obowiązuje, gdy Easy4Tutor przetwarza te dane w imieniu
          Administratora.
        </p>
      </Paragraphs>
    ),
  },
  {
    id: "przedmiot",
    title: "2. Przedmiot i cel",
    content: (
      <Paragraphs>
        <p>
          Administrator powierza przetwarzanie w zakresie potrzebnym do
          wybranych funkcji dotyczących uczniów, kontaktów, grup, lekcji,
          kalendarza, rezerwacji, obecności, notatek, zadań, materiałów,
          pakietów, rozliczeń, integracji, backupu i bezpieczeństwa.
        </p>
      </Paragraphs>
    ),
  },
  {
    id: "kategorie",
    title: "3. Osoby i dane",
    content: (
      <Paragraphs>
        <p>
          Dane mogą dotyczyć uczniów, potencjalnych uczniów, klientów, rodziców,
          opiekunów, osób kontaktowych, członków grup i rezerwujących. Mogą
          obejmować identyfikację, kontakt, naukę, lekcje, harmonogram,
          obecność, notatki, zadania, materiały, pakiety, rozliczenia i
          rezerwacje. Administrator ogranicza zakres do niezbędnego.
        </p>
      </Paragraphs>
    ),
  },
  {
    id: "polecenia",
    title: "4. Polecenia i poufność",
    content: (
      <Paragraphs>
        <p>
          Easy4Tutor działa wyłącznie na udokumentowane polecenie
          Administratora, chyba że przetwarzanie nakazuje prawo. Poleceniami są
          ta Umowa, działania w interfejsie, konfiguracja integracji i
          dyspozycje związane z usługą. Osoby upoważnione są związane poufnością
          i otrzymują dostęp w niezbędnym zakresie.
        </p>
      </Paragraphs>
    ),
  },
  {
    id: "bezpieczenstwo",
    title: "5. Bezpieczeństwo",
    content: (
      <Paragraphs>
        <p>
          Easy4Tutor stosuje środki odpowiednie do ryzyka zgodnie z art. 32
          RODO, w tym odpowiednio szyfrowanie transmisji, kontrolę i separację
          dostępu, minimalne uprawnienia, ochronę poświadczeń, kopie
          bezpieczeństwa, aktualizacje i reagowanie na incydenty.
        </p>
      </Paragraphs>
    ),
  },
  {
    id: "podprocesorzy",
    title: "6. Dalsi podmioty przetwarzający",
    content: (
      <Paragraphs>
        <p>
          Administrator udziela ogólnej zgody na używanie dalszych podmiotów
          niezbędnych do usługi. Aktualna lista i data zmiany są na stronie{" "}
          <Link href="/podprocesorzy">Podprocesorzy</Link>. O planowanym dodaniu
          lub zastąpieniu istotnego dostawcy Easy4Tutor poinformuje w sposób
          umożliwiający uzasadniony sprzeciw dotyczący ochrony danych. Na
          dostawcę nakładane są odpowiednie obowiązki. Transfer poza EOG wymaga
          mechanizmu zgodnego z RODO.
        </p>
      </Paragraphs>
    ),
  },
  {
    id: "wsparcie",
    title: "7. Prawa osób, naruszenia i zgodność",
    content: (
      <Paragraphs>
        <p>
          Uwzględniając charakter przetwarzania, Easy4Tutor wspiera
          Administratora w realizacji praw osób i obowiązków z art. 32–36 RODO.
          O stwierdzonym naruszeniu powierzonych danych informuje bez zbędnej
          zwłoki i przekazuje dostępne informacje potrzebne do wykonania
          obowiązków.
        </p>
      </Paragraphs>
    ),
  },
  {
    id: "audyt",
    title: "8. Informacje i audyt",
    content: (
      <Paragraphs>
        <p>
          Easy4Tutor udostępnia informacje potrzebne do wykazania zgodności.
          Weryfikacja może używać dokumentacji, raportów, certyfikatów lub
          audytu i nie może naruszać bezpieczeństwa, danych innych użytkowników
          ani tajemnic chronionych; nie ogranicza to praw z art. 28 RODO.
        </p>
      </Paragraphs>
    ),
  },
  {
    id: "koniec",
    title: "9. Zakończenie",
    content: (
      <Paragraphs>
        <p>
          Po zakończeniu usług Easy4Tutor usuwa lub umożliwia zwrot powierzonych
          danych zgodnie z wyborem Administratora i prawem, chyba że dalsze
          przechowywanie jest obowiązkowe. Dane mogą ograniczony czas pozostawać
          w zabezpieczonych backupach.
        </p>
      </Paragraphs>
    ),
  },
  {
    id: "administrator",
    title: "10. Obowiązki Administratora i pierwszeństwo",
    content: (
      <Paragraphs>
        <p>
          Administrator odpowiada za legalność pozyskania danych, podstawy,
          informacje dla osób, zgodność poleceń i minimalizację. Niniejsza Umowa
          oraz bezwzględne prawo ochrony danych mają pierwszeństwo przed
          sprzecznym postanowieniem ogólnego Regulaminu.
        </p>
      </Paragraphs>
    ),
  },
];
export default function Page() {
  return (
    <LegalPage
      title="Umowa powierzenia przetwarzania danych osobowych"
      subtitle="stanowiąca część umowy korzystania z Easy4Tutor"
      sections={s}
    />
  );
}
