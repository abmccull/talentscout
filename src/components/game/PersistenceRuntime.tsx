"use client";

import { useEffect } from "react";
import { useGameStore } from "@/stores/gameStore";

/**
 * Flushes the in-memory career to the autosave slot when the window hides
 * or the packaged app is closing. Electron close fires pagehide on the
 * renderer; main-process before-quit then waits for game:notifySaveFlushed.
 */
export function PersistenceRuntime() {
  useEffect(() => {
    let inFlight: Promise<void> | null = null;

    const flush = (): Promise<void> => {
      if (inFlight) return inFlight;
      const { gameState, flushGameplaySave } = useGameStore.getState();
      if (!gameState) return Promise.resolve();
      inFlight = flushGameplaySave().finally(() => {
        inFlight = null;
      });
      return inFlight;
    };

    const onPageHide = () => {
      void flush();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") void flush();
    };

    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibility);

    const gameApi = window.electronAPI?.game;
    const unsubscribeFlushRequest = gameApi?.onFlushSaveRequest?.(() => {
      void flush()
        .then(() => gameApi.notifySaveFlushed?.())
        .catch((error) => {
          console.warn("Quit flush failed:", error);
        });
    });

    return () => {
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibility);
      unsubscribeFlushRequest?.();
    };
  }, []);

  return null;
}
