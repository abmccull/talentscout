import { describe, expect, it } from "vitest";
import type {
  Fixture,
  GameState,
  Observation,
  Player,
  UnsignedYouth,
} from "@/engine/core/types";
import {
  compactLongCareerHistory,
  migrateHistoricalFixtureRetention,
  retainRequiredFixtureHistory,
  selectWorldHistoryPlayers,
  WORLD_HISTORY_PLAYER_LIMIT,
} from "@/engine/world/saveRetention";
import type { PlayerSeasonHistory } from "@/engine/world/worldHistory";

function fixture(id: string, season: number): Fixture {
  return {
    id,
    season,
    week: 1,
    leagueId: "league",
    homeClubId: "home",
    awayClubId: "away",
    played: true,
  };
}

function state(overrides: Partial<GameState> = {}): GameState {
  return {
    currentSeason: 5,
    fixtures: {
      old: fixture("old", 1),
      observed: fixture("observed", 2),
      rated: fixture("rated", 2),
      previous: fixture("previous", 4),
      current: fixture("current", 5),
    },
    observations: {
      observation: { id: "observation", matchId: "observed" } as Observation,
    },
    players: {
      player: {
        id: "player",
        recentMatchRatings: [{ fixtureId: "rated", week: 1, season: 2, rating: 7 }],
      } as Player,
    },
    retiredPlayers: {},
    playedFixtures: [],
    rivalScouts: {},
    rivalActivities: [],
    disciplinaryRecords: {},
    schedule: { week: 1, season: 5, activities: Array(7).fill(null), completed: false },
    matchRatings: {
      old: {},
      observed: {},
      rated: {},
      previous: {},
      current: {},
    },
    ...overrides,
  } as unknown as GameState;
}

