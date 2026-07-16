import { describe, expect, it } from "vitest";
import type {
  Activity,
  FinancialRecord,
  GameState,
  JobOffer,
  NewGameConfig,
} from "@/engine/core/types";
import {
  canAcceptJobOffer,
  expireJobOffersAtWeekEnd,
} from "@/engine/career/progression";
import {
  applyCareerPathTransition,
  transitionToClubEmployment,
  transitionToIndependentCareer,
} from "@/engine/career/transitions";
import {
  canVoluntarilyRetire,
  hasRepresentedCareerCompletionState,
  markCareerVoluntarilyRetired,
  VOLUNTARY_RETIREMENT_MARKER,
} from "@/engine/career/legacy";
import {
  isBankruptcyRecoveryActive,
  processDistress,
} from "@/engine/finance/distress";
import { initializeFinances } from "@/engine/finance/expenses";
import { addActivity, createWeekSchedule } from "@/engine/core/calendar";
import { monthlyEquivalentOfWeeklyAmount } from "@/engine/core/annualization";
import { createScout } from "@/engine/scout/creation";
import { RNG } from "@/engine/rng";
import { createWeeklyActions } from "@/stores/actions/weeklyActions";
import { createProgressionActions } from "@/stores/actions/progressionActions";
import type {
  GameStoreState,
  GetState,
  SetState,
} from "@/stores/actions/types";

