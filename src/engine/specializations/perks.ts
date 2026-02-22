/**
 * Perk trees for all four scout specializations.
 *
 * MVP includes the first 5 perks per specialization (levels 1, 3, 5, 8, 12).
 * Perks at levels 8 and 12 are defined here so the full tree is visible to the
 * player, even though they unlock beyond the MVP progression window.
 */

import type {
  Specialization,
  ContactType,
  Scout,
  PlayerAttribute,
} from "@/engine/core/types";

// ---------------------------------------------------------------------------
// Perk types
// ---------------------------------------------------------------------------

export type PerkEffect =
  | {
      type: "visibilityBonus";
      /** ObservationContext string where the bonus applies */
      context: string;
      attributes: PlayerAttribute[];
    }
  | { type: "accuracyBonus"; factor: number; condition?: string }
  | { type: "networkBonus"; contactType: ContactType; bonus: number }
  | { type: "youthProjection"; enabled: true }
  | { type: "formDetection"; enabled: true }
  | { type: "valuationBonus"; factor: number }
  | { type: "dataAccess"; dataType: string }
  | { type: "alertSystem"; alertType: string }
  /** Predict how a player's development curve will unfold over future seasons. */
  | { type: "developmentPrediction"; enabled: true }
  /** Automatically flag players whose hidden WonderkidTier is generational or worldClass. */
  | { type: "wonderkidDetection"; enabled: true }
  /** Directly expose specific hidden attributes without needing to infer them. */
  | { type: "hiddenAttributeAccess"; attributes: PlayerAttribute[] }
  /** Amplify the conviction level's influence on club transfer decision weight. */
  | { type: "convictionMultiplier"; factor: number }
  /** Country-specific accuracy improvement for observations made in that country. */
  | { type: "regionalAccuracyBonus"; factor: number; country: string }
  /** Increase the scout's ability to influence a club's transfer decision process. */
  | { type: "transferInfluence"; factor: number }
  /** Unlock grassroots venues (streetFootball, grassrootsTournament) for youth scouting. */
  | { type: "grassrootsAccess"; enabled: true }
  /** Increase gut feeling trigger rate for young players up to a maximum age. */
  | { type: "gutFeelingBonus"; multiplier: number; maxAge: number }
  /** Contacts begin sharing intel tips about unsigned youth sightings. */
  | { type: "youthNetworkTips"; enabled: true }
  /** Additive bonus to youth placement acceptance rate across all conviction levels. */
  | { type: "placementReputationBonus"; factor: number }
  /** Scout can request clubs to hold dedicated trial days for recommended youth. */
  | { type: "trialDayAccess"; enabled: true }
  /** Gut feelings include a PA estimate within a given margin of the true value. */
  | { type: "paEstimate"; enabled: true; margin: number };

export interface Perk {
  id: string;
  name: string;
  description: string;
  /** Specialization level required to unlock this perk */
  level: number;
  specialization: Specialization;
  effect: PerkEffect;
}

