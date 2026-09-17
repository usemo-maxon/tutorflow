"use client";

import { Check } from "lucide-react";
import { useId, useRef, type CSSProperties } from "react";
import {
  CALENDAR_COLOR_PALETTE,
  DEFAULT_CALENDAR_COLOR,
  normalizeCalendarColor,
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
  const customInput = useRef<HTMLInputElement>(null);
  const selected =
    normalizeCalendarColor(value ?? "") ?? DEFAULT_CALENDAR_COLOR;
  const isPaletteColor = CALENDAR_COLOR_PALETTE.some(
    (option) => option.hex === selected,
  );

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
        <button
          type="button"
          className="calendar-color-custom"
          data-selected={!isPaletteColor || undefined}
          aria-pressed={!isPaletteColor}
          aria-label={`Własny kolor${!isPaletteColor ? `, wybrany ${selected}` : ""}`}
          onClick={() => customInput.current?.click()}
        >
          <span
            className="calendar-color-custom__preview"
            style={{ backgroundColor: selected }}
            aria-hidden="true"
          />
          Własny
          {!isPaletteColor && <Check size={14} aria-hidden="true" />}
        </button>
        <input
          ref={customInput}
          id={id}
          className="calendar-color-native"
          type="color"
          value={selected}
          aria-label="Wybierz własny kolor"
          onChange={(event) => {
            const color = normalizeCalendarColor(event.target.value);
            if (color) onChange(color);
          }}
        />
      </div>
    </fieldset>
  );
}
