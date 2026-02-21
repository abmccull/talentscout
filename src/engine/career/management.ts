/**
 * Career management functions for tier 4+ scouts.
 *
 * Covers:
 *  - Manager relationship mechanics (tier 4)
 *  - Board directive evaluation and generation (tier 5)
 *  - Secondary specialization unlock logic (tier 3+)
 *
 * All functions are pure: they accept state and return new state or derived
 * data without mutating their inputs. The RNG instance is the only shared
 * mutable object; callers must pass the same RNG instance used for the
 * current tick so that the sequence remains deterministic.
 */

import type {
  Scout,
  ScoutReport,
  ManagerRelationship,
  ScoutingDirective,
  ScoutingPriority,
  BoardDirective,
  Specialization,
  Position,
} from "@/engine/core/types";
import { RNG } from "@/engine/rng";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Manager satisfaction thresholds.
 * score ≥ HIGH  → trust increases
 * score ≥ MID   → trust is stable (no change)
 * score < MID   → trust decreases
 */
const SATISFACTION_HIGH = 70;
const SATISFACTION_MID  = 40;

/**
 * Trust delta applied at the end of a manager meeting based on satisfaction.
 * All deltas are added on top of the existing trust (clamped to [0, 100]).
 */
const MEETING_TRUST_DELTA: Record<"positive" | "neutral" | "negative", number> = {
  positive: 8,
  neutral:  0,
  negative: -6,
};

/**
 * Influence delta applied at the end of a manager meeting.
 * Influence represents how often the manager acts on the scout's
 * recommendations (0–100). It changes more slowly than trust.
 */
const MEETING_INFLUENCE_DELTA: Record<"positive" | "neutral" | "negative", number> = {
  positive: 3,
  neutral:  0,
  negative: -2,
};

/**
 * Minimum career tier required to unlock a secondary specialization.
 * Scouts must also have a primary specialization level of ≥ 8.
 */
const SECONDARY_SPEC_MIN_TIER   = 3;
const SECONDARY_SPEC_MIN_LEVEL  = 8;

// ---------------------------------------------------------------------------
// Manager satisfaction scoring
// ---------------------------------------------------------------------------

/**
 * Calculate a manager satisfaction score (0–100) based on:
 *  - Report quality relative to the manager's preference style
 *  - How many active scouting directives the scout has fulfilled
 *  - The overall trust level in the existing relationship
 *
 * Higher scores mean the manager is pleased with the scouting department's
 * work this period. The score feeds into meeting outcomes and end-of-season
 * performance reviews (tier 4).
 *
 * @param relationship  The current manager relationship state.
 * @param reports       Reports submitted by the player scout this period.
 * @param directives    Active directives issued by the manager.
 */
export function calculateManagerSatisfaction(
  relationship: ManagerRelationship,
  reports: ScoutReport[],
  directives: ScoutingDirective[],
): number {
  // ── 1. Base trust contribution (up to 30 pts) ────────────────────────────
  // The existing relationship carries significant weight — a well-established
  // rapport is hard to destroy in a single period.
  const trustComponent = Math.round((relationship.trust / 100) * 30);

  // ── 2. Report quality contribution (up to 40 pts) ────────────────────────
  let qualityComponent = 0;
  if (reports.length > 0) {
    const avgQuality =
      reports.reduce((sum, r) => sum + r.qualityScore, 0) / reports.length;

    // Apply a style preference multiplier based on the manager's scouting
    // preference — some managers weight data differently from eye-test scouts.
    const styleMultiplier = computeStyleMultiplier(relationship, reports);

    // Target quality 70 → full 40 pts
    qualityComponent = Math.min(40, Math.round((avgQuality / 70) * 40 * styleMultiplier));
  }

  // ── 3. Directive fulfilment contribution (up to 30 pts) ──────────────────
  let directiveComponent = 0;
  if (directives.length > 0) {
    const fulfilled = directives.filter((d) => d.fulfilled).length;

    // Weight by urgency: fulfilled high-urgency directives score more
    const totalWeight    = directives.reduce((sum, d) => sum + d.urgency, 0);
    const fulfilledWeight = directives
      .filter((d) => d.fulfilled)
      .reduce((sum, d) => sum + d.urgency, 0);

    const fulfilRate = totalWeight > 0 ? fulfilledWeight / totalWeight : fulfilled / directives.length;
    directiveComponent = Math.min(30, Math.round(fulfilRate * 30));
  } else {
    // No directives issued → neutral contribution (15 / 30)
    directiveComponent = 15;
  }

  const total = trustComponent + qualityComponent + directiveComponent;
  return Math.max(0, Math.min(100, total));
}

