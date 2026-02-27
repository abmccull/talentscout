/**
 * Post-Session Reflection
 *
 * After observation phases complete, the scout enters a reflection period.
 * This is where gut feelings trigger, hypotheses form, and the scout
 * synthesizes their observations into actionable insights.
 *
 * The reflection phase is the bridge between raw observation and the
 * structured knowledge that feeds into reports and decisions.
 */

import type { RNG } from "@/engine/rng";
import type { AttributeDomain, Player } from "@/engine/core/types";
import type {
  ObservationSession,
  Hypothesis,
  SessionFlaggedMoment,
  SessionPlayer,
  LensType,
} from "@/engine/observation/types";

// =============================================================================
// RESULT TYPES
// =============================================================================

/**
 * A candidate gut feeling surfaced during the reflection phase.
 * This is not yet a persisted GutFeeling — the UI layer confirms or dismisses it.
 */
export interface GutFeelingCandidate {
  /** ID of the player the feeling is about. */
  playerId: string;
  /** Display name of the player. */
  playerName: string;
  /** The attribute domain the gut feeling relates to. */
  domain: AttributeDomain;
  /** Narrative text the scout experiences internally. */
  narrative: string;
  /**
   * How much weight to place on this feeling when it seeds an attribute reading.
   * Range: 0–1. Driven by scout intuition.
   */
  reliability: number;
  /** Short explanation of what triggered the feeling. */
  triggerReason: string;
  /**
   * Optional PA estimate range, present only when the scout has the
   * "Generational Eye" perk (paEstimate effect). Shows a heuristic
   * low–high range around the player's true potential ability.
   */
  paEstimate?: { low: number; high: number };
}

/**
 * The full output of a post-session reflection pass.
 * Consumed by the session completion pipeline and the UI reflection screen.
 */
export interface ReflectionResult {
  /** Auto-generated hypotheses derived from session moments. */
  suggestedHypotheses: Hypothesis[];
  /** A gut feeling candidate if one triggered, otherwise null. */
  gutFeelingCandidate: GutFeelingCandidate | null;
  /** Narrative prompts for the scout to consider after the session. */
  reflectionPrompts: string[];
  /** Bonus insight points earned purely from the reflection process. */
  insightPointsFromReflection: number;
  /** A single narrative paragraph summarising the full session. */
  sessionSummary: string;
}

// =============================================================================
// GUT FEELING NARRATIVE TEMPLATES
// =============================================================================

/**
 * Reflection-specific gut feeling narratives, organised by domain.
 * These are quieter, more introspective than the live youth scouting templates —
 * they reflect the scout sitting down after the session and processing what they saw.
 */
export const GUT_FEELING_NARRATIVES: Record<AttributeDomain, string[]> = {
  technical: [
    "Something about the way {playerName} touches the ball... there's a quality there that the numbers don't capture.",
    "You keep coming back to that one moment — {playerName} adjusting mid-stride to receive on the half-turn. It wasn't spectacular. But it was effortless.",
    "In the car home, you find yourself replaying {playerName}'s first touch over and over. You've seen that kind of softness before. It tends to matter.",
    "There's a cleanliness to {playerName}'s execution that stayed with you. Not flash — just right, every time. That's harder than it looks.",
  ],
  physical: [
    "You can't quite explain it, but {playerName}'s movement reminds you of a player who went on to dominate at the highest level.",
    "The athleticism you saw from {playerName} today isn't the kind that shows up in sprint tests. It's the efficiency — the economy of movement. Rare.",
    "{playerName} covered more ground than anyone but you barely noticed the effort. That's the tell. Effortless coverage is the hardest thing to develop.",
    "Something about the way {playerName} decelerates into space — the body control, the low centre of gravity. You've made worse calls on less.",
  ],
  mental: [
    "There's a calmness in {playerName}'s eyes. In thirty years, you've learned to trust that look.",
    "Twice today {playerName} made a decision that slowed the game down when everyone around them was rushing. That awareness doesn't come from coaching.",
    "You noticed {playerName} scanning the field before every touch — three, four checks. That's not habit. That's how they think. It's going to compound.",
    "The moment the pressure spiked, {playerName} got quieter. Most players panic or hide. Composure under duress is the scarcest thing in this game.",
  ],
  tactical: [
    "{playerName} sees the game differently. The spaces they find, the timing of their runs — it's instinctive.",
    "Watching {playerName} today, you kept noticing them in the right place a second before the ball arrived. You can't teach that read. It has to be felt.",
    "{playerName} pressed in a way that felt rehearsed — except they were pressing triggers none of their teammates were cued to. Pure pattern recognition.",
    "The positioning was textbook at first glance. Then you realised: no one coached that shape. {playerName} drifted into those pockets on instinct alone.",
  ],
  hidden: [
    "Your gut tells you there's more to {playerName} than meets the eye. Something the data won't show.",
    "You can't point to a single moment — but you left the ground certain that {playerName} is operating at a ceiling nobody around them can see yet.",
    "There's a variable here that doesn't fit any of your frameworks. {playerName} has something. You don't have a word for it yet. You've felt it before.",
    "It's the small things. The way {playerName} responded after a mistake. The way they communicated before a set piece. You've been doing this long enough to know.",
  ],
};

