import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { getSeasonLength } from "@/engine/core/gameDate";
import type { GameState } from "@/engine/core/types";
import { findUnpartitionedGameStateKeys } from "@/engine/core/gameStatePartitions";
import {
  deriveCareerEraContext,
  directCareerEra,
} from "@/engine/events/careerEraDirector";
import { migrateSaveState } from "@/lib/db";
import {
  compactWeeklyWorkerCommit,
  materializeWeeklyWorkerCommit,
} from "@/stores/actions/weeklyHeadlessTransaction";
import {
  createWeeklyWorkerWireState,
  materializeWeeklyWorkerWireState,
} from "@/stores/actions/weeklyWorkerSync";
import type { WeeklyWorkerInput } from "@/stores/actions/weeklyWorkerTypes";

const goldenV0Path = fileURLToPath(
  new URL("../fixtures/saves/v0-save-record.json", import.meta.url),
);

function migratedCareerEraState(): GameState {
  const record = JSON.parse(readFileSync(goldenV0Path, "utf8")) as {
    state: Record<string, unknown>;
  };
  const baseline = migrateSaveState(record.state);
  const seasonLength = getSeasonLength(baseline.fixtures, baseline.currentSeason);

  return {
    ...baseline,
    careerEraDirectorState: directCareerEra(
      baseline.careerEraDirectorState,
      deriveCareerEraContext(baseline, seasonLength),
    ),
  };
}

function workerInput(gameState: GameState): WeeklyWorkerInput {
  return {
    gameState,
    weekSimulation: { currentDay: 7 } as WeeklyWorkerInput["weekSimulation"],
    currentScreen: "weekSimulation",
    isLoaded: true,
    tutorial: {
      completedSequences: [],
      visitedScreens: [],
      dismissedHints: [],
      discoveredFeatures: [],
    },
  };
}

describe("career era persistence compatibility", () => {
  it("keeps career-era state equivalent through worker sync patches and compacted commits", () => {
    const source = migratedCareerEraState();
    const current = source.careerEraDirectorState?.current;
    expect(current).toBeDefined();
    if (!current) return;

    const next = structuredClone(source);
    next.careerEraDirectorState = {
      ...next.careerEraDirectorState!,
      current: {
        ...current,
        reinforcementCount: current.reinforcementCount + 1,
        lastReinforcedAt: {
          season: next.currentSeason,
          week: next.currentWeek,
        },
      },
      history: [
        ...next.careerEraDirectorState!.history,
        {
          id: `${current.id}-history`,
          theme: current.theme,
          title: current.title,
          startedAt: current.startedAt,
          endedAt: {
            season: next.currentSeason,
            week: next.currentWeek,
          },
          reinforcementCount: current.reinforcementCount,
        },
      ],
      processedWeekKeys: [
        ...next.careerEraDirectorState!.processedWeekKeys,
        `${next.currentSeason}:${next.currentWeek + 1}`,
      ],
    };
    next.inbox = [
      ...next.inbox,
      {
        id: `career-era-compat:${current.id}`,
        week: next.currentWeek,
        season: next.currentSeason,
        type: "news",
        title: current.title,
        body: `${current.premise} ${current.deskPrompt}`,
        read: false,
        actionRequired: false,
        relatedId: current.id,
        relatedEntityType: "narrative",
      },
    ];

    const wire = createWeeklyWorkerWireState(source, workerInput(next));
    expect(wire).toMatchObject({
      kind: "patch",
      gameState: {
        changedFields: {
          careerEraDirectorState: next.careerEraDirectorState,
          inbox: next.inbox,
        },
        removedFields: [],
      },
    });
    expect(materializeWeeklyWorkerWireState(source, wire).gameState).toEqual(next);

    const compact = compactWeeklyWorkerCommit(source, {
      patch: { gameState: next },
      tutorialCommands: [],
    }, 1);
    expect(compact.gameState.kind).toBe("delta");
    if (compact.gameState.kind !== "delta") return;
    expect(
      compact.gameState.recordDeltas.careerEraDirectorState
      ?? compact.gameState.changedFields.careerEraDirectorState,
    ).toBeDefined();
    expect(
      compact.gameState.arrayDeltas.inbox
      ?? compact.gameState.changedFields.inbox,
    ).toBeDefined();
    expect(materializeWeeklyWorkerCommit(source, compact).patch.gameState).toEqual(next);
    expect(findUnpartitionedGameStateKeys(next)).toEqual([]);
  });
});
