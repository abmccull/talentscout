/**
 * Board AI — Dynamic Board Expectations (F10)
 *
 * Simulates a reactive board of directors that evaluates the scouting
 * department's performance weekly, adjusts satisfaction, and generates
 * consequences (praise, warnings, budget changes, ultimatums, firing).
 *
 * 5 board personality types shift thresholds and severity:
 *  - patient:        Wide neutral band, slow patience decay
 *  - impatient:      Narrow neutral band, fast patience decay
 *  - penny-pinching: Budget-focused, budget cuts more severe
 *  - ambitious:      Expects rapid growth, escalates targets
 *  - hands-off:      Rarely intervenes, wide tolerance bands
 *
 * Pure functions — no side effects, no mutation, no React imports.
 */

import type { RNG } from "@/engine/rng";
import type {
  GameState,
  BoardProfile,
  BoardReaction,
  BoardReactionType,
  BoardPersonality,
  InboxMessage,
} from "@/engine/core/types";

// =============================================================================
// CONSTANTS
// =============================================================================

/** Default starting satisfaction for new boards. */
const DEFAULT_SATISFACTION = 60;
/** Default starting patience for new boards. */
const DEFAULT_PATIENCE = 70;
/** Default budget multiplier. */
const DEFAULT_BUDGET_MULTIPLIER = 1.0;

/**
 * Per-personality configuration.
 * Shifts determine how much each event type moves satisfaction / patience,
 * and define the threshold bands for reactions.
 */
interface PersonalityConfig {
  /** Satisfaction gain per successful recommendation. */
  successGain: number;
  /** Satisfaction loss per failed recommendation. */
  failureLoss: number;
  /** Satisfaction loss per missed directive deadline. */
  missedDeadlineLoss: number;
  /** Satisfaction loss per idle week (no reports submitted). */
  idleWeekLoss: number;
  /** Patience loss per failed directive. */
  patienceLoss: number;
  /** Satisfaction above which praise is triggered. */
  praiseThreshold: number;
  /** Satisfaction below which warnings start. */
  warningThreshold: number;
  /** Satisfaction below which budget cuts / ultimatums occur. */
  criticalThreshold: number;
  /** Satisfaction below which firing / demotion occurs. */
  firingThreshold: number;
  /** Budget increase magnitude (added to multiplier). */
  budgetIncrease: number;
  /** Budget cut magnitude (subtracted from multiplier). */
  budgetCut: number;
  /** Extra patience granted per successful find (patience recovery). */
  successPatienceRecovery: number;
}

const PERSONALITY_CONFIGS: Record<BoardPersonality, PersonalityConfig> = {
  patient: {
    successGain: 5,
    failureLoss: 6,
    missedDeadlineLoss: 10,
    idleWeekLoss: 0.5,
    patienceLoss: 3,
    praiseThreshold: 80,
    warningThreshold: 35,
    criticalThreshold: 20,
    firingThreshold: 8,
    budgetIncrease: 0.15,
    budgetCut: 0.1,
    successPatienceRecovery: 5,
  },
  impatient: {
    successGain: 4,
    failureLoss: 10,
    missedDeadlineLoss: 18,
    idleWeekLoss: 2,
    patienceLoss: 8,
    praiseThreshold: 85,
    warningThreshold: 55,
    criticalThreshold: 35,
    firingThreshold: 18,
    budgetIncrease: 0.1,
    budgetCut: 0.15,
    successPatienceRecovery: 3,
  },
  "penny-pinching": {
    successGain: 5,
    failureLoss: 8,
    missedDeadlineLoss: 15,
    idleWeekLoss: 1,
    patienceLoss: 5,
    praiseThreshold: 80,
    warningThreshold: 50,
    criticalThreshold: 30,
    firingThreshold: 12,
    budgetIncrease: 0.08,
    budgetCut: 0.25,
    successPatienceRecovery: 4,
  },
  ambitious: {
    successGain: 6,
    failureLoss: 9,
    missedDeadlineLoss: 16,
    idleWeekLoss: 1.5,
    patienceLoss: 6,
    praiseThreshold: 82,
    warningThreshold: 50,
    criticalThreshold: 28,
    firingThreshold: 14,
    budgetIncrease: 0.2,
    budgetCut: 0.15,
    successPatienceRecovery: 4,
  },
  "hands-off": {
    successGain: 4,
    failureLoss: 5,
    missedDeadlineLoss: 8,
    idleWeekLoss: 0,
    patienceLoss: 2,
    praiseThreshold: 85,
    warningThreshold: 30,
    criticalThreshold: 15,
    firingThreshold: 5,
    budgetIncrease: 0.1,
    budgetCut: 0.08,
    successPatienceRecovery: 3,
  },
};