// =============================================================================
// REFLECTION PROMPT TEMPLATES
// =============================================================================

/** Templates that reference a specific flagged player. */
const PLAYER_FOCUSED_PROMPTS = [
  "You noticed {playerName} consistently drifting into space. Worth watching their off-the-ball movement next time.",
  "{playerName}'s reaction to the referee's decision was telling. A character assessment might be valuable.",
  "You couldn't pin down exactly what {playerName}'s ceiling is today. That uncertainty is worth revisiting.",
  "{playerName} was quieter in the second half — fatigue or something else? A follow-up would settle it.",
  "The contrast between {playerName} under pressure and at rest was striking. Mental resilience deserves a dedicated focus next time.",
];

/** Templates that reference the observation conditions. */
const ATMOSPHERE_PROMPTS = [
  "The atmosphere affected your readings today. Consider a follow-up session in calmer conditions.",
  "The noise from the crowd made it hard to isolate individual behaviour. Don't over-weight today's data.",
  "Chaotic conditions revealed raw instincts — but obscured fine technical detail. Factor that in.",
  "You spent time managing distractions rather than watching. That's a session cost worth acknowledging.",
];

/** Templates about session focus distribution. */
const FOCUS_DISTRIBUTION_PROMPTS = [
  "You spent most of your focus on {playerName}. Don't forget the peripheral players who caught your eye.",
  "Your focus was spread thin today. Next time, consider narrowing to two or three players at most.",
  "You flagged {flagCount} moments — more than usual. Prioritise the standouts before writing the report.",
  "You flagged fewer moments than expected. Consider whether the session conditions limited your reads.",
];

/** Generic reflective prompts that always apply. */
const GENERIC_PROMPTS = [
  "First impressions age. Come back to your notes in a week and see if they still hold.",
  "Consider which moments you'd be comfortable defending in a scout meeting. Start with those.",
  "You formed {hypothesisCount} hypothesis today. Each one is a reason to return.",
];

// =============================================================================
// INTERNAL HELPERS
// =============================================================================

/**
 * Map a PlayerMoment's momentType to the closest AttributeDomain.
 * 'characterReveal' maps to 'hidden' since character sits outside the four core domains.
 */
function momentTypeToDomain(
  momentType: SessionFlaggedMoment["moment"]["momentType"],
): AttributeDomain {
  switch (momentType) {
    case "technicalAction":
      return "technical";
    case "physicalTest":
      return "physical";
    case "mentalResponse":
      return "mental";
    case "tacticalDecision":
      return "tactical";
    case "characterReveal":
      return "hidden";
  }
}

/**
 * Returns the AttributeDomain that appears most frequently across an array of
 * flagged moments. Falls back to "technical" when there are no moments.
 */
function dominantDomainFromFlagged(
  flagged: SessionFlaggedMoment[],
): AttributeDomain {
  if (flagged.length === 0) return "technical";

  const counts: Record<AttributeDomain, number> = {
    technical: 0,
    physical: 0,
    mental: 0,
    tactical: 0,
    hidden: 0,
  };

  for (const fm of flagged) {
    counts[momentTypeToDomain(fm.moment.momentType)] += 1;
  }

  let best: AttributeDomain = "technical";
  let bestCount = -1;
  for (const [domain, count] of Object.entries(counts) as [
    AttributeDomain,
    number,
  ][]) {
    if (count > bestCount) {
      best = domain;
      bestCount = count;
    }
  }

  return best;
}

