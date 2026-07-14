"use client";

import { useEffect } from "react";
import { AchievementToast } from "@/components/game/AchievementToast";
import { useAchievementStore } from "@/stores/achievementStore";
import { useGameStore } from "@/stores/gameStore";

/**
 * Keeps achievement evaluation and its notification UI out of the main-menu
 * bundle. This runtime is mounted only while a career is active.
 */
export function AchievementRuntime() {
  const gameState = useGameStore((state) => state.gameState);
  const currentScreen = useGameStore((state) => state.currentScreen);
  const checkAndUnlock = useAchievementStore((state) => state.checkAndUnlock);

  useEffect(() => {
    if (gameState) {
      checkAndUnlock(gameState);
    }
  }, [checkAndUnlock, gameState]);

  // Preserve critical scouting decisions as a single emotional beat. Newly
  // earned achievements stay queued instead of covering observation, opening
  // discovery, or a travel dossier on smaller screens.
  if (
    currentScreen === "observation"
    || currentScreen === "openingDiscovery"
    || currentScreen === "internationalView"
  ) {
    return null;
  }

  return <AchievementToast />;
}