/**
 * Compute a style preference multiplier (0.75–1.25) that adjusts the quality
 * component of satisfaction based on how the manager prefers scouting to work.
 *
 *  dataFirst:    rewards higher data-literacy signals in reports
 *  eyeTest:      rewards higher conviction usage and video observations
 *  balanced:     neutral (1.0)
 *  resultsBased: rewards reports where the club subsequently acted ("signed")
 */
function computeStyleMultiplier(
  relationship: ManagerRelationship,
  reports: ScoutReport[],
): number {
  switch (relationship.scoutingPreference) {
    case "dataFirst": {
      // Reward reports where the scout used high data-driven quality
      // (proxy: quality ≥ 80 indicates thorough, data-backed assessment)
      const highDataReports = reports.filter((r) => r.qualityScore >= 80).length;
      const ratio = highDataReports / reports.length;
      return 0.85 + ratio * 0.4; // [0.85, 1.25]
    }

    case "eyeTest": {
      // Reward bold conviction: tablePound or strongRecommend signals a scout
      // who backs their own judgment rather than hedging with data
      const boldReports = reports.filter(
        (r) => r.conviction === "tablePound" || r.conviction === "strongRecommend",
      ).length;
      const ratio = boldReports / reports.length;
      return 0.85 + ratio * 0.4; // [0.85, 1.25]
    }

    case "balanced":
      return 1.0;

    case "resultsBased": {
      // Reward reports that led to club action ("signed" or "shortlisted")
      const actionedReports = reports.filter(
        (r) => r.clubResponse === "signed" || r.clubResponse === "shortlisted",
      ).length;
      const ratio = actionedReports / reports.length;
      return 0.75 + ratio * 0.5; // [0.75, 1.25]
    }
  }
}

// ---------------------------------------------------------------------------
// Manager meeting
// ---------------------------------------------------------------------------

/**
 * Process a manager meeting and return the updated relationship plus an
 * optional new scouting directive issued by the manager.
 *
 * Meeting outcomes are influenced by:
 *  - Current trust and influence levels
 *  - Scout's networking and persuasion attributes (soft skill check)
 *  - Light RNG variation to represent the unpredictable nature of human dynamics
 *
 * A directive is issued roughly 60 % of the time in a positive meeting, 30 %
 * in a neutral one, and never in a negative one.
 *
 * @param rng          Seeded RNG instance for this tick.
 * @param scout        Current scout state (attributes used for skill check).
 * @param relationship Current manager relationship state.
 */
export function processManagerMeeting(
  rng: RNG,
  scout: Scout,
  relationship: ManagerRelationship,
): { updatedRelationship: ManagerRelationship; directive?: ScoutingDirective } {
  // ── Soft skill check ──────────────────────────────────────────────────────
  // Networking (ease of building rapport) and persuasion (ability to steer the
  // conversation) both contribute. Both skills are on 1–20; we normalise to
  // a [0, 1] modifier capped at ±15 pts on the effective trust for the check.
  const networkingScore  = scout.attributes.networking;
  const persuasionScore  = scout.attributes.persuasion;
  const skillBonus       = ((networkingScore + persuasionScore - 2) / 38) * 15; // 0..15

  // ── RNG variation ─────────────────────────────────────────────────────────
  // A small Gaussian noise term (σ = 8) reflects how real conversations can
  // swing unexpectedly regardless of preparation.
  const noise = rng.gaussian(0, 8);

  // ── Effective score ───────────────────────────────────────────────────────
  const effectiveTrust = Math.max(
    0,
    Math.min(100, relationship.trust + skillBonus + noise),
  );

  // Determine meeting tone from effective trust
  const tone: "positive" | "neutral" | "negative" =
    effectiveTrust >= 65 ? "positive" :
    effectiveTrust >= 35 ? "neutral"  :
    "negative";

  // ── Apply trust and influence deltas ─────────────────────────────────────
  const newTrust = Math.max(
    0,
    Math.min(100, relationship.trust + MEETING_TRUST_DELTA[tone]),
  );
  const newInfluence = Math.max(
    0,
    Math.min(100, relationship.influence + MEETING_INFLUENCE_DELTA[tone]),
  );

  const updatedRelationship: ManagerRelationship = {
    ...relationship,
    trust:               newTrust,
    influence:           newInfluence,
    meetingsThisSeason:  relationship.meetingsThisSeason + 1,
  };

  // ── Directive generation ──────────────────────────────────────────────────
  const directiveProbability =
    tone === "positive" ? 0.6 :
    tone === "neutral"  ? 0.3 :
    0.0;

  let directive: ScoutingDirective | undefined;
  if (rng.chance(directiveProbability)) {
    directive = generateManagerDirective(rng, relationship, updatedRelationship.meetingsThisSeason);
  }

  return { updatedRelationship, directive };
}

