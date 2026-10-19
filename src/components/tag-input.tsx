"use client";

import { useState } from "react";
import { X } from "lucide-react";

export function appendTags(
  current: string[],
  input: string,
  maxItems?: number,
  maxLength = 70,
) {
  const next = [...current];
  for (const candidate of input.split(/[,\n]/)) {
    const tag = candidate.trim().slice(0, maxLength);
    if (!tag || next.some((item) => item.toLocaleLowerCase("pl") === tag.toLocaleLowerCase("pl"))) continue;
    if (maxItems && next.length >= maxItems) break;
    next.push(tag);
  }
  return next;
}

export function TagInput({
  value,
  onChange,
  disabled = false,
  maxItems,
  maxLength = 70,
  placeholder,
  ariaLabel,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
  maxItems?: number;
  maxLength?: number;
  placeholder?: string;
  ariaLabel: string;
}) {
  const [draft, setDraft] = useState("");
  const atLimit = Boolean(maxItems && value.length >= maxItems);

  const commit = (input = draft) => {
    const next = appendTags(value, input, maxItems, maxLength);
    if (next !== value) onChange(next);
    setDraft("");
  };

  return (
    <div className={`tag-input${disabled ? " is-disabled" : ""}`}>
      {value.map((tag) => (
        <span className="tag-input__chip" key={tag}>
          {tag}
          <button
            type="button"
            aria-label={`Usuń: ${tag}`}
            onClick={() => onChange(value.filter((item) => item !== tag))}
            disabled={disabled}
          >
            <X size={13} aria-hidden="true" />
          </button>
        </span>
      ))}
      <input
        value={draft}
        aria-label={ariaLabel}
        disabled={disabled || atLimit}
        maxLength={maxLength}
        placeholder={value.length === 0 ? placeholder : atLimit ? "" : "Dodaj kolejny…"}
        onChange={(event) => {
          const input = event.target.value;
          if (/[,\n]/.test(input)) commit(input);
          else setDraft(input);
        }}
        onBlur={() => commit()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === ",") {
            event.preventDefault();
            commit();
          } else if (event.key === "Backspace" && !draft && value.length > 0) {
            onChange(value.slice(0, -1));
          }
        }}
      />
    </div>
  );
}
