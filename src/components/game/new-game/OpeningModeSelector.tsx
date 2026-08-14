"use client";

import { ChoiceCard } from "@/components/ui/ChoiceCard";

export type VeteranOpeningMode = "dynamic" | "desk" | "tutorial";

interface OpeningModeSelectorProps {
  value: VeteranOpeningMode;
  onChange: (value: VeteranOpeningMode) => void;
}

const OPENING_OPTIONS: ReadonlyArray<{
  value: VeteranOpeningMode;
  title: string;
  description: string;
  detail: string;
  recommended?: boolean;
}> = [
  {
    value: "dynamic",
    title: "Follow a fresh lead",
    description: "Start with a new assignment created for this career.",
    detail: "The contact, venue, pressure, evidence, and deadline change every career.",
    recommended: true,
  },
  {
    value: "desk",
    title: "Plan the week yourself",
    description: "Start at the Desk and choose your own first assignment.",
    detail: "Best when you already know the Planner, reports, and prospect workflow.",
  },
  {
    value: "tutorial",
    title: "Replay guided assignment",
    description: "Return to the school-match introduction.",
    detail: "Work through observation, judgment, reporting, and follow-up with guidance.",
  },
] as const;

export function OpeningModeSelector({
  value,
  onChange,
}: OpeningModeSelectorProps) {
  return (
    <fieldset aria-describedby="opening-mode-help">
      <legend className="text-sm font-semibold text-white">How should this career begin?</legend>
      <div className="mt-1 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <p id="opening-mode-help" className="max-w-2xl text-xs leading-relaxed text-quiet">
          Your opening changes the first assignment, not your scout, world, or long-term progression.
        </p>
        <p className="text-xs text-quiet">You can make a different choice next career.</p>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        {OPENING_OPTIONS.map((option) => (
          <ChoiceCard
            key={option.value}
            type="radio"
            name="opening-mode"
            value={option.value}
            selected={value === option.value}
            recommended={option.recommended}
            onSelect={() => onChange(option.value)}
            className="min-h-40"
          >
            <span className="block font-semibold text-white">{option.title}</span>
            <span className="mt-2 block text-sm leading-relaxed text-zinc-200">
              {option.description}
            </span>
            <span className="mt-3 block text-xs leading-relaxed text-quiet">
              {option.detail}
            </span>
          </ChoiceCard>
        ))}
      </div>
    </fieldset>
  );
}
