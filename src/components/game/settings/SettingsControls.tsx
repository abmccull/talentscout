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
      className={`relative h-11 w-16 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
        checked ? "bg-emerald-500" : "bg-zinc-700"
      }`}
    >
      <span
        className={`absolute left-1.5 top-1.5 h-8 w-8 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-5" : "translate-x-0"
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
          className={`flex min-h-11 min-w-11 cursor-pointer items-center gap-1.5 rounded-md border px-4 py-2 text-sm transition ${
            value === option.value
              ? "border-emerald-500 bg-emerald-500/10 text-emerald-400"
              : "border-[#27272a] text-zinc-400 hover:border-zinc-600 hover:text-white"
          }`}
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
            className="sr-only"
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
    <div className="flex items-center justify-between gap-4 rounded-md border border-[#27272a] bg-[#0c0c0c] px-3 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        {description ? (
          <p className="mt-0.5 text-xs leading-relaxed text-zinc-400">{description}</p>
        ) : null}
      </div>
      {children}
    </div>
  );
}