// =============================================================================
// HELPERS
// =============================================================================

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function generateId(prefix: string, rng: RNG): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 12; i++) {
    id += chars[rng.nextInt(0, chars.length - 1)];
  }
  return `${prefix}_${id}`;
}

// =============================================================================
// BOARD PROFILE GENERATION
// =============================================================================

/**
 * Generate a board profile for a newly promoted tier 5 scout.
 * The personality is chosen pseudo-randomly based on the RNG seed.
 */
export function generateBoardProfile(rng: RNG): BoardProfile {
  const personalities: BoardPersonality[] = [
    "patient",
    "impatient",
    "penny-pinching",
    "ambitious",
    "hands-off",
  ];
  const personality = rng.pick(personalities);

  return {
    personality,
    patience: DEFAULT_PATIENCE,
    satisfactionLevel: DEFAULT_SATISFACTION,
    budgetMultiplier: DEFAULT_BUDGET_MULTIPLIER,
    ultimatumIssued: false,
    ultimatumDeadline: undefined,
    recentDirectives: [],
  };
}

// =============================================================================
// SATISFACTION EVALUATION
// =============================================================================

/**
 * Weekly assessment of board satisfaction.
 *
 * Evaluates the scouting department's performance and adjusts
 * satisfaction and patience accordingly.
 *
 * Triggers:
 *  - Successful recommendations → satisfaction +successGain
 *  - Failed recommendations → satisfaction -failureLoss
 *  - Missed directive deadlines → satisfaction -missedDeadlineLoss
 *  - Idle weeks (no reports submitted) → satisfaction -idleWeekLoss
 *  - Successful finds → patience recovery
 *
 * @returns Updated board profile (new object, no mutation).
 */
export function evaluateBoardSatisfaction(
  state: GameState,
  rng: RNG,
): BoardProfile {
  const profile = state.boardProfile;
  if (!profile) return generateBoardProfile(rng);

  const config = PERSONALITY_CONFIGS[profile.personality];

  let satisfactionDelta = 0;
  let patienceDelta = 0;

  // --- Positive triggers ---

  // Count reports submitted this week (successful recommendations)
  const reportsThisWeek = Object.values(state.reports).filter(
    (r) =>
      r.submittedWeek === state.currentWeek &&
      r.submittedSeason === state.currentSeason,
  );

  if (reportsThisWeek.length > 0) {
    // Each report submitted gives a fraction of the success gain
    satisfactionDelta += config.successGain * Math.min(reportsThisWeek.length, 3);
    patienceDelta += config.successPatienceRecovery;
  }

  // Count successful transfer records (finds that performed well)
  const successfulFindsThisSeason = state.transferRecords.filter(
    (tr) =>
      tr.season === state.currentSeason &&
      (tr.outcome === "hit" || tr.outcome === "decent"),
  );
  if (successfulFindsThisSeason.length > 0) {
    satisfactionDelta += 2; // Modest ongoing boost
  }

  // --- Negative triggers ---

  // Check for missed directive deadlines this week
  const missedDirectives = state.managerDirectives.filter(
    (d) =>
      !d.fulfilled &&
      d.season === state.currentSeason &&
      state.currentWeek >= 36, // only penalize near season end
  );
  if (missedDirectives.length > 0 && state.currentWeek === 36) {
    // Apply deadline pressure once at week 36
    satisfactionDelta -= config.missedDeadlineLoss * missedDirectives.length;
    patienceDelta -= config.patienceLoss * missedDirectives.length;
  }

  // Check for failed transfer records (flops)
  const recentFlops = state.transferRecords.filter(
    (tr) =>
      tr.season === state.currentSeason && tr.outcome === "flop",
  );
  if (recentFlops.length > 0) {
    satisfactionDelta -= config.failureLoss * recentFlops.length;
    patienceDelta -= config.patienceLoss;
  }

  // Idle week penalty: no reports submitted AND no observations made this week
  if (reportsThisWeek.length === 0) {
    const observationsThisWeek = Object.values(state.observations).filter(
      (o) =>
        o.week === state.currentWeek && o.season === state.currentSeason,
    );
    if (observationsThisWeek.length === 0) {
      satisfactionDelta -= config.idleWeekLoss;
    }
  }

  // --- Check ultimatum deadline ---
  if (
    profile.ultimatumIssued &&
    profile.ultimatumDeadline !== undefined &&
    state.currentWeek >= profile.ultimatumDeadline &&
    profile.satisfactionLevel < config.criticalThreshold + 15
  ) {
    // Ultimatum deadline reached without sufficient improvement
    satisfactionDelta -= 10;
    patienceDelta -= 15;
  }

  // Small RNG variance to prevent perfectly predictable outcomes
  satisfactionDelta += rng.nextFloat(-1, 1);

  const newSatisfaction = clamp(
    profile.satisfactionLevel + satisfactionDelta,
    0,
    100,
  );
  const newPatience = clamp(profile.patience + patienceDelta, 0, 100);

  return {
    ...profile,
    satisfactionLevel: Math.round(newSatisfaction * 10) / 10,
    patience: Math.round(newPatience * 10) / 10,
  };
}

