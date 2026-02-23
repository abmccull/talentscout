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

export { applyScenarioSetup, applyScenarioOverrides } from "./scenarioSetup";
