"use client";

import Link from "next/link";
import { ScrollReveal } from "./ScrollReveal";

const STEAM_URL = "#"; // TODO: Replace with actual Steam store URL

export function FinalCTA() {
  return (
    <section className="relative px-6 py-32">
      {/* Emerald glow */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 50% 50% at 50% 60%, rgb(16 185 129 / 0.06) 0%, transparent 70%)",
        }}
      />

      <div className="relative z-10 mx-auto max-w-2xl text-center">
        <ScrollReveal>
          <h2 className="text-3xl font-bold text-white sm:text-4xl md:text-5xl">
            The scout&rsquo;s eye sees what others miss.
          </h2>
          <p className="mt-4 text-lg text-zinc-400">
            Start your career. $29.99 on Steam.
          </p>
        </ScrollReveal>

        <ScrollReveal delay={0.2}>
          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <a
              href={STEAM_URL}
              className="inline-flex h-14 items-center rounded-lg bg-emerald-600 px-10 text-lg font-semibold text-white transition hover:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a]"
            >
              Wishlist on Steam
            </a>
            <Link
              href="/play"
              className="inline-flex h-14 items-center rounded-lg border border-zinc-700 px-10 text-lg font-semibold text-zinc-300 transition hover:border-zinc-500 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0a0a]"
            >
              Try the Free Demo
            </Link>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
