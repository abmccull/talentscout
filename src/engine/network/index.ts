export {
  generateStartingContacts,
  meetContact,
  getHiddenAttributeIntel,
  processWeeklyContactDecay,
  evaluateBetrayalRisk,
  generateExclusiveWindow,
  processExclusiveWindows,
  isContactAccessSuspended,
  getExclusiveWindowChance,
  rollExclusiveWindow,
  getContactSpecializationBonus,
} from "./contacts";

export type {
  ContactMeetingResult,
  HiddenIntel,
  PlayerTip,
  ContactSpecializationBonus,
} from "./contacts";

export {
  generateGossip,
  processGossipDecay,
  evaluateGossipAccuracy,
  processWeeklyGossip,
  getActionableGossipItems,
  applyGossipAction,
} from "./gossip";

export {
  generateReferralOpportunity,
  processReferral,
  processWeeklyReferrals,
} from "./referrals";
