import { IS_YOUTH_EARLY_ACCESS } from "@/lib/demo";
import type { GameScreen } from "./gameStoreTypes";

export type YouthEarlyAccessScreenAccess =
  | "entry"
  | "workspace"
  | "detail"
  | "support"
  | "future";

export type YouthEarlyAccessNavigationGroup = "workspace" | "support";

interface YouthEarlyAccessScreenScope {
  access: YouthEarlyAccessScreenAccess;
  workspaceParent: GameScreen | null;
  /** Support destinations that can be opened before a career exists. */
  availableWithoutCareer?: boolean;
  navigation?: {
    group: YouthEarlyAccessNavigationGroup;
    label: string;
    order: number;
  };
  fallback?: GameScreen;
}

/**
 * The single screen contract for the Youth Scout Early Access build.
 *
 * Every GameScreen is listed deliberately. Workspace screens are permanent
 * navigation destinations, detail screens are valid drill-downs, and future
 * screens remain compiled for full-game builds but cannot be entered by an
 * Early Access career. A future screen always names the in-scope destination
 * that should receive an old link, stale UI state, or direct store mutation.
 */
export const YOUTH_EARLY_ACCESS_SCREEN_SCOPE = {
  mainMenu: { access: "entry", workspaceParent: null },
  newGame: { access: "entry", workspaceParent: null },
  dashboard: {
    access: "workspace",
    workspaceParent: "dashboard",
    navigation: { group: "workspace", label: "Desk", order: 0 },
  },
  calendar: {
    access: "workspace",
    workspaceParent: "calendar",
    navigation: { group: "workspace", label: "Planner", order: 1 },
  },
  match: { access: "future", workspaceParent: null, fallback: "calendar" },
  observation: { access: "detail", workspaceParent: "calendar" },
  openingDiscovery: { access: "detail", workspaceParent: "calendar" },
  matchSummary: { access: "future", workspaceParent: null, fallback: "calendar" },
  playerProfile: { access: "detail", workspaceParent: "youthScouting" },
  playerDatabase: { access: "future", workspaceParent: null, fallback: "youthScouting" },
  reportWriter: { access: "detail", workspaceParent: "reportHistory" },
  reportHistory: {
    access: "workspace",
    workspaceParent: "reportHistory",
    navigation: { group: "workspace", label: "Reports", order: 3 },
  },
  career: {
    access: "workspace",
    workspaceParent: "career",
    navigation: { group: "workspace", label: "Career", order: 5 },
  },
  network: { access: "detail", workspaceParent: "career" },
  settings: {
    access: "support",
    workspaceParent: "settings",
    navigation: { group: "support", label: "Settings", order: 2 },
  },
  inbox: { access: "detail", workspaceParent: "inbox" },
  npcManagement: { access: "detail", workspaceParent: "career" },
  internationalView: {
    access: "workspace",
    workspaceParent: "internationalView",
    navigation: { group: "workspace", label: "World", order: 4 },
  },
  discoveries: { access: "detail", workspaceParent: "career" },
  leaderboard: { access: "future", workspaceParent: null, fallback: "career" },
  analytics: { access: "future", workspaceParent: null, fallback: "career" },
  performance: { access: "detail", workspaceParent: "career" },
  fixtureBrowser: { access: "future", workspaceParent: null, fallback: "calendar" },
  youthScouting: {
    access: "workspace",
    workspaceParent: "youthScouting",
    navigation: { group: "workspace", label: "Prospects", order: 2 },
  },
  alumniDashboard: { access: "detail", workspaceParent: "career" },
  finances: { access: "detail", workspaceParent: "career" },
  handbook: {
    access: "support",
    workspaceParent: "handbook",
    navigation: { group: "support", label: "Handbook", order: 0 },
  },
  futureRoadmap: {
    access: "support",
    workspaceParent: "futureRoadmap",
    availableWithoutCareer: true,
    navigation: { group: "support", label: "Roadmap", order: 1 },
  },
  achievements: { access: "detail", workspaceParent: "career" },
  scenarioSelect: { access: "future", workspaceParent: null, fallback: "mainMenu" },
  hallOfFame: { access: "detail", workspaceParent: "career" },
  demoEnd: { access: "detail", workspaceParent: "career" },
  equipment: { access: "detail", workspaceParent: "career" },
  agency: { access: "detail", workspaceParent: "career" },
  weekSimulation: { access: "detail", workspaceParent: "calendar" },
  training: { access: "detail", workspaceParent: "career" },
  rivals: { access: "detail", workspaceParent: "career" },
  reportComparison: { access: "detail", workspaceParent: "reportHistory" },
  negotiation: { access: "future", workspaceParent: null, fallback: "dashboard" },
  seasonAwards: { access: "detail", workspaceParent: "career" },
  freeAgents: { access: "future", workspaceParent: null, fallback: "dashboard" },
} as const satisfies Record<GameScreen, YouthEarlyAccessScreenScope>;

