import { describe, expect, it } from "vitest";
import type {
  Club,
  DifficultyLevel,
  GameState,
  Player,
  RivalScout,
} from "@/engine/core/types";
import {
  DIFFICULTY_CONFIGS,
  scaleReputationChange,
} from "@/engine/core/difficulty";
import { RNG } from "@/engine/rng";
import {
  generateRivalScouts,
  processRivalScoutWeek,
} from "@/engine/rivals/rivalScouts";
import {
  getRivalPlayerEvidence,
  getRivalShortlistCapacity,
  observePlayerForRival,
  scoreRivalTargetCandidate,
} from "@/engine/rivals/rivalEvidence";

function club(id: string, budget = 50_000_000): Club {
  return {
    id,
    name: `Club ${id}`,
    shortName: id.slice(0, 4).toUpperCase(),
    leagueId: "league-test",
    reputation: 60,
    budget,
    scoutingPhilosophy: "marketSmart",
    managerId: `manager-${id}`,
    playerIds: [],
    academyPlayerIds: [],
    youthAcademyRating: 12,
    loanedOutPlayerIds: [],
    loanedInPlayerIds: [],
  };
}

function player(
  id: string,
  clubId: string,
  overrides: Partial<Player> = {},
): Player {
  return {
    id,
    firstName: id,
    lastName: "Target",
    age: 22,
    dateOfBirth: { day: 1, month: 1, year: 2000 },
    nationality: "England",
    position: "CM",
    secondaryPositions: [],
    preferredFoot: "right",
    clubId,
    contractClubId: clubId,
    contractExpiry: 4,
    wage: 5_000,
    marketValue: 5_000_000,
    attributes: {} as Player["attributes"],
    currentAbility: 110,
    potentialAbility: 140,
    developmentProfile: "steadyGrower",
    wonderkidTier: "qualityPro",
    form: 0,
    morale: 7,
    injured: false,
    injuryWeeksRemaining: 0,
    personalityTraits: [],
    personalityRevealed: [],
    playerTraits: [],
    playerTraitsRevealed: [],
    recentMatchRatings: [
      { fixtureId: `${id}-fixture`, week: 1, season: 1, rating: 6.8 },
    ],
    seasonRatings: [],
    ...overrides,
  } as Player;
}

function rival(overrides: Partial<RivalScout> = {}): RivalScout {
  return {
    id: "rival-1",
    name: "Rita Rival",
    quality: 3,
    specialization: "youth",
    clubId: "rival-club",
    targetPlayerIds: ["young"],
    reputation: 50,
    personality: "aggressive",
    isNemesis: false,
    competingForPlayers: [],
    scoutingProgress: {},
    aggressiveness: 1,
    budgetTier: "high",
    winsAgainstPlayer: 0,
    lossesToPlayer: 0,
    ...overrides,
  };
}

function gameState(overrides: Partial<GameState> = {}): GameState {
  const clubs = {
    "scout-club": club("scout-club"),
    "rival-club": club("rival-club"),
    "player-club-a": club("player-club-a"),
    "player-club-b": club("player-club-b"),
  };
  const players = {
    young: player("young", "player-club-a", { age: 18 }),
    veteran: player("veteran", "player-club-b", { age: 28 }),
  };
  clubs["player-club-a"].playerIds = ["young"];
  clubs["player-club-b"].playerIds = ["veteran"];
  const baseRival = rival();
  return {
    difficulty: "normal",
    currentSeason: 1,
    currentWeek: 1,
    players,
    clubs,
    leagues: {
      "league-test": {
        id: "league-test",
        name: "Test League",
        shortName: "TEST",
        country: "England",
        tier: 1,
        clubIds: Object.keys(clubs),
        season: 1,
      },
    },
    fixtures: {},
    reports: {},
    observations: {},
    rivalScouts: { [baseRival.id]: baseRival },
    scout: { currentClubId: "scout-club" },
    ...overrides,
  } as unknown as GameState;
}

const NO_RANDOM_PRESSURE = {
  discoveryChanceMultiplier: 0,
  poachChanceMultiplier: 0,
  signingChanceMultiplier: 0,
} as const;

