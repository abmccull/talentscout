"use client";

import { useEffect } from "react";
import { useGameStore } from "@/stores/gameStore";

/**
 * Flushes the in-memory career to the autosave slot when the window hides
 * or the packaged app is closing. Electron close fires pagehide on the
 * renderer; there is no game state in the main-process before-quit hook.
 */
export function PersistenceRuntime() {
  const hasCareer = useGameStore((state) => state.gameState !== null);
  const saveGame = useGameStore((state) => state.saveGame);

  useEffect(() => {
    if (!hasCareer) return;

    const flush = () => {
      saveGame();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush();
    };

    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [hasCareer, saveGame]);

  return null;
}
