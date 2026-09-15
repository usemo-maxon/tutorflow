import type { Metadata } from "next";
export const metadata: Metadata = { title: "Regulamin" };
import { BrandLogo } from "@/components/brand-logo";
import Link from "next/link";
export default function TermsPage() {
  return (
    <main className="legal-page">
      <Link className="brand brand--public" href="/">
        <BrandLogo />
      </Link>
      <article>
        <p className="eyebrow">Dokument roboczy</p>
        <h1>Regulamin</h1>
        <p>
          Warunki świadczenia usługi, zasady okresu próbnego, płatności i
          rezygnacji zostaną opublikowane przed produkcyjnym uruchomieniem
          easy4tutor. Ten ekran nie stanowi jeszcze oferty handlowej.
        </p>
      </article>
    </main>
  );
}
