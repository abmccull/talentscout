import { describe, expect, it } from "vitest";
import {
  YOUTH_EARLY_ACCESS_SCREEN_SCOPE,
  getYouthEarlyAccessNavigationEntries,
  getYouthEarlyAccessWorkspaceParent,
  isYouthEarlyAccessScreenAllowed,
  resolveYouthEarlyAccessScreen,
} from "@/stores/gameScreenScope";
import type { GameScreen } from "@/stores/gameStoreTypes";

describe("Youth Early Access screen scope", () => {
  it("publishes exactly the six permanent workspaces in product order", () => {
    expect(getYouthEarlyAccessNavigationEntries("workspace")).toEqual([
      { screen: "dashboard", label: "Desk" },
      { screen: "calendar", label: "Planner" },
      { screen: "youthScouting", label: "Prospects" },
      { screen: "reportHistory", label: "Reports" },
      { screen: "internationalView", label: "World" },
      { screen: "career", label: "Career" },
    ]);
    expect(getYouthEarlyAccessNavigationEntries("support")).toEqual([
      { screen: "handbook", label: "Handbook" },
      { screen: "settings", label: "Settings" },
    ]);
  });

  it("keeps real scouting and late-career drill-downs in their parent workspaces", () => {
    const expectedParents: Partial<Record<GameScreen, GameScreen>> = {
      observation: "calendar",
      openingDiscovery: "calendar",
      weekSimulation: "calendar",
      playerProfile: "youthScouting",
      reportWriter: "reportHistory",
      reportComparison: "reportHistory",
      network: "career",
      npcManagement: "career",
      equipment: "career",
      training: "career",
      agency: "career",
      rivals: "career",
      alumniDashboard: "career",
      seasonAwards: "career",
    };

    for (const [screen, parent] of Object.entries(expectedParents)) {
      expect(isYouthEarlyAccessScreenAllowed(screen as GameScreen)).toBe(true);
      expect(getYouthEarlyAccessWorkspaceParent(screen as GameScreen)).toBe(parent);
      expect(resolveYouthEarlyAccessScreen(screen as GameScreen, true)).toBe(screen);
    }
  });

  it("redirects preserved full-game screens to an in-scope workspace", () => {
    const expectedFallbacks: Partial<Record<GameScreen, GameScreen>> = {
      match: "calendar",
      matchSummary: "calendar",
      fixtureBrowser: "calendar",
      playerDatabase: "youthScouting",
      scenarioSelect: "mainMenu",
      analytics: "career",
      leaderboard: "career",
      negotiation: "dashboard",
      freeAgents: "dashboard",
    };

    for (const [screen, fallback] of Object.entries(expectedFallbacks)) {
      expect(isYouthEarlyAccessScreenAllowed(screen as GameScreen)).toBe(false);
      expect(resolveYouthEarlyAccessScreen(screen as GameScreen, true)).toBe(fallback);
    }
  });

  it("never restores a career-only screen without an active career", () => {
    expect(resolveYouthEarlyAccessScreen("mainMenu", false)).toBe("mainMenu");
    expect(resolveYouthEarlyAccessScreen("newGame", false)).toBe("newGame");
    expect(resolveYouthEarlyAccessScreen("futureRoadmap", false)).toBe("futureRoadmap");
    expect(resolveYouthEarlyAccessScreen("playerProfile", false)).toBe("mainMenu");
    expect(resolveYouthEarlyAccessScreen("career", false)).toBe("mainMenu");
  });

  it("classifies every declared screen through the exhaustive registry", () => {
    for (const [screen, scope] of Object.entries(YOUTH_EARLY_ACCESS_SCREEN_SCOPE)) {
      expect(screen.length).toBeGreaterThan(0);
      expect(["entry", "workspace", "detail", "support", "future"]).toContain(scope.access);
      if (scope.access === "future") {
        expect("fallback" in scope).toBe(true);
      }
    }
  });
});
