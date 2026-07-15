import { describe, expect, it } from "vitest";
import { ACHIEVEMENTS } from "@/lib/achievements";
import {
  HINT_DEFINITIONS,
  evaluateHints,
  isHintDefinitionAvailableForBuild,
  type HintEvalContext,
} from "@/components/game/tutorial/hintConditions";
import {
  YOUTH_EARLY_ACCESS_HIDDEN_WIKI_ARTICLE_SLUGS,
  YOUTH_EARLY_ACCESS_HIDDEN_WIKI_CATEGORY_SLUGS,
} from "@/components/game/wiki/wikiScope";
import {
  YOUTH_EARLY_ACCESS_UNAVAILABLE_ACHIEVEMENT_IDS,
  isAchievementAvailableForBuild,
  isGameScreenAllowedForBuild,
} from "@/stores/gameScreenScope";
import { TOTAL_ACHIEVEMENT_COUNT } from "@/stores/achievementStore";
import { hasBrowsedYouthLoanWorkspace } from "@/stores/actions/weeklyPresentationEffects";
import {
  CAREER_FINANCE_DRILLDOWN,
  CAREER_RECORD_DRILLDOWNS,
} from "@/components/game/career/careerDrilldowns";
import { getYouthEarlyAccessWorkspaceParent } from "@/stores/gameScreenScope";

function hintContext(
  overrides: Partial<HintEvalContext> = {},
): HintEvalContext {
  return {
    currentWeek: 1,
    currentSeason: 1,
    fatigue: 0,
    savings: 10_000,
    hasClub: false,
    observationCount: 0,
    reportCount: 0,
    comparisonCount: 0,
    networkMeetingsHeld: 1,
    unfulfilledDirectiveWeeks: 0,
    scheduledRestDays: 1,
    transferWindowClosingIn: null,
    unsubmittedReportCount: 0,
    specialization: "youth",
    unclaimedPerks: 0,
    emptyEquipmentSlots: 0,
    discoveryCount: 0,
    alumniCount: 0,
    hasCheckedAlumni: true,
    hasCheckedLeaderboard: true,
    npcSlotsAvailable: 0,
    npcHiredCount: 0,
    freeAgentCount: 0,
    hasBrowsedFreeAgents: true,
    loanMarketActive: false,
    hasBrowsedLoans: true,
    careerTier: 1,
    ...overrides,
  };
}

describe("Youth Early Access content scope", () => {
  it("keeps achievement evaluation and totals on the same catalog", () => {
    const available = ACHIEVEMENTS.filter((achievement) =>
      isAchievementAvailableForBuild(achievement.id),
    );

    expect(TOTAL_ACHIEVEMENT_COUNT).toBe(available.length);
    expect(YOUTH_EARLY_ACCESS_UNAVAILABLE_ACHIEVEMENT_IDS).toEqual(
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
      ]),
    );
  });

  it("filters unavailable hints before priority selection", () => {
    const hint = evaluateHints(
      hintContext({ currentSeason: 2, hasCheckedLeaderboard: false }),
      new Set(),
    );

    expect(hint).toBeNull();
    for (const definition of HINT_DEFINITIONS.filter(
      isHintDefinitionAvailableForBuild,
    )) {
      if (definition.hint.cta) {
        expect(isGameScreenAllowedForBuild(definition.hint.cta.screen)).toBe(true);
      }
    }
  });

  it("routes comparison and loan guidance to real Youth Scout workspaces", () => {
    const comparison = evaluateHints(
      hintContext({ observationCount: 5, reportCount: 2 }),
      new Set(),
    );
    const loan = evaluateHints(
      hintContext({ loanMarketActive: true, hasBrowsedLoans: false }),
      new Set(),
    );

    expect(comparison?.cta).toEqual({
      label: "Compare Reports",
      screen: "reportHistory",
    });
    expect(loan?.cta).toEqual({
      label: "Review Prospects",
      screen: "youthScouting",
    });
    expect(hasBrowsedYouthLoanWorkspace(new Set(["youthScouting"]))).toBe(true);
    expect(hasBrowsedYouthLoanWorkspace(new Set(["loans"]))).toBe(false);
  });

  it("quarantines future handbook categories and articles", () => {
    expect(YOUTH_EARLY_ACCESS_HIDDEN_WIKI_CATEGORY_SLUGS).toEqual(
      new Set(["match-observation", "match-systems"]),
    );
    expect(YOUTH_EARLY_ACCESS_HIDDEN_WIKI_ARTICLE_SLUGS).toEqual(
      new Set([
        "first-team-scout-spec",
        "regional-expert-spec",
        "data-scout-spec",
        "specialization-depth",
        "specialization-exclusive-activities",
        "phase-matching",
      ]),
    );
  });

  it("keeps Career records and detailed finances durably reachable", () => {
    const drilldowns = [
      ...CAREER_RECORD_DRILLDOWNS,
      CAREER_FINANCE_DRILLDOWN,
    ];

    expect(CAREER_RECORD_DRILLDOWNS.map((item) => item.screen)).toEqual([
      "network",
      "alumniDashboard",
      "performance",
      "achievements",
    ]);
    for (const item of drilldowns) {
      expect(isGameScreenAllowedForBuild(item.screen)).toBe(true);
      expect(getYouthEarlyAccessWorkspaceParent(item.screen)).toBe("career");
    }
  });
});
