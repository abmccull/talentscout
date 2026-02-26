/**
 * Free Agent System — barrel export.
 *
 * Manages player contract expiry, the global free agent pool,
 * per-specialization discovery, and direct player negotiation.
 */

export { processContractExpiries } from "./expiry";
export {
  createEmptyPool,
  tickFreeAgentPool,
  addFreeAgent,
  removeFreeAgent,
  getVisibleFreeAgents,
} from "./pool";
export {
  discoverFreeAgents,
  getFamiliarityVisibility,
} from "./discovery";
export {
  initiateFreeAgentNegotiation,
  advanceFreeAgentNegotiation,
  calculateFreeAgentAcceptance,
} from "./negotiation";
