"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface ChoiceCardProps {
  selected?: boolean;
  pending?: boolean;
  disabled?: boolean;
  disabledReason?: string;
  recommended?: boolean;
  name?: string;
  value?: string;
  type?: "button" | "radio";
  onSelect?: () => void;
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
}

const selectedMark = (
  <span
    aria-hidden="true"
    className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[color:var(--primary)] bg-[color:var(--primary)] text-[length:var(--text-eyebrow)] font-bold text-[color:var(--primary-foreground)]"
  >
    ✓
  </span>
);

const idleMark = (
  <span
    aria-hidden="true"
    className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-[color:var(--border)] text-transparent"
  >
    ✓
  </span>
);

export function ChoiceCard({
  selected = false,
  pending = false,
  disabled = false,
  disabledReason,
  recommended = false,
  name,
  value,
  type = "button",
  onSelect,
  children,
  className,
  "aria-label": ariaLabel,
}: ChoiceCardProps) {
  const locked = disabled || pending;
  const surface = cn(
    "relative flex min-h-14 w-full cursor-pointer flex-col rounded border px-4 py-3 text-left transition-colors",
    selected
      ? "border-[color:var(--primary)]/70 bg-[color:var(--surface-selected)]"
      : "border-[color:var(--border)] bg-transparent hover:bg-[color:var(--surface-interactive)]",
    pending && "cursor-wait",
    disabled && !pending && "cursor-not-allowed opacity-55",
    className,
  );

  const body = (
    <>
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0 flex-1">
          {children}
          {(pending || recommended) && (
            <span className="mt-2 block text-xs font-semibold text-[color:var(--primary)]">
              {pending ? "Working…" : "Recommended"}
            </span>
          )}
        </span>
        {selected ? selectedMark : idleMark}
      </span>
      {disabled && disabledReason && (
        <span className="text-meta mt-2 text-quiet">{disabledReason}</span>
      )}
    </>
  );

  if (type === "radio") {
    return (
      <label className={`${surface} has-[:focus-visible]:outline has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-offset-3 has-[:focus-visible]:outline-[color:var(--ring)]`}>
        <input
          type="radio"
          name={name}
          value={value}
          checked={selected}
          disabled={locked}
          onChange={() => onSelect?.()}
          className="sr-only"
          aria-label={ariaLabel}
        />
        {body}
      </label>
    );
  }

  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-pressed={selected}
      aria-busy={pending || undefined}
      disabled={locked}
      onClick={onSelect}
      className={surface}
    >
      {body}
    </button>
  );
}
