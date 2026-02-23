"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ScrollReveal } from "./ScrollReveal";

const specializations = [
  {
    name: "Youth Scout",
    tagline: "Find the wonderkids before anyone else.",
    description:
      "Visit academies, attend youth tournaments, and project which 16-year-olds will become world-class players.",
    features: [
      "Academy visits & youth tournament scouting",
      "Gut feelings \u2014 intuitive reads on young talent",
      "Alumni tracking \u2014 watch your discoveries grow",
    ],
    keyStrength:
      "Potential Assessment \u2014 the best at projecting a player\u2019s ceiling",
  },
  {
    name: "First Team Scout",
    tagline: "Your manager needs a left-back who fits the system.",
    description:
      "High-pressure, results-driven gameplay. Your manager sets transfer targets and you must deliver players who fit the tactical system.",
    features: [
      "Manager directives \u2014 fulfil specific transfer briefs",
      "System fit analysis \u2014 tactical compatibility scoring",
      "Transfer tracker \u2014 monitor your signings\u2019 performance",
    ],
    keyStrength:
      "Player Judgment \u2014 the best at assessing current ability level",
  },
  {
    name: "Regional Expert",
    tagline: "Know every pitch, every prospect.",
    description:
      "Deep knowledge of a specific region gives you connections and insights no outsider can match.",
    features: [
      "Regional reputation & territory bonuses",
      "Stronger local contact network",
      "Hidden gem discovery advantage",
    ],
    keyStrength:
      "Balanced skills \u2014 strong generalist with deep regional knowledge",
  },
  {
    name: "Data Scout",
    tagline: "Numbers reveal what eyes miss.",
    description:
      "Query statistical databases, detect anomalies in player data, and make predictions about who\u2019s about to break out.",
    features: [
      "Database queries \u2014 filter players by statistical criteria",
      "Prediction system \u2014 forecast breakouts & declines",
      "Oracle status \u2014 earn prestige through prediction accuracy",
    ],
    keyStrength:
      "Data Literacy \u2014 the best at interpreting statistics and spotting anomalies",
  },
];

export function SpecializationShowcase() {
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <section className="mx-auto max-w-5xl px-6 py-24">
      <ScrollReveal>
        <h2 className="mb-12 text-center text-3xl font-bold text-white sm:text-4xl">
          Four ways to scout.
        </h2>
      </ScrollReveal>
      <div className="grid gap-6 sm:grid-cols-2">
        {specializations.map((spec, i) => {
          const isExpanded = expanded === i;
          return (
            <ScrollReveal key={spec.name} delay={i * 0.1}>
              <motion.button
                onClick={() => setExpanded(isExpanded ? null : i)}
                className={`w-full cursor-pointer rounded-xl border p-6 text-left transition-colors ${
                  isExpanded
                    ? "border-emerald-500/60 bg-emerald-500/5"
                    : "border-zinc-800 bg-zinc-900/30 hover:border-zinc-700"
                }`}
                whileHover={{ scale: 1.02 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
              >
                <h3 className="text-lg font-semibold text-white">
                  {spec.name}
                </h3>
                <p className="mt-1 text-sm text-emerald-400">{spec.tagline}</p>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="overflow-hidden"
                    >
                      <p className="mt-4 text-sm text-zinc-400">
                        {spec.description}
                      </p>
                      <ul className="mt-4 space-y-2">
                        {spec.features.map((f) => (
                          <li
                            key={f}
                            className="flex items-start gap-2 text-sm text-zinc-300"
                          >
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                            {f}
                          </li>
                        ))}
                      </ul>
                      <div className="mt-4 rounded-lg bg-emerald-950/40 px-3 py-2">
                        <p className="text-xs text-emerald-400">
                          <span className="font-semibold">Key strength:</span>{" "}
                          <span className="text-emerald-300">
                            {spec.keyStrength}
                          </span>
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.button>
            </ScrollReveal>
          );
        })}
      </div>
    </section>
  );
}
