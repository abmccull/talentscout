"use client";

import { useEffect } from "react";
import { useGameStore } from "@/stores/gameStore";

/**
 * Flushes the in-memory career to the autosave slot when the window hides
 * or the packaged app requests a save before closing. The desktop shell keeps
 * the window open until the matching save succeeds or the player discards it.
 */
export function PersistenceRuntime() {
  useEffect(() => {
    let latestQuitRequest: number | null = null;
    const flush = async (): Promise<void> => {
      const { gameState, flushGameplaySave } = useGameStore.getState();
      if (!gameState) return;
      // The store serializes writes and captures the latest career for each
      // request, including a retry while an earlier save is still running.
      await flushGameplaySave();
    };

    const flushInBackground = () => {
      void flush().catch((error) => {
        console.warn("Background career save failed:", error);
      });
    };

    const onPageHide = () => {
      flushInBackground();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushInBackground();
    };

    window.addEventListener("pagehide", onPageHide);
    document.addEventListener("visibilitychange", onVisibility);

    const gameApi = window.electronAPI?.game;
    const unsubscribeFlushRequest = gameApi?.onFlushSaveRequest?.((requestId) => {
      latestQuitRequest = requestId;
      void (async () => {
        let status: "saved" | "failed" = "saved";
        try {
          while (latestQuitRequest === requestId) {
            const state = useGameStore.getState();
            if (!state.gameState) break;
            // flushGameplaySave captures synchronously and publishes its saved
            // snapshot before awaiting I/O. Compare against that reference so
            // its own lastSaved update does not trigger an endless re-save.
            const write = state.flushGameplaySave();
            const captured = useGameStore.getState();
            await write;
            if (latestQuitRequest !== requestId) return;
            const current = useGameStore.getState();
            if (
              current.gameState === captured.gameState &&
              current.activeSession === captured.activeSession
            ) break;
            // The window remains usable while saving. Persist any newer edit,
            // observation session, or career before acknowledging this quit.
          }
        } catch (error) {
          if (latestQuitRequest !== requestId) return;
          status = "failed";
          console.warn("Quit career save failed:", error);
        }
        if (latestQuitRequest !== requestId) return;
        try {
          await gameApi.notifySaveFlushed?.({ requestId, status });
        } catch (error) {
          console.warn("Could not report quit save result:", error);
        }
      })();
    });

    return () => {
      latestQuitRequest = null;
      window.removeEventListener("pagehide", onPageHide);
      document.removeEventListener("visibilitychange", onVisibility);
      unsubscribeFlushRequest?.();
    };
  }, []);

  return null;
}