/**
 * Resolve a LensType to an AttributeDomain.
 * 'general' has no direct domain mapping — fall back to "technical".
 */
function lensToDomain(lens: LensType): AttributeDomain {
  if (lens === "general") return "technical";
  return lens;
}

/**
 * Find the player who received the most focus during the session, measured by
 * number of phases actively focused. Returns undefined when no player was focused.
 */
function mostFocusedPlayer(
  players: SessionPlayer[],
): SessionPlayer | undefined {
  return players.reduce<SessionPlayer | undefined>((best, p) => {
    if (!best) return p.focusedPhases.length > 0 ? p : undefined;
    return p.focusedPhases.length > best.focusedPhases.length ? p : best;
  }, undefined);
}

/**
 * Interpolate {playerName}, {flagCount}, {hypothesisCount} tokens in a template string.
 */
function interpolate(
  template: string,
  vars: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) =>
    key in vars ? String(vars[key]) : `{${key}}`,
  );
}

// =============================================================================
// AUTO-HYPOTHESIS GENERATION
// =============================================================================

/**
 * Derives a suggested Hypothesis from a group of flagged moments that share
 * the same player and domain. The hypothesis text is assembled from the
 * dominant reaction type and domain label.
 */
function buildHypothesisFromMoments(
  playerId: string,
  playerName: string,
  domain: AttributeDomain,
  moments: SessionFlaggedMoment[],
  week: number,
  rng: RNG,
): Hypothesis {
  const promising = moments.filter((m) => m.reaction === "promising").length;
  const concerning = moments.filter((m) => m.reaction === "concerning").length;
  const direction: "for" | "against" =
    promising >= concerning ? "for" : "against";

  const HYPOTHESIS_TEXTS: Record<
    AttributeDomain,
    Record<"for" | "against", string[]>
  > = {
    technical: {
      for: [
        `${playerName} shows above-average technical quality for this level.`,
        `${playerName}'s ball control may be a genuine strength worth tracking.`,
      ],
      against: [
        `${playerName} appears to struggle with technical consistency under pressure.`,
        `${playerName}'s first touch lets them down in congested areas.`,
      ],
    },
    physical: {
      for: [
        `${playerName}'s athleticism stands out — strong candidate for physical potential rating.`,
        `${playerName} covers ground efficiently and recovers quickly. Physical ceiling looks high.`,
      ],
      against: [
        `${playerName} may have physical limitations that could cap their development.`,
        `${playerName} looked fatigued in the later phases — endurance could be a concern.`,
      ],
    },
    mental: {
      for: [
        `${playerName} demonstrates composure that exceeds expectations for this age group.`,
        `${playerName} shows good decision-making under pressure — mental attributes worth investigating.`,
      ],
      against: [
        `${playerName} appeared rattled when things went wrong. Mental resilience is a question mark.`,
        `${playerName}'s decision-making deteriorated as the session wore on. Worth monitoring.`,
      ],
    },
    tactical: {
      for: [
        `${playerName} finds pockets of space instinctively — tactical awareness looks advanced.`,
        `${playerName}'s positioning suggests an intuitive understanding of game structure.`,
      ],
      against: [
        `${playerName} was regularly caught out of position. Tactical discipline needs work.`,
        `${playerName} struggles to read the press and often ends up isolated.`,
      ],
    },
    hidden: {
      for: [
        `${playerName} shows character and drive that the standard attributes don't capture.`,
        `${playerName} has an intangible quality worth monitoring across future sessions.`,
      ],
      against: [
        `${playerName}'s reaction to adversity raised questions about their mentality.`,
        `${playerName} disengaged at key moments — hidden attributes may be a concern.`,
      ],
    },
  };

  const textOptions = HYPOTHESIS_TEXTS[domain][direction];
  const text = rng.pick(textOptions);

  const descriptionsByReaction: Record<string, string> = {
    promising: `Flagged ${moments.length} positive ${domain} moment(s) during session.`,
    concerning: `Flagged ${moments.length} concerning ${domain} moment(s) during session.`,
    interesting: `Flagged ${moments.length} notable ${domain} moment(s) requiring follow-up.`,
    needs_more_data: `Flagged ${moments.length} inconclusive ${domain} moment(s) — more data needed.`,
  };

  const dominantReaction =
    promising >= concerning ? "promising" : "concerning";
  const evidenceDescription =
    descriptionsByReaction[dominantReaction] ??
    `Flagged ${moments.length} ${domain} moment(s) during session.`;

  return {
    id: `hyp-${playerId}-${domain}-${week}-${rng.nextInt(1000, 9999)}`,
    playerId,
    text,
    domain,
    state: "open",
    createdAtWeek: week,
    evidence: [
      {
        week,
        direction,
        description: evidenceDescription,
        strength: moments.length >= 3 ? "strong" : moments.length === 2 ? "moderate" : "weak",
      },
    ],
  };
}

