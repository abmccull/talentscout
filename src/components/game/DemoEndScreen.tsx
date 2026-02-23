"use client";

import { useGameStore } from "@/stores/gameStore";
import { Button } from "@/components/ui/button";

/**
 * Shown when the player reaches the demo season limit.
 * Promotes the full game and provides navigation options.
 */
export function DemoEndScreen() {
  const setScreen = useGameStore((s) => s.setScreen);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-b from-[#0a0a0a] to-[#0f1a0f] px-6">
      <div className="w-full max-w-lg text-center">
        <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
          <svg
            className="h-8 w-8 text-emerald-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.563.563 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
            />
          </svg>
        </div>

        <h1 className="mb-3 text-3xl font-bold text-white">
          Thanks for playing the demo!
        </h1>
        <p className="mb-8 text-zinc-400">
          You&apos;ve completed 2 seasons as a Youth Scout. The full game
          has much more to offer:
        </p>

        <div className="mb-8 grid grid-cols-2 gap-3 text-left">
          {[
            "4 specializations (Youth, First Team, Regional, Data)",
            "10 unique scenarios with custom objectives",
            "Unlimited seasons of career progression",
            "5-tier career ladder from amateur to elite",
            "45 achievements to unlock",
            "Multi-season storylines and rivalries",
            "Full economics system with agency management",
            "Moddable game data for custom leagues",
          ].map((feature) => (
            <div
              key={feature}
              className="flex items-start gap-2 rounded-lg border border-zinc-800 bg-zinc-900/50 p-3"
            >
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
              <span className="text-sm text-zinc-300">{feature}</span>
            </div>
          ))}
        </div>

        <div className="flex flex-col gap-3">
          <Button
            size="lg"
            className="w-full bg-emerald-600 text-base hover:bg-emerald-500"
            onClick={() => {
              window.open(
                "https://store.steampowered.com/app/talentscout",
                "_blank",
              );
            }}
          >
            Buy on Steam
          </Button>
          <Button
            variant="outline"
            size="lg"
            className="w-full text-base"
            onClick={() => setScreen("mainMenu")}
          >
            Return to Menu
          </Button>
        </div>
      </div>
    </div>
  );
}
