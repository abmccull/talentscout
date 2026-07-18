import type { GameState } from "@/engine/core/types";
import type {
  WeeklyWorkerInput,
  WeeklyWorkerWireState,
} from "./weeklyWorkerTypes";

function sourceMatches(base: GameState, input: GameState): boolean {
  return base.seed === input.seed
    && base.currentSeason === input.currentSeason
    && base.currentWeek === input.currentWeek
    && base.scout.primarySpecialization === input.scout.primarySpecialization;
}

/** Build the smallest safe synchronization message for a persistent worker. */
export function createWeeklyWorkerWireState(
  base: GameState | null,
  input: WeeklyWorkerInput,
): WeeklyWorkerWireState {
  if (!base || !sourceMatches(base, input.gameState)) {
    return { kind: "replace", input };
  }

  const changedFields: Partial<GameState> = {};
  for (const key of Object.keys(input.gameState) as Array<keyof GameState>) {
    if (!Object.is(base[key], input.gameState[key])) {
      Object.assign(changedFields, { [key]: input.gameState[key] });
    }
  }
  const removedFields = (Object.keys(base) as Array<keyof GameState>)
    .filter((key) => !Object.prototype.hasOwnProperty.call(input.gameState, key));

  return {
    kind: "patch",
    base: {
      seed: base.seed,
      season: base.currentSeason,
      week: base.currentWeek,
      mode: base.scout.primarySpecialization,
    },
    gameState: { changedFields, removedFields },
    weekSimulation: input.weekSimulation,
    currentScreen: input.currentScreen,
    isLoaded: input.isLoaded,
    tutorial: input.tutorial,
  };
}

/** Validate and apply a synchronization message inside the dedicated worker. */
export function materializeWeeklyWorkerWireState(
  cachedState: GameState | null,
  wire: WeeklyWorkerWireState,
): WeeklyWorkerInput {
  if (wire.kind === "replace") return wire.input;
  if (!cachedState) throw new Error("Weekly worker state cache is unavailable.");
  if (
    cachedState.seed !== wire.base.seed
    || cachedState.currentSeason !== wire.base.season
    || cachedState.currentWeek !== wire.base.week
    || cachedState.scout.primarySpecialization !== wire.base.mode
  ) {
    throw new Error("Weekly worker state cache does not match the requested source.");
  }

  const gameState = {
    ...cachedState,
    ...wire.gameState.changedFields,
  };
  for (const key of wire.gameState.removedFields) {
    delete (gameState as Partial<GameState>)[key];
  }
  return {
    gameState,
    weekSimulation: wire.weekSimulation,
    currentScreen: wire.currentScreen,
    isLoaded: wire.isLoaded,
    tutorial: wire.tutorial,
  };
}
