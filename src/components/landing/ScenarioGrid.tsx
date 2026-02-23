"use client";

import { ScrollReveal } from "./ScrollReveal";

const scenarios = [
  {
    name: "The Rescue Job",
    description:
      "A relegation-threatened club hires you mid-season. Eight weeks to find three signings that save their season.",
    difficulty: "Easy",
    color: "bg-emerald-500",
  },
  {
    name: "Moneyball",
    description:
      "Cash-strapped club, impossible brief. Find players who punch above their market value using data and instinct.",
    difficulty: "Hard",
    color: "bg-amber-500",
  },
  {
    name: "Wonderkid Hunter",
    description:
      "Find three generational talents across different countries in a single season. Rivals are circling the same pool.",
    difficulty: "Hard",
    color: "bg-amber-500",
  },
];

export function ScenarioGrid() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-24">
      <ScrollReveal>
        <h2 className="text-center text-3xl font-bold text-white sm:text-4xl">
          10 scenarios. Each one a different challenge.
        </h2>
        <p className="mx-auto mt-4 max-w-lg text-center text-zinc-400">
          From short rescue missions to season-long campaigns, every scenario
          tests a different part of your scouting ability.
        </p>
      </ScrollReveal>

      <div className="mt-12 grid gap-6 sm:grid-cols-3">
        {scenarios.map((scenario, i) => (
          <ScrollReveal key={scenario.name} delay={i * 0.1}>
            <div className="flex h-full flex-col rounded-xl border border-zinc-800 bg-zinc-900/30 p-6">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">
                  {scenario.name}
                </h3>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white ${scenario.color}`}
                >
                  {scenario.difficulty}
                </span>
              </div>
              <p className="text-sm leading-relaxed text-zinc-400">
                {scenario.description}
              </p>
            </div>
          </ScrollReveal>
        ))}
      </div>
    </section>
  );
}
