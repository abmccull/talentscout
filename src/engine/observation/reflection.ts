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
import { MODE_FLAGGED_NOUN } from "@/engine/observation/types";

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

const ACTIVITY_LABELS: Partial<Record<ObservationSession["activityType"], string>> = {
  attendMatch: "Attend Match",
  watchVideo: "Watch Video",
  networkMeeting: "Network Meeting",
  trainingVisit: "Training Visit",
  academyVisit: "Academy Visit",
  youthTournament: "Youth Tournament",
  schoolMatch: "School Match",
  grassrootsTournament: "Grassroots Tournament",
  streetFootball: "Street Football",
  academyTrialDay: "Academy Trial Day",
  youthFestival: "Youth Festival",
  followUpSession: "Follow-Up Session",
  parentCoachMeeting: "Parent/Coach Meeting",
  reserveMatch: "Reserve Match",
  scoutingMission: "Scouting Mission",
  oppositionAnalysis: "Opposition Analysis",
  agentShowcase: "Agent Showcase",
  trialMatch: "Trial Match",
  databaseQuery: "Database Query",
  deepVideoAnalysis: "Deep Video Analysis",
  statsBriefing: "Stats Briefing",
  dataConference: "Data Conference",
  analyticsTeamMeeting: "Analytics Team Meeting",
};

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

// ---- Investigation mode (meetings, conversations) ----

const INVESTIGATION_PLAYER_PROMPTS = [
  "You noticed {playerName}'s body language shift during the conversation. Worth following up on.",
  "Something about the way {playerName} was described suggested hidden potential. Investigate further.",
  "{playerName}'s name came up more than once — the people around them clearly have strong opinions.",
  "The hesitation when discussing {playerName}'s weaknesses was telling. Dig deeper next time.",
];

const INVESTIGATION_ATMOSPHERE_PROMPTS = [
  "The tone of the meeting was tense. Consider whether that coloured the information you received.",
  "They were guarded today — the conversation yielded less than you hoped. A different approach may open doors.",
  "The meeting felt one-sided. Next time, lead with something of value to balance the exchange.",
  "Your counterpart was unusually forthcoming. Consider whether they had an agenda of their own.",
];

const INVESTIGATION_FOCUS_PROMPTS = [
  "You asked a lot of questions but didn't leave much space for the other party. Consider a listening approach next time.",
  "You spent most of the conversation on {playerName}. Don't forget to gather context about the wider situation.",
  "Prioritise what's actionable — not everything from this conversation will age well.",
  "You gathered {flagCount} key pieces of intel. Cross-reference them before committing to your file.",
];

// ---- Analysis mode (data, video) ----

const ANALYSIS_PLAYER_PROMPTS = [
  "{playerName}'s numbers stood out from the dataset. Worth a deeper statistical dive.",
  "The data on {playerName} was inconsistent across metrics. That gap deserves investigation.",
  "{playerName}'s trend line is moving in the right direction — but check the sample size.",
  "The anomaly you flagged around {playerName} might be noise. Cross-reference with video before writing it up.",
];

const ANALYSIS_ATMOSPHERE_PROMPTS = [
  "Data quality was patchy today — consider whether the source was reliable enough to base conclusions on.",
  "Some of the metrics you reviewed had small sample sizes. Treat early signals with appropriate caution.",
  "The dataset skewed towards a particular context. Factor that bias into your interpretation.",
];

