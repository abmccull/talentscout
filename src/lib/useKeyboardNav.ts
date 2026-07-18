"use client";

import { useEffect } from "react";
import { useGameStore, type GameScreen } from "@/stores/gameStore";
import { useTutorialStore } from "@/stores/tutorialStore";

const KEY_TO_SCREEN: Record<string, GameScreen[]> = {
  "1": ["dashboard"],
  "2": ["calendar"],
  "3": ["youthScouting", "playerDatabase"],
  "4": ["reportHistory"],
  "5": ["internationalView"],
  "6": ["career"],
};

const NON_GAME_SCREENS = new Set<GameScreen>([
  "mainMenu",
  "newGame",
  "scenarioSelect",
  "hallOfFame",
  "demoEnd",
]);

const ESCAPE_TO_DASHBOARD_SCREENS = new Set<GameScreen>([
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
  "handbook",
  "futureRoadmap",
  "equipment",
  "agency",
  "training",
  "rivals",
  "performance",
  "achievements",
  "reportComparison",
  "freeAgents",
  "seasonAwards",
  "negotiation",
  "weekSimulation",
  "matchSummary",
]);

function isTypingTarget(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  if ((el as HTMLElement).isContentEditable) return true;
  return false;
}

function hasOpenModal(): boolean {
  return document.querySelector('[role="dialog"][aria-modal="true"]') !== null;
}

function isVisibleShortcutTarget(screen: GameScreen): boolean {
  const target = document.querySelector<HTMLElement>(
    `[data-tutorial-id="nav-${screen}"]`,
  );
  if (!target) return false;
  if (target.hasAttribute("disabled")) return false;
  if (target.getAttribute("aria-disabled") === "true") return false;
  return true;
}

function getShortcutTarget(key: string): GameScreen | null {
  const candidates = KEY_TO_SCREEN[key];
  if (!candidates) return null;
  return candidates.find((screen) => isVisibleShortcutTarget(screen)) ?? null;
}

let onFeedbackOpen: (() => void) | null = null;

export function setFeedbackOpenHandler(handler: (() => void) | null): void {
  onFeedbackOpen = handler;
}

export function useKeyboardNav(): void {
  const setScreen = useGameStore((s) => s.setScreen);
  const currentScreen = useGameStore((s) => s.currentScreen);
  const advancePhase = useGameStore((s) => s.advancePhase);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (isTypingTarget(document.activeElement)) return;
      if (hasOpenModal()) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        if (
          !NON_GAME_SCREENS.has(currentScreen) &&
          isVisibleShortcutTarget("settings")
        ) {
          e.preventDefault();
          setScreen("settings");
        }
        return;
      }

      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const key = e.key;

      if (key === "Escape") {
        if (useTutorialStore.getState().guidedSessionActive) {
          e.preventDefault();
          return;
        }
        if (ESCAPE_TO_DASHBOARD_SCREENS.has(currentScreen)) {
          e.preventDefault();
          setScreen("dashboard");
        }
        return;
      }

      const targetScreen = getShortcutTarget(key);
      if (targetScreen) {
        if (!NON_GAME_SCREENS.has(currentScreen)) {
          e.preventDefault();
          setScreen(targetScreen);
        }
        return;
      }

      if (key === " " || key === "Spacebar") {
        if (currentScreen === "calendar") {
          const advanceButton = document.querySelector<HTMLButtonElement>(
            '[data-tutorial-id="advance-week"]',
          );
          if (advanceButton && !advanceButton.disabled) {
            e.preventDefault();
            advanceButton.click();
          }
        } else if (currentScreen === "match") {
          e.preventDefault();
          advancePhase();
        }
        return;
      }

      if (key === "?") {
        if (
          !NON_GAME_SCREENS.has(currentScreen) &&
          isVisibleShortcutTarget("settings")
        ) {
          e.preventDefault();
          setScreen("settings");
        }
        return;
      }

      if (key === "F1") {
        if (useTutorialStore.getState().guidedSessionActive) {
          e.preventDefault();
          return;
        }
        if (!NON_GAME_SCREENS.has(currentScreen) && onFeedbackOpen) {
          e.preventDefault();
          onFeedbackOpen();
        }
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [setScreen, currentScreen, advancePhase]);
}
