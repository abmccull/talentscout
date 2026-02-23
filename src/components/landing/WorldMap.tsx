"use client";

import { ScrollReveal } from "./ScrollReveal";

const countries = [
  { name: "England", x: 47, y: 22, clubs: 40 },
  { name: "Spain", x: 44, y: 32, clubs: 30 },
  { name: "Germany", x: 51, y: 23, clubs: 25 },
  { name: "France", x: 47, y: 27, clubs: 25 },
  { name: "Italy", x: 52, y: 30, clubs: 25 },
  { name: "Netherlands", x: 49, y: 21, clubs: 15 },
  { name: "Portugal", x: 42, y: 31, clubs: 15 },
  { name: "Belgium", x: 49, y: 23, clubs: 10 },
  { name: "Brazil", x: 32, y: 60, clubs: 25 },
  { name: "Argentina", x: 30, y: 72, clubs: 20 },
  { name: "Scotland", x: 46, y: 19, clubs: 10 },
  { name: "Turkey", x: 58, y: 31, clubs: 10 },
  { name: "Japan", x: 85, y: 30, clubs: 10 },
  { name: "USA", x: 20, y: 30, clubs: 10 },
  { name: "Mexico", x: 15, y: 40, clubs: 10 },
  { name: "Nigeria", x: 50, y: 50, clubs: 8 },
  { name: "South Africa", x: 55, y: 72, clubs: 8 },
  { name: "Australia", x: 82, y: 70, clubs: 8 },
  { name: "Colombia", x: 25, y: 50, clubs: 8 },
  { name: "South Korea", x: 83, y: 28, clubs: 8 },
  { name: "Saudi Arabia", x: 62, y: 40, clubs: 8 },
  { name: "Egypt", x: 56, y: 42, clubs: 8 },
];

export function WorldMap() {
  return (
    <section className="border-y border-zinc-800/60 bg-zinc-950/50 px-6 py-24">
      <div className="mx-auto max-w-5xl">
        <ScrollReveal>
          <h2 className="text-center text-3xl font-bold text-white sm:text-4xl">
            Scout across 22 countries.
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-center text-zinc-400">
            From the Premier League to the Argentine Primera Divisi&oacute;n.
            Every country has its own clubs, leagues, and player pools.
          </p>
        </ScrollReveal>

        <ScrollReveal delay={0.2}>
          <div className="relative mx-auto mt-12 aspect-[2/1] max-w-3xl rounded-xl border border-zinc-800 bg-zinc-900/30">
            {/* Simplified world outline via dots */}
            <svg
              viewBox="0 0 100 80"
              className="absolute inset-0 h-full w-full"
              preserveAspectRatio="xMidYMid meet"
            >
              {/* Background grid */}
              <defs>
                <pattern
                  id="grid"
                  width="5"
                  height="5"
                  patternUnits="userSpaceOnUse"
                >
                  <circle cx="2.5" cy="2.5" r="0.2" fill="rgb(63 63 70 / 0.3)" />
                </pattern>
              </defs>
              <rect width="100" height="80" fill="url(#grid)" />

              {/* Country dots */}
              {countries.map((c) => (
                <g key={c.name}>
                  <circle
                    cx={c.x}
                    cy={c.y}
                    r="1.2"
                    className="fill-emerald-500/80"
                  />
                  <circle
                    cx={c.x}
                    cy={c.y}
                    r="2.5"
                    className="fill-emerald-500/20"
                  />
                  <title>
                    {c.name} — {c.clubs} clubs
                  </title>
                </g>
              ))}
            </svg>
          </div>
        </ScrollReveal>

        {/* Country tags */}
        <ScrollReveal delay={0.3}>
          <div className="mt-8 flex flex-wrap justify-center gap-2">
            {countries.map((c) => (
              <span
                key={c.name}
                className="rounded-full bg-zinc-800/60 px-3 py-1 text-xs text-zinc-400"
              >
                {c.name}
              </span>
            ))}
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
