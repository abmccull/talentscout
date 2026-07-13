import { describe, expect, it } from "vitest";

import type {
  AgencyEmployee,
  Club,
  FinancialRecord,
  GameState,
  NewGameConfig,
  Player,
  RetainerContract,
  Scout,
  Territory,
} from "@/engine/core/types";
import {
  advanceIndependentTier,
  canChooseCareerPath,
  calculatePerformanceReview,
  checkIndependentTierAdvancement,
  endClubEmployment,
  ensureLeadershipDelegationTeam,
  generateJobOffersForTier,
  transitionToClubEmployment,
  updateReputation,
} from "@/engine/career";
import {
  applyLegacyPerks,
  generateLegacyProfile,
  markCareerVoluntarilyRetired,
  VOLUNTARY_RETIREMENT_MARKER,
} from "@/engine/career/legacy";
import { createScout } from "@/engine/scout/creation";
import { initializeFinances, applyBalanceTransaction } from "@/engine/finance";
import {
  delegateScoutingTask,
  processNPCDelegations,
} from "@/engine/core/quickScout";
import { RNG } from "@/engine/rng";
import { createFinanceActions } from "@/stores/actions/financeActions";
import type {
  GameStoreState,
  GetState,
  SetState,
} from "@/stores/actions/types";

const CONFIG: NewGameConfig = {
  scoutFirstName: "Organic",
  scoutLastName: "Journey",
  scoutAge: 29,
  specialization: "youth",
  difficulty: "normal",
  worldSeed: "organic-career-proof",
  startingCountry: "england",
  selectedCountries: ["england"],
  skillAllocations: {
    technicalEye: 2,
    physicalAssessment: 1,
    psychologicalRead: 1,
    tacticalUnderstanding: 1,
    dataLiteracy: 1,
    playerJudgment: 1,
    potentialAssessment: 1,
  },
};

const CLUBS: Record<string, Club> = {
  academy_fc: {
    id: "academy_fc",
    name: "Academy FC",
    shortName: "AFC",
    leagueId: "league_1",
    reputation: 28,
    budget: 2_000_000,
    scoutingPhilosophy: "academyFirst",
    managerId: "manager_1",
    playerIds: ["player_1"],
    youthAcademyRating: 15,
  },
};

const TERRITORY: Territory = {
  id: "territory_england",
  name: "England",
  country: "England",
  countryKey: "england",
  leagueIds: ["league_1"],
  maxScouts: 4,
  assignedScoutIds: [],
};

const PLAYER = {
  id: "player_1",
  firstName: "Sam",
  lastName: "Prospect",
  age: 18,
  position: "ST",
  clubId: "academy_fc",
  currentAbility: 112,
  potentialAbility: 158,
  attributes: {
    firstTouch: 13,
    passing: 11,
    dribbling: 14,
    shooting: 14,
    heading: 10,
    pace: 15,
    strength: 10,
    stamina: 13,
    agility: 14,
    composure: 12,
    positioning: 12,
    workRate: 13,
    decisionMaking: 11,
    offTheBall: 14,
    pressing: 12,
    defensiveAwareness: 7,
  },
} as unknown as Player;

function recordReportWork(
  scout: Scout,
  targetReportCount: number,
  quality = 100,
): Scout {
  let worked = scout;
  while (worked.reportsSubmitted < targetReportCount) {
    worked = updateReputation(worked, { type: "reportSubmitted", quality });
    worked = { ...worked, reportsSubmitted: worked.reportsSubmitted + 1 };
  }
  return worked;
}

function activeRetainer(index: number): RetainerContract {
  return {
    id: `retainer_${index}`,
    clubId: `client_${index}`,
    tier: 2,
    monthlyFee: 1_500,
    requiredReportsPerMonth: 2,
    reportsDeliveredThisMonth: 0,
    status: "active",
  };
}

function agencyEmployee(): AgencyEmployee {
  return {
    id: "employee_1",
    name: "Casey Analyst",
    role: "analyst",
    quality: 65,
    salary: 900,
    morale: 70,
    fatigue: 0,
    hiredWeek: 8,
    hiredSeason: 2,
    reportsGenerated: [],
    experience: 2,
    weeklyLog: [],
    regionFocusWeeks: 0,
  };
}

