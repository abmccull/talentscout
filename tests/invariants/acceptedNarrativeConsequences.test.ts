import { describe, expect, it } from "vitest";
import type { Club, GameState, NarrativeEvent } from "@/engine/core/types";
import { generateNarrativeEventOfType } from "@/engine/events";
import { createRNG } from "@/engine/rng";
import { applyAcceptedNarrativeConsequences } from "@/engine/world/acceptedNarrativeConsequences";

function club(id: string): Club {
  return {
    id,
    name: "Northbridge FC",
    shortName: "NFC",
    leagueId: "league",
    reputation: 68,
    budget: 10_000_000,
    scoutingBudget: 500_000,
    scoutingPhilosophy: "marketSmart",
    managerId: "manager-old",
    playerIds: ["player-a"],
    youthAcademyRating: 12,
  };
}

function event(
  type: NarrativeEvent["type"],
  id = `event-${type}`,
): NarrativeEvent {
  return {
    id,
    type,
    week: 12,
    season: 3,
    title: type,
    description: type,
    relatedIds: ["club-a"],
    acknowledged: false,
  };
}

function state(): GameState {
  return {
    seed: "accepted-narrative-consequences-test",
    currentWeek: 12,
    currentSeason: 3,
    narrativeEvents: [],
    clubs: { "club-a": club("club-a") },
    players: {
      "player-a": {
        id: "player-a",
        clubId: "club-a",
        contractClubId: "club-a",
        position: "CM",
        secondaryPositions: [],
        currentAbility: 100,
        age: 24,
      },
    },
    managerProfiles: {
      "club-a": {
        clubId: "club-a",
        managerId: "manager-old",
        managerName: "Alex Morgan",
        preference: "balanced",
        reportInfluence: 0.6,
        preferredFormation: "4-4-2",
      },
    },
    managerDirectives: [],
    reports: {},
    observations: {},
    contacts: {},
    rivalScouts: {},
    countries: [],
    unsignedYouth: {},
    contactIntel: {},
    alumniRecords: [],
    consequenceState: {
      obligations: {},
    },
    scout: {
      id: "scout-a",
      firstName: "Taylor",
      lastName: "Reed",
      currentClubId: "club-a",
      primarySpecialization: "firstTeam",
      careerTier: 3,
      reputation: 55,
    },
  } as unknown as GameState;
}

describe("accepted narrative world consequences", () => {
  it("applies club budget effects exactly once per published event id", () => {
    const original = state();
    const budgetEvent = event("budgetCut", "evt-budget-cut");
    const firstPass = applyAcceptedNarrativeConsequences(original, [
      budgetEvent,
      budgetEvent,
    ]);

    expect(firstPass.appliedBudgetEventIds).toEqual(["evt-budget-cut"]);
    expect(firstPass.state.clubs["club-a"].budget).toBe(9_200_000);
    expect(firstPass.state.clubs["club-a"].scoutingBudget).toBe(400_000);

    const publishedState = {
      ...firstPass.state,
      narrativeEvents: [budgetEvent],
    } as GameState;
    const secondPass = applyAcceptedNarrativeConsequences(publishedState, [
      budgetEvent,
    ]);

    expect(secondPass.appliedBudgetEventIds).toEqual([]);
    expect(secondPass.state.clubs["club-a"].budget).toBe(9_200_000);
    expect(secondPass.state.clubs["club-a"].scoutingBudget).toBe(400_000);
  });

  it("preserves manager-turnover authority while applying financial trouble cuts", () => {
    const original = state();
    const result = applyAcceptedNarrativeConsequences(original, [
      event("managerSacked", "evt-manager"),
      event("clubFinancialTrouble", "evt-finance"),
    ]);

    expect(result.managerTurnovers).toHaveLength(1);
    expect(result.state.managerProfiles["club-a"].managerId).not.toBe("manager-old");
    expect(result.state.clubs["club-a"].managerId).toBe(
      result.state.managerProfiles["club-a"].managerId,
    );
    expect(result.state.clubs["club-a"].budget).toBe(8_000_000);
    expect(result.state.clubs["club-a"].scoutingBudget).toBe(300_000);
  });
});

describe("narrative wording stays truthful to modeled authority", () => {
  it("frames non-modeled industry events as proposals or market chatter", () => {
    const transferRuleChange = generateNarrativeEventOfType(
      createRNG("transfer-rule"),
      state(),
      "transferRuleChange",
    );
    const financialFairPlayImpact = generateNarrativeEventOfType(
      createRNG("ffp-impact"),
      state(),
      "financialFairPlayImpact",
    );

    expect(transferRuleChange?.title).toBe("Transfer Rule Changes Under Discussion");
    expect(transferRuleChange?.description).toContain("draft amendments");
    expect(transferRuleChange?.description).toContain("Nothing has been enacted yet");

    expect(financialFairPlayImpact?.description).toContain(
      "No universal freeze has been confirmed",
    );
    expect(financialFairPlayImpact?.description).not.toContain(
      "withdrawn from negotiations",
    );
  });

  it("describes club finance events using the modeled spending consequences", () => {
    const budgetCut = generateNarrativeEventOfType(
      createRNG("budget-cut-copy"),
      state(),
      "budgetCut",
    );
    const financialTrouble = generateNarrativeEventOfType(
      createRNG("club-finance-copy"),
      state(),
      "clubFinancialTrouble",
    );

    expect(budgetCut?.description).toContain("tighter operating budget");
    expect(budgetCut?.description).toContain("confirmed consequences");
    expect(financialTrouble?.description).toContain("reduced scouting budget");
    expect(financialTrouble?.description).not.toContain("near zero");
  });
});