/**
 * Build a scouting directive from the manager.
 *
 * Directive types are weighted by the manager's scouting preference so that
 * data-first managers tend to ask for specific, budget-conscious targets while
 * eye-test managers lean toward first-team-ready or world-class targets.
 */
function generateManagerDirective(
  rng: RNG,
  relationship: ManagerRelationship,
  issuedWeek: number,
): ScoutingDirective {
  type WeightedPriority = { item: ScoutingPriority; weight: number };

  const weightsByPreference: Record<
    ManagerRelationship["scoutingPreference"],
    WeightedPriority[]
  > = {
    dataFirst: [
      { item: "budgetOption",     weight: 30 },
      { item: "specificPosition", weight: 25 },
      { item: "loanTarget",       weight: 20 },
      { item: "youthProspect",    weight: 15 },
      { item: "firstTeamReady",   weight: 8  },
      { item: "worldClass",       weight: 2  },
    ],
    eyeTest: [
      { item: "firstTeamReady",   weight: 30 },
      { item: "worldClass",       weight: 20 },
      { item: "specificPosition", weight: 20 },
      { item: "youthProspect",    weight: 15 },
      { item: "loanTarget",       weight: 10 },
      { item: "budgetOption",     weight: 5  },
    ],
    balanced: [
      { item: "specificPosition", weight: 20 },
      { item: "firstTeamReady",   weight: 20 },
      { item: "youthProspect",    weight: 20 },
      { item: "budgetOption",     weight: 15 },
      { item: "loanTarget",       weight: 15 },
      { item: "worldClass",       weight: 10 },
    ],
    resultsBased: [
      { item: "firstTeamReady",   weight: 35 },
      { item: "specificPosition", weight: 25 },
      { item: "worldClass",       weight: 15 },
      { item: "budgetOption",     weight: 10 },
      { item: "loanTarget",       weight: 10 },
      { item: "youthProspect",    weight: 5  },
    ],
  };

  const priority = rng.pickWeighted(weightsByPreference[relationship.scoutingPreference]);
  const urgency  = rng.nextInt(1, 5);

  // Derive a position requirement for position-specific directives
  const ALL_OUTFIELD_POSITIONS: Position[] = [
    "CB", "LB", "RB", "CDM", "CM", "CAM", "LW", "RW", "ST",
  ];
  const position: Position | undefined =
    priority === "specificPosition"
      ? rng.pick(ALL_OUTFIELD_POSITIONS)
      : undefined;

  const descriptionByPriority: Record<ScoutingPriority, string> = {
    firstTeamReady:   "Find a ready-now player who can step into the first team immediately.",
    youthProspect:    "Identify a high-ceiling youth player for long-term development.",
    specificPosition: `Scout options for the ${position ?? "unknown"} position.`,
    loanTarget:       "Locate a loan candidate who fits our short-term needs within budget.",
    budgetOption:     "Find a cost-effective signing that represents strong value for money.",
    worldClass:       "Scout a world-class talent capable of transforming the squad.",
  };

  return {
    id:          `directive_${issuedWeek}_${rng.nextInt(10000, 99999)}`,
    type:        priority,
    position,
    urgency,
    description: descriptionByPriority[priority],
    issuedWeek,
    fulfilled:   false,
  };
}

// ---------------------------------------------------------------------------
// Board directive evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluate board directives at the end of a season and return which were
 * completed, which were failed, and the resulting reputation change.
 *
 * Directives are completed when `directive.completed === true` and the season
 * deadline has not yet passed. Any directive with `deadline <= season` that is
 * not marked completed is considered failed.
 *
 * @param scout      Current scout (used for specialization-based bonuses).
 * @param directives Board directives active this season.
 * @param season     The season just ended.
 */
