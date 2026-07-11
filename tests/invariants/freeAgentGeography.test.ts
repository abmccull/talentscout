import { describe, expect, it } from "vitest";
import type { Contact, FreeAgent, GameState, Territory } from "@/engine/core/types";
import { discoverFreeAgents } from "@/engine/freeAgents/discovery";
import { migrateFreeAgentGeography } from "@/lib/db";

function makeFreeAgent(overrides: Partial<FreeAgent> = {}): FreeAgent {
  return {
    playerId: "p1",
    country: "English",
    nationality: undefined,
    releasedFrom: "club-1",
    releasedSeason: 1,
    weeksInPool: 0,
    maxWeeksInPool: 20,
    wageExpectation: 1_000,
    signingBonusExpectation: 2_000,
    discoverySource: null,
    discoveredByScout: false,
    npcInterest: [],
    status: "available",
    ...overrides,
  };
}

function makeState(overrides: Partial<GameState> = {}): GameState {
  const territory: Territory = {
    id: "territory-1",
    name: "South Korea",
    country: "South Korea",
    leagueIds: ["league-1"],
    maxScouts: 1,
    assignedScoutIds: [],
  };

  const contact: Contact = {
    id: "contact-1",
    name: "Lee Ji-hoon",
    type: "scout",
    organization: "Seoul Network",
    relationship: 20,
    reliability: 75,
    knownPlayerIds: [],
    country: "South Korea",
  };

  return {
    scout: ({
      id: "scout-1",
      firstName: "Alec",
      lastName: "Finder",
      age: 34,
      reputation: 50,
      currentClubId: "club-2",
      primarySpecialization: "regional",
      secondarySpecializations: [],
      specializationLevel: 1,
      level: 1,
      xp: 0,
      skillPoints: 0,
      skills: {
        technicalEye: 5,
        physicalAssessment: 5,
        psychologicalRead: 5,
        tacticalUnderstanding: 5,
        dataLiteracy: 5,
        playerJudgment: 5,
        potentialAssessment: 5,
      },
      attributes: {
        networking: 5,
        persuasion: 5,
        endurance: 5,
        adaptability: 5,
        memory: 5,
        intuition: 5,
      },
      energy: 100,
      fatigue: 0,
      knownPlayerIds: [],
      npcScoutIds: [],
      countryReputations: {
        "South Korea": {
          country: "South Korea",
          familiarity: 35,
          reportsSubmitted: 0,
          successfulFinds: 0,
          contactCount: 0,
        },
      },
      boardDirectives: [],
      unlockedPerks: [],
      skillXp: {},
      attributeXp: {},
      specializationXp: 0,
    }) as unknown as GameState["scout"],
    currentSeason: 1,
    currentWeek: 1,
    countries: ["england"],
    players: {
      p1: {
        id: "p1",
        firstName: "Min",
        lastName: "Park",
        age: 25,
        dateOfBirth: { day: 1, month: 1, year: 2001 },
        nationality: "South Korean",
        position: "CM",
        secondaryPositions: [],
        preferredFoot: "right",
        clubId: "",
        contractClubId: undefined,
        contractExpiry: 0,
        wage: 0,
        marketValue: 100_000,
        attributes: {} as GameState["players"][string]["attributes"],
        currentAbility: 78,
        potentialAbility: 84,
        developmentProfile: "steadyGrower",
        wonderkidTier: "qualityPro",
        form: 0,
        morale: 5,
        injured: false,
        injuryWeeksRemaining: 0,
        personalityTraits: [],
        personalityRevealed: [],
        playerTraits: [],
        playerTraitsRevealed: [],
        recentMatchRatings: [],
        seasonRatings: [],
      },
    },
    clubs: {
      "club-1": {
        id: "club-1",
        name: "FC Seoul",
        shortName: "SEO",
        leagueId: "league-1",
        reputation: 60,
        budget: 1_000_000,
        scoutingPhilosophy: "academyFirst",
        managerId: "manager-1",
        playerIds: [],
        academyPlayerIds: [],
        youthAcademyRating: 10,
      },
      "club-2": {
        id: "club-2",
        name: "Destination FC",
        shortName: "DST",
        leagueId: "league-2",
        reputation: 55,
        budget: 1_000_000,
        scoutingPhilosophy: "academyFirst",
        managerId: "manager-2",
        playerIds: [],
        academyPlayerIds: [],
        youthAcademyRating: 10,
      },
    },
    leagues: {
      "league-1": {
        id: "league-1",
        name: "K League 1",
        shortName: "K1",
        country: "South Korea",
        tier: 1,
        clubIds: ["club-1"],
        season: 1,
      },
      "league-2": {
        id: "league-2",
        name: "Premier League",
        shortName: "EPL",
        country: "England",
        tier: 1,
        clubIds: ["club-2"],
        season: 1,
      },
    },
    contacts: { "contact-1": contact },
    territories: { "territory-1": territory },
    freeAgentPool: {
      agents: [makeFreeAgent()],
      lastRefreshSeason: 1,
      totalReleasedThisSeason: 0,
      totalSignedThisSeason: 0,
      totalRetiredThisSeason: 0,
    },
    ...overrides,
  } as unknown as GameState;
}

describe("free-agent geography invariants", () => {
  it("migrates legacy nationality/display values into a canonical country key", () => {
    const state = makeState();

    migrateFreeAgentGeography(state);

    expect(state.freeAgentPool.agents[0].country).toBe("southkorea");
    expect(state.freeAgentPool.agents[0].nationality).toBe("South Korean");
  });

  it("uses canonical keys for familiarity and territory discovery even on legacy geography labels", () => {
    const state = makeState({
      contacts: {},
      freeAgentPool: {
        agents: [makeFreeAgent({ country: "southkorea", nationality: "South Korean" })],
        lastRefreshSeason: 1,
        totalReleasedThisSeason: 0,
        totalSignedThisSeason: 0,
        totalRetiredThisSeason: 0,
      },
    });

    const rng = {
      chance: () => true,
      nextInt: () => 0,
      pick: <T,>(items: T[]) => items[0],
    };

    const result = discoverFreeAgents(state, rng as never);

    expect(result.newDiscoveries).toBe(1);
    expect(result.updatedPool.agents[0].discoveredByScout).toBe(true);
    expect(result.updatedPool.agents[0].discoverySource).toBe("territoryScan");
  });
});
