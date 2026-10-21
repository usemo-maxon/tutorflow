"use client";

import { Check, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import {
  CALENDAR_COLOR_PALETTE,
  DEFAULT_CALENDAR_COLOR,
  calendarHexToHsl,
  calendarHslToHex,
  normalizeCalendarColor,
  type CalendarHsl,
} from "@/lib/calendar-colors";

export function CalendarColorPicker({
  value,
  onChange,
  disabled,
  label = "Kolor",
}: {
  value?: string;
  onChange: (color: string) => void;
  disabled?: boolean;
  label?: string;
}) {
  const id = useId();
  const picker = useRef<HTMLDivElement>(null);
  const customButton = useRef<HTMLButtonElement>(null);
  const firstSlider = useRef<HTMLInputElement>(null);
  const selected =
    normalizeCalendarColor(value ?? "") ?? DEFAULT_CALENDAR_COLOR;
  const isPaletteColor = CALENDAR_COLOR_PALETTE.some(
    (option) => option.hex === selected,
  );
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(selected);
  const [hexInput, setHexInput] = useState(selected);
  const [hsl, setHsl] = useState<CalendarHsl>(() => calendarHexToHsl(selected));
  const customPickerId = `${id}-custom-picker`;

  useEffect(() => {
    if (!open) return;

    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!picker.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        window.requestAnimationFrame(() => customButton.current?.focus());
      }
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  function openCustomPicker() {
    if (open) {
      setOpen(false);
      return;
    }
    const nextHsl = calendarHexToHsl(selected);
    setDraft(selected);
    setHexInput(selected);
    setHsl(nextHsl);
    setOpen(true);
    window.requestAnimationFrame(() => firstSlider.current?.focus());
  }

  function updateHsl(partial: Partial<CalendarHsl>) {
    const next = { ...hsl, ...partial };
    const nextHex = calendarHslToHex(next);
    setHsl(next);
    setDraft(nextHex);
    setHexInput(nextHex);
  }

  function updateHexInput(nextValue: string) {
    const next = nextValue.toUpperCase();
    setHexInput(next);
    const normalized = normalizeCalendarColor(next);
    if (!normalized) return;
    setDraft(normalized);
    setHsl(calendarHexToHsl(normalized));
  }

  return (
    <fieldset className="calendar-color-field" disabled={disabled}>
      <legend>{label}</legend>
      <div className="calendar-color-options">
        {CALENDAR_COLOR_PALETTE.map((option) => {
          const active = selected === option.hex;
          return (
            <button
              key={option.hex}
              type="button"
              className="calendar-color-swatch"
              data-selected={active || undefined}
              style={{ "--swatch-color": option.hex } as CSSProperties}
              aria-label={`${option.label}${active ? ", wybrany" : ""}`}
              aria-pressed={active}
              title={option.label}
              onClick={() => onChange(option.hex)}
            >
              {active && <Check size={14} strokeWidth={3} aria-hidden="true" />}
            </button>
          );
        })}
        <div className="calendar-color-custom-wrap" ref={picker}>
          <button
            ref={customButton}
            type="button"
            className="calendar-color-custom"
            data-selected={!isPaletteColor || undefined}
            aria-expanded={open}
            aria-controls={customPickerId}
            aria-haspopup="dialog"
            aria-label={`Własny kolor${!isPaletteColor ? `, wybrany ${selected}` : ""}`}
            onClick={openCustomPicker}
          >
            <span
              className="calendar-color-custom__preview"
              style={{ backgroundColor: selected }}
              aria-hidden="true"
            />
            Własny
            <SlidersHorizontal size={13} aria-hidden="true" />
          </button>
          {open && (
            <div
              id={customPickerId}
              className="calendar-color-popover"
              role="dialog"
              aria-label="Własny wybór koloru"
              style={
                {
                  "--picker-color": draft,
                  "--picker-hue": hsl.hue,
                  "--picker-saturation": hsl.saturation,
                  "--picker-lightness": hsl.lightness,
                } as CSSProperties
              }
            >
              <div className="calendar-color-popover__header">
                <div>
                  <strong>Własny kolor</strong>
                  <small>Wybierz kolor bez systemowego okna.</small>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  aria-label="Zamknij wybór koloru"
                  onClick={() => {
                    setOpen(false);
                    window.requestAnimationFrame(() =>
                      customButton.current?.focus(),
                    );
                  }}
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </div>
              <div
                className="calendar-color-popover__preview"
                aria-hidden="true"
              />
              <label className="calendar-color-slider calendar-color-slider--hue">
                <span>Odcień</span>
                <output>{Math.round(hsl.hue)}°</output>
                <input
                  ref={firstSlider}
                  type="range"
                  min="0"
                  max="359"
                  value={hsl.hue}
                  onChange={(event) =>
                    updateHsl({ hue: Number(event.target.value) })
                  }
                />
              </label>
              <label className="calendar-color-slider calendar-color-slider--saturation">
                <span>Nasycenie</span>
                <output>{Math.round(hsl.saturation)}%</output>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={hsl.saturation}
                  onChange={(event) =>
                    updateHsl({ saturation: Number(event.target.value) })
                  }
                />
              </label>
              <label className="calendar-color-slider calendar-color-slider--lightness">
                <span>Jasność</span>
                <output>{Math.round(hsl.lightness)}%</output>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={hsl.lightness}
                  onChange={(event) =>
                    updateHsl({ lightness: Number(event.target.value) })
                  }
                />
              </label>
              <label className="calendar-color-hex">
                <span>HEX</span>
                <input
                  type="text"
                  inputMode="text"
                  maxLength={7}
                  value={hexInput}
                  aria-invalid={!normalizeCalendarColor(hexInput)}
                  onChange={(event) => updateHexInput(event.target.value)}
                  onBlur={() => {
                    if (!normalizeCalendarColor(hexInput)) setHexInput(draft);
                  }}
                />
              </label>
              <div className="calendar-color-popover__actions">
                <button
                  type="button"
                  className="button button--quiet"
                  onClick={() => {
                    setOpen(false);
                    window.requestAnimationFrame(() =>
                      customButton.current?.focus(),
                    );
                  }}
                >
                  Anuluj
                </button>
                <button
                  type="button"
                  className="button button--primary"
                  disabled={!normalizeCalendarColor(hexInput)}
                  onClick={() => {
                    onChange(draft);
                    setOpen(false);
                    window.requestAnimationFrame(() =>
                      customButton.current?.focus(),
                    );
                  }}
                >
                  <Check size={15} aria-hidden="true" /> Zastosuj
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </fieldset>
  );
}
