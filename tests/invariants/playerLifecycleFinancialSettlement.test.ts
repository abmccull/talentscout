import { describe, expect, it, vi } from "vitest";
import type {
  Club,
  ClubFinancialObligation,
  FreeAgent,
  FreeAgentPool,
  LoanDeal,
  Player,
} from "@/engine/core/types";
import { advanceWeek, type TickResult } from "@/engine/core/gameLoop";
import {
  resolvePlayerMovements,
  type LifecycleWorldState,
} from "@/engine/world/playerLifecycle";

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

function player(overrides: Partial<Player> = {}): Player {
  return {
    id: "p1",
    firstName: "Alex",
    lastName: "Prospect",
    age: 22,
    clubId: "a",
    contractClubId: "a",
    contractExpiry: 5,
    wage: 1_000,
    currentAbility: 72,
    potentialAbility: 84,
    morale: 5,
    ...overrides,
  } as Player;
}

function club(
  id: string,
  overrides: Partial<Club> = {},
): Club {
  return {
    id,
    name: `Club ${id.toUpperCase()}`,
    shortName: id.toUpperCase(),
    leagueId: `league-${id}`,
    reputation: 55,
    budget: 100_000,
    weeklyWageBudget: 5_000,
    scoutingBudget: 250_000,
    financialObligations: [],
    scoutingPhilosophy: "academyFirst",
    managerId: `manager-${id}`,
    playerIds: [],
    academyPlayerIds: [],
    youthAcademyRating: 12,
    loanedOutPlayerIds: [],
    loanedInPlayerIds: [],
    ...overrides,
  };
}

function emptyPool(agents: FreeAgent[] = []): FreeAgentPool {
  return {
    agents,
    lastRefreshSeason: 1,
    totalReleasedThisSeason: 0,
    totalSignedThisSeason: 0,
    totalRetiredThisSeason: 0,
  };
}

function world(
  players: Record<string, Player>,
  clubs: Record<string, Club>,
  overrides: Partial<LifecycleWorldState> = {},
): LifecycleWorldState {
  return {
    players,
    clubs,
    activeLoans: [],
    loanHistory: [],
    retiredPlayers: {},
    retiredPlayerIds: [],
    playerMovementHistory: [],
    freeAgentPool: emptyPool(),
    ...overrides,
  };
}

function emptyTick(): TickResult {
  return {
    fixturesPlayed: [],
    standingsUpdated: false,
    playerDevelopment: [],
    unsignedYouthDevelopment: [],
    breakthroughs: [],
    transfers: [],
    injuries: [],
    newMessages: [],
    reputationChange: 0,
    injurySetbacks: [],
    endOfSeasonTriggered: false,
    npcScoutResults: [],
    formMomentumUpdates: [],
    satisfactionDeltas: [],
  };
}

