"use client";

import type { ReactNode } from "react";

export function PillToggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-11 w-16 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] ${
        checked ? "bg-[var(--primary)]" : "bg-[var(--border)]"
      }`}
    >
      <span
        className={`absolute left-1.5 top-1.5 h-8 w-8 rounded-full shadow transition-transform ${
          checked ? "translate-x-5 bg-[var(--primary-foreground)]" : "translate-x-0 bg-[var(--foreground)]"
        }`}
      />
    </button>
  );
}

export function RadioGroup<T extends string>({
  name,
  options,
  value,
  onChange,
}: {
  name: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={name}>
      {options.map((option) => (
        <label
          key={option.value}
          data-selected={value === option.value}
          className="dossier-choice flex min-h-11 min-w-11 cursor-pointer items-center gap-1.5 px-4 py-2 text-sm transition"
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            className="h-4 w-4 shrink-0 accent-[var(--primary)]"
          />
          {option.label}
        </label>
      ))}
    </div>
  );
}

export function SettingRow({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[var(--border)] py-4">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        {description ? (
          <p className="mt-0.5 text-sm leading-relaxed text-quiet">{description}</p>
        ) : null}
      </div>
      {children}
    </div>
  );
}
