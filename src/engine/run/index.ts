/** Public API for deterministic career-run identity and random streams. */

export type {
  CreateRunManifestInput,
  SeedScopePart,
} from "./runManifest";
export type { RunIntegrity, RunManifest } from "@/engine/core/types";
export type {
  RunSimulationModifiers,
  WorldTraitDefinition,
  WorldTraitDimension,
} from "./worldTraits";
export type {
  RunChoiceSimulationModifiers,
  ScoutDoctrineDefinition,
  ScoutDoctrineId,
  ScoutFlawDefinition,
  ScoutFlawId,
  ScoutIdentitySelection,
  ScoutOriginDefinition,
  ScoutOriginId,
  StartingScoutEffects,
} from "./scoutIdentity";

export {
  NAMED_RNG_VERSION,
  RUN_CONTENT_VERSION,
  RUN_MANIFEST_VERSION,
  RUN_RULES_VERSION,
  createContentFingerprint,
  computeRunManifestFingerprint,
  createDeterministicRunId,
  createNamedRNG,
  createRunManifest,
  deriveNamedSeed,
  formatRunFingerprint,
  repairRunManifest,
  stableFingerprint,
  stableSerialize,
  validateRunManifest,
} from "./runManifest";
export {
  WORLD_TRAITS,
  deriveWorldTraitIds,
  formatWorldTraitBrief,
  getRunSimulationModifiers,
  getWorldTraitContentDefinitionIds,
  getWorldTraitDefinitions,
} from "./worldTraits";
export {
  DEFAULT_SCOUT_DOCTRINE_ID,
  DEFAULT_SCOUT_FLAW_ID,
  DEFAULT_SCOUT_ORIGIN_ID,
  SCOUT_DOCTRINES,
  SCOUT_FLAWS,
  SCOUT_ORIGINS,
  applyScoutIdentityContactEffects,
  applyScoutIdentityStartingEffects,
  formatScoutIdentityBrief,
  getRunChoiceSimulationModifiers,
  getScoutDoctrineDefinitions,
  getScoutFlawDefinition,
  getScoutIdentityContentDefinitionIds,
  getScoutOriginDefinition,
  scoutIdentitySelectionFromConfig,
} from "./scoutIdentity";