// =============================================================================
// BOARD REACTION GENERATION
// =============================================================================

/**
 * Generate a board reaction based on current satisfaction thresholds.
 *
 * Returns null if no reaction is warranted (neutral zone).
 * Only generates one reaction per evaluation to avoid overwhelming the player.
 */
export function generateBoardReaction(
  state: GameState,
  rng: RNG,
): { reaction: BoardReaction; updatedProfile: BoardProfile; message: InboxMessage } | null {
  const profile = state.boardProfile;
  if (!profile) return null;

  const config = PERSONALITY_CONFIGS[profile.personality];
  const satisfaction = profile.satisfactionLevel;

  let reactionType: BoardReactionType | null = null;
  let trigger = "";
  let message = "";
  let updatedProfile = { ...profile };

  // --- Extreme dissatisfaction: firing or demotion ---
  if (satisfaction < config.firingThreshold && profile.patience < 10) {
    // Choose between firing (game over) or demotion based on RNG and tier
    if (state.scout.careerTier > 1 && rng.nextFloat(0, 1) < 0.6) {
      reactionType = "demotion";
      trigger = "Extreme dissatisfaction with scouting department performance";
      message =
        "The board has lost confidence in your leadership of the scouting department. " +
        "You have been demoted. Prove yourself worthy of this position again.";
    } else {
      reactionType = "firing";
      trigger = "Board patience exhausted — termination of employment";
      message =
        "The board has decided to terminate your contract effective immediately. " +
        "Your track record has fallen below the minimum acceptable standard.";
    }
  }
  // --- Critical zone: budget cut + ultimatum ---
  else if (satisfaction < config.criticalThreshold) {
    if (!profile.ultimatumIssued) {
      reactionType = "ultimatum";
      trigger = "Board satisfaction critically low";
      const deadline = Math.min(state.currentWeek + 8, 38);
      message =
        `The board has issued a formal ultimatum. You have until week ${deadline} ` +
        "to demonstrate significant improvement or face serious consequences. " +
        "Budget allocations have been reduced.";
      updatedProfile = {
        ...updatedProfile,
        ultimatumIssued: true,
        ultimatumDeadline: deadline,
        budgetMultiplier: clamp(
          updatedProfile.budgetMultiplier - config.budgetCut,
          0.5,
          2.0,
        ),
      };
    } else {
      reactionType = "budgetCut";
      trigger = "Continued underperformance during ultimatum period";
      message =
        "The board has further reduced your operating budget due to continued " +
        "underperformance. Immediate improvement is required.";
      updatedProfile = {
        ...updatedProfile,
        budgetMultiplier: clamp(
          updatedProfile.budgetMultiplier - config.budgetCut * 0.5,
          0.5,
          2.0,
        ),
      };
    }
  }
  // --- Warning zone ---
  else if (satisfaction < config.warningThreshold) {
    // Only issue warnings periodically (every 4 weeks) to avoid spam
    if (state.currentWeek % 4 === 0) {
      reactionType = "warning";
      trigger = "Board satisfaction below expectations";
      message =
        "The board has expressed concern about the scouting department's recent output. " +
        "They expect to see better results in the coming weeks.";
    }
  }
  // --- High satisfaction: praise + budget increase ---
  else if (satisfaction > config.praiseThreshold) {
    // Praise every 6 weeks to avoid spam
    if (state.currentWeek % 6 === 0) {
      if (rng.nextFloat(0, 1) < 0.5) {
        reactionType = "budgetIncrease";
        trigger = "Excellent scouting department performance";
        message =
          "The board is impressed with the scouting department's work. " +
          "They have approved an increase to your operating budget.";
        updatedProfile = {
          ...updatedProfile,
          budgetMultiplier: clamp(
            updatedProfile.budgetMultiplier + config.budgetIncrease,
            0.5,
            2.0,
          ),
          // Clear any previous ultimatum on high satisfaction
          ultimatumIssued: false,
          ultimatumDeadline: undefined,
        };
      } else {
        reactionType = "praise";
        trigger = "Board satisfaction high";
        message =
          "The board commends your outstanding work. Keep up the excellent " +
          "performance and the department will continue to thrive.";
        updatedProfile = {
          ...updatedProfile,
          ultimatumIssued: false,
          ultimatumDeadline: undefined,
        };
      }
    }
  }

  if (reactionType === null) return null;

  const reaction: BoardReaction = {
    type: reactionType,
    trigger,
    week: state.currentWeek,
    message,
  };

  const inboxMessage: InboxMessage = {
    id: generateId("msg", rng),
    week: state.currentWeek,
    season: state.currentSeason,
    type: reactionType === "praise" || reactionType === "budgetIncrease"
      ? "feedback"
      : "warning",
    title: getBoardReactionTitle(reactionType),
    body: message,
    read: false,
    actionRequired:
      reactionType === "ultimatum" ||
      reactionType === "firing" ||
      reactionType === "demotion",
  };

  return { reaction, updatedProfile, message: inboxMessage };
}

