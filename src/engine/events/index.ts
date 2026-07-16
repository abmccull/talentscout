/**
 * Events module barrel export.
 *
 * Usage:
 *   import { generateWeeklyEvent, resolveEventChoice } from "@/engine/events";
 *   import type { EventTemplate, EventContext } from "@/engine/events";
 */

// Templates and context helpers
export type { EventTemplate, EventContext } from "./eventTemplates";
export { EVENT_TEMPLATES, buildEventContext, extractRelatedIds } from "./eventTemplates";
export type {
  CommandNarrativeTruthContract,
  FactualNarrativeTruthContract,
  NarrativeEvidenceReference,
  NarrativeEvidenceSource,
  NarrativeTruthContract,
  NarrativeTruthContext,
  NarrativeTruthResolution,
  RumorNarrativeTruthContract,
} from "./narrativeTruth";
export {
  FACTUAL_NARRATIVE_TRUTH_CONTRACTS,
  MATERIAL_FACTUAL_NARRATIVE_TYPES,
  resolveNarrativeTruth,
} from "./narrativeTruth";

// Event generation and processing
export type {
  EventChoiceResult,
  NarrativeGenerationOptions,
  WeeklyEventResult,
} from "./narrativeEvents";
export {
  generateNarrativeEventOfType,
  generateWeeklyEvent,
  resolveEventChoice,
  getActiveEvents,
  acknowledgeEvent,
  formatConsequence,
} from "./narrativeEvents";
export type {
  DirectedWeeklyEventResult,
  EventDirectorState,
} from "./eventDirector";
export {
  createEventDirectorState,
  directWeeklyNarrativeEvent,
  recordEventDirectorOutcome,
} from "./eventDirector";
export type {
  ScoutingSpecialEventCategory,
  ScoutingSpecialEventDefinition,
  ScoutingSpecialEventOptionDefinition,
  SpecialEventDecisionOptionPayload,
  SpecialEventSelectionHistory,
} from "./specialEventDeck";
export {
  SCOUTING_SPECIAL_EVENT_DECK,
  buildSpecialEventDecisionOption,
  buildSpecialEventOfferObligations,
  createScoutingSpecialEvent,
  getScoutingSpecialEventDefinition,
  getSpecialEventSelectionWeights,
  selectScoutingSpecialEvent,
} from "./specialEventDeck";

// Economic events
export {
  updateMarketTemperature,
  generateEconomicEvent,
  applyEconomicEvent,
  expireEconomicEvents,
  getActiveEconomicMultiplier,
} from "./economicEvents";

// Storyline system
export type {
  Storyline,
  StorylineStage,
  SimpleRNG,
  StorylineTickResult,
  StorylineChoiceResult,
} from "./storylines";
export {
  checkStorylineTriggers,
  processActiveStorylines,
  resolveStorylineChoice,
} from "./storylines";

// Event chain system (F2)
export type {
  ChainStartResult,
  ChainAdvanceResult,
} from "./eventChains";

export * from "./storyDirectorV2";
export * from "./weeklyStoryDirectorAdapter";
export {
  startChain,
  advanceChain,
  checkPendingChains,
  resolveChain,
  resolveChainChoice,
  tryTriggerChain,
  computeChainChoiceEffects,
  CHAIN_TRIGGER_CHANCE,
  getChainTemplateKeys,
} from "./eventChains";
