import { describe, expect, it } from "vitest";
import type {
  GameState,
  League,
  Player,
  Scout,
  ScoutingInfrastructure,
} from "@/engine/core/types";
import type { EquipmentLoadout } from "@/engine/finance";
import {
  getActiveEquipmentBonuses,
  getContextualEquipmentBonuses,
} from "@/engine/finance";
import { processCompletedWeek } from "@/engine/core/calendar";
import { processWeeklyDataObservationActivities } from "@/stores/actions/weeklyDataObservationActivities";

function buildScout(): Scout {
  return {
    id: "scout",
    firstName: "Nia",
    lastName: "Vale",
    age: 33,
    nationality: "English",
    homeCountry: "england",
    attributes: {
      adaptability: 11,
      intuition: 12,
    } as Scout["attributes"],
    skills: {
      dataLiteracy: 5,
    } as Scout["skills"],
    primarySpecialization: "data",
    specializationLevel: 4,
    specializationXp: 0,
    unlockedPerks: [],
    careerTier: 3,
    careerPath: "independent",
    reputation: 40,
    clubTrust: 0,
    specializationReputation: 25,
    salary: 0,
    savings: 0,
    reportsSubmitted: 0,
    successfulFinds: 0,
    discoveryCredits: [],
    fatigue: 0,
    skillXp: {},
    attributeXp: {},
    npcScoutIds: [],
    countryReputations: {
      england: {
        country: "england",
        familiarity: 60,
        reportsSubmitted: 0,
        successfulFinds: 0,
        contactCount: 0,
      },
    },
    boardDirectives: [],
  } as Scout;
}

function buildPlayer(id: string, clubId: string, shooting: number): Player {
  return {
    id,
    clubId,
    firstName: `Player${id}`,
    lastName: "Test",
    age: 20,
    position: "ST",
    currentAbility: 110,
    form: 1,
    marketValue: 1_000_000,
    attributes: {
      shooting,
      composure: 13,
      positioning: 12,
      passing: 11,
      crossing: 9,
      decisionMaking: 12,
      firstTouch: 11,
      defensiveAwareness: 7,
      strength: 10,
      pressing: 8,
      heading: 9,
      stamina: 12,
      dribbling: 12,
      agility: 13,
      pace: 14,
    } as Player["attributes"],
  } as Player;
}

function buildState(
  infrastructure: ScoutingInfrastructure,
): GameState {
  const scout = buildScout();
  const league: League = {
    id: "eng-league",
    name: "England Test League",
    country: "England",
    clubIds: ["club-a", "club-b"],
  } as League;
  const players = Object.fromEntries(
    Array.from({ length: 8 }, (_, index) => {
      const player = buildPlayer(
        `player-${index + 1}`,
        index < 4 ? "club-a" : "club-b",
        10 + index,
      );
      return [player.id, player];
    }),
  );

  return {
    seed: "data-quality-authority",
    currentWeek: 6,
    currentSeason: 2,
    scout,
    scoutingInfrastructure: infrastructure,
    countries: ["england"],
    territories: {
      england: {
        id: "england",
        name: "England",
        country: "England",
        countryKey: "england",
        leagueIds: [league.id],
        maxScouts: 2,
        assignedScoutIds: [],
      },
    },
    leagues: {
      [league.id]: league,
    },
    clubs: {
      "club-a": { id: "club-a", name: "Club A", leagueId: league.id },
      "club-b": { id: "club-b", name: "Club B", leagueId: league.id },
    },
    players,
    fixtures: {},
    subRegions: {
      england: {
        id: "england",
        name: "London",
        country: "England",
        countryKey: "england",
        familiarity: 0,
      },
    },
    unsignedYouth: {},
    youthTournaments: {},
    regionalKnowledge: {
      england: {
        countryId: "england",
        knowledgeLevel: 30,
        discoveredLeagues: [],
        culturalInsights: [],
        localContacts: [],
        scoutingEfficiency: 1,
      },
    },
    contacts: {},
    statisticalProfiles: {},
    anomalyFlags: [],
    dataAnalysts: [],
    analystReports: {},
  } as unknown as GameState;
}

