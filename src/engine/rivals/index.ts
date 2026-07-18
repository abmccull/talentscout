export {
  generateRivalScouts,
  processRivalScoutWeek,
  getRivalThreatLevel,
  getSharedTargets,
  checkRivalPresence,
  generateRivalIntelligence,
  resolveRivalSigningAttempt,
  getPoachCounterBidEligibility,
  resolvePoachCounterBid,
  isNemesis,
} from "./rivalScouts";

export type {
  RivalScoutWeekResult,
  PoachBidResult,
  PoachBidEligibility,
  RivalSimulationModifiers,
  RivalSigningResult,
} from "./rivalScouts";

export {
  getEffectiveRivalPlayerEvidence,
  getRivalPlayerEvidence,
} from "./rivalEvidence";

export type {
  EffectiveRivalPlayerEvidence,
  RivalPlayerEvidence,
} from "./rivalEvidence";

export {
  advanceYouthRivalPressure,
  getRivalYouthClaimEligibility,
  getYouthRivalPressure,
  getYouthRivalPressureBand,
  isEligibleYouthRivalTarget,
  rankYouthRivalTargets,
  resolveRivalYouthClaim,
  selectYouthRivalTarget,
} from "./youthCompetition";

export {
  createRivalCampaignState,
  directRivalCampaignWeek,
  resolveRivalCampaignResponse,
} from "./campaigns";

export type {
  DirectRivalCampaignWeekInput,
  DirectRivalCampaignWeekResult,
  ResolveRivalCampaignResponseInput,
  ResolveRivalCampaignResponseResult,
  RivalCampaign,
  RivalCampaignCounterplayOption,
  RivalCampaignDirectory,
  RivalCampaignHistoryRecord,
  RivalCampaignKind,
  RivalCampaignOperationalEffect,
  RivalCampaignPhase,
  RivalCampaignProvenancePacket,
  RivalCampaignResolution,
  RivalCampaignSignal,
  RivalCampaignState,
  RivalCampaignStatus,
  RivalCampaignTarget,
  RivalCampaignTargetKind,
} from "./campaigns";

export {
  buildRivalCampaignDirectory,
} from "./campaignDirectory";

export {
  RIVAL_ORGANIZATION_DEFINITIONS,
  createRivalOrganizationState,
  assessRivalMarketCounterplay,
  deriveRivalMarketPressure,
  getOpenRivalOrganizationOpportunities,
  getOrganizationForRival,
  getRivalOrganizationContentDefinitionIds,
  getRivalOrganizationDefinition,
  getRivalOrganizationThreat,
  initializeRivalOrganizations,
  migrateRivalOrganizationState,
  processRivalOrganizationWeek,
  resolveRivalOrganizationOpportunity,
} from "./organizations";

export type {
  InitializeRivalOrganizationsResult,
  ProcessRivalOrganizationWeekInput,
  ProcessRivalOrganizationWeekResult,
  ResolveRivalOrganizationOpportunityResult,
  FamilyMarketPreference,
  FamilyMarketSignal,
  RivalInformationExposureBand,
  RivalMarketCounterplayAssessment,
  RivalMarketPressureBand,
  RivalMarketPressureSnapshot,
  RivalMarketWatcher,
  RivalOrganization,
  RivalOrganizationActionKind,
  RivalOrganizationActivity,
  RivalOrganizationAgendaId,
  RivalOrganizationArchetypeId,
  RivalOrganizationDefinition,
  RivalOrganizationOpportunity,
  RivalOrganizationOpportunityKind,
  RivalOrganizationOpportunityStatus,
  RivalOrganizationPressure,
  RivalOrganizationState,
  RivalTransferContestAuthority,
  ScoutMarketCounterplay,
} from "./organizations";

export type {
  AdvanceYouthRivalPressureRequest,
  AdvanceYouthRivalPressureResult,
  ResolveRivalYouthClaimRequest,
  RivalYouthClaimEligibility,
  RivalYouthClaimResult,
  YouthRivalPressureBand,
  YouthRivalTargetCandidate,
} from "./youthCompetition";
