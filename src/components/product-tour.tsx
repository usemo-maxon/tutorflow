"use client";

import { Check, Compass, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import type { Teacher } from "@/lib/domain";
import {
  MAIN_TOUR_STEPS,
  PRODUCT_TOUR_VERSION,
  reduceTourState,
  shouldShowTourInvitation,
  targetForStep,
  type ProductTourState,
  type TourAction,
} from "@/lib/product-tour";

const initialState: ProductTourState = {
  version: PRODUCT_TOUR_VERSION,
  status: "not_started",
  currentStep: 0,
};

export function ProductTour({ teacher }: { teacher: Teacher }) {
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useState(initialState);
  const [ready, setReady] = useState(false);
  const [active, setActive] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [targetMissing, setTargetMissing] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const previousFocus = useRef<HTMLElement | null>(null);
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const completionRef = useRef<HTMLElement | null>(null);
  const completionPrimaryRef = useRef<HTMLButtonElement | null>(null);

  const persist = useCallback(async (next: ProductTourState) => {
    try {
      const response = await fetch("/api/product-tour", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!response.ok) throw new Error("TOUR_SAVE_FAILED");
      setSaveFailed(false);
    } catch {
      setSaveFailed(true);
    }
  }, []);

  const apply = useCallback(
    (action: TourAction) => {
      setState((current) => {
        const next = reduceTourState(current, action);
        void persist(next);
        return next;
      });
    },
    [persist],
  );

  const start = useCallback(() => {
    previousFocus.current = document.activeElement as HTMLElement | null;
    setCompleteOpen(false);
    setActive(true);
    apply({ type: "restart" });
  }, [apply]);

  const closeTour = useCallback(
    (action: "skip" | "complete") => {
      apply({ type: action });
      setActive(false);
      setTargetRect(null);
      if (action === "complete") setCompleteOpen(true);
      window.setTimeout(() => previousFocus.current?.focus(), 0);
    },
    [apply],
  );

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/product-tour", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("TOUR_LOAD_FAILED");
        return (await response.json()) as ProductTourState;
      })
      .then((saved) => {
        if (cancelled) return;
        setState(saved);
        if (
          saved.status === "in_progress" &&
          saved.version === PRODUCT_TOUR_VERSION
        ) {
          previousFocus.current = document.activeElement as HTMLElement | null;
          setActive(true);
        }
      })
      .catch(() => setSaveFailed(true))
      .finally(() => !cancelled && setReady(true));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onStart = () => start();
    window.addEventListener("easy4tutor:start-tour", onStart);
    return () => window.removeEventListener("easy4tutor:start-tour", onStart);
  }, [start]);

  useEffect(() => {
    if (!active) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeTour("skip");
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [active, closeTour]);

  useEffect(() => {
    if (!completeOpen) return;
    completionPrimaryRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setCompleteOpen(false);
        window.setTimeout(
          () => document.getElementById("main-content")?.focus(),
          0,
        );
        return;
      }
      if (event.key !== "Tab") return;
      const controls = completionRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      );
      if (!controls?.length) return;
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [completeOpen]);

  useEffect(() => {
    if (!active) return;
    const step = MAIN_TOUR_STEPS[state.currentStep];
    if (!step) return;
    if (pathname !== step.route) {
      router.push(step.route, { scroll: false });
      return;
    }

    let cancelled = false;
    let attempts = 0;
    let timer = 0;
    const targetName = targetForStep(step, mobile);

    const locate = () => {
      if (cancelled) return;
      const target = document.querySelector<HTMLElement>(
        `[data-tour="${targetName}"]`,
      );
      if (target && target.getClientRects().length > 0) {
        target.scrollIntoView({
          block: "center",
          inline: "nearest",
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)")
            .matches
            ? "auto"
            : "smooth",
        });
        window.setTimeout(() => {
          if (!cancelled) {
            setTargetRect(target.getBoundingClientRect());
            setTargetMissing(false);
            headingRef.current?.focus({ preventScroll: true });
          }
        }, 180);
        return;
      }
      attempts += 1;
      if (attempts >= 20) {
        setTargetRect(null);
        setTargetMissing(true);
        headingRef.current?.focus({ preventScroll: true });
        return;
      }
      timer = window.setTimeout(locate, 150);
    };

    locate();
    const refresh = () => {
      const target = document.querySelector<HTMLElement>(
        `[data-tour="${targetName}"]`,
      );
      if (target?.getClientRects().length) {
        setTargetRect(target.getBoundingClientRect());
      }
    };
    window.addEventListener("resize", refresh);
    window.addEventListener("scroll", refresh, true);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener("resize", refresh);
      window.removeEventListener("scroll", refresh, true);
    };
  }, [active, mobile, pathname, router, state.currentStep]);

  if (!ready || typeof document === "undefined") return null;

  const invitation = shouldShowTourInvitation({
    pathname,
    onboardingCompleted: Boolean(teacher.onboardingCompletedAt),
    state,
  });
  const onboardingCompleted = Boolean(teacher.onboardingCompletedAt);

  return createPortal(
    <>
      {invitation && !active && !completeOpen && (
        <aside className="tour-invitation" aria-labelledby="tour-invite-title">
          <button
            className="tour-invitation__close"
            aria-label="Nie pokazuj ponownie"
            onClick={() => apply({ type: "dismiss_invitation" })}
          >
            <X size={17} aria-hidden="true" />
          </button>
          <span className="tour-invitation__icon" aria-hidden="true">
            <Compass size={20} />
          </span>
          <div>
            <h2 id="tour-invite-title">Cześć! Jestem Twoim przewodnikiem 🙂</h2>
            <p>
              W 2 minuty pokażę Ci rytm pracy w Easy4Tutor i najważniejsze
              miejsca. Spokojnie — podczas wycieczki niczego nie zapiszę ani nie
              zepsuję.
            </p>
          </div>
          <div className="tour-invitation__actions">
            <button className="button button--primary" onClick={start}>
              Rozpocznij
            </button>
            <button
              className="button button--quiet"
              onClick={() => apply({ type: "skip" })}
            >
              Może później
            </button>
            <button
              className="tour-text-button"
              onClick={() => apply({ type: "dismiss_invitation" })}
            >
              Nie pokazuj ponownie
            </button>
          </div>
        </aside>
      )}

      {active &&
        MAIN_TOUR_STEPS[state.currentStep]?.route === pathname &&
        (targetRect || targetMissing) && (
          <TourStepOverlay
            state={state}
            targetRect={targetRect}
            targetMissing={targetMissing}
            onBack={() => {
              setTargetRect(null);
              setTargetMissing(false);
              apply({ type: "back" });
            }}
            onNext={() => {
              setTargetRect(null);
              setTargetMissing(false);
              apply({ type: "next" });
            }}
            onSkip={() => closeTour("skip")}
            onComplete={() => closeTour("complete")}
            headingRef={headingRef}
          />
        )}

      {completeOpen && (
        <div className="tour-complete-backdrop" role="presentation">
          <section
            ref={completionRef}
            className="tour-complete"
            role="dialog"
            aria-modal="true"
            aria-labelledby="tour-complete-title"
          >
            <span className="tour-complete__icon" aria-hidden="true">
              <Check size={24} />
            </span>
            <h2 id="tour-complete-title">
              Gotowe! Znasz już podstawy Easy4Tutor.
            </h2>
            <p>
              {onboardingCompleted
                ? "Możesz teraz spokojnie odkrywać aplikację. Przewodnik uruchomisz ponownie w sekcji Pomoc."
                : "Teraz wróć do pierwszych kroków i przygotuj swój prawdziwy plan pracy. Przewodnik zawsze znajdziesz też w sekcji Pomoc."}
            </p>
            <div>
              <button
                ref={completionPrimaryRef}
                className="button button--primary"
                onClick={() => {
                  setCompleteOpen(false);
                  router.push(
                    onboardingCompleted ? "/app/dzisiaj" : "/app/start",
                  );
                }}
              >
                {onboardingCompleted
                  ? "Przejdź do Dzisiaj"
                  : "Wróć do pierwszych kroków"}
              </button>
              <button
                className="button button--secondary"
                onClick={() => {
                  setCompleteOpen(false);
                  window.setTimeout(
                    () => document.getElementById("main-content")?.focus(),
                    0,
                  );
                }}
              >
                Odkrywaj samodzielnie
              </button>
            </div>
          </section>
        </div>
      )}

      {saveFailed && (
        <p className="tour-save-warning" role="status">
          Postęp przewodnika zapisze się, gdy połączenie wróci.
        </p>
      )}
    </>,
    document.body,
  );
}

