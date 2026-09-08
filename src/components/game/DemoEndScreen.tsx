"use client";

import { useGameStore } from "@/stores/gameStore";
import { Button } from "@/components/ui/button";
import { ArrowUpRight, ChevronDown } from "lucide-react";

/**
 * Shown when the player reaches the demo season limit.
 * Describes the currently purchasable Early Access scope without promising
 * preserved full-game systems that are not available yet.
 */
export function DemoEndScreen() {
  const setScreen = useGameStore((s) => s.setScreen);

  return (
    <main className="flex min-h-screen items-center bg-[var(--background)] px-5 py-10 text-[var(--foreground)] sm:px-10 sm:py-16">
      <div className="mx-auto w-full max-w-2xl">
        <p className="dossier-eyebrow">Youth Scout · Two seasons complete</p>
        <h1 className="mt-4 max-w-xl font-editorial text-4xl leading-tight tracking-tight sm:text-5xl">
          You&apos;ve completed the demo
        </h1>
        <p className="mt-5 max-w-xl text-base leading-7 text-[var(--muted-foreground)]">
          You&apos;ve reached the two-season demo limit. Continue in Youth Scout
          Early Access with unlimited seasons and the scouting systems
          available today.
        </p>

        <div className="mt-7 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <Button
            size="lg"
            className="gap-2"
            onClick={() => {
              window.open(
                "https://store.steampowered.com/app/4455570",
                "_blank",
                "noopener,noreferrer",
              );
            }}
          >
            Get Youth Scout Early Access
            <ArrowUpRight aria-hidden="true" size={18} />
          </Button>
          <Button
            variant="outline"
            size="lg"
            onClick={() => setScreen("mainMenu")}
          >
            Return to Menu
          </Button>
        </div>
        <p className="mt-3 text-xs leading-5 text-[var(--muted-foreground)]">
          Opens the Steam store in a new window.
        </p>

        <details className="group mt-9 border-y border-[var(--border)]">
          <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 py-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--ring)] [&::-webkit-details-marker]:hidden">
            <h2 className="font-editorial text-xl sm:text-2xl">Included in Early Access</h2>
            <ChevronDown aria-hidden="true" size={18} className="shrink-0 text-[var(--muted-foreground)] transition-transform group-open:rotate-180 motion-reduce:transition-none" />
          </summary>
          <ul className="list-disc space-y-3 pb-6 pl-5 pt-2 text-sm leading-6 text-[var(--muted-foreground)] marker:text-[var(--primary)]">
            {[
              "A Youth Scout career from local observer to recruitment leader",
              "Unlimited seasons of career progression",
              "Live, video, training, and tournament observation contexts",
              "Evidence-led reports, club pitches, and youth placements",
              "Rival scouts competing for prospects and influence",
              "Regional knowledge, travel, and international assignments",
              "Career setbacks, recovery, and leadership responsibilities",
              "Alumni tracking and long-term recommendation accountability",
            ].map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
        </details>
      </div>
    </main>
  );
}
