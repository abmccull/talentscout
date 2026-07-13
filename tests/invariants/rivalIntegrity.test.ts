import { describe, expect, it } from "vitest";
import type {
  Club,
  FreeAgentPool,
  NewGameConfig,
  Player,
  RivalScout,
} from "@/engine/core/types";
import {
  getPoachCounterBidEligibility,
  resolvePoachCounterBid,
  resolveRivalSigningAttempt,
} from "@/engine/rivals/rivalScouts";
import type { LifecycleWorldState } from "@/engine/world/playerLifecycle";
import { createScout } from "@/engine/scout/creation";
import { RNG } from "@/engine/rng";

function club(id: string, budget: number): Club {
  return {
    id,
    name: `Club ${id.toUpperCase()}`,
    shortName: id.toUpperCase(),
    leagueId: "league-test",
    reputation: 50,
    budget,
    scoutingPhilosophy: "academyFirst",
    managerId: `manager-${id}`,
    playerIds: [],
    academyPlayerIds: [],
    youthAcademyRating: 12,
    loanedOutPlayerIds: [],
    loanedInPlayerIds: [],
  };
}

function player(): Player {
  return {
    id: "player-1",
    firstName: "Rival",
    lastName: "Target",
    age: 21,
    clubId: "a",
    contractClubId: "a",
    contractExpiry: 4,
    wage: 2_000,
    marketValue: 100_000,
    currentAbility: 105,
    potentialAbility: 145,
    morale: 6,
    onLoan: undefined,
  } as Player;
}

function emptyPool(): FreeAgentPool {
  return {
    agents: [],
    lastRefreshSeason: 1,
    totalReleasedThisSeason: 0,
    totalSignedThisSeason: 0,
    totalRetiredThisSeason: 0,
  };
}

function world(rivalBudget: number, scoutBudget = 400_000): LifecycleWorldState {
  const activePlayer = player();
  const owner = club("a", 100_000);
  owner.playerIds = [activePlayer.id];
  return {
    players: { [activePlayer.id]: activePlayer },
    clubs: {
      a: owner,
      b: club("b", rivalBudget),
      c: club("c", scoutBudget),
    },
    activeLoans: [],
    loanHistory: [],
    retiredPlayers: {},
    retiredPlayerIds: [],
    playerMovementHistory: [],
    freeAgentPool: emptyPool(),
  };
}

const rival: RivalScout = {
  id: "rival-1",
  name: "Rita Rival",
  quality: 1,
  specialization: "youth",
  clubId: "b",
  targetPlayerIds: ["player-1"],
  reputation: 40,
  personality: "aggressive",
  isNemesis: false,
  competingForPlayers: ["player-1"],
  scoutingProgress: { "player-1": 5 },
  aggressiveness: 0.8,
  budgetTier: "medium",
  winsAgainstPlayer: 0,
  lossesToPlayer: 0,
};

const SCOUT_CONFIG: NewGameConfig = {
  scoutFirstName: "Casey",
  scoutLastName: "Counter",
  scoutAge: 35,
  specialization: "youth",
  difficulty: "normal",
  worldSeed: "rival-integrity",
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

describe("rival signing integrity", () => {
  it("does not claim an unaffordable signing and commits an affordable one once", () => {
    const blockedWorld = world(99_999);
    const blocked = resolveRivalSigningAttempt(
      blockedWorld,
      rival,
      "player-1",
      8,
      1,
    );
    expect(blocked.success).toBe(false);
    expect(blocked.rejectionReason).toMatch(/unaffordable/i);
    expect(blocked.lifecycle.players["player-1"].clubId).toBe("a");
    expect(blocked.lifecycle.clubs.b.budget).toBe(99_999);

    const completed = resolveRivalSigningAttempt(
      world(200_000),
      rival,
      "player-1",
      8,
      1,
    );
    expect(completed.success).toBe(true);
    expect(completed.movement).toMatchObject({
      type: "permanentTransfer",
      playerId: "player-1",
      fromClubId: "a",
      toClubId: "b",
      fee: 100_000,
    });
    expect(completed.lifecycle.players["player-1"]).toMatchObject({
      clubId: "b",
      contractClubId: "b",
    });
    expect(completed.lifecycle.clubs.a.budget).toBe(200_000);
    expect(completed.lifecycle.clubs.b.budget).toBe(100_000);
  });

  it("blocks an unaffordable counter-bid without spending or changing rivalry", () => {
    const signed = resolveRivalSigningAttempt(
      world(300_000, 149_999),
      rival,
      "player-1",
      8,
      1,
    );
    expect(signed.success).toBe(true);
    const scout = {
      ...createScout(SCOUT_CONFIG, new RNG("counter-scout-blocked")),
      careerPath: "club" as const,
      currentClubId: "c",
      reputation: 100,
    };
    const movedPlayer = signed.lifecycle.players["player-1"];
    const eligibility = getPoachCounterBidEligibility(
      signed.lifecycle,
      rival,
      movedPlayer,
      scout,
    );
    expect(eligibility).toMatchObject({ eligible: false, cost: 150_000 });

    const result = resolvePoachCounterBid(
      new RNG("counter-blocked"),
      rival,
      movedPlayer,
      scout,
      signed.lifecycle,
      8,
      1,
    );
    expect(result).toMatchObject({ attempted: false, success: false, reputationChange: 0 });
    expect(result.lifecycle.clubs.c.budget).toBe(149_999);
    expect(result.lifecycle.players["player-1"].clubId).toBe("b");
    expect(result.updatedRival).toBe(rival);
  });

  it("moves the player and both club budgets only after a successful counter-bid", () => {
    const signed = resolveRivalSigningAttempt(
      world(300_000, 400_000),
      rival,
      "player-1",
      8,
      1,
    );
    const scout = {
      ...createScout(SCOUT_CONFIG, new RNG("counter-scout-success")),
      careerPath: "club" as const,
      currentClubId: "c",
      reputation: 100,
    };
    const movedPlayer = signed.lifecycle.players["player-1"];
    const attempts = Array.from({ length: 50 }, (_, index) =>
      resolvePoachCounterBid(
        new RNG(`counter-success-${index}`),
        rival,
        movedPlayer,
        scout,
        signed.lifecycle,
        8,
        1,
      ));
    const result = attempts.find((attempt) => attempt.success);

    expect(result).toBeDefined();
    expect(result!.movement).toMatchObject({
      type: "permanentTransfer",
      fromClubId: "b",
      toClubId: "c",
      fee: 150_000,
    });
    expect(result!.lifecycle.players["player-1"].clubId).toBe("c");
    expect(result!.lifecycle.clubs.b.budget).toBe(350_000);
    expect(result!.lifecycle.clubs.c.budget).toBe(250_000);
    expect(result!.updatedRival.lossesToPlayer).toBe(1);
  });
});
