import type { Metadata } from "next";
import { LegalPage, Paragraphs } from "@/components/legal-page";
import styles from "@/components/legal-page.module.css";
import { isLegalOperatorComplete, legalOperator } from "@/lib/legal/config";
export const metadata: Metadata = {
  title: "Dane usługodawcy",
  description: "Dane operatora platformy Easy4Tutor.",
};
export default function Page() {
  const rows = [
    ["Pełna nazwa", legalOperator.legalName],
    ["Nazwa handlowa", legalOperator.tradingName],
    ["Adres", legalOperator.address],
    ["NIP", legalOperator.nip],
    ["REGON", legalOperator.regon],
    ["KRS", legalOperator.krs],
    ["Sąd rejestrowy", legalOperator.registrationCourt],
    ["Kapitał zakładowy", legalOperator.shareCapital],
    ["E-mail", legalOperator.email],
  ].filter((x): x is [string, string] => Boolean(x[1]));
  return (
    <LegalPage title="Dane usługodawcy">
      <div className={styles.dataCard}>
        {rows.map(([k, v]) => (
          <div key={k}>
            <strong>{k}:</strong> {v}
          </div>
        ))}
      </div>
      {!isLegalOperatorComplete() && (
        <div className={styles.warning}>
          <strong>
            Dane identyfikacyjne operatora są w trakcie uzupełniania.
          </strong>
          <p>
            Do czasu ich pełnego skonfigurowania Easy4Tutor nie umożliwia
            zawarcia płatnej umowy. Kontakt: support@easy4tutor.pl.
          </p>
        </div>
      )}
      <Paragraphs>
        <p>
          Dane są renderowane z centralnej konfiguracji i nie są zastępowane
          fikcyjnymi wartościami.
        </p>
      </Paragraphs>
    </LegalPage>
  );
}
