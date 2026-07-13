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

  // Preserve the opening discovery reveal as a single emotional beat. Newly
  // earned achievements stay queued and appear once the player reaches the
  // report desk instead of covering the prospect or decision on mobile.
  if (currentScreen === "observation" || currentScreen === "openingDiscovery") {
    return null;
  }

  return <AchievementToast />;
}
