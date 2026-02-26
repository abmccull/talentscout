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

// Event generation and processing
export type { EventChoiceResult, WeeklyEventResult } from "./narrativeEvents";
export {
  generateWeeklyEvent,
  resolveEventChoice,
  getActiveEvents,
  acknowledgeEvent,
  formatConsequence,
} from "./narrativeEvents";

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
export {
  startChain,
  advanceChain,
  checkPendingChains,
  resolveChain,
  tryTriggerChain,
  computeChainChoiceEffects,
  CHAIN_TRIGGER_CHANCE,
  getChainTemplateKeys,
} from "./eventChains";
