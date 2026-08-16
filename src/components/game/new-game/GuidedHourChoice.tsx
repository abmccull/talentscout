"use client";

import { ChoiceCard } from "@/components/ui/ChoiceCard";

interface GuidedHourChoiceProps {
  value: boolean;
  onChange: (guideFirstHour: boolean) => void;
}

export function GuidedHourChoice({ value, onChange }: GuidedHourChoiceProps) {
  return (
    <fieldset data-testid="guided-hour-choice">
      <legend className="text-sm font-semibold text-white">Do you want the first-assignment guide?</legend>
      <p className="mt-1 max-w-2xl text-xs leading-relaxed text-quiet">
        This is the same school match either way. The guide only highlights the next click.
        You can still disable it later from the mentor card.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <ChoiceCard
          type="radio"
          name="guided-hour"
          value="guide"
          selected={value}
          recommended
          onSelect={() => onChange(true)}
          className="min-h-28"
        >
          <span className="block font-semibold text-white">Walk me through it</span>
          <span className="mt-2 block text-sm leading-relaxed text-zinc-200">
            Highlight Watch, focus, the discovery call, the first report, and Advance Week.
          </span>
        </ChoiceCard>
        <ChoiceCard
          type="radio"
          name="guided-hour"
          value="skip"
          selected={!value}
          onSelect={() => onChange(false)}
          className="min-h-28"
        >
          <span className="block font-semibold text-white">Start without the guide</span>
          <span className="mt-2 block text-sm leading-relaxed text-zinc-200">
            Play the assignment yourself. Navigation stays open. No mentor lock.
          </span>
        </ChoiceCard>
      </div>
    </fieldset>
  );
}
