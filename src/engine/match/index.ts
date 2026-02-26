export { generateMatchPhases, simulateMatchResult } from "./phases";
export type { MatchContext } from "./phases";
export { processFocusedObservations } from "./focus";
export { generateCommentary, getCommentary } from "./commentary";
export type { CommentaryContext } from "./commentary";
export type { CommentaryTemplate } from "./commentaryTemplates";
export {
  generateCardEvents,
  processCardAccumulation,
  decrementSuspensions,
  getPlayerAvailability,
  clearSeasonCards,
  applyCardRatingPenalty,
} from "./discipline";
export {
  calculateTacticalMatchup,
  applyTacticalModifiers,
  getTacticalQualityModifier,
  generateSubstitutions,
  getDefaultEventDistribution,
  getMatchupProfile,
  STYLE_EVENT_DISTRIBUTIONS,
} from "./tactics";
