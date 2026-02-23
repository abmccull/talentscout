"use client";

import { CountUp } from "./CountUp";
import { ScrollReveal } from "./ScrollReveal";

const stats = [
  { value: 22, label: "Countries" },
  { value: 350, suffix: "+", label: "Clubs" },
  { value: 4, label: "Career Paths" },
  { value: 10, label: "Scenarios" },
];

export function StatsStrip() {
  return (
    <section className="border-y border-zinc-800/60 bg-zinc-950/50 py-10">
      <ScrollReveal>
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-y-6">
          {stats.map((stat, i) => (
            <div key={stat.label} className="flex items-center">
              {i > 0 && (
                <div className="mx-6 hidden h-8 w-px bg-emerald-500/30 sm:block" />
              )}
              <div className="px-4 text-center sm:px-0">
                <p className="text-2xl font-bold text-white">
                  <CountUp end={stat.value} suffix={stat.suffix} />
                </p>
                <p className="mt-1 text-sm text-zinc-400">{stat.label}</p>
              </div>
            </div>
          ))}
        </div>
      </ScrollReveal>
    </section>
  );
}