export function evaluateBoardDirectives(
  scout: Scout,
  directives: BoardDirective[],
  season: number,
): { completed: BoardDirective[]; failed: BoardDirective[]; reputationChange: number } {
  const completed: BoardDirective[] = [];
  const failed: BoardDirective[]    = [];

  for (const directive of directives) {
    if (directive.completed) {
      // Directive was fulfilled before or during this season
      completed.push(directive);
    } else if (directive.deadline <= season) {
      // Deadline passed without completion
      failed.push(directive);
    }
    // Directives with a future deadline and not yet complete are still active;
    // they are not included in either list.
  }

  // ── Specialization synergy bonus ─────────────────────────────────────────
  // Directors whose specialization aligns with a completed directive type earn
  // a 20 % boost to that directive's reward. This incentivises focusing the
  // department on areas where the director has genuine expertise.
  const SPEC_DIRECTIVE_AFFINITY: Record<Specialization, BoardDirective["type"][]> = {
    youth:     ["findWonderkid", "buildPipeline"],
    firstTeam: ["buildPipeline", "improveAccuracy"],
    regional:  ["expandTerritory", "buildPipeline"],
    data:      ["improveAccuracy", "cutCosts"],
  };

  const affinityTypes = SPEC_DIRECTIVE_AFFINITY[scout.primarySpecialization];

  let reputationChange = 0;

  for (const dir of completed) {
    const isAffinityType = affinityTypes.includes(dir.type);
    const multiplier     = isAffinityType ? 1.2 : 1.0;
    reputationChange    += Math.round(dir.rewardReputation * multiplier);
  }

  for (const dir of failed) {
    reputationChange -= dir.penaltyReputation;
  }

  // Clamp to a reasonable range: large departments can swing reputation hard
  reputationChange = Math.max(-30, Math.min(30, reputationChange));

  return { completed, failed, reputationChange };
}

// ---------------------------------------------------------------------------
// Board directive generation
// ---------------------------------------------------------------------------

/**
 * Generate a set of board directives for the coming season.
 *
 * The board issues 1–3 directives depending on the scout's tier reputation:
 *  - reputation < 50:  1 directive (new directors start with low board trust)
 *  - reputation 50–79: 2 directives
 *  - reputation ≥ 80:  3 directives (high-trust board gives more mandates)
 *
 * Directives are weighted by the scout's specialization so that the board's
 * expectations align with the department's stated focus area.
 *
 * @param rng    Seeded RNG instance.
 * @param scout  Current scout (must be tier 5; tier checked by caller).
 * @param season The upcoming season for which directives are issued.
 */
export function generateBoardDirectives(
  rng: RNG,
  scout: Scout,
  season: number,
): BoardDirective[] {
  const count =
    scout.reputation >= 80 ? 3 :
    scout.reputation >= 50 ? 2 :
    1;

  type DirectiveWeight = { item: BoardDirective["type"]; weight: number };

  // Weight tables per specialization — the board asks for things the director
  // is expected to deliver based on their claimed expertise.
  const WEIGHTS_BY_SPEC: Record<Specialization, DirectiveWeight[]> = {
    youth: [
      { item: "findWonderkid",    weight: 35 },
      { item: "buildPipeline",    weight: 30 },
      { item: "expandTerritory",  weight: 20 },
      { item: "improveAccuracy",  weight: 10 },
      { item: "cutCosts",         weight: 5  },
    ],
    firstTeam: [
      { item: "buildPipeline",    weight: 25 },
      { item: "improveAccuracy",  weight: 25 },
      { item: "findWonderkid",    weight: 20 },
      { item: "expandTerritory",  weight: 15 },
      { item: "cutCosts",         weight: 15 },
    ],
    regional: [
      { item: "expandTerritory",  weight: 40 },
      { item: "buildPipeline",    weight: 25 },
      { item: "findWonderkid",    weight: 20 },
      { item: "cutCosts",         weight: 10 },
      { item: "improveAccuracy",  weight: 5  },
    ],
    data: [
      { item: "improveAccuracy",  weight: 35 },
      { item: "cutCosts",         weight: 25 },
      { item: "buildPipeline",    weight: 20 },
      { item: "findWonderkid",    weight: 10 },
      { item: "expandTerritory",  weight: 10 },
    ],
  };

  const weights     = WEIGHTS_BY_SPEC[scout.primarySpecialization];
  const directives: BoardDirective[] = [];
  const usedTypes   = new Set<BoardDirective["type"]>();

  for (let i = 0; i < count; i++) {
    // Avoid duplicate directive types within the same season
    const availableWeights = weights.filter((w) => !usedTypes.has(w.item));
    if (availableWeights.length === 0) break;

    const type           = rng.pickWeighted(availableWeights);
    usedTypes.add(type);

    const meta = DIRECTIVE_META[type];
    const deadline       = season; // All directives expire at end of this season

    directives.push({
      id:                 `board_${type}_s${season}_${rng.nextInt(10000, 99999)}`,
      type,
      description:        meta.description,
      deadline,
      completed:          false,
      rewardReputation:   rng.nextInt(meta.rewardMin, meta.rewardMax),
      penaltyReputation:  rng.nextInt(meta.penaltyMin, meta.penaltyMax),
    });
  }

  return directives;
}