describe("player lifecycle financial settlement", () => {
  it("charges only the loan fee upfront and persists weekly wage contributions as obligations", () => {
    const input = world(
      {
        p1: player(),
      },
      {
        a: club("a", { playerIds: ["p1"] }),
        b: club("b"),
      },
    );
    const deal: LoanDeal = {
      id: "loan-1",
      playerId: "p1",
      parentClubId: "a",
      loanClubId: "b",
      startWeek: 1,
      startSeason: 2,
      endWeek: 11,
      endSeason: 2,
      loanFee: 5_000,
      wageContribution: 50,
      buyOptionFee: 18_000,
      recallClause: true,
      status: "active",
    };

    const result = resolvePlayerMovements(
      input,
      [{ type: "loanStart", playerId: "p1", deal }],
      1,
      2,
    );

    expect(result.rejected).toEqual([]);
    expect(result.state.clubs.a.budget).toBe(105_000);
    expect(result.state.clubs.b.budget).toBe(95_000);
    expect(result.state.clubs.b.financialObligations?.[0]).toMatchObject({
      type: "loanWageContribution",
      playerId: "p1",
      creditorClubId: "a",
      weeklyAmount: 500,
      remainingWeeks: 10,
      amount: 5_000,
      status: "active",
    });
  });

  it("persists transfer add-ons as club obligations instead of charging them upfront", () => {
    const input = world(
      {
        p1: player(),
      },
      {
        a: club("a", { playerIds: ["p1"] }),
        b: club("b", { weeklyWageBudget: 6_000 }),
      },
    );

    const result = resolvePlayerMovements(
      input,
      [{
        type: "permanentTransfer",
        playerId: "p1",
        fromClubId: "a",
        toClubId: "b",
        fee: 10_000,
        signingBonus: 2_000,
        wage: 1_400,
        addOns: [
          { type: "appearanceBonus", value: 800, trigger: "20 appearances" },
          { type: "performanceBonus", value: 1_200, trigger: "10 goals or 10 assists" },
          { type: "sellOnClause", value: 15, trigger: "Future sale percentage" },
        ],
      }],
      4,
      2,
    );

    expect(result.rejected).toEqual([]);
    expect(result.state.clubs.a.budget).toBe(110_000);
    expect(result.state.clubs.b.budget).toBe(88_000);
    expect(result.state.clubs.b.financialObligations).toEqual([
      expect.objectContaining({
        type: "appearanceBonus",
        creditorClubId: "a",
        amount: 800,
        appearanceThreshold: 20,
        appearancesRecorded: 0,
      }),
      expect.objectContaining({
        type: "performanceBonus",
        creditorClubId: "a",
        amount: 1_200,
        goalThreshold: 10,
        assistThreshold: 10,
        goalsRecorded: 0,
        assistsRecorded: 0,
      }),
      expect.objectContaining({
        type: "sellOnClause",
        creditorClubId: "a",
        percentage: 15,
        trigger: "Future sale percentage",
        status: "active",
      }),
    ]);
    expect(result.state.clubs.b.financialObligations?.[0]?.weeklyAmount).toBeUndefined();
    expect(result.state.clubs.b.financialObligations?.[1]?.weeklyAmount).toBeUndefined();
  });

  it("settles a persisted sell-on clause exactly when the player moves again", () => {
    const result = resolvePlayerMovements(
      world(
        { p1: player() },
        {
          a: club("a", {
            playerIds: ["p1"],
            financialObligations: [{
              id: "sell-on-p1",
              type: "sellOnClause",
              playerId: "p1",
              creditorClubId: "c",
              percentage: 10,
              createdWeek: 1,
              createdSeason: 1,
              status: "active",
            }],
          }),
          b: club("b", { budget: 100_000, weeklyWageBudget: 6_000 }),
          c: club("c", { budget: 50_000 }),
        },
      ),
      [{
        type: "permanentTransfer",
        playerId: "p1",
        fromClubId: "a",
        toClubId: "b",
        fee: 20_000,
        wage: 1_200,
      }],
      6,
      2,
    );

    expect(result.rejected).toEqual([]);
    expect(result.state.clubs.a.budget).toBe(118_000);
    expect(result.state.clubs.b.budget).toBe(80_000);
    expect(result.state.clubs.c.budget).toBe(52_000);
    expect(result.state.clubs.a.financialObligations?.[0]).toMatchObject({
      id: "sell-on-p1",
      status: "settled",
    });
    expect(result.applied[0].financialSettlements).toEqual([{
      type: "sellOnClause",
      amount: 2_000,
      creditorClubId: "c",
      obligationId: "sell-on-p1",
    }]);
  });

  it("uses the shared affordability gate for signings, renewals, loans, and buy options", () => {
    const crowdedClub = club("b", {
      weeklyWageBudget: 3_000,
      playerIds: ["p2"],
    });
    const depthPlayer = player({
      id: "p2",
      clubId: "b",
      contractClubId: "b",
      wage: 2_900,
    });

    const freeAgentResult = resolvePlayerMovements(
      world(
        {
          p1: player({ clubId: "", contractClubId: undefined, wage: 0 }),
          p2: depthPlayer,
        },
        { a: club("a"), b: crowdedClub },
      ),
      [{
        type: "freeAgentSigning",
        playerId: "p1",
        toClubId: "b",
        wage: 200,
        contractLength: 2,
        signingBonus: 1_000,
      }],
      2,
      2,
    );
    expect(freeAgentResult.applied).toEqual([]);
    expect(freeAgentResult.rejected[0]?.reason).toContain("signing package");

    const youthResult = resolvePlayerMovements(
      world(
        {
          p1: player({ age: 17, clubId: "", contractClubId: undefined, wage: 0 }),
          p2: depthPlayer,
        },
        { a: club("a"), b: crowdedClub },
      ),
      [{
        type: "youthSigning",
        playerId: "p1",
        toClubId: "b",
        wage: 200,
        contractLength: 3,
      }],
      2,
      2,
    );
    expect(youthResult.applied).toEqual([]);
    expect(youthResult.rejected[0]?.reason).toContain("signing package");

    const renewalResult = resolvePlayerMovements(
      world(
        {
          p1: player({ wage: 2_800 }),
        },
        {
          a: club("a", {
            weeklyWageBudget: 3_000,
            playerIds: ["p1"],
          }),
          b: club("b"),
        },
      ),
      [{
        type: "contractRenewal",
        playerId: "p1",
        clubId: "a",
        contractLength: 3,
        wage: 3_300,
      }],
      2,
      2,
    );
    expect(renewalResult.applied).toEqual([]);
    expect(renewalResult.rejected[0]?.reason).toContain("renewed weekly wage");

    const transferResult = resolvePlayerMovements(
      world(
        {
          p1: player(),
          p2: depthPlayer,
        },
        {
          a: club("a", { playerIds: ["p1"] }),
          b: crowdedClub,
        },
      ),
      [{
        type: "permanentTransfer",
        playerId: "p1",
        fromClubId: "a",
        toClubId: "b",
        fee: 10_000,
        wage: 150,
        addOns: [{ type: "appearanceBonus", value: 800 }],
      }],
      2,
      2,
    );
    expect(transferResult.applied).toEqual([]);
    expect(transferResult.rejected[0]?.reason).toContain("transfer package");

    const loanStartResult = resolvePlayerMovements(
      world(
        {
          p1: player({ wage: 400 }),
          p2: depthPlayer,
        },
        {
          a: club("a", { playerIds: ["p1"] }),
          b: crowdedClub,
        },
      ),
      [{
        type: "loanStart",
        playerId: "p1",
        deal: {
          id: "loan-tight",
          playerId: "p1",
          parentClubId: "a",
          loanClubId: "b",
          startWeek: 2,
          startSeason: 2,
          endWeek: 12,
          endSeason: 2,
          loanFee: 500,
          wageContribution: 50,
          recallClause: true,
          status: "active",
        },
      }],
      2,
      2,
    );
    expect(loanStartResult.applied).toEqual([]);
    expect(loanStartResult.rejected[0]?.reason).toContain("weekly wage contribution");

    const buyOptionWorld = world(
      {
        p1: player({
          clubId: "b",
          contractClubId: "a",
          loanParentClubId: "a",
          onLoan: true,
          wage: 250,
        }),
        p2: depthPlayer,
      },
      {
        a: club("a", { playerIds: [], loanedOutPlayerIds: ["p1"] }),
        b: club("b", {
          weeklyWageBudget: 3_000,
          playerIds: ["p1", "p2"],
          loanedInPlayerIds: ["p1"],
          financialObligations: [{
            id: "loan-obligation",
            type: "loanWageContribution",
            playerId: "p1",
            creditorClubId: "a",
            amount: 400,
            weeklyAmount: 100,
            remainingWeeks: 4,
            createdWeek: 1,
            createdSeason: 2,
            status: "active",
          }],
        }),
      },
      {
        activeLoans: [{
          id: "loan-obligation",
          playerId: "p1",
          parentClubId: "a",
          loanClubId: "b",
          startWeek: 1,
          startSeason: 2,
          endWeek: 6,
          endSeason: 2,
          loanFee: 0,
          wageContribution: 40,
          buyOptionFee: 10_000,
          recallClause: true,
          status: "active",
        }],
      },
    );
    const buyOptionResult = resolvePlayerMovements(
      buyOptionWorld,
      [{
        type: "loanEnd",
        playerId: "p1",
        dealId: "loan-obligation",
        resolution: "buyOption",
      }],
      2,
      2,
    );
    expect(buyOptionResult.applied).toEqual([]);
    expect(buyOptionResult.rejected[0]?.reason).toContain("buy option");
  });

  it("settles weekly obligations once during the world tick", async () => {
    const { useGameStore } = await import("@/stores/gameStore");
    await useGameStore.getState().startNewGame({
      scoutFirstName: "Finance",
      scoutLastName: "Tick",
      scoutAge: 30,
      specialization: "youth",
      difficulty: "normal",
      worldSeed: "club-economics-tick",
      selectedCountries: ["england"],
      startingCountry: "england",
      nationality: "English",
      skillAllocations: {
        technicalEye: 2,
        psychologicalRead: 2,
        playerJudgment: 2,
        potentialAssessment: 2,
      },
      originId: "academy-apprentice",
      flawId: "fragile-network",
      doctrineIds: ["evidence-first"],
    });

    const generated = useGameStore.getState().gameState!;
    const [creditorClubId, debtorClubId] = Object.keys(generated.clubs);
    const playerId = generated.clubs[creditorClubId].playerIds[0];
    const state = {
      ...generated,
      currentWeek: 2,
      clubs: {
        ...generated.clubs,
        [creditorClubId]: {
          ...generated.clubs[creditorClubId],
          budget: 5_000,
        },
        [debtorClubId]: {
          ...generated.clubs[debtorClubId],
          budget: 10_000,
          financialObligations: [{
            id: "weekly-loan",
            type: "loanWageContribution",
            playerId,
            creditorClubId,
            amount: 1_200,
            weeklyAmount: 400,
            remainingWeeks: 3,
            createdWeek: 1,
            createdSeason: generated.currentSeason,
            status: "active",
          } satisfies ClubFinancialObligation],
        },
      },
    };

    const advanced = advanceWeek(state, emptyTick());
    const carriedObligation = advanced.clubs[debtorClubId].financialObligations?.[0];

    expect(advanced.clubs[creditorClubId].budget).toBe(5_400);
    expect(advanced.clubs[debtorClubId].budget).toBe(9_600);
    expect(carriedObligation).toMatchObject({
      amount: 800,
      remainingWeeks: 2,
      status: "active",
    });
  }, 60_000);

  it("removes a staged youth player when club affordability rejects the signing", async () => {
    const { useGameStore } = await import("@/stores/gameStore");
    await useGameStore.getState().startNewGame({
      scoutFirstName: "Youth",
      scoutLastName: "Integrity",
      scoutAge: 28,
      specialization: "youth",
      difficulty: "normal",
      worldSeed: "rejected-youth-signing-integrity",
      selectedCountries: ["england"],
      startingCountry: "england",
      nationality: "English",
      skillAllocations: {
        technicalEye: 2,
        psychologicalRead: 2,
        playerJudgment: 2,
        potentialAssessment: 2,
      },
      originId: "academy-apprentice",
      flawId: "fragile-network",
      doctrineIds: ["evidence-first"],
    });

    const generated = useGameStore.getState().gameState!;
    const [youthId, youth] = Object.entries(generated.unsignedYouth)[0];
    const targetClub = Object.values(generated.clubs)[0];
    const proposedYouth = {
      ...youth,
      placed: true,
      placedClubId: targetClub.id,
    };
    const state = {
      ...generated,
      clubs: {
        ...generated.clubs,
        [targetClub.id]: {
          ...targetClub,
          budget: 0,
          weeklyWageBudget: 1,
        },
      },
    };
    const tick: TickResult = {
      ...emptyTick(),
      youthAgingResult: {
        autoSigned: [{ youthId, clubId: targetClub.id }],
        retired: [],
        updatedUnsignedYouth: {
          ...generated.unsignedYouth,
          [youthId]: proposedYouth,
        },
      },
    };

    const advanced = advanceWeek(state, tick);

    expect(advanced.unsignedYouth[youthId]).toMatchObject({
      placed: false,
      placedClubId: undefined,
    });
    expect(advanced.players[youth.player.id]).toBeUndefined();
    expect(advanced.retiredPlayers[youth.player.id]).toBeUndefined();
    expect(advanced.playerMovementHistory).not.toContainEqual(
      expect.objectContaining({
        playerId: youth.player.id,
        type: "youthSigning",
      }),
    );
  }, 60_000);
});
