import { describe, expect, it } from "vitest";
import type { GameState } from "@/engine/core/types";
import {
  compactWeeklyWorkerCommit,
  materializeWeeklyWorkerCommit,
} from "@/stores/actions/weeklyHeadlessTransaction";

describe("weekly worker state delta", () => {
  it("returns only changed top-level branches and materializes the exact next state", () => {
    const stablePlayers = { player: { id: "player" } };
    const stableHistory = [{ season: 1 }];
    const source = {
      seed: "delta",
      currentSeason: 1,
      currentWeek: 8,
      players: stablePlayers,
      performanceHistory: stableHistory,
      obsoleteTransientField: true,
    } as unknown as GameState;
    const next = {
      ...source,
      currentWeek: 9,
      inbox: [{ id: "message" }],
    } as unknown as GameState;
    delete (next as unknown as Record<string, unknown>).obsoleteTransientField;

    const compact = compactWeeklyWorkerCommit(source, {
      patch: {
        gameState: next,
        currentScreen: "calendar",
      },
      tutorialCommands: [],
    }, 7);
    const materialized = materializeWeeklyWorkerCommit(source, compact);

    expect(compact.gameState).toEqual({
      kind: "delta",
      changedFields: {
        currentWeek: 9,
        inbox: next.inbox,
      },
      recordDeltas: {},
      arrayDeltas: {},
      removedFields: ["obsoleteTransientField"],
    });
    expect(compact.metrics).toMatchObject({
      computeMs: 7,
      changedFieldCount: 3,
      changedEntryCount: 3,
      totalFieldCount: 6,
    });
    expect(materialized.patch).toEqual({
      currentScreen: "calendar",
      gameState: next,
    });
    expect(materialized.patch.gameState?.players).toBe(stablePlayers);
    expect(materialized.patch.gameState?.performanceHistory).toBe(stableHistory);
    expect(compact.metrics.responseBytes).toBeGreaterThan(0);
  });

  it("compacts structurally cloned arrays to changed indexes", () => {
    const source = {
      seed: "array-delta",
      currentSeason: 2,
      currentWeek: 4,
      performanceHistory: Array.from({ length: 20 }, (_, index) => ({
        season: index + 1,
        rating: 70 + index,
        narrative: `Preserved historical season ${index + 1}`,
      })),
    } as unknown as GameState;
    const next = structuredClone(source);
    next.currentWeek = 5;
    (next.performanceHistory[1] as unknown as { rating: number }).rating = 76;
    next.performanceHistory.push({
      season: 21,
      rating: 91,
      narrative: "New season",
    } as never);

    const compact = compactWeeklyWorkerCommit(source, {
      patch: { gameState: next },
      tutorialCommands: [],
    }, 2);
    const materialized = materializeWeeklyWorkerCommit(source, compact);

    expect(compact.gameState).toMatchObject({
      kind: "delta",
      arrayDeltas: {
        performanceHistory: {
          nextLength: 21,
          changedEntries: {
            1: {
              kind: "replace",
              value: {
                season: 2,
                rating: 76,
                narrative: "Preserved historical season 2",
              },
            },
            20: {
              kind: "replace",
              value: { season: 21, rating: 91, narrative: "New season" },
            },
          },
        },
      },
    });
    expect(materialized.patch.gameState).toEqual(next);
    expect(materialized.patch.gameState?.performanceHistory[0])
      .toBe(source.performanceHistory[0]);
  });

  it("omits large structurally cloned branches when their values are unchanged", () => {
    const source = {
      seed: "large-equal-delta",
      currentSeason: 4,
      currentWeek: 12,
      players: Object.fromEntries(
        Array.from({ length: 250 }, (_, index) => [
          `player-${index}`,
          {
            id: `player-${index}`,
            attributes: { pace: 8 + (index % 11), vision: 7 + (index % 12) },
            history: Array.from({ length: 4 }, (__, season) => ({ season, clubId: `club-${index % 20}` })),
          },
        ]),
      ),
      playerMovementHistory: Array.from({ length: 500 }, (_, index) => ({
        id: `movement-${index}`,
        playerId: `player-${index % 250}`,
        season: 1 + (index % 4),
      })),
    } as unknown as GameState;
    const structurallyEqual = structuredClone(source);

    const compact = compactWeeklyWorkerCommit(source, {
      patch: { gameState: structurallyEqual },
      tutorialCommands: [],
    }, 1);
    const materialized = materializeWeeklyWorkerCommit(source, compact);

    expect(compact.gameState).toEqual({
      kind: "delta",
      changedFields: {},
      recordDeltas: {},
      arrayDeltas: {},
      removedFields: [],
    });
    expect(compact.metrics).toMatchObject({
      changedFieldCount: 0,
      changedEntryCount: 0,
    });
    expect(materialized.patch.gameState?.players).toBe(source.players);
    expect(materialized.patch.gameState?.playerMovementHistory)
      .toBe(source.playerMovementHistory);
  });
});
