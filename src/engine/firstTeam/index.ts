/**
 * First-team scouting engine barrel export.
 *
 * Re-exports all public functions from the first-team sub-modules.
 * Import from here in application code and other engine modules.
 *
 * Usage:
 *   import {
 *     generateDirectives,
 *     evaluateReportAgainstDirectives,
 *     generateClubResponse,
 *     processTrialOutcome,
 *     calculateSystemFit,
 *     updateTransferRecords,
 *     calculateScoutHitRate,
 *   } from "@/engine/firstTeam";
 */

// Directive generation and report matching
export {
  generateDirectives,
  evaluateReportAgainstDirectives,
} from "./directives";

// Club response pipeline
export {
  generateClubResponse,
  processTrialOutcome,
  shouldRouteToNegotiation,
} from "./clubResponse";

// Tactical system fit analysis
export {
  calculateSystemFit,
} from "./systemFit";

// Transfer performance tracking
export {
  updateTransferRecords,
  calculateScoutHitRate,
} from "./transferTracker";

// Dynamic board expectations (F10)
export {
  generateBoardProfile,
  evaluateBoardSatisfaction,
  generateBoardReaction,
  adjustDirectiveDifficulty,
  processBoardMeeting,
  processBoardWeekly,
} from "./boardAI";

// Transfer negotiation system (F4)
export {
  initiateNegotiation,
  submitOffer,
  generateCounterOffer,
  checkRivalBids,
  processAgentDemands,
  evaluateNegotiationOutcome,
  processActiveNegotiations,
  applyCompletedTransfer,
  walkAwayFromNegotiation,
  getRecommendedOffer,
  getPersonalityDescription,
  determineClubPersonality,
} from "./negotiation";