describe("long-career save retention", () => {
  it("keeps current/previous details and every fixture still referenced by durable evidence", () => {
    const retained = retainRequiredFixtureHistory(state());

    expect(Object.keys(retained).sort()).toEqual([
      "current",
      "observed",
      "previous",
      "rated",
    ]);
  });

  it("repairs an old save without leaving orphaned per-fixture ratings", () => {
    const legacy = state();

    migrateHistoricalFixtureRetention(legacy);

    expect(legacy.fixtures.old).toBeUndefined();
    expect(legacy.matchRatings.old).toBeUndefined();
    expect(legacy.matchRatings.observed).toBeDefined();
  });

  it("fails safely for pre-fixture saves during canonical migration", () => {
    const legacy = state({
      fixtures: undefined as unknown as GameState["fixtures"],
      matchRatings: undefined as unknown as GameState["matchRatings"],
    });

    const compacted = compactLongCareerHistory(legacy);

    expect(compacted.fixtures).toEqual({});
    expect(compacted.matchRatings).toEqual({});
  });

  it("keeps material archive movements while bounding routine renewals", () => {
    const legacy = state({
      currentSeason: 5,
      playerMovementHistory: [
        { id: "old-renewal", playerId: "player", type: "contractRenewal", week: 1, season: 1 },
        { id: "recent-renewal", playerId: "player", type: "contractRenewal", week: 1, season: 4 },
        { id: "transfer", playerId: "player", type: "permanentTransfer", week: 1, season: 1 },
      ],
      worldHistory: {
        version: 1,
        latestRecordedSeason: 4,
        seasons: [{
          season: 1,
          recordedAfterTotalWeeks: 46,
          leagues: [],
          clubs: [],
          players: [{
            playerId: "player",
            age: 20,
            position: "CM",
            currentAbility: 100,
            marketValue: 1_000_000,
            status: "contracted",
            movementEventIds: ["old-renewal", "transfer"],
          }],
        }],
      },
    });

    const compacted = compactLongCareerHistory(legacy);

    expect(compacted.playerMovementHistory.map((movement) => movement.id)).toEqual([
      "recent-renewal",
      "transfer",
    ]);
    expect(compacted.worldHistory?.seasons[0].players[0].movementEventIds).toEqual(["transfer"]);
  });

  it("caps global detail while never sampling out a scout-causal player", () => {
    const players = Array.from(
      { length: WORLD_HISTORY_PLAYER_LIMIT + 5 },
      (_, index): PlayerSeasonHistory => ({
        playerId: `player-${String(index).padStart(4, "0")}`,
        age: 20,
        position: "CM",
        currentAbility: 80,
        marketValue: index,
        status: "contracted",
        movementEventIds: [],
        performance: {
          appearances: 1,
          starts: 1,
          minutesPlayed: 90,
          appearancesWithoutMinutes: 0,
          averageRating: 6,
          goals: 0,
          assists: 0,
          cleanSheets: 0,
        },
      }),
    );
    const causalId = players[0].playerId;

    const retained = selectWorldHistoryPlayers(players, new Set([causalId]));

    expect(retained).toHaveLength(WORLD_HISTORY_PLAYER_LIMIT);
    expect(retained.some((player) => player.playerId === causalId)).toBe(true);
  });

  it("compacts unreferenced retired records but preserves causal and recent careers", () => {
    const retired = (id: string): Player => ({
      id,
      firstName: "Retired",
      lastName: id,
      clubId: "",
      contractClubId: undefined,
      recentMatchRatings: [],
    } as unknown as Player);
    const legacy = state({
      currentSeason: 5,
      reports: {
        report: { id: "report", playerId: "causal" } as GameState["reports"][string],
      },
      retiredPlayers: {
        causal: retired("causal"),
        recent: retired("recent"),
        obsolete: retired("obsolete"),
      },
      retiredPlayerIds: ["causal", "recent", "obsolete"],
      playerMovementHistory: [
        { id: "recent-retirement", playerId: "recent", type: "retirement", week: 1, season: 4 },
        { id: "old-retirement", playerId: "obsolete", type: "retirement", week: 1, season: 1 },
      ],
    });

    const compacted = compactLongCareerHistory(legacy);

    expect(Object.keys(compacted.retiredPlayers).sort()).toEqual(["causal", "recent"]);
    expect(compacted.retiredPlayerIds.sort()).toEqual(["causal", "recent"]);
  });

  it("compacts terminal youth with their old signing detail while preserving causal, recent, and active records", () => {
    const youth = (
      id: string,
      generatedSeason: number,
      flags: Partial<Pick<UnsignedYouth, "placed" | "retired">> = {},
    ): UnsignedYouth => ({
      id: `youth-${id}`,
      player: {
        id: `player-${id}`,
        firstName: "Youth",
        lastName: id,
        recentMatchRatings: [],
      } as unknown as Player,
      visibility: 10,
      buzzLevel: 10,
      discoveredBy: [],
      regionId: "region",
      country: "england",
      venueAppearances: [],
      generatedSeason,
      placed: false,
      retired: false,
      ...flags,
    });
    const active = youth("active", 1);
    const causal = youth("causal", 1, { placed: true });
    const recent = youth("recent", 4, { placed: true });
    const oldPlaced = youth("old-placed", 1, { placed: true });
    const oldRetired = youth("old-retired", 1, { retired: true });
    const legacy = state({
      currentSeason: 10,
      reports: {
        causal: { id: "causal", playerId: causal.player.id } as GameState["reports"][string],
      },
      unsignedYouth: Object.fromEntries(
        [active, causal, recent, oldPlaced, oldRetired].map((record) => [record.id, record]),
      ),
      playerMovementHistory: [
        { id: "sign-causal", playerId: causal.player.id, type: "youthSigning", week: 1, season: 2 },
        { id: "sign-recent", playerId: recent.player.id, type: "youthSigning", week: 1, season: 9 },
        { id: "sign-old", playerId: oldPlaced.player.id, type: "youthSigning", week: 1, season: 2 },
      ],
    });

    const compacted = compactLongCareerHistory(legacy);

    expect(Object.keys(compacted.unsignedYouth).sort()).toEqual([
      active.id,
      causal.id,
      recent.id,
    ].sort());
    expect(compacted.playerMovementHistory.map((movement) => movement.id).sort()).toEqual([
      "sign-causal",
      "sign-recent",
    ]);
    for (const record of Object.values(compacted.unsignedYouth).filter((entry) => entry.placed)) {
      expect(compacted.playerMovementHistory.some(
        (movement) => movement.playerId === record.player.id && movement.type === "youthSigning",
      )).toBe(true);
    }
  });
});
