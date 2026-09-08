"use client";

import { useEffect } from "react";
import { AchievementToast } from "@/components/game/AchievementToast";
import { useAchievementStore } from "@/stores/achievementStore";
import { useGameStore } from "@/stores/gameStore";
import { shouldHoldAchievementToasts } from "@/lib/youthFirstHour";

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

  // Preserve the first-hour beat. Unlocks stay queued; the toast waits.
  if (shouldHoldAchievementToasts(currentScreen, gameState)) {
    return null;
  }

  return <AchievementToast />;
}