export interface PerkModifiers {
  /** Multiplier on all attribute accuracy (1.0 = baseline, <1 = more accurate) */
  accuracyMultiplier: number;
  /** Additional attributes made visible in observations due to perks */
  visibilityBonusAttributes: PlayerAttribute[];
  /** Whether the scout can schedule academy visit activities */
  canVisitAcademies: boolean;
  /** Whether the scout can see a youth player's potential ceiling range */
  canSeeYouthProjection: boolean;
  /** Whether the scout can distinguish current form from underlying ability */
  canDetectForm: boolean;
  /** Fractional reduction in market valuation error */
  valuationAccuracyBonus: number;
  /** 0 = baseline data access; higher = advanced statistical models unlocked */
  dataAccessLevel: number;
  /** Flat relationship bonus per contact type for meetings */
  networkBonuses: Record<ContactType, number>;
  /** Whether the scout can predict a player's multi-season development trajectory */
  canPredictDevelopment: boolean;
  /** Whether the scout can automatically detect players of generational/worldClass tier */
  canDetectWonderkids: boolean;
  /**
   * Multiplier applied to the conviction level's weight on club transfer decisions.
   * 1.0 = baseline; >1.0 means each conviction tier carries more persuasive force.
   */
  convictionMultiplier: number;
  /**
   * Additive factor representing the scout's ability to influence a club's transfer
   * decision process (0 = none; 0.3 = meaningful lobbying power).
   */
  transferInfluenceFactor: number;
  /**
   * Hidden player attributes that are directly visible to this scout without
   * needing to infer them through repeated observation.
   */
  hiddenAttributeAccess: PlayerAttribute[];
  /** Whether grassroots venues (streetFootball, grassrootsTournament) are unlocked */
  hasGrassrootsAccess: boolean;
  /** Gut feeling trigger rate multiplier for young players */
  gutFeelingMultiplier: number;
  /** Maximum age for gut feeling bonus to apply */
  gutFeelingMaxAge: number;
  /** Whether contacts share youth sighting tips */
  hasYouthNetworkTips: boolean;
  /** Additive bonus to placement acceptance rate */
  placementReputationBonus: number;
  /** Whether scout can request trial days */
  hasTrialDayAccess: boolean;
  /** Whether gut feelings include PA estimate */
  hasPAEstimate: boolean;
  /** Margin of error for PA estimate */
  paEstimateMargin: number;
}

// ---------------------------------------------------------------------------
// Perk definitions — 5 per specialization = 20 total for MVP
// ---------------------------------------------------------------------------

