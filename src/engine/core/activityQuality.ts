/**
 * Activity Quality System: rolls quality tiers for weekly activities,
 * producing XP multipliers, discovery modifiers, and narrative descriptions.
 *
 * Pure module, no side effects. Uses the seeded RNG for deterministic results.
 */

import type { ActivityType, ScoutSkill, Scout, CareerPath } from "@/engine/core/types";
import type { RNG } from "@/engine/rng";
import { resolveCareerPathText } from "@/engine/utils/textResolution";

// =============================================================================
// TYPES
// =============================================================================

export type ActivityQualityTier =
  | "poor"
  | "average"
  | "good"
  | "excellent"
  | "exceptional";

export interface ActivityQualityResult {
  activityType: ActivityType;
  tier: ActivityQualityTier;
  /** XP multiplier: 0.4x to 2.0x */
  multiplier: number;
  /** Descriptive text for inbox/summary */
  narrative: string;
  /** For scouting activities: adjustment to players discovered. */
  discoveryModifier: number;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const TIER_CONFIG: Record<
  ActivityQualityTier,
  { multiplier: number; discoveryModifier: number }
> = {
  poor:        { multiplier: 0.4, discoveryModifier: -1 },
  average:     { multiplier: 0.8, discoveryModifier: 0 },
  good:        { multiplier: 1.0, discoveryModifier: 0 },
  excellent:   { multiplier: 1.4, discoveryModifier: 1 },
  exceptional: { multiplier: 2.0, discoveryModifier: 2 },
};

/** Base weights for quality tier distribution (sum = 100). */
const BASE_WEIGHTS: Record<ActivityQualityTier, number> = {
  poor: 10,
  average: 35,
  good: 30,
  excellent: 20,
  exceptional: 5,
};

/** Which scout skill influences quality for each activity type. */
const PRIMARY_SKILL_MAP: Partial<Record<ActivityType, ScoutSkill>> = {
  attendMatch: "technicalEye",
  watchVideo: "tacticalUnderstanding",
  writeReport: "dataLiteracy",
  networkMeeting: "psychologicalRead",
  trainingVisit: "physicalAssessment",
  academyVisit: "technicalEye",
  youthTournament: "technicalEye",
  study: "dataLiteracy",
  // Youth venue activities
  schoolMatch: "technicalEye",
  grassrootsTournament: "technicalEye",
  streetFootball: "technicalEye",
  academyTrialDay: "technicalEye",
  youthFestival: "technicalEye",
  followUpSession: "technicalEye",
  parentCoachMeeting: "psychologicalRead",
  writePlacementReport: "dataLiteracy",
  // First-team exclusive
  reserveMatch: "playerJudgment",
  scoutingMission: "tacticalUnderstanding",
  oppositionAnalysis: "tacticalUnderstanding",
  agentShowcase: "playerJudgment",
  trialMatch: "playerJudgment",
  contractNegotiation: "psychologicalRead",
  // Free agent activities
  freeAgentOutreach: "playerJudgment",
  // Youth showcase
  agencyShowcase: "technicalEye",
  // Territory management
  assignTerritory: "playerJudgment",
  // Data-exclusive
  databaseQuery: "dataLiteracy",
  deepVideoAnalysis: "dataLiteracy",
  statsBriefing: "dataLiteracy",
  dataConference: "dataLiteracy",
  algorithmCalibration: "dataLiteracy",
  marketInefficiency: "dataLiteracy",
  analyticsTeamMeeting: "dataLiteracy",
  // Review/management
  reviewNPCReport: "dataLiteracy",
  managerMeeting: "psychologicalRead",
  boardPresentation: "psychologicalRead",
  // Loan activities
  loanMonitoring: "playerJudgment",
  loanRecommendation: "playerJudgment",
};

// =============================================================================
// NARRATIVE TEMPLATES
// =============================================================================

/**
 * Quality measures scouting work and opportunity, not facts about a player or
 * the world. Specific performances and consequences come from their own
 * observation/event pipelines, which have the evidence needed to describe them.
 *
 * Keep this legacy set of 39 narrated activities and two variants per tier:
 * narrated activities consume one extra RNG draw; travel historically does not.
 */
const ACTIVITY_QUALITY_LABELS: Partial<Record<ActivityType, string>> = {
  study: "Study Session",
  attendMatch: "Match Attendance",
  watchVideo: "Video Analysis",
  networkMeeting: "Network Meeting",
  trainingVisit: "Training Visit",
  academyVisit: "Academy Visit",
  youthTournament: "Youth Tournament",
  schoolMatch: "School Match",
  grassrootsTournament: "Grassroots Tournament",
  streetFootball: "Street Football",
  academyTrialDay: "Academy Trial Day",
  youthFestival: "Youth Festival",
  writeReport: "Report Writing",
  followUpSession: "Follow-Up Session",
  parentCoachMeeting: "Parent/Coach Meeting",
  writePlacementReport: "Placement Report",
  reserveMatch: "Reserve Match",
  scoutingMission: "Scouting Mission",
  oppositionAnalysis: "Opposition Analysis",
  agentShowcase: "Agent Showcase",
  trialMatch: "Trial Match",
  contractNegotiation: "Contract Negotiation",
  databaseQuery: "Database Query",
  deepVideoAnalysis: "Deep Video Analysis",
  statsBriefing: "Stats Briefing",
  dataConference: "Data Conference",
  algorithmCalibration: "Algorithm Calibration",
  marketInefficiency: "Market Inefficiency Scan",
  analyticsTeamMeeting: "Analytics Team Meeting",
  freeAgentOutreach: "Free Agent Outreach",
  loanMonitoring: "Loan Monitoring",
  loanRecommendation: "Loan Recommendation",
  rest: "Rest Day",
  reviewNPCReport: "NPC Report Review",
  managerMeeting: "Manager Meeting",
  boardPresentation: "Board Presentation",
  assignTerritory: "Territory Assignment",
  agencyShowcase: "Agency Showcase",
  internationalTravel: "International Travel",
};

const QUALITY_NARRATIVES: Record<ActivityQualityTier, string[]> = {
  poor: [
    "A difficult session, with limited opportunities to make progress.",
    "This session offered limited room for progress.",
  ],
  average: [
    "A routine session, with ordinary opportunities to make progress.",
    "This session offered a steady opportunity to make progress.",
  ],
  good: [
    "A productive session, with useful opportunities to make progress.",
    "This session offered a useful opportunity to make progress.",
  ],
  excellent: [
    "A highly productive session, with strong opportunities to make progress.",
    "This session offered a particularly strong opportunity to make progress.",
  ],
  exceptional: [
    "An exceptionally productive session, with outstanding opportunities to make progress.",
    "This session offered an exceptional opportunity to make progress.",
  ],
};

// =============================================================================
// ROLL FUNCTION
// =============================================================================

/**
 * Roll an activity quality tier based on the scout's relevant skill and fatigue.
 *
 * Higher skill levels and lower fatigue shift the distribution toward better
 * outcomes. The function uses the seeded RNG for deterministic results.
 */
export function rollActivityQuality(
  rng: RNG,
  activityType: ActivityType,
  scout: Scout,
  careerPath?: CareerPath,
): ActivityQualityResult {
  const primarySkill = PRIMARY_SKILL_MAP[activityType];
  // Default skill level of 10 (mid-range) for unmapped activities
  const skillLevel = primarySkill ? scout.skills[primarySkill] : 10;
  const fatigue = scout.fatigue;

  // Shift factor: positive shifts boost higher tiers, negative boosts lower
  // Skill contribution: (skillLevel - 8) / 24 ranges from about -0.29 to +0.5
  // Fatigue penalty: -(fatigue / 100) * 0.4 ranges from 0 to -0.4
  const shiftFactor = (skillLevel - 8) / 24 - (fatigue / 100) * 0.4;

  // Build weighted items with shifted weights
  const tiers: ActivityQualityTier[] = [
    "poor",
    "average",
    "good",
    "excellent",
    "exceptional",
  ];

  // Shift multipliers: negative tiers get penalized by positive shift, boosted by negative
  const shiftMultipliers = [-2, -1, 0, 1, 2];

  const items = tiers.map((tier, i) => {
    const baseWeight = BASE_WEIGHTS[tier];
    const adjusted = baseWeight * (1 + shiftFactor * shiftMultipliers[i]);
    return { item: tier, weight: Math.max(1, adjusted) };
  });

  const tier = rng.pickWeighted(items);
  const config = TIER_CONFIG[tier];

  // Preserve the legacy narrative draw without turning quality into player truth.
  const activityLabel = ACTIVITY_QUALITY_LABELS[activityType];
  const qualityNarrative = activityLabel
    ? rng.pick(QUALITY_NARRATIVES[tier])
    : QUALITY_NARRATIVES[tier][0];
  const rawNarrative = `${activityLabel ?? "Travel"}: ${qualityNarrative}`;
  const narrative = resolveCareerPathText(rawNarrative, careerPath);

  return {
    activityType,
    tier,
    multiplier: config.multiplier,
    narrative,
    discoveryModifier: config.discoveryModifier,
  };
}

// =============================================================================
// MULTI-DAY CONTINUATION NARRATIVES
// =============================================================================

/** Day-2+ narratives for multi-slot activities. Keyed by activity type. */
export const MULTI_DAY_CONTINUATIONS: Partial<Record<ActivityType, string[]>> = {
  schoolMatch: [
    "You continue the school-match visit with another opportunity to observe.",
    "Another look at the same group gives you an opportunity to revisit your notes.",
  ],
  grassrootsTournament: [
    "The tournament visit continues, with more time for observation.",
    "Back at the tournament grounds, you can revisit your scouting questions.",
    "You continue observing and comparing your notes at the grassroots tournament.",
  ],
  streetFootball: [
    "You return to the cages for another look at the local talent.",
  ],
  academyTrialDay: [
    "Another day of trials gives you another opportunity to observe.",
  ],
  youthFestival: [
    "The festival visit continues, with more time to revisit your scouting questions.",
    "You continue observing and comparing your notes at the festival.",
  ],
  attendMatch: [
    "You review your notes and settle in for continued observation.",
  ],
  trainingVisit: [
    "Another training session gives you an opportunity to revisit your initial impressions.",
  ],
  scoutingMission: [
    "You continue your scouting mission, following up on yesterday's initial impressions.",
  ],
  travel: [
    "The journey continues. You review your notes and prepare for arrival.",
  ],
  internationalTravel: [
    "Still in transit. You use the downtime to organize your scouting plans.",
  ],
  dataConference: [
    "The conference continues, with more time to study and review your notes.",
  ],
  agencyShowcase: [
    "The showcase continues, with another opportunity to observe and review your notes.",
  ],
};
