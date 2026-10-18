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
        Same school match. Choose a guided route or keep navigation open. You can turn the guide off later.
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <ChoiceCard
          type="radio"
          name="guided-hour"
          value="guide"
          selected={value}
          onSelect={() => onChange(true)}
          className="min-h-24"
        >
          <span className="block font-semibold text-white">Walk me through it</span>
          <span className="mt-1 block text-sm leading-6 text-[color:var(--muted-foreground)]">
            A mentor highlights each step through your first week.
          </span>
        </ChoiceCard>
        <ChoiceCard
          type="radio"
          name="guided-hour"
          value="skip"
          selected={!value}
          onSelect={() => onChange(false)}
          className="min-h-24"
        >
          <span className="block font-semibold text-white">Start without the guide</span>
          <span className="mt-1 block text-sm leading-6 text-[color:var(--muted-foreground)]">
            Explore the assignment yourself, with navigation open.
          </span>
        </ChoiceCard>
      </div>
    </fieldset>
  );
}