function getBoardReactionTitle(type: BoardReactionType): string {
  switch (type) {
    case "praise":
      return "Board Commendation";
    case "warning":
      return "Board Warning";
    case "budgetIncrease":
      return "Budget Increase Approved";
    case "budgetCut":
      return "Budget Reduction Notice";
    case "ultimatum":
      return "Board Ultimatum Issued";
    case "demotion":
      return "Demotion Notice";
    case "firing":
      return "Contract Terminated";
  }
}

// =============================================================================
// DIRECTIVE DIFFICULTY SCALING
// =============================================================================

/**
 * Adjust directive difficulty based on board profile.
 *
 * Ambitious boards escalate targets over time.
 * Satisfied boards give more reasonable targets.
 * Dissatisfied boards tighten deadlines.
 *
 * Returns a difficulty multiplier (0.8 - 1.5) that should be applied to:
 *  - minCAStars requirements
 *  - budget allocations (inversely — tighter budget when difficulty is high)
 *  - age range restrictions (narrower when difficulty is high)
 */
export function adjustDirectiveDifficulty(
  state: GameState,
  boardProfile: BoardProfile,
): {
  caStarsMultiplier: number;
  budgetScale: number;
  ageFlexibility: number;
} {
  const config = PERSONALITY_CONFIGS[boardProfile.personality];
  const satisfaction = boardProfile.satisfactionLevel;

  // Base difficulty scales with inverse satisfaction
  // High satisfaction (80+) → easier targets, low satisfaction → harder
  let baseDifficulty: number;
  if (satisfaction > config.praiseThreshold) {
    baseDifficulty = 0.85; // generous targets
  } else if (satisfaction > config.warningThreshold) {
    baseDifficulty = 1.0; // standard
  } else if (satisfaction > config.criticalThreshold) {
    baseDifficulty = 1.15; // stricter
  } else {
    baseDifficulty = 1.3; // very strict
  }

  // Ambitious boards escalate over seasons
  if (boardProfile.personality === "ambitious") {
    const seasonCount = boardProfile.recentDirectives.length;
    baseDifficulty += Math.min(seasonCount * 0.05, 0.2);
  }

  // Penny-pinching boards scale budget more aggressively
  const budgetPenalty =
    boardProfile.personality === "penny-pinching" ? 0.15 : 0;

  return {
    caStarsMultiplier: clamp(baseDifficulty, 0.8, 1.5),
    budgetScale: clamp(
      boardProfile.budgetMultiplier - budgetPenalty,
      0.5,
      2.0,
    ),
    ageFlexibility: satisfaction > 60 ? 1.0 : 0.7, // narrower age ranges when unhappy
  };
}

