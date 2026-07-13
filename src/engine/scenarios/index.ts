/**
 * Barrel export for the scenarios module.
 */

export { SCENARIOS } from "./scenarioDefinitions";
export type { ScenarioDef, ScenarioObjective } from "./scenarioDefinitions";

export {
  getScenarioById,
  checkScenarioObjectives,
  isScenarioFailed,
} from "./scenarioEngine";
export type { ScenarioProgress, ObjectiveStatus, FailCheck } from "./scenarioEngine";
export { getInvalidScenarioReason } from "./scenarioEngine";

export {
  reconcileScenarioAuthority,
  resolveScenarioOutcome,
} from "./scenarioAuthority";
export type { ScenarioOutcomeResolution } from "./scenarioAuthority";

export { applyScenarioSetup, applyScenarioOverrides } from "./scenarioSetup";
