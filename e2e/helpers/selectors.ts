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

/** Generate the compact mobile workspace-navigation selector. */
export function mobileNavItem(screen: string): string {
  return `[data-tutorial-id="mobile-nav-${screen}"]`;
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

/**
 * Always visible at week 1, tier 1 (in ALWAYS_VISIBLE set + inbox returns true).
 * Note: playerDatabase visible for non-youth, youthScouting for youth.
 */
export const ALWAYS_VISIBLE_SCREENS = [
  "dashboard",
  "calendar",
  "achievements",
  "handbook",
  "settings",
  "inbox",
] as const;

/** Visible after week 2 (fixtureBrowser, career, performance). */
export const WEEK2_SCREENS = [
  "fixtureBrowser",
  "career",
  "performance",
] as const;

/** Visible after week 3 (finances, reportHistory). */
export const WEEK3_SCREENS = [
  "finances",
  "reportHistory",
] as const;

/** Visible at tier 2+ OR week >= 6 (equipment, training). */
export const TIER2_EQUIPMENT_SCREENS = ["equipment", "training"] as const;

/** Visible at tier 2+ (network needs tier 2 OR week >= 4, rivals needs tier 2). */
export const TIER2_SCREENS = ["network", "rivals"] as const;

/** Visible at tier 3+. */
export const TIER3_SCREENS = ["discoveries", "analytics", "alumniDashboard"] as const;

/** Visible at tier 3+ OR week >= 12. */
export const TIER3_AGENCY = ["agency"] as const;

/** Visible at tier 4+. */
export const TIER4_SCREENS = ["npcManagement"] as const;

/** Visible after season 1 (effectiveWeek > 52). */
export const SEASON2_SCREENS = ["leaderboard"] as const;

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

// ─── Calendar Selectors ─────────────────────────────────────────────────────

export const CALENDAR_SELECTORS = {
  calendarGrid: '[data-tutorial-id="calendar-grid"]',
  daySlot: '[data-tutorial-id="day-slot"]',
  activityCard: '[data-tutorial-id="activity-card"]',
  advanceWeekButton: 'button:has-text("Advance"), button:has-text("End Week"), button:has-text("Next Week"), button:has-text("Advance Week")',
  autoScheduleButton: 'button:has-text("Auto"), button:has-text("Quick Scout")',
} as const;

// ─── Report Selectors ───────────────────────────────────────────────────────

export const REPORT_SELECTORS = {
  reportList: '[data-tutorial-id="report-list"]',
  reportCard: '[data-tutorial-id="report-card"]',
  listForSaleButton: 'button:has-text("List"), button:has-text("Sell")',
  priceInput: 'input[type="number"]',
  convictionSelect: '[data-tutorial-id="conviction-level"]',
  submitButton: 'button:has-text("Submit")',
} as const;

// ─── Network Selectors ──────────────────────────────────────────────────────

export const NETWORK_SELECTORS = {
  contactList: '[data-tutorial-id="contact-list"]',
  contactCard: '[data-tutorial-id="contact-card"]',
  intelSection: '[data-tutorial-id="intel-section"]',
  relationshipBadge: '[data-tutorial-id="relationship-badge"]',
} as const;

// ─── Common UI Selectors ─────────────────────────────────────────────────────

export const SELECTORS = {
  // Main Menu
  newGameButton: 'button:has-text("New Game"), button:has-text("Start Youth Career")',
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
