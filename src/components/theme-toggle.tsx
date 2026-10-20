"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export type ColorTheme = "light" | "dark";

const STORAGE_KEY = "easy4tutor-color-theme";

function getStoredTheme(): ColorTheme | null {
  const stored = window.localStorage.getItem(STORAGE_KEY);
  return stored === "light" || stored === "dark" ? stored : null;
}

function getPreferredTheme(): ColorTheme {
  return getStoredTheme() ??
    (window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light");
}

function applyTheme(theme: ColorTheme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<ColorTheme>("light");

  useEffect(() => {
    const preferredTheme = getPreferredTheme();
    applyTheme(preferredTheme);
    const syncLabel = window.setTimeout(() => setTheme(preferredTheme), 0);

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleSystemChange = () => {
      if (getStoredTheme()) return;
      const next = media.matches ? "dark" : "light";
      applyTheme(next);
      setTheme(next);
    };
    media.addEventListener("change", handleSystemChange);
    return () => {
      window.clearTimeout(syncLabel);
      media.removeEventListener("change", handleSystemChange);
    };
  }, []);

  const dark = theme === "dark";
  const Icon = dark ? Sun : Moon;
  const actionLabel = dark ? "Włącz jasny motyw" : "Włącz nocny motyw";

  function toggleTheme() {
    const next = dark ? "light" : "dark";
    window.localStorage.setItem(STORAGE_KEY, next);
    setTheme(next);
    applyTheme(next);
  }

  return (
    <button
      type="button"
      className={`theme-toggle${compact ? " theme-toggle--compact" : ""}`}
      onClick={toggleTheme}
      aria-label={actionLabel}
      title={actionLabel}
    >
      <Icon size={18} aria-hidden="true" />
      {!compact && <span>{actionLabel}</span>}
    </button>
  );
}
