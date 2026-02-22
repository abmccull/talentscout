/**
 * Activity Quality System — rolls quality tiers for weekly activities,
 * producing XP multipliers, discovery modifiers, and narrative descriptions.
 *
 * Pure module, no side effects. Uses the seeded RNG for deterministic results.
 */

import type { ActivityType, ScoutSkill, Scout } from "@/engine/core/types";
import type { RNG } from "@/engine/rng";

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
  /** For scouting activities: ±players discovered */
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
};

// =============================================================================
// NARRATIVE TEMPLATES
// =============================================================================

const NARRATIVES: Partial<
  Record<ActivityType, Record<ActivityQualityTier, string[]>>
> = {
  study: {
    poor: [
      "A frustrating study session — you struggled to concentrate and made little progress.",
      "The material felt impenetrable today. You'll need to revisit these concepts.",
    ],
    average: [
      "A routine study session. You covered the basics but nothing clicked in a new way.",
      "Steady progress through your reading material, though nothing stood out.",
    ],
    good: [
      "A productive study session. You connected several concepts and feel sharper for it.",
      "Good session — your notes are well-organized and the methods are starting to feel intuitive.",
    ],
    excellent: [
      "An excellent study session! A complex statistical technique suddenly made sense, opening new analytical possibilities.",
      "Highly productive studying. You identified patterns in the data that most scouts would miss.",
    ],
    exceptional: [
      "A breakthrough study session! You developed a novel analytical framework that connects data patterns you'd never noticed before.",
      "A revelation — you found a way to cross-reference performance metrics that could give you a genuine edge over rival scouts.",
    ],
  },
  attendMatch: {
    poor: [
      "A disappointing match to scout — poor weather and a defensive stalemate gave you little to work with.",
      "Frustrating match. Your target player was substituted early with a knock, limiting observation time.",
    ],
    average: [
      "A decent match for scouting. You gathered some useful observations, though nothing remarkable.",
      "Standard match day. The game flowed predictably and you logged steady observations.",
    ],
    good: [
      "A good match for scouting. Several players caught your eye with interesting moments of quality.",
      "Productive match attendance. The tempo was high and you captured plenty of meaningful data.",
    ],
    excellent: [
      "An excellent match! High intensity and attacking play gave you clear reads on multiple attributes.",
      "Outstanding match for scouting. A player's exceptional performance gave you crystal-clear assessment data.",
    ],
    exceptional: [
      "A match you won't forget! You witnessed a star-making performance — the kind of display that launches careers.",
      "Incredible match! A player displayed a combination of technical skill and composure far beyond his years.",
    ],
  },
  watchVideo: {
    poor: [
      "Poor video session — the footage quality was terrible and camera angles obscured key moments.",
      "A frustrating session. The available footage was mostly wide-angle with few close-ups of individual play.",
    ],
    average: [
      "A routine video session. You reviewed the footage but the material was unremarkable.",
      "Standard video analysis. The clips provided useful context but no surprises.",
    ],
    good: [
      "Good video session. You spotted movement patterns that weren't obvious in real-time.",
      "Productive analysis — slowing down key passages revealed tactical details you'd have missed live.",
    ],
    excellent: [
      "Excellent video session! Frame-by-frame analysis revealed a player's exceptional off-the-ball intelligence.",
      "Highly productive session. Reviewing multiple angles exposed tactical tendencies that could be decisive.",
    ],
    exceptional: [
      "An extraordinary video session! You uncovered a hidden gem — a player whose subtle positioning reveals elite-level game reading.",
      "Breakthrough analysis! By cross-referencing multiple matches, you identified a tactical pattern that no other scout has noticed.",
    ],
  },
  networkMeeting: {
    poor: [
      "An awkward meeting — your contact seemed distracted and shared nothing of value.",
      "Disappointing encounter. The conversation went nowhere and your contact was guarded.",
    ],
    average: [
      "A pleasant enough meeting. Some casual football chat but no major revelations.",
      "Standard networking. Your contact was friendly but had little new information to share.",
    ],
    good: [
      "A good meeting. Your contact shared some useful insider perspectives on player development.",
      "Productive networking session. You strengthened the relationship and picked up a couple of leads.",
    ],
    excellent: [
      "An excellent meeting! Your contact opened up about a player they've been tracking closely — valuable inside information.",
      "Highly productive encounter. Your contact introduced you to another influential figure in the scouting world.",
    ],
    exceptional: [
      "A meeting that could change your career! Your contact revealed an exclusive tip about an under-the-radar talent.",
      "Extraordinary networking session! Your contact shared confidential transfer intel that could give you a major edge.",
    ],
  },
  trainingVisit: {
    poor: [
      "A disappointing training visit — the session was closed to outsiders, limiting your observation time.",
      "Frustrating visit. Rain cut the session short and you barely saw anything useful.",
    ],
    average: [
      "A standard training visit. You observed the drills but nothing particularly stood out.",
      "Routine training session. The exercises were basic and player differentiation was difficult.",
    ],
    good: [
      "A good training visit. Small-sided games let you assess technical ability in realistic scenarios.",
      "Productive session. You got a clear look at several players' work rate and attitude.",
    ],
    excellent: [
      "An excellent training visit! Small-sided games let you assess technical and mental attributes up close.",
      "Highly productive visit. You noticed a player's exceptional training intensity — a strong professionalism indicator.",
    ],
    exceptional: [
      "An outstanding training visit! You spotted raw talent that the coaching staff themselves haven't fully recognized.",
      "Remarkable training session! A player demonstrated composure under pressure that you've rarely seen at this level.",
    ],
  },
  academyVisit: {
    poor: [
      "A quiet academy visit — most of the top prospects were away on international duty.",
      "Disappointing trip. The age group you targeted was doing fitness work, not football.",
    ],
    average: [
      "A routine academy visit. You saw some decent young players but nobody stood out dramatically.",
      "Standard academy session. The talent level was as expected for this club's youth setup.",
    ],
    good: [
      "A good academy visit. You spotted a couple of youngsters with genuine potential.",
      "Productive visit. The academy coaches pointed you toward their most promising age group.",
    ],
    excellent: [
      "An excellent academy visit! You identified a youngster with exceptional composure for his age.",
      "Highly productive trip. Multiple prospects caught your eye and the coaching staff were forthcoming.",
    ],
    exceptional: [
      "Outstanding academy visit! You spotted a youngster with exceptional composure for his age — potential wonderkid material.",
      "A visit you'll remember. A young player displayed the kind of raw, instinctive talent that can't be coached.",
    ],
  },
  youthTournament: {
    poor: [
      "A disappointing tournament. Defensive, cautious play from most teams made it hard to assess individual talent.",
      "Poor tournament for scouting — wet conditions and long balls meant technical players couldn't express themselves.",
    ],
    average: [
      "A standard youth tournament. Some decent performances but no one who truly caught your eye.",
      "Routine tournament viewing. The talent level was mixed and you gathered modest data.",
    ],
    good: [
      "A good tournament for scouting. Several young players showed flashes of quality worth tracking.",
      "Productive day. The competitive atmosphere brought the best out of several prospects.",
    ],
    excellent: [
      "An excellent tournament for scouting. You identified multiple prospects with genuine potential.",
      "Highly productive tournament. Two or three players performed well above the expected level for their age.",
    ],
    exceptional: [
      "An extraordinary tournament! One player dominated every match — the kind of display that signals a future star.",
      "Remarkable tournament! You discovered a talent so impressive you've already mentally drafted the report.",
    ],
  },
  writeReport: {
    poor: [
      "A struggle to compile your report. Your notes were disorganized and the analysis feels shallow.",
      "Difficult report session. You couldn't articulate your assessment clearly despite the data you have.",
    ],
    average: [
      "A standard report session. The work is solid but unlikely to impress the decision-makers.",
      "Routine report writing. You covered the key points but nothing in the analysis feels groundbreaking.",
    ],
    good: [
      "Good report writing session. Your analysis is clear and well-supported by your observations.",
      "Productive session. The report flows well and your conviction rating feels well-calibrated.",
    ],
    excellent: [
      "Excellent report session! You connected observations across multiple matches into a compelling narrative.",
      "Highly productive writing. Your comparison to a known player archetype adds real value to the assessment.",
    ],
    exceptional: [
      "A masterful report! Your analysis is so precise and insightful that it could influence a transfer decision on its own.",
      "Breakthrough report writing! You synthesized data, eye-test impressions, and context into an assessment that reads like art.",
    ],
  },
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

  // Pick a narrative
  const templates = NARRATIVES[activityType]?.[tier];
  const narrative = templates
    ? rng.pick(templates)
    : `Your ${activityType} session was ${tier}.`;

  return {
    activityType,
    tier,
    multiplier: config.multiplier,
    narrative,
    discoveryModifier: config.discoveryModifier,
  };
}
