"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const settingsNav = [
  ["/app/ustawienia/profil", "Profil"],
  ["/app/ustawienia/integracje", "Integracje"],
  ["/app/ustawienia/dostepnosc", "Dostępność"],
  ["/app/ustawienia/subskrypcja", "Subskrypcja"],
] as const;

export default function SettingsLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="settings-page page-enter">
      <header className="page-header">
        <div>
          <p className="eyebrow">Obszar pracy</p>
          <h1>Ustawienia</h1>
        </div>
      </header>
      <nav className="settings-nav" aria-label="Sekcje ustawień">
        {settingsNav.map(([href, label]) => (
          <Link
            key={href}
            href={href}
            className={pathname === href ? "active" : ""}
          >
            {label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