function TourStepOverlay({
  state,
  targetRect,
  targetMissing,
  onBack,
  onNext,
  onSkip,
  onComplete,
  headingRef,
}: {
  state: ProductTourState;
  targetRect: DOMRect | null;
  targetMissing: boolean;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
  onComplete: () => void;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
}) {
  const step = MAIN_TOUR_STEPS[state.currentStep];
  const final = state.currentStep === MAIN_TOUR_STEPS.length - 1;
  const box = targetRect
    ? ({
        "--tour-x": `${Math.max(8, targetRect.left - 6)}px`,
        "--tour-y": `${Math.max(8, targetRect.top - 6)}px`,
        "--tour-width": `${Math.min(window.innerWidth - 16, targetRect.width + 12)}px`,
        "--tour-height": `${targetRect.height + 12}px`,
      } as CSSProperties)
    : undefined;
  const popover = tooltipPosition(targetRect);

  return (
    <div
      className={`product-tour${targetRect ? " has-target" : ""}`}
      aria-live="polite"
    >
      <div className="product-tour__veil" aria-hidden="true" />
      {targetRect && (
        <div
          className="product-tour__spotlight"
          style={box}
          aria-hidden="true"
        />
      )}
      <section
        className="product-tour__popover"
        style={popover}
        role="dialog"
        aria-modal="false"
        aria-labelledby="tour-step-title"
        aria-describedby="tour-step-description"
      >
        <div className="product-tour__meta">
          <span>
            Krok {state.currentStep + 1} z {MAIN_TOUR_STEPS.length}
          </span>
          <button className="tour-text-button" onClick={onSkip}>
            Pomiń
          </button>
        </div>
        <div className="product-tour__progress" aria-hidden="true">
          <span
            style={{
              width: `${((state.currentStep + 1) / MAIN_TOUR_STEPS.length) * 100}%`,
            }}
          />
        </div>
        <h2 id="tour-step-title" ref={headingRef} tabIndex={-1}>
          {step.title}
        </h2>
        <p id="tour-step-description">{step.description}</p>
        {targetMissing && (
          <p className="product-tour__fallback" role="status">
            Ten element nie jest teraz dostępny. Możesz przejść dalej bez utraty
            postępu.
          </p>
        )}
        <div className="product-tour__actions">
          <button
            className="button button--secondary"
            disabled={state.currentStep === 0}
            onClick={onBack}
          >
            Wstecz
          </button>
          <button
            className="button button--primary"
            onClick={final ? onComplete : onNext}
          >
            {final ? "Zakończ" : "Dalej"}
          </button>
        </div>
      </section>
    </div>
  );
}

function tooltipPosition(rect: DOMRect | null): CSSProperties | undefined {
  if (!rect || window.innerWidth <= 767) return undefined;
  const width = 360;
  const gap = 16;
  const left = Math.max(
    16,
    Math.min(
      window.innerWidth - width - 16,
      rect.left + rect.width / 2 - width / 2,
    ),
  );
  const placeBelow = rect.bottom + 330 < window.innerHeight || rect.top < 340;
  return placeBelow
    ? { left, top: Math.min(window.innerHeight - 320, rect.bottom + gap) }
    : { left, bottom: window.innerHeight - rect.top + gap };
}

declare global {
  interface WindowEventMap {
    "easy4tutor:start-tour": Event;
  }
}