export const ALL_PERKS: Perk[] = [
  // -------------------------------------------------------------------------
  // Youth Scout (levels 1, 3, 5, 7, 9, 12, 15, 18)
  // -------------------------------------------------------------------------
  {
    id: "youth_grassroots_access",
    name: "Grassroots Access",
    description:
      "Opens doors to street football sessions and grassroots tournaments. Discover unsigned youth in venues hidden from the mainstream scouting circuit.",
    level: 1,
    specialization: "youth",
    effect: { type: "grassrootsAccess", enabled: true },
  },
  {
    id: "youth_raw_potential_reading",
    name: "Raw Potential Reading",
    description:
      "Years of watching rough diamonds gives you an instinctive sense of ceilings. Unlocks a rough potential ability range indicator on unsigned youth.",
    level: 3,
    specialization: "youth",
    effect: { type: "youthProjection", enabled: true },
  },
  {
    id: "youth_instinct_sharpening",
    name: "Instinct Sharpening",
    description:
      "Your gut reactions to young talent are sharper than most. Gut feeling trigger rate increased by 40% when observing players under 16.",
    level: 5,
    specialization: "youth",
    effect: { type: "gutFeelingBonus", multiplier: 1.4, maxAge: 16 },
  },
  {
    id: "youth_network_expansion",
    name: "Youth Network",
    description:
      "Your contacts begin sharing intel about unsigned youth sightings. Network meetings occasionally reveal hidden talents in the region.",
    level: 7,
    specialization: "youth",
    effect: { type: "youthNetworkTips", enabled: true },
  },
  {
    id: "youth_placement_reputation",
    name: "Placement Reputation",
    description:
      "Clubs trust your recommendations. Placement acceptance rate increases by 25% across all conviction levels.",
    level: 9,
    specialization: "youth",
    effect: { type: "placementReputationBonus", factor: 0.25 },
  },
  {
    id: "youth_wonderkid_radar",
    name: "Wonderkid Radar",
    description:
      "Your pattern recognition for generational talent is razor-sharp. Auto-alert when observing an under-16 with generational potential markers.",
    level: 12,
    specialization: "youth",
    effect: { type: "wonderkidDetection", enabled: true },
  },
  {
    id: "youth_academy_whisperer",
    name: "Academy Whisperer",
    description:
      "Your reputation opens private academy doors. You can request clubs to hold dedicated trial days for your recommended youth.",
    level: 15,
    specialization: "youth",
    effect: { type: "trialDayAccess", enabled: true },
  },
  {
    id: "youth_generational_eye",
    name: "Generational Eye",
    description:
      "The pinnacle of youth scouting intuition. Gut feelings now include a PA estimate within ±5 of the true value.",
    level: 18,
    specialization: "youth",
    effect: { type: "paEstimate", enabled: true, margin: 5 },
  },

  // -------------------------------------------------------------------------
  // First Team Scout (levels 1, 3, 5, 8, 12)
  // -------------------------------------------------------------------------
  {
    id: "firstteam_system_fit",
    name: "System Fit Analysis",
    description:
      "Assess how well a player's movement and decision-making patterns match your club's tactical shape. Observations include a system-compatibility indicator alongside standard readings.",
    level: 1,
    specialization: "firstTeam",
    effect: {
      type: "visibilityBonus",
      context: "liveMatch",
      attributes: ["positioning", "decisionMaking", "offTheBall", "pressing"],
    },
  },
  {
    id: "firstteam_form_vs_ability",
    name: "Form vs Ability",
    description:
      "Distinguish between a player riding a hot streak and one whose underlying ability is genuinely elite. Unlocks a form-adjusted reading that separates current peak from long-term level.",
    level: 3,
    specialization: "firstTeam",
    effect: { type: "formDetection", enabled: true },
  },
  {
    id: "firstteam_opponent_weakness",
    name: "Opposition Context Correction",
    description:
      "Watching players against weak opposition no longer artificially inflates readings. Your assessments apply a quality-of-opposition adjustment — a striker banging goals against relegation sides gets appropriate credit, no more.",
    level: 5,
    specialization: "firstTeam",
    effect: {
      type: "accuracyBonus",
      factor: 0.8,
      condition: "oppositionQualityMismatch",
    },
  },
  {
    id: "firstteam_transfer_market_sense",
    name: "Transfer Market Sense",
    description:
      "Seasons spent tracking senior players gives an instinctive feel for fair value. Market valuation estimates carry significantly tighter error margins.",
    level: 8,
    specialization: "firstTeam",
    effect: { type: "valuationBonus", factor: 0.4 },
  },
  {
    id: "firstteam_adaptation_prediction",
    name: "Adaptation Prediction",
    description:
      "Predict how well a player will settle into a new league, club culture, or tactical demand. Unlock an adaptation-risk score on every report for players moving between leagues.",
    level: 12,
    specialization: "firstTeam",
    effect: { type: "dataAccess", dataType: "adaptationRiskScore" },
  },

  // -------------------------------------------------------------------------
  // Regional Expert (levels 1, 3, 5, 8, 12)
  // -------------------------------------------------------------------------
  {
    id: "regional_local_network",
    name: "Local Network",
    description:
      "Deep roots in your region mean contacts trust you faster. Meetings with regional scouts and journalists yield enhanced relationship gains and more candid intelligence.",
    level: 1,
    specialization: "regional",
    effect: { type: "networkBonus", contactType: "scout", bonus: 10 },
  },
  {
    id: "regional_league_knowledge",
    name: "League Knowledge",
    description:
      "You know the playing styles, tactical tendencies, and quality variance of every club in your region intimately. Attribute readings from regional matches carry a 15 % accuracy bonus.",
    level: 3,
    specialization: "regional",
    effect: { type: "accuracyBonus", factor: 0.85, condition: "inHomeRegion" },
  },
  {
    id: "regional_hidden_gem_finder",
    name: "Hidden Gem Finder",
    description:
      "Lower leagues hide players no-one else is watching. Your thorough regional coverage reveals additional layers of mental and tactical attributes on players outside the top two tiers.",
    level: 5,
    specialization: "regional",
    effect: {
      type: "visibilityBonus",
      context: "liveMatch",
      attributes: [
        "composure",
        "leadership",
        "stamina",
        "defensiveAwareness",
      ],
    },
  },
  {
    id: "regional_cultural_translator",
    name: "Cultural Translator",
    description:
      "Understanding regional culture, language, and football philosophy lets you build bridges between players and new clubs. Agent contacts in your region yield substantially richer intel.",
    level: 8,
    specialization: "regional",
    effect: { type: "networkBonus", contactType: "agent", bonus: 20 },
  },
  {
    id: "regional_pipeline_builder",
    name: "Pipeline Builder",
    description:
      "Establish a formal talent pipeline from your region. Receive alerts when contracted players in your territory enter their final contract year or become available for loan.",
    level: 12,
    specialization: "regional",
    effect: {
      type: "alertSystem",
      alertType: "regionalTransferAvailability",
    },
  },

  // -------------------------------------------------------------------------
  // Data Scout (levels 1, 3, 5, 8, 12)
  // -------------------------------------------------------------------------
  {
    id: "data_statistical_baseline",
    name: "Statistical Baseline",
    description:
      "Access to league-wide per-90 benchmarks lets you contextualise raw output numbers. Attribute readings gain a statistical confidence score drawn from data rather than pure observation.",
    level: 1,
    specialization: "data",
    effect: { type: "dataAccess", dataType: "per90Benchmarks" },
  },
  {
    id: "data_performance_model",
    name: "Performance Modelling",
    description:
      "A proprietary model blends observed attributes with underlying statistical profiles. All attribute confidence ranges narrow by 20 % when sufficient data coverage is available.",
    level: 3,
    specialization: "data",
    effect: {
      type: "accuracyBonus",
      factor: 0.8,
      condition: "dataAvailable",
    },
  },
  {
    id: "data_anomaly_detection",
    name: "Anomaly Detection",
    description:
      "Flags players whose statistical output is significantly higher or lower than their observed attribute profile would predict — surfacing hidden gems and overrated names alike.",
    level: 5,
    specialization: "data",
    effect: { type: "alertSystem", alertType: "statisticalAnomaly" },
  },
  {
    id: "data_video_efficiency",
    name: "Video Efficiency Protocol",
    description:
      "Systematic clip tagging and frame-by-frame review extracts more signal from footage than a standard viewing session. Video observations now yield attribute readings comparable to a live visit.",
    level: 8,
    specialization: "data",
    effect: {
      type: "visibilityBonus",
      context: "videoAnalysis",
      attributes: [
        "decisionMaking",
        "positioning",
        "composure",
        "offTheBall",
        "defensiveAwareness",
      ],
    },
  },
  {
    id: "data_xg_chain",
    name: "xG Chain Analysis",
    description:
      "Decompose expected-goals chains to assess each player's contribution to attack creation and defensive disruption. Unlocks advanced shot-creation and pressing-intensity metrics on reports.",
    level: 12,
    specialization: "data",
    effect: { type: "dataAccess", dataType: "xgChainMetrics" },
  },

  // -------------------------------------------------------------------------
  // First Team Scout (levels 15, 18)
  // -------------------------------------------------------------------------
  {
    id: "firstteam_conviction_commander",
    name: "Conviction Commander",
    description:
      "Your reputation for backing the right players is impeccable. Every conviction level you attach to a report now carries 50 % more persuasive weight in the boardroom — a tablePound from you is almost impossible to ignore.",
    level: 15,
    specialization: "firstTeam",
    effect: { type: "convictionMultiplier", factor: 1.5 },
  },
  {
    id: "firstteam_transfer_kingmaker",
    name: "Transfer Kingmaker",
    description:
      "At this level your word carries real institutional weight. Direct lobbying, targeted briefings, and relationship leverage give you a meaningful influence over whether a club pursues a transfer — not just recommending players, but shaping decisions.",
    level: 18,
    specialization: "firstTeam",
    effect: { type: "transferInfluence", factor: 0.3 },
  },

  // -------------------------------------------------------------------------
  // Regional Expert (levels 15, 18)
  // -------------------------------------------------------------------------
  {
    id: "regional_territory_mastery",
    name: "Territory Mastery",
    description:
      "You know your home region as well as anyone alive. Observations made on home soil carry a 70 % accuracy bonus, narrowing confidence intervals to near-certainty and making your regional reports the most authoritative in the game.",
    level: 15,
    specialization: "regional",
    effect: {
      type: "regionalAccuracyBonus",
      factor: 0.7,
      country: "homeRegion",
    },
  },
  {
    id: "regional_hidden_attribute_revealer",
    name: "Hidden Attribute Revealer",
    description:
      "Years of intimate knowledge of players in your territory — their training habits, personal lives, and dressing-room reputations — means consistency and professionalism are no longer hidden to you. You read them directly from sustained observation.",
    level: 18,
    specialization: "regional",
    effect: {
      type: "hiddenAttributeAccess",
      attributes: ["consistency", "professionalism"],
    },
  },

  // -------------------------------------------------------------------------
  // Data Scout (levels 15, 18)
  // -------------------------------------------------------------------------
  {
    id: "data_predictive_analytics",
    name: "Predictive Analytics",
    description:
      "When data coverage is rich enough, your models move from descriptive to predictive. Attribute confidence intervals tighten by 65 % on players with high data coverage, giving you the most precise numerical picture available anywhere in the sport.",
    level: 15,
    specialization: "data",
    effect: {
      type: "accuracyBonus",
      factor: 0.65,
      condition: "highDataCoverage",
    },
  },
  {
    id: "data_neural_scout_network",
    name: "Neural Scout Network",
    description:
      "Your pattern-matching systems now operate across the entire dataset simultaneously. Receive automated alerts whenever a cross-league statistical pattern — a sudden xG spike, an anomalous pressing intensity, an outlier defensive action rate — matches a profile associated with breakout talent.",
    level: 18,
    specialization: "data",
    effect: { type: "alertSystem", alertType: "patternMatch" },
  },
];

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Return all perks for a specialization unlocked at or below the given level.
 */
