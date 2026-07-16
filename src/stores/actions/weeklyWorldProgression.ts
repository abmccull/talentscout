import type { DayResult, GameState } from "@/engine/core/types";
import {
  advanceWeek,
  processWeeklyTick,
  type TickResult,
} from "@/engine/core/gameLoop";
import { processNPCDelegations } from "@/engine/core/quickScout";
import { recordWeeklyStrategyOutcome } from "@/engine/core/weeklyStrategy";
import type { RNG } from "@/engine/rng";
import { synchronizeInternationalAssignmentProgress } from "@/engine/world/internationalDeliverables";
import { processInternationalTravelLifecycle } from "./weeklySimulationSupport";
import { processWeeklyConsequenceLifecycle } from "./weeklyNarrativeConsequences";
import { emitProfessionalCaseCallbacks } from "./weeklyProfessionalCaseCallbacks";

export interface WeeklyWorldProgressionInput {
  state: GameState;
  sourceWeek: number;
  sourceSeason: number;
  dayResults: readonly DayResult[];
  rng: RNG;
}

export interface WeeklyWorldProgressionResult {
  state: GameState;
  tick: TickResult;
}

/** Advance the living world and apply every consequence due on the new date. */
export function processWeeklyWorldProgression(
  input: WeeklyWorldProgressionInput,
): WeeklyWorldProgressionResult {
  const synchronized = synchronizeInternationalAssignmentProgress(input.state);
  const tick = processWeeklyTick(synchronized, input.rng);
  let state = advanceWeek(synchronized, tick);
  state = processNPCDelegations(state, input.rng).state;
  state = processInternationalTravelLifecycle(state);
  state = {
    ...state,
    weeklyStrategy: recordWeeklyStrategyOutcome(
      state.weeklyStrategy,
      input.sourceWeek,
      input.sourceSeason,
      input.dayResults,
    ),
  };
  state = processWeeklyConsequenceLifecycle(state);
  return {
    state: emitProfessionalCaseCallbacks(state),
    tick,
  };
}
