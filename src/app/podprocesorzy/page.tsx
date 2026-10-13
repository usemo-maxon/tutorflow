import type { Metadata } from "next";
import { LegalPage, Paragraphs } from "@/components/legal-page";
import styles from "@/components/legal-page.module.css";
import {
  LEGAL_CONTACT_EMAIL,
  LEGAL_UPDATED_LABEL,
  subprocessors,
} from "@/lib/legal/config";
export const metadata: Metadata = {
  title: "Podprocesorzy",
  description: "Aktualna lista podprocesorów Easy4Tutor.",
};
export default function Page() {
  return (
    <LegalPage title="Podprocesorzy Easy4Tutor">
      <Paragraphs>
        <p>
          Easy4Tutor korzysta z wyspecjalizowanych dostawców technologicznych w
          zakresie niezbędnym do świadczenia i zabezpieczenia usługi. W
          przypadkach, w których dostawca przetwarza dane osobowe w imieniu
          Easy4Tutor, może pełnić rolę dalszego podmiotu przetwarzającego.
        </p>
        <p>
          Data ostatniej zmiany listy: {LEGAL_UPDATED_LABEL}. Kontakt w sprawach
          dotyczących podprocesorów:{" "}
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>.
        </p>
      </Paragraphs>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Dostawca</th>
            <th>Cel i kontekst</th>
            <th>Region / transfer</th>
          </tr>
        </thead>
        <tbody>
          {subprocessors.map((x) => (
            <tr key={x.name}>
              <td>
                <a href={x.href} rel="noreferrer" target="_blank">
                  {x.name}
                </a>
              </td>
              <td>
                <strong>{x.purpose}</strong>
                <br />
                {x.context}
              </td>
              <td>
                {x.region}
                <br />
                <small>{x.transfer}</small>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </LegalPage>
  );
}