// =============================================================================
// EXPORTED FUNCTIONS
// =============================================================================

/**
 * Checks whether a gut feeling triggers during reflection.
 *
 * Base chance: 10%
 * Intuition bonus: intuition / 200 (max +0.5 at intuition 100)
 * Spec level bonus: specLevel / 100 (max +0.5 at specLevel 50)
 * Flagged moment bonus: each flagged moment adds 5%
 *
 * If triggered, selects the player with the most flagged moments as the subject
 * and the dominant domain across those moments as the feeling's domain.
 */
export function checkGutFeelingTrigger(
  rng: RNG,
  session: ObservationSession,
  scoutIntuition: number,
  scoutSpecLevel: number,
  perkModifiers?: { paEstimate: boolean },
  paEstimateAccuracyBonus?: number,
  players?: Record<string, Player>,
): GutFeelingCandidate | null {
  const flaggedCount = session.flaggedMoments.length;

  const baseProbability = 0.1;
  const intuitionBonus = scoutIntuition / 200;
  const specLevelBonus = scoutSpecLevel / 100;
  const flaggedBonus = flaggedCount * 0.05;

  const triggerChance = Math.min(
    baseProbability + intuitionBonus + specLevelBonus + flaggedBonus,
    0.95,
  );

  if (!rng.chance(triggerChance)) return null;

  // Pick the player with the most flagged moments as the feeling's subject.
  const byPlayer = new Map<string, SessionFlaggedMoment[]>();
  for (const fm of session.flaggedMoments) {
    const existing = byPlayer.get(fm.moment.playerId) ?? [];
    existing.push(fm);
    byPlayer.set(fm.moment.playerId, existing);
  }

  // Fall back to the most-focused player if no moments were flagged.
  let targetPlayer: SessionPlayer | undefined;
  let targetMoments: SessionFlaggedMoment[] = [];

  if (byPlayer.size > 0) {
    let bestId = "";
    let bestCount = -1;
    for (const [pid, moments] of byPlayer) {
      if (moments.length > bestCount) {
        bestId = pid;
        bestCount = moments.length;
      }
    }
    targetPlayer = session.players.find((p) => p.playerId === bestId);
    targetMoments = byPlayer.get(bestId) ?? [];
  } else {
    targetPlayer = mostFocusedPlayer(session.players);
  }

  if (!targetPlayer) return null;

  // Determine domain: majority vote over flagged moments; fall back to active lens.
  let domain: AttributeDomain;
  if (targetMoments.length > 0) {
    domain = dominantDomainFromFlagged(targetMoments);
  } else if (targetPlayer.currentLens) {
    domain = lensToDomain(targetPlayer.currentLens);
  } else {
    domain = "technical";
  }

  // Reliability scales with scout intuition, capped at 0.85.
  const reliability = Math.min(0.3 + scoutIntuition / 30, 0.85);

  // Select a narrative template for this domain.
  const templates = GUT_FEELING_NARRATIVES[domain];
  const rawNarrative = rng.pick(templates);
  const narrative = interpolate(rawNarrative, {
    playerName: targetPlayer.name,
  });

  // Build a trigger reason string.
  const triggerReasonParts: string[] = [];
  if (targetMoments.length > 0) {
    triggerReasonParts.push(
      `${targetMoments.length} flagged ${domain} moment${targetMoments.length > 1 ? "s" : ""}`,
    );
  }
  if (targetPlayer.focusedPhases.length > 0) {
    triggerReasonParts.push(
      `${targetPlayer.focusedPhases.length} phase${targetPlayer.focusedPhases.length > 1 ? "s" : ""} of direct focus`,
    );
  }
  const triggerReason =
    triggerReasonParts.length > 0
      ? `Triggered by: ${triggerReasonParts.join(", ")}.`
      : "Triggered during general reflection.";

  // --- Optional PA estimate when perk is active ---
  let paEstimate: { low: number; high: number } | undefined;
  if (perkModifiers?.paEstimate === true && players) {
    const player = players[targetPlayer.playerId];
    if (player) {
      const pa = player.potentialAbility;
      const margin = Math.max(1, Math.floor(5 * (1 - (paEstimateAccuracyBonus ?? 0))));
      paEstimate = {
        low: Math.max(1, pa - margin),
        high: Math.min(200, pa + margin),
      };
    }
  }

  return {
    playerId: targetPlayer.playerId,
    playerName: targetPlayer.name,
    domain,
    narrative,
    reliability,
    triggerReason,
    paEstimate,
  };
}

