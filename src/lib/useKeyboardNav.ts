/**
 * useKeyboardNav — global keyboard shortcut hook.
 *
 * Registers document-level keydown listeners that fire only when the user
 * is not typing in an input, textarea, or contenteditable element.
 *
 * Shortcuts:
 *   Escape     — go back to dashboard (or close active overlay when one exists)
 *   1–8        — quick-navigate to the corresponding sidebar screen
 *   Space      — advance week on calendar screen; advance phase on match screen
 *   ?          — open settings screen (handbook placeholder)
 *
 * Call this hook exactly once, at the root page component level.
 */

"use client";

import { useEffect } from "react";
import { useGameStore, type GameScreen } from "@/stores/gameStore";

// ---------------------------------------------------------------------------
// Screen map  (number key → screen)
// ---------------------------------------------------------------------------

const KEY_TO_SCREEN: Record<string, GameScreen> = {
  "1": "dashboard",
  "2": "calendar",
  "3": "playerDatabase",
  "4": "reportHistory",
  "5": "career",
  "6": "inbox",
  "7": "network",
  "8": "settings",
};

// ---------------------------------------------------------------------------
// Helper — returns true when the focused element is an editable control
// ---------------------------------------------------------------------------

function isTypingTarget(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useKeyboardNav(): void {
  // Subscribe to only the slice we need to avoid unnecessary re-renders
  const setScreen = useGameStore((s) => s.setScreen);
  const currentScreen = useGameStore((s) => s.currentScreen);
  const requestWeekAdvance = useGameStore((s) => s.requestWeekAdvance);
  const advancePhase = useGameStore((s) => s.advancePhase);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      // Never fire shortcuts while the user is typing
      if (isTypingTarget(document.activeElement)) return;

      // Never fire when modifier keys are held (avoid browser/OS shortcuts)
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const key = e.key;

      // ── Escape ────────────────────────────────────────────────────────────
      // Return to dashboard from any in-game screen
      if (key === "Escape") {
        const inGameScreens: GameScreen[] = [
          "calendar",
          "playerDatabase",
          "reportHistory",
          "career",
          "inbox",
          "network",
          "settings",
          "playerProfile",
          "reportWriter",
          "npcManagement",
          "internationalView",
          "discoveries",
          "leaderboard",
          "analytics",
          "fixtureBrowser",
          "youthScouting",
          "alumniDashboard",
          "finances",
        ];
        if (inGameScreens.includes(currentScreen)) {
          e.preventDefault();
          setScreen("dashboard");
        }
        return;
      }

      // ── Number keys 1–8: jump to screen ───────────────────────────────────
      if (KEY_TO_SCREEN[key]) {
        // Only activate when already in-game (not on main menu / new game)
        const noGameScreens: GameScreen[] = ["mainMenu", "newGame"];
        if (!noGameScreens.includes(currentScreen)) {
          e.preventDefault();
          setScreen(KEY_TO_SCREEN[key]);
        }
        return;
      }

      // ── Space: advance week on calendar / advance phase on match ──────────
      if (key === " " || key === "Spacebar") {
        if (currentScreen === "calendar") {
          e.preventDefault();
          requestWeekAdvance();
        } else if (currentScreen === "match") {
          e.preventDefault();
          advancePhase();
        }
        return;
      }

      // ── ? — open settings ──────────────────────────────────────────────────
      if (key === "?") {
        const noGameScreens: GameScreen[] = ["mainMenu", "newGame"];
        if (!noGameScreens.includes(currentScreen)) {
          e.preventDefault();
          setScreen("settings");
        }
        return;
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [setScreen, currentScreen, requestWeekAdvance, advancePhase]);
}
