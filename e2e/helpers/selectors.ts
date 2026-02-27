/**
 * Centralized selector constants for E2E tests.
 *
 * Uses data-tutorial-id attributes from the game's tutorial system
 * so tests are resilient to styling/class changes.
 */

// ─── Sidebar Navigation ─────────────────────────────────────────────────────

export const SIDEBAR_NAV = '[data-tutorial-id="sidebar-nav"]';

/** Generate a nav-item selector for the given screen name. */
export function navItem(screen: string): string {
  return `[data-tutorial-id="nav-${screen}"]`;
}

// ─── Screen Name → Nav Selector Map ─────────────────────────────────────────

export const NAV_SCREENS = {
  // Scouting section
  dashboard: "dashboard",
  calendar: "calendar",
  playerDatabase: "playerDatabase",
  youthScouting: "youthScouting",
  fixtureBrowser: "fixtureBrowser",
  reportHistory: "reportHistory",

  // Career section
  career: "career",
  performance: "performance",
  equipment: "equipment",
  training: "training",
  finances: "finances",
  agency: "agency",

  // World section
  discoveries: "discoveries",
  network: "network",
  rivals: "rivals",
  npcManagement: "npcManagement",
  internationalView: "internationalView",
  alumniDashboard: "alumniDashboard",
  analytics: "analytics",
  leaderboard: "leaderboard",

  // Utility section
  inbox: "inbox",
  achievements: "achievements",
  handbook: "handbook",
  settings: "settings",
} as const;

// ─── Visibility Tiers ────────────────────────────────────────────────────────

/** Always visible regardless of tier/week. */
export const ALWAYS_VISIBLE_SCREENS = [
  "dashboard",
  "calendar",
  "fixtureBrowser",
  "finances",
  "achievements",
  "handbook",
  "settings",
  "agency",
  "leaderboard",
] as const;

/** Visible after week 3. */
export const WEEK3_SCREENS = [
  "career",
  "performance",
  "equipment",
  "training",
  "inbox",
  "reportHistory",
] as const;

/** Visible at tier 2+. */
export const TIER2_SCREENS = ["network", "rivals"] as const;

/** Visible at tier 3+. */
export const TIER3_SCREENS = ["discoveries", "analytics", "alumniDashboard"] as const;

/** Visible at tier 4+. */
export const TIER4_SCREENS = ["npcManagement"] as const;

// ─── All GameScreens (from gameStore.ts type) ────────────────────────────────

export const ALL_GAME_SCREENS = [
  "dashboard",
  "calendar",
  "playerDatabase",
  "fixtureBrowser",
  "reportHistory",
  "career",
  "performance",
  "equipment",
  "training",
  "finances",
  "agency",
  "youthScouting",
  "discoveries",
  "network",
  "rivals",
  "npcManagement",
  "internationalView",
  "alumniDashboard",
  "analytics",
  "leaderboard",
  "inbox",
  "achievements",
  "handbook",
  "settings",
] as const;

// ─── Keyboard Shortcuts ──────────────────────────────────────────────────────

export const KEY_TO_SCREEN: Record<string, string> = {
  "1": "dashboard",
  "2": "calendar",
  "3": "playerDatabase",
  "4": "reportHistory",
  "5": "career",
  "6": "inbox",
  "7": "network",
  "8": "settings",
};

// ─── Specializations ─────────────────────────────────────────────────────────

export const SPECIALIZATIONS = ["youth", "firstTeam", "regional", "data"] as const;

// ─── Common UI Selectors ─────────────────────────────────────────────────────

export const SELECTORS = {
  // Main Menu
  newGameButton: 'button:has-text("New Game")',
  continueButton: 'button:has-text("Continue")',
  loadGameButton: 'button:has-text("Load Game")',

  // New Game Wizard
  wizardContinueButton: 'button:has-text("Continue")',
  wizardBackButton: 'button:has-text("Back")',
  wizardBeginButton: 'button:has-text("Begin Career")',
  backToMenu: 'button:has-text("Back to Menu")',
  firstNameInput: 'input#scout-first-name, input[placeholder="Alex"]',
  lastNameInput: 'input#scout-last-name, input[placeholder="Morgan"]',

  // Calendar / Week Simulation
  advanceWeekButton: 'button:has-text("Advance"), button:has-text("End Week"), button:has-text("Next Week")',
  skipToResultsButton: 'button:has-text("Skip to Results")',
  nextDayButton: 'button:has-text("Next Day")',

  // Match
  advancePhaseButton: 'button:has-text("Next Phase")',

  // Generic
  closeButton: 'button[aria-label="Close"]',
  modalBackdrop: '[aria-hidden="true"]',
} as const;
