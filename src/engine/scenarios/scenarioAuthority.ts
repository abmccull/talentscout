import type {
  GameState,
  InvalidScenarioArchiveEntry,
} from "@/engine/core/types";
import { SCENARIOS } from "./scenarioDefinitions";
import { getInvalidScenarioReason } from "./scenarioEngine";

const SHIPPED_SCENARIO_IDS = new Set(SCENARIOS.map((scenario) => scenario.id));

// completedScenarioIds predates a dedicated career-completion field and still
// carries this non-scenario terminal marker. Preserve it, but never reward it.
const RESERVED_CAREER_MARKERS = new Set(["career_retired_voluntarily"]);

function rewardedScenarioCount(ids: readonly string[]): number {
  return new Set(ids.filter((id) => SHIPPED_SCENARIO_IDS.has(id))).size;
}

function archiveEntry(
  state: GameState,
  scenarioId: string,
  source: InvalidScenarioArchiveEntry["source"],
): InvalidScenarioArchiveEntry {
  return {
    scenarioId,
    source,
    reason: getInvalidScenarioReason(scenarioId),
    archivedWeek: state.currentWeek,
    archivedSeason: state.currentSeason,
  };
}

function appendArchive(
  archives: InvalidScenarioArchiveEntry[],
  entry: InvalidScenarioArchiveEntry,
): void {
  if (archives.some((existing) =>
    existing.scenarioId === entry.scenarioId && existing.source === entry.source,
  )) return;
  archives.push(entry);
}

/**
 * Reconcile scenario authority on every save-load path.
 *
 * Unknown/removed active scenarios are cancelled and archived. Unknown
 * completion markers are removed so they cannot unlock achievements or inflate
 * legacy rewards. The voluntary-retirement marker is preserved separately.
 * This operation is deterministic and idempotent.
 */
export function reconcileScenarioAuthority(state: GameState): GameState {
  const archives = [...(state.invalidScenarioArchives ?? [])];
  const completed = Array.from(new Set(state.completedScenarioIds ?? []));
  const validCompleted: string[] = [];

  for (const scenarioId of completed) {
    if (SHIPPED_SCENARIO_IDS.has(scenarioId) || RESERVED_CAREER_MARKERS.has(scenarioId)) {
      validCompleted.push(scenarioId);
    } else {
      appendArchive(archives, archiveEntry(state, scenarioId, "completed"));
    }
  }

  const invalidActive = state.activeScenarioId
    && !SHIPPED_SCENARIO_IDS.has(state.activeScenarioId)
    ? state.activeScenarioId
    : undefined;
  if (invalidActive) {
    appendArchive(archives, archiveEntry(state, invalidActive, "active"));
  }

  return {
    ...state,
    activeScenarioId: invalidActive ? undefined : state.activeScenarioId,
    completedScenarioIds: validCompleted,
    invalidScenarioArchives: archives,
    legacyScore: {
      ...state.legacyScore,
      scenariosCompleted: rewardedScenarioCount(validCompleted),
    },
  };
}

export interface ScenarioOutcomeResolution {
  state: GameState;
  resolvedScenarioId: string | null;
  rewardApplied: boolean;
  valid: boolean;
}

/** Apply a terminal outcome exactly once and only for a shipped definition. */
export function resolveScenarioOutcome(
  inputState: GameState,
  outcome: "victory" | "failure",
): ScenarioOutcomeResolution {
  const requestedScenarioId = inputState.activeScenarioId ?? null;
  const state = reconcileScenarioAuthority(inputState);
  if (!requestedScenarioId) {
    return { state, resolvedScenarioId: null, rewardApplied: false, valid: true };
  }
  if (!SHIPPED_SCENARIO_IDS.has(requestedScenarioId)) {
    return {
      state,
      resolvedScenarioId: requestedScenarioId,
      rewardApplied: false,
      valid: false,
    };
  }

  if (outcome === "failure") {
    return {
      state: { ...state, activeScenarioId: undefined },
      resolvedScenarioId: requestedScenarioId,
      rewardApplied: false,
      valid: true,
    };
  }

  const alreadyCompleted = state.completedScenarioIds.includes(requestedScenarioId);
  const completedScenarioIds = alreadyCompleted
    ? state.completedScenarioIds
    : [...state.completedScenarioIds, requestedScenarioId];
  return {
    state: {
      ...state,
      activeScenarioId: undefined,
      completedScenarioIds,
      legacyScore: {
        ...state.legacyScore,
        scenariosCompleted: rewardedScenarioCount(completedScenarioIds),
      },
    },
    resolvedScenarioId: requestedScenarioId,
    rewardApplied: !alreadyCompleted,
    valid: true,
  };
}
