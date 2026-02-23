"use client";

import { ScrollReveal } from "./ScrollReveal";

// PLACEHOLDER: Replace these quotes with real testimonials before launch
const quotes = [
  {
    text: "I\u2019ve played Football Manager for 20 years. This fills a gap I didn\u2019t know existed.",
    author: "Placeholder",
  },
  {
    text: "The first game that makes scouting feel like actual scouting.",
    author: "Placeholder",
  },
  {
    text: "I spent 4 hours watching youth tournaments and I regret nothing.",
    author: "Placeholder",
  },
];

export function SocialProof() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-24">
      <ScrollReveal>
        <h2 className="mb-12 text-center text-3xl font-bold text-white sm:text-4xl">
          What players are saying.
        </h2>
      </ScrollReveal>
      <div className="grid gap-6 sm:grid-cols-3">
        {quotes.map((q, i) => (
          <ScrollReveal key={i} delay={i * 0.1}>
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/30 p-6">
              <span className="text-3xl text-emerald-500/60">&ldquo;</span>
              <p className="mt-2 text-sm italic leading-relaxed text-zinc-300">
                {q.text}
              </p>
              <p className="mt-4 text-xs text-zinc-500">
                &mdash; {q.author}
              </p>
            </div>
          </ScrollReveal>
        ))}
      </div>
    </section>
  );
}