const CONFIG: NewGameConfig = {
  scoutFirstName: "State",
  scoutLastName: "Integrity",
  scoutAge: 34,
  specialization: "youth",
  difficulty: "normal",
  worldSeed: "career-state-integrity",
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

const OFFER: JobOffer = {
  id: "offer-integrity",
  clubId: "club-a",
  tier: 3,
  role: "Senior Youth Scout",
  salary: 2_000,
  contractLength: 2,
  expiresWeek: 12,
};

const WORK_ACTIVITY: Activity = {
  type: "schoolMatch",
  slots: 2,
  description: "Scout a school match",
};

function createFinances(): FinancialRecord {
  const scout = createScout(CONFIG, new RNG("career-state-finances"));
  return initializeFinances(scout, "independent", "normal");
}

function createWeeklyHarness(gameState: GameState): {
  actions: ReturnType<typeof createWeeklyActions>;
  getStore: () => GameStoreState;
  getRecursiveStarts: () => number;
  getSetCalls: () => number;
} {
  let recursiveStarts = 0;
  let setCalls = 0;
  let store = {
    gameState,
    weekSimulation: null,
    startWeekSimulation: () => {
      recursiveStarts += 1;
    },
  } as unknown as GameStoreState;

  const get: GetState = () => store;
  const set: SetState = (partial) => {
    setCalls += 1;
    const update = typeof partial === "function" ? partial(store) : partial;
    store = { ...store, ...update };
  };

  return {
    actions: createWeeklyActions(get, set),
    getStore: () => store,
    getRecursiveStarts: () => recursiveStarts,
    getSetCalls: () => setCalls,
  };
}

describe("career state integrity", () => {
  it("clears club employment when switching to the independent path", () => {
    const created = createScout(CONFIG, new RNG("career-state-independent"));
    const employed = {
      ...created,
      careerPath: "club" as const,
      careerTier: 3 as const,
      currentClubId: "club-a",
      contractEndSeason: 4,
      salary: 2_000,
      clubTrust: 65,
      managerRelationship: {
        managerId: "manager-a",
        trust: 70,
      } as unknown as typeof created.managerRelationship,
    };
    const finances: FinancialRecord = {
      ...createFinances(),
      careerPath: "club" as const,
      monthlyIncome: 8_000,
    };

    const transitioned = transitionToIndependentCareer(employed, finances);

    expect(transitioned.scout).toMatchObject({
      careerPath: "independent",
      independentTier: 1,
      careerTier: 3,
      salary: 0,
      clubTrust: 0,
    });
    expect(transitioned.scout.currentClubId).toBeUndefined();
    expect(transitioned.scout.contractEndSeason).toBeUndefined();
    expect(transitioned.scout.managerRelationship).toBeUndefined();
    expect(transitioned.finances).toMatchObject({
      careerPath: "independent",
      independentTier: 1,
      monthlyIncome: 0,
    });
  });

  it("closes incompatible agency work when accepting club employment", () => {
    const created = createScout(CONFIG, new RNG("career-state-club"));
    const scout = {
      ...created,
      careerPath: "independent" as const,
      independentTier: 3 as const,
      careerTier: 3 as const,
    };
    const finances = {
      ...createFinances(),
      careerPath: "independent" as const,
      independentTier: 3 as const,
      office: {
        tier: "professional" as const,
        monthlyCost: 1_500,
        qualityBonus: 0.15,
        maxEmployees: 6,
      },
      employees: [{ id: "employee-a" }] as unknown as FinancialRecord["employees"],
      retainerContracts: [{
        id: "retainer-a",
        clubId: "client-a",
        tier: 1 as const,
        monthlyFee: 500,
        requiredReportsPerMonth: 1,
        reportsDeliveredThisMonth: 0,
        status: "active" as const,
      }],
      consultingContracts: [{
        id: "consulting-a",
        clubId: "client-a",
        type: "youthAudit" as const,
        fee: 2_000,
        deadline: 20,
        deadlineSeason: 1,
        status: "active" as const,
      }],
    };

    const transitioned = transitionToClubEmployment(
      scout,
      finances,
      OFFER,
      2,
      ["england"],
    );

    expect(transitioned.scout).toMatchObject({
      careerPath: "club",
      independentTier: undefined,
      currentClubId: "club-a",
      salary: 2_000,
      contractEndSeason: 4,
    });
    expect(transitioned.finances.employees).toEqual([]);
    expect(transitioned.finances.office.tier).toBe("home");
    expect(transitioned.finances.retainerContracts[0]?.status).toBe("cancelled");
    expect(transitioned.finances.consultingContracts[0]?.status).toBe("expired");
    expect(transitioned.finances.monthlyIncome).toBe(
      monthlyEquivalentOfWeeklyAmount(2_000),
    );
  });

  it("does not carry an employer's leadership portfolio into unemployment", () => {
    const created = createScout(CONFIG, new RNG("career-state-leadership-exit"));
    const state = {
      scout: {
        ...created,
        careerPath: "club",
        careerTier: 4,
        currentClubId: "club-a",
        salary: 4_000,
      },
      finances: {
        ...createFinances(),
        careerPath: "club",
        monthlyIncome: 16_000,
      },
      assistantScouts: [],
      npcScouts: { "club-scout": { id: "club-scout" } },
      npcReports: { "club-report": { id: "club-report" } },
      npcDelegations: { "club-delegation": { id: "club-delegation" } },
      leadershipPortfolio: {
        version: 1,
        attentionWeek: 1,
        attentionSeason: 1,
        attentionCapacity: 2,
        attentionUsed: 1,
        responsibilities: { "club-task": { id: "club-task" } },
        trackRecord: {},
      },
      territories: {
        home: {
          id: "home",
          name: "Home",
          country: "England",
          leagueIds: [],
          maxScouts: 3,
          assignedScoutIds: ["club-scout"],
        },
      },
      managerDirectives: [{ id: "club-directive" }],
      boardProfile: { personality: "patient" },
    } as unknown as GameState;

    const transitioned = applyCareerPathTransition(state, "independent");

    expect(transitioned.npcScouts).toEqual({});
    expect(transitioned.npcReports).toEqual({});
    expect(transitioned.npcDelegations).toEqual({});
    expect(transitioned.leadershipPortfolio).toBeUndefined();
    expect(transitioned.territories.home.assignedScoutIds).toEqual([]);
    expect(transitioned.managerDirectives).toEqual([]);
    expect(transitioned.boardProfile).toBeUndefined();
  });

  it("rejects expired offers and partitions consumed deadlines", () => {
    expect(canAcceptJobOffer(OFFER, 12)).toBe(true);
    expect(canAcceptJobOffer(OFFER, 13)).toBe(false);

    const laterOffer = { ...OFFER, id: "offer-later", expiresWeek: 14 };
    expect(expireJobOffersAtWeekEnd([OFFER, laterOffer], 12)).toEqual({
      active: [laterOffer],
      expired: [OFFER],
    });

    const priorSeasonOffer = {
      ...OFFER,
      id: "offer_club-a_s1_1234",
      expiresWeek: 38,
    };
    expect(canAcceptJobOffer(priorSeasonOffer, 1, 2)).toBe(false);
    expect(expireJobOffersAtWeekEnd([priorSeasonOffer], 1, 2).expired).toEqual([
      priorSeasonOffer,
    ]);
  });

  it("removes an expired offer instead of accepting it through the store", () => {
    const scout = createScout(CONFIG, new RNG("career-state-expired-store"));
    const state = {
      currentWeek: 13,
      currentSeason: 2,
      scout,
      finances: createFinances(),
      jobOffers: [OFFER],
      inbox: [{
        id: "offer-action",
        week: 10,
        season: 2,
        type: "jobOffer" as const,
        title: "Job offer",
        body: "Respond before the deadline",
        read: false,
        actionRequired: true,
        relatedId: OFFER.id,
      }],
    } as unknown as GameState;
    let store = { gameState: state } as unknown as GameStoreState;
    const get: GetState = () => store;
    const set: SetState = (partial) => {
      const update = typeof partial === "function" ? partial(store) : partial;
      store = { ...store, ...update };
    };

    createProgressionActions(get, set).acceptJob(OFFER.id);

    expect(store.gameState?.jobOffers).toEqual([]);
    expect(store.gameState?.scout.currentClubId).toBeUndefined();
    expect(store.gameState?.inbox[0]).toMatchObject({
      relatedId: OFFER.id,
      read: true,
      actionRequired: false,
    });
    expect(store.gameState?.inbox.at(-1)?.title).toBe("Job Offer Expired");
  });

  it("bankruptcy atomically clears employment and agency state", () => {
    const created = createScout(CONFIG, new RNG("career-state-bankruptcy"));
    const employed = {
      ...created,
      careerPath: "club" as const,
      careerTier: 4 as const,
      currentClubId: "club-a",
      contractEndSeason: 5,
      salary: 5_000,
      reputation: 60,
    };
    const finances: FinancialRecord = {
      ...createFinances(),
      balance: -6_000,
      careerPath: "club" as const,
      monthlyIncome: 20_000,
      distressLevel: "critical" as const,
      weeksInDistress: 12,
      employees: [{ id: "employee-a" }] as unknown as FinancialRecord["employees"],
      office: {
        tier: "small" as const,
        monthlyCost: 500,
        qualityBonus: 0.1,
        maxEmployees: 3,
      },
    };

    const bankrupt = processDistress(finances, employed, 20, 2);

    expect(bankrupt.forcedRest).toBe(true);
    expect(bankrupt.scout).toMatchObject({
      careerPath: "independent",
      independentTier: 1,
      careerTier: 1,
      salary: 0,
      reputation: 30,
    });
    expect(bankrupt.scout.currentClubId).toBeUndefined();
    expect(bankrupt.scout.contractEndSeason).toBeUndefined();
    expect(bankrupt.finances).toMatchObject({
      careerPath: "independent",
      independentTier: 1,
      monthlyIncome: 0,
      bankruptcyRecoveryCooldown: 10,
    });
    expect(bankrupt.finances.employees).toEqual([]);
    expect(bankrupt.finances.office.tier).toBe("home");
    expect(isBankruptcyRecoveryActive(bankrupt.finances)).toBe(true);

    const replayedBankruptcy = processDistress(
      bankrupt.finances,
      bankrupt.scout,
      20,
      2,
    );
    expect(replayedBankruptcy.finances).toEqual(bankrupt.finances);
    expect(replayedBankruptcy.scout).toEqual(bankrupt.scout);
    expect(replayedBankruptcy.messages).toEqual([]);

    const recoveryWeek = processDistress(
      bankrupt.finances,
      bankrupt.scout,
      21,
      2,
    );
    expect(recoveryWeek.forcedRest).toBe(true);
    expect(recoveryWeek.finances.bankruptcyRecoveryCooldown).toBe(9);

    const replayedRecovery = processDistress(
      recoveryWeek.finances,
      recoveryWeek.scout,
      21,
      2,
    );
    expect(replayedRecovery.finances).toEqual(recoveryWeek.finances);
    expect(replayedRecovery.finances.bankruptcyRecoveryCooldown).toBe(9);
  });

  it("blocks scheduling and clears injected work throughout bankruptcy recovery", () => {
    const finances = {
      ...createFinances(),
      bankruptcyRecoveryCooldown: 3,
    };
    const emptySchedule = createWeekSchedule(5, 1);
    const blockedState = {
      currentWeek: 5,
      currentSeason: 1,
      finances,
      schedule: emptySchedule,
      completedScenarioIds: [],
    } as unknown as GameState;
    const scheduling = createWeeklyHarness(blockedState);

    scheduling.actions.scheduleActivity(WORK_ACTIVITY, 0);
    expect(scheduling.getSetCalls()).toBe(0);
    expect(scheduling.getStore().gameState?.schedule).toEqual(emptySchedule);

    const injectedSchedule = addActivity(emptySchedule, WORK_ACTIVITY, 0);
    const offerMessage = {
      id: "offer-message",
      week: 5,
      season: 1,
      type: "jobOffer" as const,
      title: "Offer",
      body: "Pending",
      read: false,
      actionRequired: true,
      relatedId: OFFER.id,
    };
    const processingState = {
      ...blockedState,
      schedule: injectedSchedule,
      jobOffers: [{ ...OFFER, expiresWeek: 5 }],
      inbox: [offerMessage],
      clubs: {},
    } as unknown as GameState;
    const processing = createWeeklyHarness(processingState);

    processing.actions.startWeekSimulation();

    expect(processing.getStore().gameState?.schedule.activities.every((activity) => activity === null)).toBe(true);
    expect(processing.getStore().gameState?.jobOffers).toEqual([]);
    expect(processing.getStore().gameState?.inbox[0]).toMatchObject({
      relatedId: OFFER.id,
      read: true,
      actionRequired: false,
    });
    expect(processing.getRecursiveStarts()).toBe(1);
  });

  it("provides every clean career a durable voluntary retirement route", () => {
    const firstSeason = {
      currentSeason: 1,
      completedScenarioIds: [],
      legacyScore: { totalSeasons: 0 },
    } as unknown as GameState;
    expect(canVoluntarilyRetire(firstSeason)).toBe(false);

    const eligible = { ...firstSeason, currentSeason: 2 } as GameState;
    expect(canVoluntarilyRetire(eligible)).toBe(true);
    const retired = markCareerVoluntarilyRetired(eligible);
    expect(retired?.completedScenarioIds).toContain(VOLUNTARY_RETIREMENT_MARKER);
    expect(hasRepresentedCareerCompletionState(retired as GameState)).toBe(true);
    expect(markCareerVoluntarilyRetired(retired as GameState)).toBeNull();
  });
});
