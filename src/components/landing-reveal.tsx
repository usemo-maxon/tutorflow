"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Content remains visible without JS; only off-screen sections are enhanced. */
export function LandingReveal({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (media.matches || !window.IntersectionObserver) return;
    const sections =
      root.current?.querySelectorAll<HTMLElement>("[data-reveal]");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.removeAttribute("data-reveal-pending");
            entry.target.setAttribute("data-reveal-state", "visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.08 },
    );
    sections?.forEach((section) => {
      if (section.getBoundingClientRect().top > window.innerHeight) {
        section.setAttribute("data-reveal-pending", "");
        observer.observe(section);
      } else {
        section.setAttribute("data-reveal-state", "visible");
      }
    });
    const revealAll = () =>
      sections?.forEach((section) => {
        section.removeAttribute("data-reveal-pending");
        section.setAttribute("data-reveal-state", "visible");
      });
    media.addEventListener("change", revealAll);
    return () => {
      observer.disconnect();
      revealAll();
      media.removeEventListener("change", revealAll);
    };
  }, []);
  return <div ref={root}>{children}</div>;
}
