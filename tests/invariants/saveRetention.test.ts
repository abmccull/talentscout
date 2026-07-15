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
  collectCausallyReferencedPlayerIds,
  findSaveRetentionReferenceViolations,
  measureSaveRetentionFootprint,
  migrateHistoricalFixtureRetention,
  observeSaveRetentionCompaction,
  retainRequiredFixtureHistory,
  resolvePlacementPlayerId,
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
  it("does not mistake background world traffic for permanent scout causality", () => {
    const players = Object.fromEntries(
      ["background-loan", "scout-loan", "old-news", "recent-action"].map((id) => [
        id,
        { id, recentMatchRatings: [] } as unknown as Player,
      ]),
    );
    const sample = state({
      currentSeason: 8,
      players,
      activeLoans: [
        { id: "ai-loan", playerId: "background-loan" },
        { id: "authored-loan", playerId: "scout-loan", scoutId: "scout" },
      ] as GameState["activeLoans"],
      inbox: [
        {
          id: "old-news",
          week: 1,
          season: 3,
          type: "news",
          title: "Old news",
          body: "Historical notification",
          read: false,
          actionRequired: true,
          relatedId: "old-news",
          relatedEntityType: "player",
        },
        {
          id: "recent-action",
          week: 1,
          season: 8,
          type: "event",
          title: "Recent action",
          body: "A live decision",
          read: false,
          actionRequired: true,
          relatedId: "recent-action",
          relatedEntityType: "player",
        },
      ],
    });

    const causal = collectCausallyReferencedPlayerIds(sample);

    expect(causal.has("background-loan")).toBe(false);
    expect(causal.has("old-news")).toBe(false);
    expect(causal.has("scout-loan")).toBe(true);
    expect(causal.has("recent-action")).toBe(true);
  });

  it("keeps active-season details and every older fixture still referenced by durable evidence", () => {
    const retained = retainRequiredFixtureHistory(state());

    expect(Object.keys(retained).sort()).toEqual([
      "current",
      "observed",
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

  it("projects old material moves before releasing their raw ledger rows", () => {
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
    ]);
    expect(compacted.worldHistory?.seasons[0].players[0].movementEventIds).toEqual(["transfer"]);
    expect(compacted.worldHistory?.seasons[0].playerMovementSummaries).toEqual([{
      id: "transfer",
      playerId: "player",
      type: "permanentTransfer",
      week: 1,
    }]);
    expect(findSaveRetentionReferenceViolations(compacted)).toEqual([]);
  });

  it("backfills every archived-season movement before pruning non-causal raw rows", () => {
    const legacy = state({
      currentSeason: 7,
      reports: {
        causal: { id: "causal-report", playerId: "causal-player" } as GameState["reports"][string],
      },
      playerMovementHistory: [
        {
          id: "archived-unlisted",
          playerId: "unlisted-player",
          type: "permanentTransfer",
          week: 2,
          season: 1,
          fromClubId: "old-club",
          toClubId: "new-club",
          fee: 2_000_000,
          reason: "Legacy reason that belongs only in the detailed ledger.",
        },
        {
          id: "archived-causal",
          playerId: "causal-player",
          type: "loanStart",
          week: 4,
          season: 1,
          fromClubId: "home",
          toClubId: "loan-club",
          loanDealId: "loan-detail",
        },
        {
          id: "unarchived-old",
          playerId: "unarchived-player",
          type: "release",
          week: 1,
          season: 2,
        },
      ],
      worldHistory: {
        version: 1,
        latestRecordedSeason: 2,
        seasons: [{
          season: 1,
          recordedAfterTotalWeeks: 46,
          leagues: [],
          clubs: [],
          // Neither player made a public comparison row in this legacy save.
          players: [],
        }],
      },
    });

    const compacted = compactLongCareerHistory(legacy);
    const archive = compacted.worldHistory!.seasons[0];

    expect(archive.playerMovementSummaries).toEqual([
      {
        id: "archived-causal",
        playerId: "causal-player",
        type: "loanStart",
        week: 4,
        fromClubId: "home",
        toClubId: "loan-club",
      },
    ]);
    expect(compacted.playerMovementHistory.map((movement) => movement.id).sort()).toEqual([
      "archived-causal",
      "unarchived-old",
    ]);
    expect(JSON.stringify(archive.playerMovementSummaries)).not.toContain("Legacy reason");
    expect(JSON.stringify(archive.playerMovementSummaries)).not.toContain("loan-detail");
    expect(findSaveRetentionReferenceViolations(compacted)).toEqual([]);
    expect(compactLongCareerHistory(structuredClone(compacted))).toEqual(compacted);
  });

  it("retires old background movement summaries only after safe archive projection", () => {
    const legacy = state({
      currentSeason: 10,
      reports: {
        causal: {
          id: "causal-report",
          playerId: "causal-player",
        } as GameState["reports"][string],
      },
      playerMovementHistory: [
        {
          id: "causal-transfer",
          playerId: "causal-player",
          type: "permanentTransfer",
          week: 2,
          season: 1,
        },
        {
          id: "background-transfer",
          playerId: "background-player",
          type: "permanentTransfer",
          week: 3,
          season: 1,
        },
      ],
      worldHistory: {
        version: 1,
        latestRecordedSeason: 1,
        seasons: [{
          season: 1,
          recordedAfterTotalWeeks: 46,
          leagues: [],
          clubs: [],
          players: [{
            playerId: "causal-player",
            age: 20,
            position: "CM",
            currentAbility: 100,
            marketValue: 1_000_000,
            status: "contracted",
            movementEventIds: ["causal-transfer"],
          }],
        }],
      },
    });

    const compacted = compactLongCareerHistory(legacy);

    expect(compacted.worldHistory?.seasons[0].playerMovementSummaries?.map(
      (summary) => summary.id,
    )).toEqual(["causal-transfer"]);
    expect(compacted.playerMovementHistory.map((movement) => movement.id)).toEqual([
      "causal-transfer",
    ]);
    expect(compactLongCareerHistory(structuredClone(compacted))).toEqual(compacted);
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

  it("supports a smaller historic public archive without dropping causal careers", () => {
    const players = Array.from(
      { length: 12 },
      (_, index): PlayerSeasonHistory => ({
        playerId: `player-${index}`,
        age: 24,
        position: "CM",
        currentAbility: 100 + index,
        marketValue: 1_000_000 + index,
        status: "contracted",
        movementEventIds: [],
        performance: {
          appearances: 20,
          starts: 18,
          minutesPlayed: 1_600,
          appearancesWithoutMinutes: 0,
          averageRating: 6 + index / 10,
          goals: index,
          assists: 0,
          cleanSheets: 0,
        },
      }),
    );

    const retained = selectWorldHistoryPlayers(players, new Set(["player-0"]), 4);

    expect(retained).toHaveLength(4);
    expect(retained.some((player) => player.playerId === "player-0")).toBe(true);
    expect(retained.some((player) => player.playerId === "player-11")).toBe(true);
  });

  it("coalesces duplicate legacy season rows without double-counting performance", () => {
    const base: PlayerSeasonHistory = {
      playerId: "duplicate",
      firstName: "Ada",
      age: 20,
      position: "CM",
      currentAbility: 80,
      marketValue: 100,
      status: "contracted",
      movementEventIds: ["move-a", "move-a"],
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
    };
    const stronger: PlayerSeasonHistory = {
      ...base,
      firstName: undefined,
      lastName: "Lovelace",
      marketValue: 1_000,
      movementEventIds: ["move-b"],
      performance: { ...base.performance!, averageRating: 8 },
    };

    const retained = selectWorldHistoryPlayers([base, stronger], new Set());
    const reversed = selectWorldHistoryPlayers([stronger, base], new Set());

    expect(retained).toHaveLength(1);
    expect(reversed).toEqual(retained);
    expect(retained[0]).toMatchObject({
      firstName: "Ada",
      lastName: "Lovelace",
      marketValue: 1_000,
      movementEventIds: ["move-a", "move-b"],
      performance: { appearances: 1, averageRating: 8 },
    });
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

  it("compacts terminal youth immediately while preserving active and malformed causal records", () => {
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

  it("removes an authoritatively placed duplicate while keeping its player resolvable", () => {
    const placedPlayer = {
      id: "placed-player",
      firstName: "Placed",
      lastName: "Prospect",
      clubId: "home",
      contractClubId: "home",
      developmentHistory: [],
    } as unknown as Player;
    const placedYouth = {
      id: "placed-youth",
      player: placedPlayer,
      visibility: 80,
      buzzLevel: 70,
      discoveredBy: ["scout"],
      regionId: "region",
      country: "england",
      venueAppearances: [],
      generatedSeason: 4,
      placed: true,
      placedClubId: "home",
      retired: false,
    } as UnsignedYouth;
    const placement = {
      id: "placement-authoritative",
      reportId: "placed-report",
      unsignedYouthId: placedYouth.id,
      targetClubId: "home",
      scoutId: "scout",
      conviction: "recommend",
      clubResponse: "accepted",
      qualityScore: 70,
      week: 4,
      season: 4,
    } as GameState["placementReports"][string];
    const legacy = state({
      players: { ...state().players, [placedPlayer.id]: placedPlayer },
      unsignedYouth: { [placedYouth.id]: placedYouth },
      reports: {
        "placed-report": {
          id: "placed-report",
          playerId: placedPlayer.id,
        } as GameState["reports"][string],
      },
      placementReports: { [placement.id]: placement },
      playerMovementHistory: [{
        id: "placed-signing",
        playerId: placedPlayer.id,
        type: "youthSigning",
        toClubId: "home",
        week: 4,
        season: 4,
      }],
    });

    const compacted = compactLongCareerHistory(legacy);

    expect(compacted.unsignedYouth[placedYouth.id]).toBeUndefined();
    expect(resolvePlacementPlayerId(compacted, placement)).toBe(placedPlayer.id);
    expect(compacted.players[placedPlayer.id]).toBeDefined();
    expect(findSaveRetentionReferenceViolations(compacted)).toEqual([]);
  });

  it("is idempotent across a JSON save/reload and preserves every retained causal reference", () => {
    const legacyDevelopmentTurn = {
      id: "development_2_1_archived_breakthrough",
      season: 2,
      week: 1,
      clubId: "home",
      event: "breakthrough" as const,
      outcome: "improved" as const,
      environmentBand: "excellent" as const,
      summary: "A visible development breakthrough arrived in an excellent environment.",
      factors: [{
        label: "Coaching infrastructure",
        impact: "strong-positive",
        summary: "Legacy duplicated explanation.",
      }],
    };
    const retiredPlayer = {
      id: "retired",
      firstName: "Retired",
      lastName: "Prospect",
      recentMatchRatings: [{ fixtureId: "retired-rated", week: 1, season: 2, rating: 7 }],
      developmentHistory: [legacyDevelopmentTurn],
    } as unknown as Player;
    const oldYouth = {
      id: "youth-causal",
      player: {
        id: "youth-player",
        firstName: "Youth",
        lastName: "Prospect",
        recentMatchRatings: [],
        developmentHistory: [legacyDevelopmentTurn],
      } as unknown as Player,
      visibility: 10,
      buzzLevel: 10,
      discoveredBy: [],
      regionId: "region",
      country: "england",
      venueAppearances: [],
      generatedSeason: 1,
      placed: true,
      retired: false,
    } as UnsignedYouth;
    const legacy = state({
      currentSeason: 8,
      fixtures: {
        current: fixture("current", 8),
        unreferenced: fixture("unreferenced", 2),
        observed: fixture("observed", 2),
        rated: fixture("rated", 2),
        "retired-rated": fixture("retired-rated", 2),
      },
      observations: {
        observation: { id: "observation", playerId: "player", matchId: "observed" } as Observation,
      },
      reports: {
        retired: { id: "retired-report", playerId: "retired" } as GameState["reports"][string],
        youth: { id: "youth-report", playerId: "youth-player" } as GameState["reports"][string],
      },
      retiredPlayers: { retired: retiredPlayer },
      retiredPlayerIds: ["retired"],
      unsignedYouth: { [oldYouth.id]: oldYouth },
      placementReports: {
        placement: {
          id: "placement",
          unsignedYouthId: oldYouth.id,
        } as GameState["placementReports"][string],
      },
      playerMovementHistory: [
        { id: "retirement", playerId: "retired", type: "retirement", week: 1, season: 2 },
        { id: "youth-signing", playerId: "youth-player", type: "youthSigning", week: 1, season: 2 },
      ],
      worldHistory: {
        version: 1,
        latestRecordedSeason: 7,
        seasons: [{
          season: 2,
          recordedAfterTotalWeeks: 92,
          leagues: [],
          clubs: [],
          players: [{
            playerId: "retired",
            age: 34,
            position: "CM",
            currentAbility: 80,
            marketValue: 0,
            status: "retired",
            movementEventIds: ["retirement"],
          }],
        }],
      },
    });

    const compacted = compactLongCareerHistory(legacy);
    const restored = JSON.parse(JSON.stringify(compacted)) as GameState;
    const compactedAgain = compactLongCareerHistory(restored);

    expect(compacted.fixtures.unreferenced).toBeUndefined();
    expect(compacted.fixtures.observed).toBeDefined();
    expect(compacted.fixtures.rated).toBeUndefined();
    expect(compacted.players.player.recentMatchRatings).toEqual([
      { fixtureId: "rated", week: 1, season: 2, rating: 7 },
    ]);
    expect(compacted.fixtures["retired-rated"]).toBeUndefined();
    expect(compacted.retiredPlayers.retired.recentMatchRatings).toEqual(
      retiredPlayer.recentMatchRatings,
    );
    expect(JSON.stringify(compacted.retiredPlayers.retired.developmentHistory)).not.toContain(
      '"factors"',
    );
    expect(JSON.stringify(compacted.unsignedYouth[oldYouth.id].player.developmentHistory)).not.toContain(
      '"factors"',
    );
    expect(findSaveRetentionReferenceViolations(compacted)).toEqual([]);
    expect(compactedAgain).toEqual(compacted);
  });

  it("attributes exact UTF-8 collection deltas without adding telemetry to the save", () => {
    const samples: Parameters<typeof observeSaveRetentionCompaction>[0] extends
      (sample: infer T) => void ? T[] : never = [];
    const stopObserving = observeSaveRetentionCompaction((sample) => samples.push(sample));
    const visibleDevelopmentTurn = {
      id: "development_2_1_player_routine-growth",
      season: 2,
      week: 1,
      clubId: "home",
      event: "routine-growth" as const,
      outcome: "improved" as const,
      environmentBand: "supportive" as const,
      summary: "Steady progress was recorded while the player was in a supportive environment.",
    };
    const legacyVerboseDevelopmentTurn = {
      ...visibleDevelopmentTurn,
      factors: [{
        label: "Playing pathway",
        impact: "strong-positive",
        summary: "A long legacy explanation that was duplicated across every world player.",
      }],
    };
    const legacy = state({
      fixtures: {
        current: fixture("current", 5),
        obsolete: fixture("obsolete", 3),
      },
      observations: {},
      players: {
        player: {
          id: "player",
          recentMatchRatings: [],
          developmentHistory: [legacyVerboseDevelopmentTurn],
        } as unknown as Player,
      },
      matchRatings: { obsolete: {} },
      playerMovementHistory: [],
      retiredPlayerIds: [],
      unsignedYouth: {},
    });

    try {
      const before = measureSaveRetentionFootprint(legacy);
      const compacted = compactLongCareerHistory(legacy);
      const after = measureSaveRetentionFootprint(compacted);

      expect(samples).toHaveLength(1);
      expect(samples[0].removedBytes).toBe(before.totalBytes - after.totalBytes);
      expect(samples[0].collectionDeltas.fixtures).toBeGreaterThan(0);
      expect(samples[0].collectionDeltas.matchRatings).toBeGreaterThan(0);
      expect(samples[0].collectionDeltas.players).toBeGreaterThan(0);
      expect(compacted.players.player.developmentHistory).toEqual([visibleDevelopmentTurn]);
      expect("saveRetentionTelemetry" in compacted).toBe(false);
    } finally {
      stopObserving();
    }
  });

  it("keeps worst-case player timelines bounded without dropping visible multi-season turns", () => {
    const verboseHistory = Array.from({ length: 8 }, (_, index) => ({
      id: `development_${index + 1}_46_synthetic_routine-growth`,
      season: index + 1,
      week: 46,
      clubId: "home",
      event: "routine-growth" as const,
      outcome: "improved" as const,
      environmentBand: "supportive" as const,
      summary: "Steady progress was recorded while the player was in a supportive environment.",
      factors: Array.from({ length: 3 }, (__, factorIndex) => ({
        label: `Historical factor ${factorIndex + 1}`,
        impact: "strong-positive",
        summary: "This legacy factor explanation was copied into every player turn even though no gameplay or player-facing screen read it.",
      })),
    }));
    const expectedVisibleHistory = verboseHistory.map((turn) => ({
      id: turn.id,
      season: turn.season,
      week: turn.week,
      clubId: turn.clubId,
      event: turn.event,
      outcome: turn.outcome,
      environmentBand: turn.environmentBand,
      summary: turn.summary,
    }));
    const players = Object.fromEntries(
      Array.from({ length: 512 }, (_, index) => {
        const playerId = `synthetic-${index}`;
        return [
          playerId,
          {
            id: playerId,
            firstName: "Synthetic",
            lastName: String(index),
            recentMatchRatings: [],
            developmentHistory: verboseHistory.map((turn) => ({
              ...turn,
              id: turn.id.replace("synthetic", playerId),
            })),
          } as unknown as Player,
        ];
      }),
    );
    const legacy = state({
      players,
      reports: {
        causal: {
          id: "causal",
          playerId: "synthetic-0",
        } as GameState["reports"][string],
      },
    });
    const before = measureSaveRetentionFootprint(legacy);

    const compacted = compactLongCareerHistory(legacy);
    const after = measureSaveRetentionFootprint(compacted);
    const sampleHistory = compacted.players["synthetic-0"].developmentHistory ?? [];

    expect(sampleHistory).toEqual(
      expectedVisibleHistory.map((turn) => ({
        ...turn,
        id: turn.id.replace("synthetic", "synthetic-0"),
      })),
    );
    expect(JSON.stringify(compacted.players)).not.toContain('"factors"');
    expect(compacted.players["synthetic-1"].developmentHistory).toHaveLength(3);
    expect(after.collections.players).toBeLessThan(before.collections.players * 0.45);
    expect(before.collections.players - after.collections.players).toBeGreaterThan(1024 * 1024);
    expect(compactLongCareerHistory(JSON.parse(JSON.stringify(compacted)) as GameState)).toEqual(
      compacted,
    );
  });

  it("retains actionable injury detail while compacting closed historical incidents", () => {
    const injury = (id: string, season: number) => ({
      id,
      playerId: "player",
      type: "hamstring" as const,
      severity: "moderate" as const,
      recoveryWeeks: 5,
      weeksRemaining: 0,
      reinjuryRisk: 0,
      occurredWeek: 10,
      occurredSeason: season,
    });
    const activeHistoricalInjury = {
      ...injury("active-historical", 3),
      weeksRemaining: 2,
    };
    const legacy = state({
      currentSeason: 8,
      players: {
        player: {
          id: "player",
          recentMatchRatings: [],
          currentInjury: activeHistoricalInjury,
          injuryHistory: {
            playerId: "player",
            injuries: [
              injury("closed-old", 2),
              activeHistoricalInjury,
              injury("review-window", 6),
              injury("recent-a", 7),
              injury("recent-b", 7),
              injury("current", 8),
            ],
            totalWeeksMissed: 20,
            injuryProneness: 0.12,
            reinjuryWindowWeeksLeft: 0,
          },
        } as unknown as Player,
      },
    });

    const compacted = compactLongCareerHistory(legacy);
    const retained = compacted.players.player.injuryHistory!;

    expect(retained.injuries.map((entry) => entry.id)).toEqual([
      "active-historical",
      "recent-a",
      "recent-b",
      "current",
    ]);
    expect(retained.totalWeeksMissed).toBe(20);
    expect(retained.injuryProneness).toBe(0.12);
    expect(compactLongCareerHistory(structuredClone(compacted))).toEqual(compacted);
  });

  it("reports exact broken compaction-owned references", () => {
    const broken = state({
      fixtures: {},
      observations: {
        observation: { id: "observation", matchId: "gone" } as Observation,
      },
      players: {},
      playedFixtures: ["played-gone"],
      matchRatings: {},
    });

    expect(findSaveRetentionReferenceViolations(broken)).toEqual([
      "observation:observation:missing-fixture:gone",
      "playedFixtures[0]:missing-fixture:played-gone",
    ]);
  });
});