/**
 * Fixed metadata for each board directive type.
 * Reward and penalty values are randomised within these bands each season.
 */
const DIRECTIVE_META: Record<
  BoardDirective["type"],
  {
    description: string;
    rewardMin: number;
    rewardMax: number;
    penaltyMin: number;
    penaltyMax: number;
  }
> = {
  expandTerritory: {
    description:  "Extend the scouting network into at least two new countries this season.",
    rewardMin:    5,
    rewardMax:    10,
    penaltyMin:   3,
    penaltyMax:   8,
  },
  cutCosts: {
    description:  "Reduce the department's wage bill by consolidating the NPC scout roster.",
    rewardMin:    4,
    rewardMax:    8,
    penaltyMin:   5,
    penaltyMax:   10,
  },
  findWonderkid: {
    description:  "Identify and submit a report on a player of world-class potential before the window closes.",
    rewardMin:    8,
    rewardMax:    15,
    penaltyMin:   5,
    penaltyMax:   12,
  },
  buildPipeline: {
    description:  "Establish a minimum of three active scouting territories with assigned NPC scouts.",
    rewardMin:    6,
    rewardMax:    12,
    penaltyMin:   4,
    penaltyMax:   9,
  },
  improveAccuracy: {
    description:  "Raise the department's average report quality above 70 by season end.",
    rewardMin:    5,
    rewardMax:    10,
    penaltyMin:   3,
    penaltyMax:   7,
  },
};

// ---------------------------------------------------------------------------
// Secondary specialization
// ---------------------------------------------------------------------------

/**
 * Check whether a scout is eligible to unlock a secondary specialization.
 *
 * Requirements:
 *  - Career tier ≥ 3 (full-time scout)
 *  - Primary specialization level ≥ 8 (proven depth before branching)
 *  - No existing secondary specialization (can only unlock once)
 */
export function canUnlockSecondarySpec(scout: Scout): boolean {
  return (
    scout.careerTier >= SECONDARY_SPEC_MIN_TIER &&
    scout.specializationLevel >= SECONDARY_SPEC_MIN_LEVEL &&
    scout.secondarySpecialization === undefined
  );
}

/**
 * Unlock a secondary specialization for the scout and return the updated Scout.
 *
 * The secondary specialization cannot match the primary.
 * Does not mutate the input scout.
 *
 * @throws {Error} If the scout is not eligible or the secondary spec matches primary.
 */
export function unlockSecondarySpecialization(
  scout: Scout,
  spec: Specialization,
): Scout {
  if (!canUnlockSecondarySpec(scout)) {
    throw new Error(
      `Scout ${scout.id} is not eligible to unlock a secondary specialization. ` +
      `Requires tier ≥ ${SECONDARY_SPEC_MIN_TIER}, ` +
      `specialization level ≥ ${SECONDARY_SPEC_MIN_LEVEL}, ` +
      `and no existing secondary specialization.`,
    );
  }

  if (spec === scout.primarySpecialization) {
    throw new Error(
      `Secondary specialization must differ from primary (${scout.primarySpecialization}).`,
    );
  }

  return {
    ...scout,
    secondarySpecialization: spec,
  };
}