function weekResult(): ReturnType<typeof processCompletedWeek> {
  return {
    databaseQueriesExecuted: 1,
    deepVideoAnalysesExecuted: 0,
    statsBriefingsExecuted: 0,
    dataConferencesExecuted: 0,
    algorithmCalibrationsExecuted: 0,
    marketInefficienciesExecuted: 0,
    analyticsTeamMeetingsExecuted: 0,
  } as ReturnType<typeof processCompletedWeek>;
}

describe("equipment context and data quality", () => {
  it("keeps home-region equipment global-free and activates it only on home soil", () => {
    const loadout: EquipmentLoadout = {
      notebook: "notebook_t1",
      video: "video_t1",
      travel: "travel_regional",
      network: "network_regional",
      analysis: "analysis_t1",
    };

    const globalBonuses = getActiveEquipmentBonuses(loadout);
    const homeBonuses = getContextualEquipmentBonuses(loadout, {
      scoutHomeCountry: "england",
      country: "England",
    });
    const awayBonuses = getContextualEquipmentBonuses(loadout, {
      scoutHomeCountry: "england",
      country: "brazil",
    });

    expect(globalBonuses.travelCostReduction).toBe(0);
    expect(globalBonuses.relationshipGainBonus).toBe(0);
    expect(globalBonuses.intelReliabilityBonus).toBe(0);
    expect(homeBonuses.travelCostReduction).toBe(0.25);
    expect(homeBonuses.fatigueReduction.travel).toBe(5);
    expect(homeBonuses.fatigueReduction.internationalTravel).toBe(5);
    expect(homeBonuses.relationshipGainBonus).toBe(0.12);
    expect(homeBonuses.intelReliabilityBonus).toBe(0.25);
    expect(awayBonuses).toEqual(globalBonuses);
  });

  it("makes data subscriptions change live statistical profile output", () => {
    const noSubscription = buildState({
      dataSubscription: "none",
      travelBudget: "economy",
      officeEquipment: "basic",
      investmentCosts: { weekly: 0, oneTime: 0 },
    });
    const eliteSubscription = buildState({
      dataSubscription: "elite",
      travelBudget: "economy",
      officeEquipment: "basic",
      investmentCosts: { weekly: 0, oneTime: 0 },
    });

    const baseInput = {
      weekResult: weekResult(),
      scout: noSubscription.scout,
      allPlayers: Object.values(noSubscription.players),
      messages: [],
      observationsGenerated: 0,
      extraAttributesPerSession: 0,
      playerEvidence: () => [],
      recordObservation: () => undefined,
      observedPlayerIds: new Set<string>(),
      profileModifier: () => 0,
      anomalyModifier: () => 0,
      relationshipModifier: () => 0,
      reportQualityModifier: () => 0,
      prioritizePlayers: (pool: Player[]) => pool,
    };

    const noneResult = processWeeklyDataObservationActivities({
      sourceState: noSubscription,
      state: noSubscription,
      ...baseInput,
    });
    const eliteResult = processWeeklyDataObservationActivities({
      sourceState: eliteSubscription,
      state: eliteSubscription,
      ...baseInput,
      scout: eliteSubscription.scout,
      allPlayers: Object.values(eliteSubscription.players),
    });

    const noneProfiles = noneResult.state.statisticalProfiles;
    const eliteProfiles = eliteResult.state.statisticalProfiles;
    const comparedPlayerId = Object.keys(noneProfiles)[0];

    expect(comparedPlayerId).toBeDefined();
    expect(Object.keys(eliteProfiles)).toContain(comparedPlayerId);
    expect(Object.keys(eliteProfiles).length).toBeGreaterThan(Object.keys(noneProfiles).length);

    const noneProfile = noneProfiles[comparedPlayerId!];
    const eliteProfile = eliteProfiles[comparedPlayerId!];

    expect(eliteProfile.evidenceContext?.confidence)
      .toBeGreaterThan(noneProfile.evidenceContext?.confidence ?? 0);
    expect(eliteProfile.per90.goals).not.toBe(noneProfile.per90.goals);
  });
});