// =============================================================================
// MEET BOARD ACTION
// =============================================================================

/**
 * Process a board meeting initiated by the scout.
 * Temporarily improves satisfaction and patience.
 *
 * @returns Updated board profile and an inbox message.
 */
export function processBoardMeeting(
  state: GameState,
  rng: RNG,
): { updatedProfile: BoardProfile; message: InboxMessage } | null {
  const profile = state.boardProfile;
  if (!profile) return null;
  if (state.scout.careerTier < 5) return null;

  const config = PERSONALITY_CONFIGS[profile.personality];

  // Base meeting boost
  let satisfactionBoost = 5;
  let patienceBoost = 8;

  // Hands-off boards don't care for meetings as much
  if (profile.personality === "hands-off") {
    satisfactionBoost = 2;
    patienceBoost = 3;
  }

  // Impatient boards appreciate face-time more
  if (profile.personality === "impatient") {
    satisfactionBoost = 7;
    patienceBoost = 10;
  }

  // Small RNG variance
  satisfactionBoost += rng.nextFloat(-1, 2);
  patienceBoost += rng.nextFloat(-1, 2);

  const updatedProfile: BoardProfile = {
    ...profile,
    satisfactionLevel: clamp(
      profile.satisfactionLevel + satisfactionBoost,
      0,
      100,
    ),
    patience: clamp(profile.patience + patienceBoost, 0, 100),
  };

  // If meeting during ultimatum period, show some leniency
  if (profile.ultimatumIssued && profile.ultimatumDeadline !== undefined) {
    // Extend deadline by 2 weeks
    updatedProfile.ultimatumDeadline = Math.min(
      profile.ultimatumDeadline + 2,
      38,
    );
  }

  const msg: InboxMessage = {
    id: generateId("msg", rng),
    week: state.currentWeek,
    season: state.currentSeason,
    type: "feedback",
    title: "Board Meeting Concluded",
    body: getBoardMeetingMessage(profile.personality, updatedProfile.satisfactionLevel, config),
    read: false,
    actionRequired: false,
  };

  return { updatedProfile, message: msg };
}

function getBoardMeetingMessage(
  personality: BoardPersonality,
  satisfaction: number,
  config: PersonalityConfig,
): string {
  if (satisfaction > config.praiseThreshold) {
    return (
      "The board meeting went very well. The directors are pleased with your " +
      "presentation and confident in the department's direction."
    );
  }
  if (satisfaction > config.warningThreshold) {
    return (
      "The board acknowledged your efforts and discussed upcoming expectations. " +
      "They remain cautiously optimistic about the department's trajectory."
    );
  }
  if (personality === "hands-off") {
    return (
      "The board listened politely but seemed disengaged. They prefer to let " +
      "results speak for themselves rather than holding frequent meetings."
    );
  }
  return (
    "The meeting was tense. The board made their displeasure clear but your " +
    "willingness to discuss the situation in person has bought some goodwill."
  );
}

// =============================================================================
// WEEKLY BOARD PROCESSING (called from processWeeklyTick)
// =============================================================================

/**
 * Combined weekly board processing. Evaluates satisfaction and generates
 * any triggered reactions.
 *
 * Only runs for tier 5 scouts.
 *
 * @returns Updated profile, any reactions, and inbox messages to deliver.
 */
export function processBoardWeekly(
  state: GameState,
  rng: RNG,
): {
  updatedProfile: BoardProfile;
  reactions: BoardReaction[];
  messages: InboxMessage[];
} | null {
  if (state.scout.careerTier < 5) return null;

  // Evaluate satisfaction changes
  const updatedProfile = evaluateBoardSatisfaction(state, rng);

  // Check for reactions using the updated profile
  const stateWithUpdatedProfile: GameState = {
    ...state,
    boardProfile: updatedProfile,
  };

  const reactionResult = generateBoardReaction(stateWithUpdatedProfile, rng);

  if (reactionResult) {
    return {
      updatedProfile: reactionResult.updatedProfile,
      reactions: [reactionResult.reaction],
      messages: [reactionResult.message],
    };
  }

  return {
    updatedProfile,
    reactions: [],
    messages: [],
  };
}