function careerState(scout: Scout, finances: FinancialRecord): GameState {
  return {
    seed: CONFIG.worldSeed,
    currentWeek: 12,
    currentSeason: 2,
    scout,
    finances,
    clubs: CLUBS,
    leagues: {},
    players: { [PLAYER.id]: PLAYER },
    fixtures: {},
    territories: { [TERRITORY.id]: TERRITORY },
    countries: ["england"],
    assistantScouts: [],
    npcScouts: {},
    npcReports: {},
    npcDelegations: {},
    managerDirectives: [],
    jobOffers: [],
    inbox: [],
    reports: {},
    placementReports: {},
    discoveryRecords: [],
    completedScenarioIds: [],
    legacyScore: {
      youthFound: 0,
      firstTeamBreakthroughs: 0,
      internationalCapsFromFinds: 0,
      totalScore: 80,
      clubsWorkedAt: 1,
      countriesScouted: 1,
      careerHighTier: scout.careerTier,
      totalSeasons: 1,
      bestDiscoveryName: "",
      bestDiscoveryPA: 0,
      scenariosCompleted: 0,
    },
    boardProfile: undefined,
    systemFitCache: {},
  } as unknown as GameState;
}

function choosePathThroughStore(state: GameState, path: "club" | "independent"): GameState {
  let store = { gameState: state } as unknown as GameStoreState;
  const get: GetState = () => store;
  const set: SetState = (partial) => {
    const update = typeof partial === "function" ? partial(store) : partial;
    store = { ...store, ...update };
  };
  createFinanceActions(get, set).chooseCareerPath(path);
  return store.gameState as GameState;
}