export interface YouthEarlyAccessNavigationEntry {
  screen: GameScreen;
  label: string;
}

export function getYouthEarlyAccessNavigationEntries(
  group: YouthEarlyAccessNavigationGroup,
): YouthEarlyAccessNavigationEntry[] {
  return (Object.keys(YOUTH_EARLY_ACCESS_SCREEN_SCOPE) as GameScreen[])
    .flatMap((screen) => {
      const scope = YOUTH_EARLY_ACCESS_SCREEN_SCOPE[screen];
      const navigation = "navigation" in scope ? scope.navigation : undefined;
      return navigation?.group === group
        ? [{ screen, label: navigation.label, order: navigation.order }]
        : [];
    })
    .sort((left, right) => left.order - right.order)
    .map(({ screen, label }) => ({ screen, label }));
}

export function isYouthEarlyAccessScreenAllowed(screen: GameScreen): boolean {
  return YOUTH_EARLY_ACCESS_SCREEN_SCOPE[screen].access !== "future";
}

/** Screens that may be targeted by the currently running build. */
export function isGameScreenAllowedForBuild(screen: GameScreen): boolean {
  return !IS_YOUTH_EARLY_ACCESS || isYouthEarlyAccessScreenAllowed(screen);
}

/**
 * Achievement definitions retained for future builds but unavailable in the
 * Youth Scout product. Keep the definitions and existing unlock records so a
 * full-game build can restore them; exclude them from evaluation, progress,
 * notifications, and current-build totals.
 */
export const YOUTH_EARLY_ACCESS_UNAVAILABLE_ACHIEVEMENT_IDS: ReadonlySet<string> =
  new Set([
    "first-match",
    "all-perks-tree",
    "dual-mastery",
    "secondary-spec",
    "matches-25",
    "matches-50",
    "matches-100",
    "against-all-odds",
    "blind-faith",
  ]);

export function isAchievementAvailableForBuild(achievementId: string): boolean {
  return (
    !IS_YOUTH_EARLY_ACCESS ||
    !YOUTH_EARLY_ACCESS_UNAVAILABLE_ACHIEVEMENT_IDS.has(achievementId)
  );
}

export function getYouthEarlyAccessWorkspaceParent(screen: GameScreen): GameScreen {
  const scope = YOUTH_EARLY_ACCESS_SCREEN_SCOPE[screen];
  if (scope.access === "future") {
    const fallback = scope.fallback;
    return YOUTH_EARLY_ACCESS_SCREEN_SCOPE[fallback].workspaceParent ?? fallback;
  }
  return scope.workspaceParent ?? "dashboard";
}

export function resolveYouthEarlyAccessScreen(
  screen: GameScreen,
  hasActiveCareer: boolean,
): GameScreen {
  const scope = YOUTH_EARLY_ACCESS_SCREEN_SCOPE[screen];

  if (!hasActiveCareer) {
    return scope.access === "entry" || "availableWithoutCareer" in scope
      ? screen
      : "mainMenu";
  }

  return scope.access === "future" ? scope.fallback : screen;
}

export function resolveGameScreenForBuild(
  screen: GameScreen,
  hasActiveCareer: boolean,
): GameScreen {
  return IS_YOUTH_EARLY_ACCESS
    ? resolveYouthEarlyAccessScreen(screen, hasActiveCareer)
    : screen;
}