export function getUnlockedPerks(
  specialization: Specialization,
  level: number
): Perk[] {
  return ALL_PERKS.filter(
    (p) => p.specialization === specialization && p.level <= level
  );
}

/**
 * Return all perks for a specialization not yet unlocked (visible on the tree
 * but cannot be used yet).
 */
export function getAvailablePerks(
  specialization: Specialization,
  level: number
): Perk[] {
  return ALL_PERKS.filter(
    (p) => p.specialization === specialization && p.level > level
  );
}

/**
 * Fold a set of unlocked perks into a single PerkModifiers struct that
 * downstream systems can cheaply query without iterating perks repeatedly.
 */
export function applyPerkEffects(scout: Scout, perks: Perk[]): PerkModifiers {
  const networkBonuses: Record<ContactType, number> = {
    agent: 0,
    scout: 0,
    clubStaff: 0,
    journalist: 0,
    academyCoach: 0,
    sportingDirector: 0,
    grassrootsOrganizer: 0,
    schoolCoach: 0,
    youthAgent: 0,
    academyDirector: 0,
    localScout: 0,
  };

  let accuracyMultiplier = 1.0;
  const visibilityBonusAttributes: PlayerAttribute[] = [];
  let canVisitAcademies = false;
  let canSeeYouthProjection = false;
  let canDetectForm = false;
  let valuationAccuracyBonus = 0;
  let dataAccessLevel = 0;

  // New L15/L18 modifier accumulators
  let canPredictDevelopment = false;
  let canDetectWonderkids = false;
  let convictionMultiplier = 1.0;
  let transferInfluenceFactor = 0;
  const hiddenAttributeAccess: PlayerAttribute[] = [];

  // Youth scouting modifier accumulators
  let hasGrassrootsAccess = false;
  let gutFeelingMultiplier = 1.0;
  let gutFeelingMaxAge = 0;
  let hasYouthNetworkTips = false;
  let placementReputationBonus = 0;
  let hasTrialDayAccess = false;
  let hasPAEstimate = false;
  let paEstimateMargin = 0;

  for (const perk of perks) {
    const effect = perk.effect;
    switch (effect.type) {
      case "visibilityBonus":
        if (effect.context === "academyVisit") {
          canVisitAcademies = true;
        }
        for (const attr of effect.attributes) {
          if (!visibilityBonusAttributes.includes(attr)) {
            visibilityBonusAttributes.push(attr);
          }
        }
        break;

      case "accuracyBonus":
        // Each accuracy perk multiplies the running multiplier.
        // factor < 1 means "error reduced by (1 - factor) * 100 %"
        accuracyMultiplier *= effect.factor;
        break;

      case "networkBonus":
        networkBonuses[effect.contactType] =
          (networkBonuses[effect.contactType] ?? 0) + effect.bonus;
        break;

      case "youthProjection":
        canSeeYouthProjection = true;
        break;

      case "formDetection":
        canDetectForm = true;
        break;

      case "valuationBonus":
        valuationAccuracyBonus += effect.factor;
        break;

      case "dataAccess":
        dataAccessLevel += 1;
        break;

      case "alertSystem":
        // Alert systems are handled at the game-loop level; no modifier needed.
        break;

      case "developmentPrediction":
        canPredictDevelopment = true;
        break;

      case "wonderkidDetection":
        canDetectWonderkids = true;
        break;

      case "convictionMultiplier":
        // Multiple conviction perks stack multiplicatively so each layer
        // continues to add meaningful leverage.
        convictionMultiplier *= effect.factor;
        break;

      case "transferInfluence":
        // Additive: stacking two influence perks compounds lobbying power.
        transferInfluenceFactor += effect.factor;
        break;

      case "hiddenAttributeAccess":
        for (const attr of effect.attributes) {
          if (!hiddenAttributeAccess.includes(attr)) {
            hiddenAttributeAccess.push(attr);
          }
        }
        break;

      case "regionalAccuracyBonus":
        // Regional accuracy perks feed into the global accuracy multiplier.
        // The country filtering is applied by the calling observation system;
        // here we fold in the raw factor so the modifier is always available.
        accuracyMultiplier *= effect.factor;
        break;

      case "grassrootsAccess":
        hasGrassrootsAccess = true;
        break;

      case "gutFeelingBonus":
        // Use the highest multiplier and the highest (most permissive) max age
        gutFeelingMultiplier = Math.max(gutFeelingMultiplier, effect.multiplier);
        gutFeelingMaxAge = Math.max(gutFeelingMaxAge, effect.maxAge);
        break;

      case "youthNetworkTips":
        hasYouthNetworkTips = true;
        break;

      case "placementReputationBonus":
        placementReputationBonus += effect.factor;
        break;

      case "trialDayAccess":
        hasTrialDayAccess = true;
        break;

      case "paEstimate":
        hasPAEstimate = true;
        // Use the smallest (most accurate) margin when multiple perks stack
        paEstimateMargin =
          paEstimateMargin === 0
            ? effect.margin
            : Math.min(paEstimateMargin, effect.margin);
        break;
    }
  }

  // Specialization level adds a passive accuracy bonus on top of individual
  // perks (synergy reward for depth of investment).
  const specializationPassive = Math.max(
    0,
    (scout.specializationLevel - 1) * 0.01
  );
  accuracyMultiplier = Math.max(
    0.1,
    accuracyMultiplier - specializationPassive
  );

  return {
    accuracyMultiplier,
    visibilityBonusAttributes,
    canVisitAcademies,
    canSeeYouthProjection,
    canDetectForm,
    valuationAccuracyBonus,
    dataAccessLevel,
    networkBonuses,
    canPredictDevelopment,
    canDetectWonderkids,
    convictionMultiplier,
    transferInfluenceFactor,
    hiddenAttributeAccess,
    hasGrassrootsAccess,
    gutFeelingMultiplier,
    gutFeelingMaxAge,
    hasYouthNetworkTips,
    placementReputationBonus,
    hasTrialDayAccess,
    hasPAEstimate,
    paEstimateMargin,
  };
}