describe("organic career journey", () => {
  it("earns the path decision from report work, then creates genuinely divergent states", () => {
    const created = createScout(CONFIG, new RNG("organic-career-scout"));
    const openingFinances = initializeFinances(created, "independent", "normal");

    expect(created).toMatchObject({
      careerTier: 1,
      careerPath: "independent",
      careerPathChosen: false,
      reportsSubmitted: 0,
      reputation: 10,
    });
    expect(canChooseCareerPath(created, openingFinances)).toBe(false);

    const worked = recordReportWork(created, 5);
    const earnedTier = checkIndependentTierAdvancement(worked, openingFinances);
    expect(earnedTier).toBe(2);
    const tierTwo = advanceIndependentTier(worked, openingFinances, earnedTier!);

    expect(tierTwo.scout).toMatchObject({
      careerTier: 2,
      independentTier: 2,
      careerPathChosen: false,
      reportsSubmitted: 5,
      reputation: 20,
    });
    expect(canChooseCareerPath(tierTwo.scout, tierTwo.finances)).toBe(true);

    const choicePoint = careerState(tierTwo.scout, tierTwo.finances);
    const independent = choosePathThroughStore(structuredClone(choicePoint), "independent");
    const employed = choosePathThroughStore(structuredClone(choicePoint), "club");

    expect(independent.scout).toMatchObject({
      careerPath: "independent",
      careerPathChosen: true,
      independentTier: 2,
      careerTier: 2,
      reportsSubmitted: 5,
    });
    expect(independent.scout.currentClubId).toBeUndefined();
    expect(employed.scout).toMatchObject({
      careerPath: "club",
      careerPathChosen: true,
      careerTier: 2,
      currentClubId: "academy_fc",
      reportsSubmitted: 5,
    });
    expect(employed.scout.salary).toBeGreaterThan(0);
    expect(employed.finances?.monthlyIncome).toBe(employed.scout.salary * 4);
    expect(employed.jobOffers).toEqual([]);
  });

  it("advances through earned business gates and unlocks a save-stable delegation team", () => {
    const created = createScout(CONFIG, new RNG("organic-leadership-scout"));
    const openingFinances = initializeFinances(created, "independent", "normal");
    const firstWork = recordReportWork(created, 5);
    const tierTwo = advanceIndependentTier(
      firstWork,
      openingFinances,
      checkIndependentTierAdvancement(firstWork, openingFinances)!,
    );
    const committed = choosePathThroughStore(
      careerState(tierTwo.scout, tierTwo.finances),
      "independent",
    );

    const leadershipWork = recordReportWork(committed.scout, 50);
    let leadershipFinances = applyBalanceTransaction(
      committed.finances!,
      25_000,
      8,
      2,
      "Verified report marketplace and retainer income",
    );
    leadershipFinances = {
      ...leadershipFinances,
      retainerContracts: [activeRetainer(1), activeRetainer(2), activeRetainer(3)],
      employees: [agencyEmployee()],
    };

    const tierThreeNumber = checkIndependentTierAdvancement(
      leadershipWork,
      leadershipFinances,
    );
    expect(tierThreeNumber).toBe(3);
    const tierThree = advanceIndependentTier(
      leadershipWork,
      leadershipFinances,
      tierThreeNumber!,
    );
    const tierFourNumber = checkIndependentTierAdvancement(
      tierThree.scout,
      tierThree.finances,
    );
    expect(tierFourNumber).toBe(4);
    const tierFour = advanceIndependentTier(
      tierThree.scout,
      tierThree.finances,
      tierFourNumber!,
    );

    const promotedState = careerState(tierFour.scout, tierFour.finances);
    const bootstrapped = ensureLeadershipDelegationTeam(
      promotedState,
      new RNG("organic-leadership-bootstrap"),
    );
    expect(bootstrapped.addedScoutIds).toHaveLength(2);
    expect(bootstrapped.state.scout.npcScoutIds).toEqual(
      expect.arrayContaining(bootstrapped.addedScoutIds),
    );
    expect(Object.values(bootstrapped.state.npcScouts).every((npc) => npc.territoryId)).toBe(true);

    const reloaded = structuredClone(bootstrapped.state);
    const repeated = ensureLeadershipDelegationTeam(
      reloaded,
      new RNG("organic-leadership-bootstrap"),
    );
    expect(repeated.addedScoutIds).toEqual([]);
    expect(Object.keys(repeated.state.npcScouts)).toEqual(
      bootstrapped.addedScoutIds,
    );

    const delegated = delegateScoutingTask(
      repeated.state,
      bootstrapped.addedScoutIds[0],
      PLAYER.id,
    );
    expect(delegated.result.accepted).toBe(true);
    let delegationState = delegated.state;
    for (let week = 0; week < delegated.result.estimatedWeeks; week++) {
      delegationState = processNPCDelegations(
        delegationState,
        new RNG(`organic-delegation-week-${week}`),
      ).state;
    }
    const delegation = Object.values(delegationState.npcDelegations)[0];
    expect(delegation).toMatchObject({ completed: true, weeksRemaining: 0 });
    expect(delegation.resultReportId).toBeTruthy();
    expect(delegationState.npcReports[delegation.resultReportId!]).toMatchObject({
      playerId: PLAYER.id,
      npcScoutId: bootstrapped.addedScoutIds[0],
    });
  });

  it("preserves the career through firing, recovery, retirement, and New Game+ inheritance", () => {
    const created = createScout(CONFIG, new RNG("organic-recovery-scout"));
    const worked = recordReportWork(created, 5);
    const finances = initializeFinances(worked, "independent", "normal");
    const tierTwo = advanceIndependentTier(
      worked,
      finances,
      checkIndependentTierAdvancement(worked, finances)!,
    );
    const employed = choosePathThroughStore(
      careerState(tierTwo.scout, tierTwo.finances),
      "club",
    );

    const failedReview = calculatePerformanceReview(
      employed.scout,
      [],
      employed.currentSeason,
    );
    expect(failedReview.outcome).toBe("fired");
    const availableForWork = endClubEmployment(employed.scout);
    expect(availableForWork).toMatchObject({
      careerPath: "independent",
      careerPathChosen: true,
      careerTier: 2,
      reportsSubmitted: 5,
      salary: 0,
    });
    expect(availableForWork.currentClubId).toBeUndefined();

    const recoveryOffers = generateJobOffersForTier(
      new RNG("organic-recovery-offer"),
      availableForWork,
      CLUBS,
      3,
      2,
    );
    expect(recoveryOffers.length).toBeGreaterThan(0);
    const rehired = transitionToClubEmployment(
      availableForWork,
      employed.finances!,
      recoveryOffers[0],
      3,
      ["england"],
    );
    expect(rehired.scout).toMatchObject({
      careerPath: "club",
      currentClubId: "academy_fc",
      reportsSubmitted: 5,
    });

    const retirementState = careerState(rehired.scout, rehired.finances);
    retirementState.currentSeason = 4;
    retirementState.legacyScore = {
      ...retirementState.legacyScore,
      careerHighTier: 4,
      totalSeasons: 3,
    };
    const retired = markCareerVoluntarilyRetired(retirementState);
    expect(retired?.completedScenarioIds).toContain(VOLUNTARY_RETIREMENT_MARKER);

    const archive = generateLegacyProfile(retired!);
    expect(archive.completedCareers).toHaveLength(1);
    expect(archive.completedCareers[0]).toMatchObject({
      scoutName: "Organic Journey",
      finalTier: 4,
      seasonsPlayed: 3,
    });
    expect(archive.legacyPerks.map((perk) => perk.id)).toEqual(
      expect.arrayContaining([
        "starting_network",
        "reputation_head_start",
        "financial_cushion",
      ]),
    );

    const inheritance = applyLegacyPerks(
      { ...CONFIG, worldSeed: "organic-career-new-game-plus" },
      archive,
      ["starting_network", "reputation_head_start", "financial_cushion"],
    );
    expect(inheritance).toMatchObject({
      extraContacts: 2,
      reputationBonus: 10,
      budgetBonusPercent: 20,
    });
    expect(inheritance.config.worldSeed).toBe("organic-career-new-game-plus");
  });
});
