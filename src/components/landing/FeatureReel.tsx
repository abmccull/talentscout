"use client";

import { ScrollReveal } from "./ScrollReveal";
import { Check } from "lucide-react";

const categories = [
  {
    name: "Career",
    features: [
      { title: "5-Tier Progression", desc: "Amateur to Chief Scout" },
      { title: "Club or Independent", desc: "Work for a club or go solo" },
      { title: "NPC Scout Management", desc: "Hire and direct a team" },
      { title: "Financial Pressure", desc: "Salary, expenses, upgrades" },
    ],
  },
  {
    name: "Scouting",
    features: [
      { title: "Match Observation", desc: "Watch live, take notes" },
      { title: "Player Database", desc: "Search, filter, track" },
      { title: "Report Writing", desc: "Your words, your judgment" },
      { title: "Player Personalities", desc: "16 observable traits" },
    ],
  },
  {
    name: "World",
    features: [
      { title: "22 Countries", desc: "Each with unique leagues" },
      { title: "350+ Clubs", desc: "Real-world-inspired rosters" },
      { title: "Seasonal Calendar", desc: "Transfer windows, fixtures" },
      { title: "Rival Scouts", desc: "Competing for discoveries" },
    ],
  },
  {
    name: "Systems",
    features: [
      { title: "45 Achievements", desc: "Across 6 categories" },
      { title: "Moddable Data", desc: "Create your own leagues" },
      { title: "10 Scenarios", desc: "Unique challenge modes" },
      { title: "Hall of Fame", desc: "Legacy tracking across saves" },
    ],
  },
];

export function FeatureReel() {
  return (
    <section className="border-y border-zinc-800/60 bg-zinc-950/50 px-6 py-24">
      <div className="mx-auto max-w-6xl">
        <ScrollReveal>
          <h2 className="mb-14 text-center text-3xl font-bold text-white sm:text-4xl">
            Everything a scout needs.
          </h2>
        </ScrollReveal>

        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {categories.map((cat, ci) => (
            <div key={cat.name}>
              <ScrollReveal delay={ci * 0.1}>
                <h3 className="mb-5 text-xs font-semibold uppercase tracking-wider text-emerald-400">
                  {cat.name}
                </h3>
              </ScrollReveal>
              <ul className="space-y-4">
                {cat.features.map((f, fi) => (
                  <ScrollReveal key={f.title} delay={ci * 0.1 + fi * 0.05}>
                    <li className="flex items-start gap-3">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                      <div>
                        <p className="text-sm font-medium text-white">
                          {f.title}
                        </p>
                        <p className="text-xs text-zinc-500">{f.desc}</p>
                      </div>
                    </li>
                  </ScrollReveal>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
