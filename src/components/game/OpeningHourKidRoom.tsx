"use client";

import { GameLayout } from "@/components/game/GameLayout";
import { YouthPortrait } from "@/components/game/YouthPortrait";
import { Button } from "@/components/ui/button";
import type { GameState } from "@/engine/core/types";
import { isYouthOpeningShell } from "@/lib/youthFirstHour";
import { useGameStore } from "@/stores/gameStore";

export function shouldUseOpeningHourKidRoom(state: GameState | null | undefined): boolean {
  return Boolean(state && isYouthOpeningShell(state));
}

export function OpeningHourKidRoom({
  title,
  gameState,
}: {
  title: string;
  gameState: GameState;
}) {
  const setScreen = useGameStore((state) => state.setScreen);
  const selectPlayer = useGameStore((state) => state.selectPlayer);
  const opening = gameState.openingCase;
  const youth = opening ? gameState.unsignedYouth[opening.youthId] : undefined;
  const player = youth?.player;
  const name = player ? `${player.firstName} ${player.lastName}` : "the kid";
  const writeReady = opening?.stage === "report" || opening?.stage === "decision";

  return (
    <GameLayout>
      <section className="relative min-h-screen px-4 py-6 sm:px-8">
        <div className="mx-auto max-w-2xl rounded-sm border border-[color:var(--primary)]/20 bg-[#14110c] p-6 sm:p-8">
          <p className="text-eyebrow font-semibold uppercase tracking-[0.18em] text-[color:var(--primary)]">
            {title}
          </p>
          <div className="mt-5 flex flex-col gap-5 sm:flex-row sm:items-center">
            {player && (
              <YouthPortrait
                playerId={player.id}
                nationality={player.nationality}
                age={player.age}
                size={96}
                alt={name}
              />
            )}
            <div className="min-w-0">
              <h1 className="text-3xl font-bold text-white">{name}</h1>
              <p className="mt-2 text-sm leading-6 text-zinc-300">
                {writeReady
                  ? "Write the name down. The rest of the board opens after this week."
                  : "Watch this kid first. The recruitment board waits until the name is filed."}
              </p>
              <Button
                className="mt-4 min-h-11"
                onClick={() => {
                  if (player) selectPlayer(player.id);
                  setScreen(writeReady ? "reportWriter" : "observation");
                }}
              >
                {writeReady ? "Write the name down" : "Watch the match"}
              </Button>
            </div>
          </div>
        </div>
      </section>
    </GameLayout>
  );
}
