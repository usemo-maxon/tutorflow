"use client";

import { RotateCcw } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

/** One finite teaching sequence; the static server-rendered preview is the fallback. */
export function LessonPreviewMotion({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = root.current;
    if (!element || !window.IntersectionObserver) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = false;
    const update = () => {
      if (reduced.matches) {
        element.removeAttribute("data-lesson-motion");
        return;
      }
      if (visible && !document.hidden) {
        element.setAttribute("data-lesson-motion", "ready");
      }
      element.getAnimations({ subtree: true }).forEach((animation) => {
        if (animation.playState === "finished") return;
        if (visible && !document.hidden) animation.play();
        else animation.pause();
      });
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        update();
      },
      { threshold: 0.12 },
    );
    observer.observe(element);
    reduced.addEventListener("change", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      observer.disconnect();
      reduced.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", update);
      element.removeAttribute("data-lesson-motion");
    };
  }, []);

  function replay() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    root.current?.getAnimations({ subtree: true }).forEach((animation) => {
      if (
        animation instanceof CSSAnimation &&
        animation.animationName.startsWith("lesson-")
      ) {
        animation.currentTime = 0;
        animation.play();
      }
    });
  }

  return (
    <div className="hero-product-preview" ref={root}>
      {children}
      <button className="lesson-replay" type="button" onClick={replay}>
        <RotateCcw size={14} aria-hidden="true" /> Odtwórz ponownie
      </button>
    </div>
  );
}
