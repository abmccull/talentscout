/**
 * State injection helpers for E2E tests.
 *
 * Provides functions to inject game state directly into the Zustand store
 * via page.evaluate(), bypassing the slow new-game wizard for most tests.
 */

import type { Page } from "@playwright/test";

export interface GameStateOverrides {
  currentWeek?: number;
  currentSeason?: number;
  skillAllocations?: Record<string, number>;
  scout?: Partial<{
    firstName: string;
    lastName: string;
    careerTier: number;
    primarySpecialization: string;
    careerPath: string;
    currentClubId: string | null;
    reputation: number;
    salary: number;
    fatigue: number;
    age: number;
    avatarId: number;
  }>;
  countries?: string[];
  [key: string]: unknown;
}

const DEFAULT_SKILL_ALLOCATIONS: Record<string, Record<string, number>> = {
  youth: {
    technicalEye: 2,
    physicalAssessment: 1,
    psychologicalRead: 1,
    playerJudgment: 1,
    potentialAssessment: 3,
  },
  firstTeam: {
    technicalEye: 1,
    physicalAssessment: 1,
    tacticalUnderstanding: 2,
    playerJudgment: 3,
    potentialAssessment: 1,
  },
  regional: {
    technicalEye: 1,
    psychologicalRead: 1,
    tacticalUnderstanding: 1,
    dataLiteracy: 1,
    playerJudgment: 2,
    potentialAssessment: 2,
  },
  data: {
    technicalEye: 1,
    tacticalUnderstanding: 1,
    dataLiteracy: 4,
    playerJudgment: 1,
    potentialAssessment: 1,
  },
};

export function getDefaultSkillAllocations(
  specialization: string = "youth",
): Record<string, number> {
  return {
    ...(DEFAULT_SKILL_ALLOCATIONS[specialization] ?? DEFAULT_SKILL_ALLOCATIONS.youth),
  };
}

export async function dismissTutorials(page: Page): Promise<void> {
  await page.evaluate(() => {
    const tutorialStore = (window as any).__TUTORIAL_STORE__;
    if (tutorialStore) {
      tutorialStore.getState().dismissForever();
    }

    try {
      const key = "talentscout_tutorial";
      const existing = JSON.parse(localStorage.getItem(key) || "{}");
      existing.dismissed = true;
      localStorage.setItem(key, JSON.stringify(existing));
    } catch {}
  });

  // Zustand updates synchronously, but React removes the rendered mentor card
  // on the following commit. Do not race the next gameplay click against that
  // still-mounted pointer-intercepting dialog.
  await page
    .locator('[role="dialog"][aria-label^="Mentor:"]')
    .waitFor({ state: "hidden", timeout: 2_000 });
}

export async function injectGameState(
  page: Page,
  overrides: GameStateOverrides = {},
): Promise<void> {
  await dismissTutorials(page);

  const specialization = overrides.scout?.primarySpecialization ?? "youth";
  const skillAllocations =
    overrides.skillAllocations ?? getDefaultSkillAllocations(specialization);

  await page.evaluate(
    async ({ overrides, skillAllocations }) => {
      const store = (window as any).__GAME_STORE__;
      if (!store) {
        throw new Error("__GAME_STORE__ not found on window - is the dev server running?");
      }

      await store.getState().startNewGame({
        scoutFirstName: overrides.scout?.firstName ?? "Test",
        scoutLastName: overrides.scout?.lastName ?? "Scout",
        scoutAge: overrides.scout?.age ?? 28,
        specialization: overrides.scout?.primarySpecialization ?? "youth",
        difficulty: "normal",
        worldSeed: "e2e-seed-42",
        selectedCountries: overrides.countries ?? ["england"],
        nationality: "English",
        avatarId: overrides.scout?.avatarId ?? 1,
        skillAllocations,
        openingMode: "desk",
      });

      const currentState = store.getState().gameState;
      if (!currentState) {
        throw new Error("Game state is null after startNewGame");
      }

      const patchedState = { ...currentState };

      if (overrides.currentWeek !== undefined) {
        patchedState.currentWeek = overrides.currentWeek;
      }
      if (overrides.currentSeason !== undefined) {
        patchedState.currentSeason = overrides.currentSeason;
      }
      if (overrides.scout) {
        patchedState.scout = { ...patchedState.scout };
        if (overrides.scout.careerTier !== undefined) {
          patchedState.scout.careerTier = overrides.scout.careerTier;
        }
        if (overrides.scout.reputation !== undefined) {
          patchedState.scout.reputation = overrides.scout.reputation;
        }
        if (overrides.scout.fatigue !== undefined) {
          patchedState.scout.fatigue = overrides.scout.fatigue;
        }
        if (overrides.scout.careerPath !== undefined) {
          patchedState.scout.careerPath = overrides.scout.careerPath;
        }
        if (overrides.scout.currentClubId !== undefined) {
          patchedState.scout.currentClubId = overrides.scout.currentClubId;
        }
        if (overrides.scout.salary !== undefined) {
          patchedState.scout.salary = overrides.scout.salary;
        }
      }

      store.getState().loadGame(patchedState);
    },
    { overrides, skillAllocations },
  );

  await dismissTutorials(page);
}

export async function injectLateGameState(
  page: Page,
  specialization: string = "youth",
): Promise<void> {
  await injectGameState(page, {
    // Keep the fixture internally coherent. This helper unlocks late-career
    // surfaces; it does not fabricate a completed season. Patching a fresh
    // Season 1 world to Season 2 previously caused save retention to prune its
    // fixtures and made the next advance synthesize an orphaned rollover.
    currentWeek: 20,
    currentSeason: 1,
    countries: ["england", "spain", "germany"],
    scout: {
      firstName: "Test",
      lastName: "Scout",
      careerTier: 4,
      primarySpecialization: specialization,
      careerPath: "independent",
      reputation: 80,
      fatigue: 20,
    },
  });
}

export async function injectMidGameState(
  page: Page,
  specialization: string = "youth",
): Promise<void> {
  await injectGameState(page, {
    currentWeek: 20,
    currentSeason: 1,
    countries: ["england"],
    scout: {
      firstName: "Test",
      lastName: "Scout",
      careerTier: 2,
      primarySpecialization: specialization,
      careerPath: "club",
      reputation: 40,
      fatigue: 30,
    },
  });
}

export async function navigateToGame(page: Page): Promise<void> {
  await page.goto("/play", { timeout: 60_000, waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => (window as any).__GAME_STORE__ !== undefined, {
    timeout: 60_000,
  });
}

export async function getCurrentScreen(page: Page): Promise<string> {
  return page.evaluate(() => {
    const store = (window as any).__GAME_STORE__;
    return store?.getState()?.currentScreen ?? "unknown";
  });
}

export async function setScreen(page: Page, screen: string): Promise<void> {
  await page.evaluate((screenName) => {
    const store = (window as any).__GAME_STORE__;
    store?.getState()?.setScreen(screenName);
  }, screen);
  await page.waitForTimeout(200);
}

export async function getGameStateValue(page: Page, path: string): Promise<unknown> {
  return page.evaluate((statePath) => {
    const store = (window as any).__GAME_STORE__;
    const state = store?.getState()?.gameState;
    if (!state) return undefined;
    return statePath.split(".").reduce((obj: any, key: string) => obj?.[key], state);
  }, path);
}