/**
 * Generates 2–4 narrative prompts based on session events.
 * Prompts reference specific players, moments, and atmosphere events observed.
 */
export function generateReflectionPrompts(
  session: ObservationSession,
  rng: RNG,
): string[] {
  const prompts: string[] = [];
  const flaggedCount = session.flaggedMoments.length;
  const hypothesisCount = session.hypotheses.length;
  const primaryPlayer = mostFocusedPlayer(session.players);

  // Always include one player-focused prompt if there is a primary subject.
  if (primaryPlayer) {
    const template = rng.pick(PLAYER_FOCUSED_PROMPTS);
    prompts.push(interpolate(template, { playerName: primaryPlayer.name }));
  }

  // Include an atmosphere prompt if the venue was chaotic.
  const chaos = session.venueAtmosphere?.chaosLevel ?? 0;
  if (chaos > 0.5) {
    prompts.push(rng.pick(ATMOSPHERE_PROMPTS));
  }

  // Include a focus distribution prompt.
  const focusTemplate = rng.pick(FOCUS_DISTRIBUTION_PROMPTS);
  prompts.push(
    interpolate(focusTemplate, {
      playerName: primaryPlayer?.name ?? "your primary player",
      flagCount: flaggedCount,
    }),
  );

  // Include a generic prompt if we have fewer than 3 prompts so far.
  if (prompts.length < 3) {
    const genericTemplate = rng.pick(GENERIC_PROMPTS);
    prompts.push(
      interpolate(genericTemplate, {
        hypothesisCount,
      }),
    );
  }

  // Shuffle and cap at 4 prompts.
  return rng.shuffle(prompts).slice(0, 4);
}

/**
 * Generates a narrative summary paragraph for the completed session.
 * Mentions venue, phases, focused players, flagged moments, and hypotheses.
 */