describe("fair senior rival decisions", () => {
  it("does not use hidden CA or PA when generating initial shortlists", () => {
    const first = gameState();
    const second = gameState({
      players: {
        ...first.players,
        young: {
          ...first.players.young,
          currentAbility: 25,
          potentialAbility: 30,
        },
        veteran: {
          ...first.players.veteran,
          currentAbility: 195,
          potentialAbility: 200,
        },
      },
    });

    const firstRivals = generateRivalScouts(new RNG("public-signals"), first);
    const secondRivals = generateRivalScouts(new RNG("public-signals"), second);

    expect(secondRivals).toEqual(firstRivals);
  });

  it("builds imperfect evidence whose uncertainty responds to rival intelligence", () => {
    const state = gameState();
    const target = state.players.young;
    const scout = rival();
    const casualResult = observePlayerForRival(
      new RNG("same-observation"),
      scout,
      target,
      state,
      DIFFICULTY_CONFIGS.casual.rivalIntelligence,
    );
    const hardResult = observePlayerForRival(
      new RNG("same-observation"),
      scout,
      target,
      state,
      DIFFICULTY_CONFIGS.hard.rivalIntelligence,
    );
    const casualEvidence = getRivalPlayerEvidence(casualResult, target.id)!;
    const hardEvidence = getRivalPlayerEvidence(hardResult, target.id)!;

    expect(casualEvidence.observations).toBe(1);
    expect(casualEvidence.confidence).toBeLessThan(1);
    expect(casualEvidence.errorMargin).toBeGreaterThan(0);
    expect(hardEvidence.confidence).toBeGreaterThan(casualEvidence.confidence);
    expect(hardEvidence.errorMargin).toBeLessThan(casualEvidence.errorMargin);
    expect(Math.abs(hardEvidence.estimatedCurrentAbility - target.currentAbility))
      .toBeLessThanOrEqual(
        Math.abs(casualEvidence.estimatedCurrentAbility - target.currentAbility),
      );
  });

  it("makes specialties produce different public-signal priorities", () => {
    const state = gameState();
    const youthRival = rival({ specialization: "youth" });
    const firstTeamRival = rival({ specialization: "firstTeam" });

    expect(scoreRivalTargetCandidate(
      youthRival,
      state.players.young,
      state,
      1,
    )).toBeGreaterThan(scoreRivalTargetCandidate(
      youthRival,
      state.players.veteran,
      state,
      1,
    ));
    expect(scoreRivalTargetCandidate(
      firstTeamRival,
      state.players.veteran,
      state,
      1,
    )).toBeGreaterThan(scoreRivalTargetCandidate(
      firstTeamRival,
      state.players.young,
      state,
      1,
    ));
  });

  it("gains evidence only by attending a target fixture", () => {
    const activeRival = rival({
      currentTarget: "young",
      reportDeadline: 4,
    });
    const withoutFixture = gameState({
      rivalScouts: { [activeRival.id]: activeRival },
    });
    const idle = processRivalScoutWeek(
      new RNG("no-fixture"),
      withoutFixture,
      NO_RANDOM_PRESSURE,
    );
    expect(getRivalPlayerEvidence(idle.updatedRivals[activeRival.id], "young"))
      .toBeUndefined();

    const withFixture = gameState({
      rivalScouts: { [activeRival.id]: activeRival },
      fixtures: {
        "fixture-1": {
          id: "fixture-1",
          homeClubId: "player-club-a",
          awayClubId: "player-club-b",
          leagueId: "league-test",
          season: 1,
          week: 1,
          played: false,
        },
      },
    });
    const observed = processRivalScoutWeek(
      new RNG("with-fixture"),
      withFixture,
      NO_RANDOM_PRESSURE,
    );
    expect(getRivalPlayerEvidence(observed.updatedRivals[activeRival.id], "young"))
      .toMatchObject({ observations: 1, lastObservedSeason: 1, lastObservedWeek: 1 });
  });

  it("keeps rival operating capacity bounded on every difficulty", () => {
    const elite = rival({ quality: 5 });
    const capacities = (Object.keys(DIFFICULTY_CONFIGS) as DifficultyLevel[]).map(
      (level) => getRivalShortlistCapacity(
        elite,
        DIFFICULTY_CONFIGS[level].rivalIntelligence,
      ),
    );

    expect(Math.min(...capacities)).toBeGreaterThanOrEqual(3);
    expect(Math.max(...capacities)).toBeLessThanOrEqual(8);
    expect(capacities[0]).toBeLessThan(capacities.at(-1)!);
  });

  it("carries newly assigned report deadlines across the season boundary", () => {
    const availableRival = rival({ currentTarget: undefined });
    const firstState = gameState({
      currentWeek: 37,
      rivalScouts: { [availableRival.id]: availableRival },
    });
    const assigned = processRivalScoutWeek(
      new RNG("cross-season-deadline"),
      firstState,
      NO_RANDOM_PRESSURE,
    );
    const assignedRival = assigned.updatedRivals[availableRival.id]!;

    expect(assignedRival).toMatchObject({
      currentTarget: "young",
      reportDeadline: 1,
      reportDeadlineSeason: 2,
    });
    expect(assigned.newActivities.some((activity) => activity.type === "reportSubmitted"))
      .toBe(false);

    const due = processRivalScoutWeek(
      new RNG("cross-season-deadline-due"),
      gameState({
        currentSeason: 2,
        currentWeek: 1,
        rivalScouts: { [assignedRival.id]: assignedRival },
      }),
      NO_RANDOM_PRESSURE,
    );
    expect(due.newActivities.some((activity) => activity.type === "reportSubmitted"))
      .toBe(true);
  });

  it("migrates a legacy overflow deadline without postponing it another season", () => {
    const legacyRival = rival({
      currentTarget: "young",
      reportDeadline: 40,
    });
    const migrated = processRivalScoutWeek(
      new RNG("legacy-deadline"),
      gameState({
        currentSeason: 2,
        currentWeek: 1,
        rivalScouts: { [legacyRival.id]: legacyRival },
      }),
      NO_RANDOM_PRESSURE,
    );
    const migratedRival = migrated.updatedRivals[legacyRival.id]!;
    expect(migratedRival).toMatchObject({
      reportDeadline: 2,
      reportDeadlineSeason: 2,
    });

    const due = processRivalScoutWeek(
      new RNG("legacy-deadline-due"),
      gameState({
        currentSeason: 2,
        currentWeek: 2,
        rivalScouts: { [migratedRival.id]: migratedRival },
      }),
      NO_RANDOM_PRESSURE,
    );
    expect(due.newActivities.some((activity) => activity.type === "reportSubmitted"))
      .toBe(true);

    const alreadyOverdue = processRivalScoutWeek(
      new RNG("legacy-deadline-overdue"),
      gameState({
        currentSeason: 2,
        currentWeek: 3,
        rivalScouts: { [legacyRival.id]: legacyRival },
      }),
      NO_RANDOM_PRESSURE,
    );
    expect(alreadyOverdue.newActivities.some(
      (activity) => activity.type === "reportSubmitted",
    )).toBe(true);
  });
});

describe("meaningful difficulty", () => {
  it("preserves world talent while making reputation scaling sign-aware", () => {
    for (const modifiers of Object.values(DIFFICULTY_CONFIGS)) {
      expect(modifiers.reputationMultiplier).toBe(1);
      expect(modifiers.developmentRate).toBe(1);
      expect(modifiers.wonderkidRateMultiplier).toBe(1);
    }

    expect(scaleReputationChange(10, "casual")).toBe(12.5);
    expect(scaleReputationChange(-10, "casual")).toBe(-7.5);
    expect(scaleReputationChange(10, "hard")).toBe(8.5);
    expect(scaleReputationChange(-10, "hard")).toBe(-11.5);
    expect(scaleReputationChange(10, "ironman")).toBe(8);
    expect(scaleReputationChange(-10, "ironman")).toBe(-12.5);
    expect(scaleReputationChange(0.4, "normal")).toBe(0.4);
    expect(scaleReputationChange(0.4, "hard")).toBe(0.34);
    expect(scaleReputationChange(0.4, "ironman")).toBe(0.32);
  });
});
