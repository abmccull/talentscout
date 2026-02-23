/**
 * Scenario engine — evaluates objective progress and failure conditions.
 *
 * Design principles:
 *  - All functions are pure: accept state in, return result out.
 *  - No mutation. No React/Next.js imports.
 *  - Failure is checked separately from objective completion so the UI can
 *    distinguish between "not yet done" and "failed".
 */

import type { GameState } from "../core/types";
import { SCENARIOS, type ScenarioDef, type ScenarioObjective } from "./scenarioDefinitions";

// =============================================================================
// PUBLIC TYPES
// =============================================================================

export interface ObjectiveStatus {
  id: string;
  description: string;
  completed: boolean;
  required: boolean;
}

export interface ScenarioProgress {
  scenarioId: string;
  objectives: ObjectiveStatus[];
  /** True when every required objective is completed. */
  allRequiredComplete: boolean;
  /** True when the scenario has been failed (cannot be won). */
  failed: boolean;
  failReason?: string;
}

export interface FailCheck {
  failed: boolean;
  reason?: string;
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Look up a scenario definition by its ID.
 * Returns undefined when the ID is not recognised.
 */
export function getScenarioById(id: string): ScenarioDef | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

/**
 * Evaluate all objectives for a scenario against the current game state.
 *
 * @param state      Current game state.
 * @param scenarioId Scenario to evaluate.
 * @returns          Full progress snapshot including completion flags.
 */
export function checkScenarioObjectives(
  state: GameState,
  scenarioId: string,
): ScenarioProgress {
  const scenario = getScenarioById(scenarioId);

  if (scenario === undefined) {
    // Unknown scenario — treat as trivially complete so the game doesn't block.
    return {
      scenarioId,
      objectives: [],
      allRequiredComplete: true,
      failed: false,
    };
  }

  const objectives: ObjectiveStatus[] = scenario.objectives.map((obj) => ({
    id: obj.id,
    description: obj.description,
    completed: safeCheck(obj, state),
    required: obj.required,
  }));

  const allRequiredComplete = objectives
    .filter((o) => o.required)
    .every((o) => o.completed);

  const failCheck = isScenarioFailed(state, scenarioId);

  return {
    scenarioId,
    objectives,
    allRequiredComplete,
    failed: failCheck.failed,
    failReason: failCheck.reason,
  };
}

/**
 * Determine whether a scenario has been definitively failed.
 *
 * Fail conditions are separate from objective completion — a scenario can be
 * failed before all objectives have been attempted (e.g., the deadline passed).
 *
 * Generic fail condition:
 *  - The number of seasons played since game start exceeds `estimatedSeasons`.
 *    ("You ran out of time.")
 *
 * Scenario-specific overrides are applied after the generic check.
 *
 * @param state      Current game state.
 * @param scenarioId Scenario to evaluate.
 * @returns          Failure status and human-readable reason if failed.
 */
export function isScenarioFailed(
  state: GameState,
  scenarioId: string,
): FailCheck {
  const scenario = getScenarioById(scenarioId);
  if (scenario === undefined) return { failed: false };

  const seasonsElapsed =
    state.currentSeason - scenario.setup.startingSeason;

  // Generic: exceeded the estimated season budget
  if (seasonsElapsed > scenario.estimatedSeasons) {
    return {
      failed: true,
      reason: `You exceeded the ${scenario.estimatedSeasons}-season target for this scenario.`,
    };
  }

  // Scenario-specific fail conditions
  switch (scenarioId) {
    case "the_rescue_job": {
      // Fail if week 28 has passed and 3 recommend-level reports haven't been filed
      const windowClose = 28;
      if (state.currentWeek > windowClose) {
        const qualified = Object.values(state.reports).filter((r) => {
          const ORDER = {
            note: 0,
            recommend: 1,
            strongRecommend: 2,
            tablePound: 3,
          };
          return ORDER[r.conviction] >= ORDER["recommend"];
        });
        if (qualified.length < 3) {
          return {
            failed: true,
            reason: "The winter window closed before you submitted 3 quality reports.",
          };
        }
      }
      break;
    }

    case "rivalry": {
      // Fail if any rival has more discoveries than the player after season 1
      if (seasonsElapsed >= 1) {
        const rivalMaxTargets = Math.max(
          ...Object.values(state.rivalScouts).map(
            (r) => r.targetPlayerIds.length,
          ),
          0,
        );
        if (state.discoveryRecords.length === 0 && rivalMaxTargets >= 5) {
          return {
            failed: true,
            reason: "A rival scout dominated the talent pool before you made any discoveries.",
          };
        }
      }
      break;
    }

    default:
      break;
  }

  return { failed: false };
}

// =============================================================================
// INTERNAL HELPERS
// =============================================================================

/**
 * Call an objective's check function with error isolation.
 * Returns false if the function throws, so a buggy objective never crashes the
 * game loop.
 */
function safeCheck(obj: ScenarioObjective, state: GameState): boolean {
  try {
    return obj.check(state);
  } catch {
    return false;
  }
}
