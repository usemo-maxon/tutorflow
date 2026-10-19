"use client";

import { Compass } from "lucide-react";

export function TourStartButton() {
  return (
    <button
      type="button"
      className="button button--primary"
      onClick={() => window.dispatchEvent(new Event("easy4tutor:start-tour"))}
    >
      <Compass size={17} aria-hidden="true" />
      Uruchom przewodnik
    </button>
  );
}
