export {
  generateStartingContacts,
  meetContact,
  getHiddenAttributeIntel,
  processWeeklyContactDecay,
  evaluateBetrayalRisk,
  generateExclusiveWindow,
  processExclusiveWindows,
} from "./contacts";

export type {
  ContactMeetingResult,
  HiddenIntel,
  PlayerTip,
} from "./contacts";

export {
  generateGossip,
  processGossipDecay,
  evaluateGossipAccuracy,
  processWeeklyGossip,
} from "./gossip";

export {
  generateReferralOpportunity,
  processReferral,
  processWeeklyReferrals,
} from "./referrals";
