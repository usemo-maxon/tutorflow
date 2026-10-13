import type { Metadata } from "next";
import { IllegalContentForm } from "@/components/illegal-content-form";
import { LegalPage, Paragraphs } from "@/components/legal-page";
export const metadata: Metadata = {
  title: "Zgłoś nielegalną treść",
  description:
    "Formularz zgłoszenia potencjalnie nielegalnej treści w Easy4Tutor.",
};
export default function Page() {
  return (
    <LegalPage title="Zgłoś nielegalną treść">
      <Paragraphs>
        <p>
          Jeżeli uważasz, że treść opublikowana za pośrednictwem Easy4Tutor jest
          niezgodna z prawem, możesz przesłać nam zgłoszenie. Zgłoszenie powinno
          umożliwiać zidentyfikowanie konkretnej treści oraz wyjaśniać, dlaczego
          uważasz ją za nielegalną.
        </p>
        <p>
          Możesz również skontaktować się z nami pod adresem{" "}
          <a href="mailto:support@easy4tutor.pl">support@easy4tutor.pl</a>.
        </p>
      </Paragraphs>
      <IllegalContentForm />
    </LegalPage>
  );
}
