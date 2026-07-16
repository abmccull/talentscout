import { describe, expect, it, vi } from "vitest";
import type { GameState, NewGameConfig } from "@/engine/core/types";
import { initializeFinances } from "@/engine/finance";
import { isFinancialPeriodClose } from "@/engine/core/annualization";
import { getRetainerCloseReferenceId } from "@/engine/finance/retainers";
import { createRunManifest } from "@/engine/run";
import { RNG } from "@/engine/rng";
import { createScout } from "@/engine/scout/creation";
import { processWeeklyEconomy } from "@/stores/actions/weeklyEconomy";
import { processWeeklyPostTickSystems } from "@/stores/actions/weeklyPostTickSystems";

vi.mock("@/lib/activeSaveProvider", () => ({
  getActiveSaveProvider: async () => ({ save: async () => undefined }),
  isSupabaseCloudSaveActive: async () => false,
}));

vi.mock("@/lib/db", () => ({
  AUTOSAVE_SLOT: 0,
  migrateSaveState: (state: unknown) => state,
  migrateFreeAgentGeography: () => undefined,
  db: {
    mods: { toArray: async () => [] },
    leaderboard: { put: async () => undefined, clear: async () => undefined },
  },
}));

const CONFIG: NewGameConfig = {
  scoutFirstName: "Economy",
  scoutLastName: "Invariant",
  scoutAge: 31,
  specialization: "youth",
  difficulty: "normal",
  worldSeed: "weekly-economy-invariant",
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

function economyState(): GameState {
  const scout = {
    ...createScout(CONFIG, new RNG("weekly-economy-scout")),
    careerPath: "independent" as const,
  };
  return {
    seed: CONFIG.worldSeed,
    runManifest: createRunManifest({
      rootSeed: CONFIG.worldSeed,
      specialization: CONFIG.specialization,
      difficulty: CONFIG.difficulty,
      selectedCountries: ["england"],
      startingCountry: CONFIG.startingCountry,
      worldTraitIds: ["golden-generation", "trusted-circuit", "cautious-market"],
    }),
    currentWeek: 3,
    currentSeason: 1,
    difficulty: CONFIG.difficulty,
    scout,
    finances: initializeFinances(scout, "independent", CONFIG.difficulty),
    fixtures: {},
    clubs: {},
    players: {},
    unsignedYouth: {},
    reports: {},
    inbox: [],
    contacts: {},
    performanceHistory: [],
    discoveryRecords: [],
  } as unknown as GameState;
}

describe("weekly economy orchestration", () => {
  it("is deterministic and does not mutate its input state", () => {
    const state = economyState();
    const snapshot = structuredClone(state);
    const rngContext = {
      seed: state.seed,
      currentWeek: state.currentWeek,
      currentSeason: state.currentSeason,
    };

    const first = processWeeklyEconomy(state, rngContext);
    const replay = processWeeklyEconomy(structuredClone(state), rngContext);

    expect(state).toEqual(snapshot);
    expect(first).toEqual(replay);
    expect(first.finances?.transactions.reduce(
      (total, transaction) => total + transaction.amount,
      0,
    )).toBe(first.finances?.balance);
  });

  it("preserves state identity when finances are unavailable", () => {
    const state = { ...economyState(), finances: undefined };

    expect(processWeeklyEconomy(state, state)).toBe(state);
  });

  it("cannot reinterpret a fulfilled retainer as failed when the economy phase replays", () => {
    const base = economyState();
    const state = {
      ...base,
      currentWeek: 4,
      finances: {
        ...base.finances!,
        retainerContracts: [{
          id: "retainer-replay",
          clubId: "club-replay",
          tier: 1 as const,
          monthlyFee: 1_000,
          requiredReportsPerMonth: 2,
          reportsDeliveredThisMonth: 2,
          status: "active" as const,
        }],
      },
    };
    const rngContext = {
      seed: state.seed,
      currentWeek: state.currentWeek,
      currentSeason: state.currentSeason,
    };
    const referenceId = getRetainerCloseReferenceId("retainer-replay", 4, 1);

    const closed = processWeeklyEconomy(state, rngContext);
    const replayed = processWeeklyEconomy(closed, rngContext);

    expect(replayed.finances?.retainerContracts[0]).toMatchObject({
      status: "active",
      reportsDeliveredThisMonth: 0,
    });
    expect(replayed.finances?.retainerRevenue).toBe(1_000);
    expect(replayed.finances?.transactions.filter(
      (transaction) => transaction.referenceId === referenceId,
    )).toHaveLength(1);
    expect(replayed.inbox.some((message) => message.id === referenceId)).toBe(false);
  });

  it("makes a missed consulting deadline visible and exact-once", () => {
    const base = economyState();
    const state = {
      ...base,
      currentWeek: 6,
      clubs: {
        client: { id: "client", name: "Client United" },
      },
      finances: {
        ...base.finances!,
        consultingContracts: [{
          id: "consulting-replay",
          clubId: "client",
          type: "youthAudit" as const,
          fee: 5_000,
          deadline: 6,
          deadlineSeason: 1,
          status: "active" as const,
          deliverables: [{
            type: "reports" as const,
            description: "Three reports",
            required: 3,
            delivered: 0,
          }],
        }],
        clientRelationships: [{
          clubId: "client",
          satisfaction: 50,
          totalReportsDelivered: 0,
          totalRevenue: 0,
          tenureWeeks: 1,
          preferences: [],
          status: "active" as const,
          lastInteractionWeek: 5,
          lastInteractionSeason: 1,
        }],
      },
    } as unknown as GameState;
    const startingReputation = state.scout.reputation;
    const rngContext = {
      seed: state.seed,
      currentWeek: state.currentWeek,
      currentSeason: state.currentSeason,
    };

    const failed = processWeeklyEconomy(state, rngContext);
    const replayed = processWeeklyEconomy(failed, rngContext);

    expect(failed.finances?.consultingContracts[0].status).toBe("failed");
    expect(failed.scout.reputation).toBe(startingReputation - 2);
    expect(failed.inbox.filter((message) => message.id === "consulting:consulting-replay:failed"))
      .toHaveLength(1);
    expect(replayed.scout.reputation).toBe(failed.scout.reputation);
    expect(replayed.finances?.transactions.filter(
      (transaction) => transaction.referenceId === "consulting:consulting-replay:failed",
    )).toHaveLength(1);
    expect(replayed.inbox.filter((message) => message.id === "consulting:consulting-replay:failed"))
      .toHaveLength(1);
  });

  it("applies lifestyle consequences at season-normalized financial closes", () => {
    const base = economyState();
    const state = {
      ...base,
      currentWeek: 7,
      fixtures: {
        seasonEnd: {
          id: "season-end",
          homeClubId: "home",
          awayClubId: "away",
          leagueId: "league",
          season: 1,
          week: 38,
          played: false,
        },
      },
      scout: {
        ...base.scout,
        careerTier: 5 as const,
        reputation: 50,
      },
      finances: {
        ...base.finances!,
        lifestyle: {
          level: 1 as const,
          monthlyCost: 200,
          networkingBonus: 0,
          salaryOfferBonus: 0,
        },
      },
    };

    expect(isFinancialPeriodClose(7, 38)).toBe(true);
    expect(7 % 4).not.toBe(0);

    const processed = processWeeklyEconomy(state, state);

    expect(processed.scout.reputation).toBe(47);
    expect(processed.finances?.transactions.filter(
      (transaction) => transaction.referenceId === "lifestyle-reputation:s1w7",
    )).toHaveLength(1);
  });

  it("reviews credit against the closing week before the world tick advances", () => {
    const generated = economyState();
    const seasonLength = 38;
    const closingWeek = Array.from({ length: seasonLength - 1 }, (_, index) => index + 1)
      .find((week) => week % 4 !== 0 && isFinancialPeriodClose(week, seasonLength));
    expect(closingWeek).toBeDefined();

    const beforeWeek = {
      ...generated,
      currentWeek: closingWeek!,
      fixtures: {
        seasonEnd: {
          id: "credit-season-end",
          homeClubId: "home",
          awayClubId: "away",
          leagueId: "league",
          season: generated.currentSeason,
          week: seasonLength,
          played: false,
        },
      },
      finances: {
        ...generated.finances!,
        balance: Math.max(1, generated.finances!.balance),
        creditScore: 50,
      },
    };
    const afterTick = {
      ...beforeWeek,
      currentWeek: closingWeek! + 1,
    };
    const processed = processWeeklyPostTickSystems({
      beforeWeek,
      state: afterTick,
      alumniMilestones: [],
    });
    const referenceId = `credit-review:s${beforeWeek.currentSeason}w${closingWeek}`;

    expect(processed.finances?.creditScore).toBe(52);
    expect(processed.finances?.transactions.filter(
      (transaction) => transaction.referenceId === referenceId,
    )).toHaveLength(1);

    const replayed = processWeeklyPostTickSystems({
      beforeWeek,
      state: processed,
      alumniMilestones: [],
    });
    expect(replayed.finances?.creditScore).toBe(52);
    expect(replayed.finances?.transactions.filter(
      (transaction) => transaction.referenceId === referenceId,
    )).toHaveLength(1);
  });
});