const ANALYSIS_FOCUS_PROMPTS = [
  "You focused heavily on statistical outliers. Don't forget to review the baseline numbers too.",
  "You flagged {flagCount} data points. Prioritise the ones with the strongest signal-to-noise ratio.",
  "Your analysis was broad today. Next session, consider narrowing the scope for deeper confidence.",
  "Consider which data points you'd present to the manager. Lead with those in the report.",
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

function humanizeIdentifier(value: string): string {
  return value
    .replace(/([A-Z])/g, " $1")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function formatObservationActivityLabel(
  activityType: ObservationSession["activityType"],
): string {
  return ACTIVITY_LABELS[activityType] ?? humanizeIdentifier(activityType);
}

function formatLensPhrase(lens?: LensType): string {
  if (!lens || lens === "general") return "";
  const article = /^[aeiou]/i.test(lens) ? "an" : "a";
  return ` through ${article} ${lens} lens`;
}

function describeSessionOpening(
  session: ObservationSession,
  completedPhases: number,
  totalPhases: number,
): string {
  const activityLabel = formatObservationActivityLabel(session.activityType).toLowerCase();
  const completedAllPhases = completedPhases >= totalPhases;

  if (session.mode === "investigation") {
    return completedAllPhases
      ? `You saw the ${activityLabel} through from start to finish.`
      : `You got through ${completedPhases} of ${totalPhases} stages of the ${activityLabel}.`;
  }

  if (session.mode === "analysis") {
    return completedAllPhases
      ? `You worked through the ${activityLabel} from start to finish.`
      : `You got through ${completedPhases} of ${totalPhases} stages of the ${activityLabel}.`;
  }

  return completedAllPhases
    ? `You saw the ${activityLabel} all the way through.`
    : `You got through ${completedPhases} of ${totalPhases} phases of the ${activityLabel}.`;
}

function describeAtmosphere(session: ObservationSession): string {
  if (session.mode !== "fullObservation" || !session.venueAtmosphere) {
    return "";
  }

  const weather = session.venueAtmosphere.weather;
  const eventIds = new Set(
    session.phases
      .map((phase) => phase.atmosphereEvent?.id)
      .filter((id): id is string => Boolean(id)),
  );

  if (weather === "heavy_rain" || eventIds.has("waterlogged_pitch")) {
    return "Heavy conditions disrupted the read; the surface and weather turned the session into more of a stress test than a calm baseline watch.";
  }

  if (weather === "light_rain" || eventIds.has("rain_starts")) {
    return "The weather kept altering touches and footing, so every read needed a little more caution than usual.";
  }

  const chaos = session.venueAtmosphere.chaosLevel;
  if (chaos <= 0.2) {
    return "Conditions stayed calm enough for a clean read.";
  }
  if (chaos <= 0.45) {
    return "Conditions were steady, though there was still a little background noise to work through.";
  }
  if (chaos <= 0.7) {
    return "The atmosphere added enough noise to blur some of the finer details.";
  }
  return "The atmosphere was chaotic, which made instincts easier to spot than precise detail.";
}

function describePlayerFocus(session: ObservationSession): string {
  if (session.mode === "investigation") {
    const primary = session.players[0];
    const speaker = session.players[1];
    if (primary && speaker) {
      return `Most of the conversation revolved around ${primary.name}, with ${speaker.name} shaping the read.`;
    }
    if (primary) {
      return `Most of the conversation centered on ${primary.name}.`;
    }
    return "You spent the meeting gathering context rather than locking onto one clear subject.";
  }

  const focusedPlayers = session.players.filter((p) => p.focusedPhases.length > 0);
  if (focusedPlayers.length === 0) {
    return "You kept your focus broad rather than locking onto one player for long.";
  }

  if (focusedPlayers.length === 1) {
    const player = focusedPlayers[0];
    return `Most of your attention stayed on ${player.name}${formatLensPhrase(player.currentLens)}.`;
  }

  if (focusedPlayers.length === 2) {
    const [primary, secondary] = focusedPlayers;
    return `Most of your attention stayed on ${primary.name}${formatLensPhrase(primary.currentLens)}, with ${secondary.name}${formatLensPhrase(secondary.currentLens)} as a secondary focus.`;
  }

  const [primary, secondary, tertiary] = focusedPlayers;
  return `Your focus moved between ${primary.name}${formatLensPhrase(primary.currentLens)}, ${secondary.name}${formatLensPhrase(secondary.currentLens)}, and ${tertiary.name}${formatLensPhrase(tertiary.currentLens)}, though ${primary.name} drew the longest look.`;
}

function describeSessionTakeaway(session: ObservationSession): string {
  const flaggedCount = session.flaggedMoments.length;
  const noun = MODE_FLAGGED_NOUN[session.mode];
  const hypCount = session.hypotheses.length;
  const parts: string[] = [];

  if (flaggedCount === 0) {
    parts.push(
      session.mode === "investigation"
        ? "The meeting gave you a little texture, but nothing concrete enough to bank as fresh intel."
        : session.mode === "analysis"
          ? "There were a few loose signals in the material, but nothing strong enough to flag."
          : "Nothing quite sharpened into a flagged moment."
    );
  } else if (flaggedCount === 1) {
    parts.push(`One ${noun.singular} stood out enough to mark down for follow-up.`);
  } else {
    parts.push(`${flaggedCount} ${noun.plural} stood out enough to flag for follow-up.`);
  }

  if (hypCount === 0) {
    parts.push(
      flaggedCount === 0
        ? "It also stopped short of giving you a new hypothesis to chase."
        : "It still wasn't enough to justify a new hypothesis."
    );
  } else if (hypCount === 1) {
    parts.push("By the end, you had one new hypothesis worth tracking.");
  } else {
    parts.push(`By the end, you had ${hypCount} new hypotheses worth tracking.`);
  }

  return parts.join(" ");
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
  season: number,
  sessionId: string,
  context: string,
  rng: RNG,
): Hypothesis {
  const promising = moments.filter((m) => m.reaction === "promising").length;
  const concerning = moments.filter((m) => m.reaction === "concerning").length;
  const averageMomentQuality = moments.length > 0
    ? moments.reduce((sum, moment) => sum + moment.moment.quality, 0) / moments.length
    : 5.5;
  const expectedSignal: "positive" | "negative" = promising === concerning
    ? (averageMomentQuality >= 5.5 ? "positive" : "negative")
    : (promising > concerning ? "positive" : "negative");
  const textDirection: "for" | "against" =
    expectedSignal === "positive" ? "for" : "against";

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

  const textOptions = HYPOTHESIS_TEXTS[domain][textDirection];
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
    createdAtSeason: season,
    lastUpdatedWeek: week,
    lastUpdatedSeason: season,
    expectedSignal,
    evidence: [
      {
        id: `evidence_${sessionId}_${playerId}_${domain}_initial`,
        week,
        season,
        // The flagged moments formed this exact claim, so they support it
        // whether the claim describes a strength or a concern.
        direction: "for",
        description: evidenceDescription,
        strength: moments.length >= 3 ? "strong" : moments.length === 2 ? "moderate" : "weak",
        sourceType: "observation",
        sourceId: sessionId,
        context,
        independenceKey: `session:${sessionId}:${playerId}:${domain}`,
        signal: expectedSignal,
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
  perkModifiers?: { paEstimate: boolean; paEstimateMargin?: number },
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
      const baseMargin = perkModifiers.paEstimateMargin ?? 5;
      const margin = Math.max(
        1,
        Math.floor(baseMargin * (1 - (paEstimateAccuracyBonus ?? 0))),
      );
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
  const primaryPlayer = mostFocusedPlayer(session.players)
    ?? (session.players[0]?.focusedPhases.length === 0 ? session.players[0] : undefined);

  // Select template banks based on session mode
  const playerPrompts =
    session.mode === "investigation" ? INVESTIGATION_PLAYER_PROMPTS
    : session.mode === "analysis" ? ANALYSIS_PLAYER_PROMPTS
    : PLAYER_FOCUSED_PROMPTS;

  const atmospherePrompts =
    session.mode === "investigation" ? INVESTIGATION_ATMOSPHERE_PROMPTS
    : session.mode === "analysis" ? ANALYSIS_ATMOSPHERE_PROMPTS
    : ATMOSPHERE_PROMPTS;

  const focusPrompts =
    session.mode === "investigation" ? INVESTIGATION_FOCUS_PROMPTS
    : session.mode === "analysis" ? ANALYSIS_FOCUS_PROMPTS
    : FOCUS_DISTRIBUTION_PROMPTS;

  // Always include one player-focused prompt if there is a primary subject.
  if (primaryPlayer) {
    const template = rng.pick(playerPrompts);
    prompts.push(interpolate(template, { playerName: primaryPlayer.name }));
  }

  // Atmosphere prompt: lower chaos threshold for investigation (meetings are always somewhat tense)
  const chaos = session.venueAtmosphere?.chaosLevel ?? 0;
  const atmosphereThreshold = session.mode === "investigation" ? 0.2 : 0.5;
  if (chaos > atmosphereThreshold || session.mode === "investigation") {
    prompts.push(rng.pick(atmospherePrompts));
  }

  // Include a focus/distribution prompt.
  const focusTemplate = rng.pick(focusPrompts);
  prompts.push(
    interpolate(focusTemplate, {
      playerName: primaryPlayer?.name ?? "your primary subject",
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
  return [
    describeSessionOpening(session, completedPhases, totalPhases),
    describeAtmosphere(session),
    describePlayerFocus(session),
    describeSessionTakeaway(session),
  ]
    .filter(Boolean)
    .join(" ");
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
  perkModifiers?: { paEstimate: boolean; paEstimateMargin?: number },
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
        session.startedAtSeason,
        session.id,
        session.activityType,
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