export function generateSessionSummary(session: ObservationSession): string {
  const totalPhases = session.phases.length;
  const completedPhases = session.currentPhaseIndex + 1;

  const venueLabel = session.venueAtmosphere?.venueType ?? session.activityType;
  const atmosphereDesc = session.venueAtmosphere?.description
    ? ` ${session.venueAtmosphere.description}`
    : "";

  const focusedPlayers = session.players.filter(
    (p) => p.focusedPhases.length > 0,
  );

  let playerFragment = "";
  if (focusedPlayers.length === 0) {
    playerFragment = "without concentrating your focus on any single player";
  } else if (focusedPlayers.length === 1) {
    const p = focusedPlayers[0];
    const lensLabel = p.currentLens ? ` (${p.currentLens} lens)` : "";
    playerFragment = `focusing primarily on ${p.name}${lensLabel}`;
  } else {
    const playerLabels = focusedPlayers.map((p) => {
      const lensLabel = p.currentLens ? ` (${p.currentLens} lens)` : "";
      return `${p.name}${lensLabel}`;
    });
    const last = playerLabels.pop()!;
    playerFragment = `focusing primarily on ${playerLabels.join(", ")} and ${last}`;
  }

  const flaggedCount = session.flaggedMoments.length;
  const momentFragment =
    flaggedCount === 0
      ? "no moments worth flagging"
      : `${flaggedCount} ${flaggedCount === 1 ? "moment" : "moments"} worth flagging`;

  const hypCount = session.hypotheses.length;
  const hypFragment =
    hypCount === 0
      ? "no new hypotheses"
      : `${hypCount} new ${hypCount === 1 ? "hypothesis" : "hypotheses"}`;

  const chaosDesc =
    session.venueAtmosphere && session.venueAtmosphere.chaosLevel > 0.6
      ? " The chaotic atmosphere revealed raw instincts, but made precise readings difficult."
      : session.venueAtmosphere && session.venueAtmosphere.chaosLevel < 0.3
        ? " Calm conditions allowed for clean, reliable observations throughout."
        : "";

  return (
    `After ${completedPhases} of ${totalPhases} phases observing a ${venueLabel},${atmosphereDesc} ` +
    `you spent the session ${playerFragment}. ` +
    `You identified ${momentFragment} and formed ${hypFragment}.${chaosDesc}`
  );
}

/**
 * Processes a completed ObservationSession and produces a ReflectionResult.
 *
 * Auto-generates hypotheses from flagged moments grouped by player + domain.
 * Checks for a gut feeling trigger. Generates narrative prompts and a session summary.
 * Awards bonus insight points based on session quality.
 */
export function generateReflection(
  session: ObservationSession,
  rng: RNG,
  scoutIntuition: number,
  scoutSpecLevel: number,
  perkModifiers?: { paEstimate: boolean },
  paEstimateAccuracyBonus?: number,
  players?: Record<string, Player>,
): ReflectionResult {
  // --- Auto-generate hypotheses from flagged moments ---
  // Group flagged moments by playerId + domain, then build one hypothesis per group.
  const momentsByPlayerDomain = new Map<string, SessionFlaggedMoment[]>();
  for (const fm of session.flaggedMoments) {
    const domain = momentTypeToDomain(fm.moment.momentType);
    const key = `${fm.moment.playerId}::${domain}`;
    const existing = momentsByPlayerDomain.get(key) ?? [];
    existing.push(fm);
    momentsByPlayerDomain.set(key, existing);
  }

  const suggestedHypotheses: Hypothesis[] = [];
  // Only propose hypotheses for groups with at least 2 flagged moments,
  // unless the moment is standout quality (isStandout === true).
  for (const [key, moments] of momentsByPlayerDomain) {
    const hasStandout = moments.some((m) => m.moment.isStandout);
    if (moments.length < 2 && !hasStandout) continue;

    const [playerId, domain] = key.split("::") as [string, AttributeDomain];
    const player = session.players.find((p) => p.playerId === playerId);
    const playerName = player?.name ?? playerId;

    // Skip if this hypothesis already exists in the session.
    const alreadyExists = session.hypotheses.some(
      (h) => h.playerId === playerId && h.domain === domain,
    );
    if (alreadyExists) continue;

    suggestedHypotheses.push(
      buildHypothesisFromMoments(
        playerId,
        playerName,
        domain,
        moments,
        session.startedAtWeek,
        rng,
      ),
    );
  }

  // --- Check for gut feeling ---
  const gutFeelingCandidate = checkGutFeelingTrigger(
    rng,
    session,
    scoutIntuition,
    scoutSpecLevel,
    perkModifiers,
    paEstimateAccuracyBonus,
    players,
  );

  // --- Generate reflection prompts ---
  const reflectionPrompts = generateReflectionPrompts(session, rng);

  // --- Bonus insight points ---
  // Base: 5 IP for reflecting. +2 per hypothesis suggested. +3 if gut feeling triggers.
  const insightPointsFromReflection =
    5 +
    suggestedHypotheses.length * 2 +
    (gutFeelingCandidate !== null ? 3 : 0);

  // --- Session summary ---
  const sessionSummary = generateSessionSummary(session);

  return {
    suggestedHypotheses,
    gutFeelingCandidate,
    reflectionPrompts,
    insightPointsFromReflection,
    sessionSummary,
  };
}
