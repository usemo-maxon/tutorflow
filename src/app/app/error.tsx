"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";

export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="route-error" role="alert">
      <AlertTriangle size={22} aria-hidden="true" />
      <h1>Nie udało się wczytać tej strony</h1>
      <p>Spróbuj ponownie. Twoje zapisane dane są bezpieczne.</p>
      <button className="button button--primary" onClick={() => retry()}>
        Spróbuj ponownie
      </button>
    </div>
  );
}
