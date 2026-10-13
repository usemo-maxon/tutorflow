import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { LEGAL_UPDATED_LABEL, legalLinks } from "@/lib/legal/config";
import styles from "./legal-page.module.css";

export type LegalSection = { id: string; title: string; content: ReactNode };

export function LegalPage({
  title,
  subtitle,
  sections,
  children,
}: {
  title: string;
  subtitle?: string;
  sections?: LegalSection[];
  children?: ReactNode;
}) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" aria-label="Easy4Tutor — strona główna">
          <BrandLogo />
        </Link>
        <Link href="/">Wróć do strony głównej</Link>
      </header>
      <main className={styles.shell}>
        <article className={styles.article}>
          <p className={styles.eyebrow}>Dokumenty Easy4Tutor</p>
          <h1>{title}</h1>
          {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
          <p className={styles.updated}>
            Ostatnia aktualizacja: {LEGAL_UPDATED_LABEL}
          </p>
          {children}
          {sections?.map((section) => (
            <section id={section.id} key={section.id}>
              <h2>{section.title}</h2>
              {section.content}
            </section>
          ))}
          <nav className={styles.related} aria-label="Powiązane dokumenty">
            <strong>Powiązane dokumenty</strong>
            <div>
              {legalLinks.map(([href, label]) => (
                <Link key={href} href={href}>
                  {label}
                </Link>
              ))}
            </div>
          </nav>
        </article>
        {sections && sections.length > 3 && (
          <aside className={styles.toc} aria-label="Spis treści">
            <strong>Spis treści</strong>
            {sections.map((section) => (
              <a key={section.id} href={`#${section.id}`}>
                {section.title}
              </a>
            ))}
          </aside>
        )}
      </main>
    </div>
  );
}

export function Paragraphs({ children }: { children: ReactNode }) {
  return <div className={styles.paragraphs}>{children}</div>;
}
