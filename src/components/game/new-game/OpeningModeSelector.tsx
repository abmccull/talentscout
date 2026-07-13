"use client";

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
    title: "Dynamic prologue",
    description: "Follow a new lead built from this career's world seed.",
    detail: "Different venue, source, pressure, evidence, and deadline each career.",
    recommended: true,
  },
  {
    value: "desk",
    title: "Start at the Desk",
    description: "Skip the opening case and take control of your first week.",
    detail: "Best when you already know the planner, reports, and prospect workflow.",
  },
  {
    value: "tutorial",
    title: "Replay tutorial",
    description: "Return to the authored school-match discovery case.",
    detail: "Revisit the guided evidence, judgment, and recommendation loop.",
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
        <p id="opening-mode-help" className="max-w-2xl text-xs leading-relaxed text-zinc-400">
          Your opening changes the first assignment, not your scout, world, or long-term progression.
        </p>
        <p className="text-xs text-zinc-400">You can make a different choice next career.</p>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        {OPENING_OPTIONS.map((option) => {
          const isSelected = value === option.value;

          return (
            <label
              key={option.value}
              className={`relative flex min-h-40 cursor-pointer flex-col rounded-xl border p-4 transition focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-emerald-300 ${
                isSelected
                  ? "border-emerald-400 bg-emerald-500/12 shadow-lg shadow-emerald-950/40"
                  : "border-zinc-700 bg-zinc-900/70 hover:border-zinc-500 hover:bg-zinc-900"
              }`}
            >
              <input
                className="sr-only"
                type="radio"
                name="opening-mode"
                value={option.value}
                checked={isSelected}
                onChange={() => onChange(option.value)}
              />
              <span className="flex items-start justify-between gap-3">
                <span className="font-semibold text-white">{option.title}</span>
                <span
                  aria-hidden="true"
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
                    isSelected
                      ? "border-emerald-300 bg-emerald-400 text-zinc-950"
                      : "border-zinc-500 text-transparent"
                  }`}
                >
                  &#10003;
                </span>
              </span>
              {option.recommended && (
                <span className="mt-2 w-fit rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-wider text-emerald-200">
                  Recommended
                </span>
              )}
              <span className="mt-2 block text-sm leading-relaxed text-zinc-200">
                {option.description}
              </span>
              <span className="mt-auto block pt-3 text-xs leading-relaxed text-zinc-400">
                {option.detail}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
