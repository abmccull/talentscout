"use client";

import { ScrollReveal } from "./ScrollReveal";

const comparisons = [
  { fm: "You manage the team", ts: "You find the players" },
  { fm: "Tactics, training, transfers", ts: "Observation, judgment, reputation" },
  { fm: "Results on the pitch", ts: "Results in the report" },
  { fm: "Database of stats", ts: "Your eyes and your notebook" },
];

export function ComparisonStrip() {
  return (
    <section className="border-y border-zinc-800/60 bg-zinc-950/50 px-6 py-24">
      <div className="mx-auto max-w-3xl">
        <ScrollReveal>
          <h2 className="mb-4 text-center text-3xl font-bold text-white sm:text-4xl">
            Not a Football Manager clone.
          </h2>
          <p className="mb-12 text-center text-lg text-zinc-400">
            A different game entirely.
          </p>
        </ScrollReveal>

        <div className="space-y-0 overflow-hidden rounded-xl border border-zinc-800">
          {/* Header */}
          <div className="grid grid-cols-2">
            <div className="border-b border-r border-zinc-800 bg-zinc-900/50 px-6 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Football Manager
              </p>
            </div>
            <div className="border-b border-zinc-800 bg-zinc-900/50 px-6 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                TalentScout
              </p>
            </div>
          </div>

          {/* Rows */}
          {comparisons.map((row, i) => (
            <ScrollReveal key={i} delay={i * 0.05}>
              <div className="grid grid-cols-2">
                <div
                  className={`border-r border-zinc-800 px-6 py-4 ${
                    i < comparisons.length - 1 ? "border-b border-b-zinc-800/50" : ""
                  }`}
                >
                  <p className="text-sm text-zinc-500">{row.fm}</p>
                </div>
                <div
                  className={`px-6 py-4 ${
                    i < comparisons.length - 1 ? "border-b border-b-zinc-800/50" : ""
                  }`}
                >
                  <p className="text-sm font-medium text-white">{row.ts}</p>
                </div>
              </div>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </section>
  );
}
