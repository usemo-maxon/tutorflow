"use client";

import { useEffect } from "react";

/** Keep in-app links and browser exits from silently discarding a draft. */
export function useUnsavedChanges(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const beforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    const followLink = (event: MouseEvent) => {
      const link = (event.target as Element).closest<HTMLAnchorElement>(
        "a[href]",
      );
      if (
        !link ||
        link.target === "_blank" ||
        link.hasAttribute("download") ||
        link.origin !== location.origin ||
        link.href === location.href ||
        link.pathname.startsWith("/api/export")
      )
        return;
      if (
        !window.confirm(
          "Masz niezapisane zmiany. Opuścić stronę bez zapisywania?",
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", followLink, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", followLink, true);
    };
  }, [dirty]);
}
