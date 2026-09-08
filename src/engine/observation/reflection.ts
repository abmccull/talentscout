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
import { ATTRIBUTE_DOMAINS } from "@/engine/core/types";
import type {
  ObservationSession,
  Hypothesis,
  SessionFlaggedMoment,
  SessionPlayer,
  LensType,
} from "@/engine/observation/types";
import { MODE_FLAGGED_NOUN } from "@/engine/observation/types";

/** Flagging preserves a scout's read; it never reveals an unseen event. */
export function getPerceivedFlaggedMomentDescription(
  session: Pick<ObservationSession, "cueReadings">,
  flagged: SessionFlaggedMoment,
): string {
  const cue = session.cueReadings?.find((reading) =>
    reading.momentId === flagged.moment.id && reading.playerId === flagged.moment.playerId,
  );
  return cue?.detail ?? flagged.moment.vagueDescription;
}

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
   * Optional projection-signal range, present only when the scout has the
   * "Generational Eye" perk. It is derived from visible cue quality and stays
   * deliberately broad; hidden potential is never consulted.
   */
  paEstimate?: { low: number; high: number };
}

/**
 * The full output of a post-session reflection pass.
 * Consumed by the session completion pipeline and the UI reflection screen.
 */
export interface ReflectionResult {
  /** Legacy read-only field. New sessions use structured evidence cards. */
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
  technical: ["You are still weighing {playerName}'s technical execution. What would another watch need to show before you made a claim?"],
  physical: ["Keep {playerName}'s physical development as a question. A different opponent or setting may give you a more useful comparison."],
  mental: ["Your read of {playerName}'s decision-making remains tentative. Look for another situation that tests the same question."],
  tactical: ["Keep an open question about {playerName}'s tactical choices. Another role or opponent could change your interpretation."],
  hidden: ["Character is still an open question for {playerName}. Seek repeated behaviour before turning an impression into a judgment."],
};

const GENERIC_PROMPTS = [
  "Which of your notes would you be comfortable defending in a scout meeting? Start with those.",
  "What evidence would change your mind? Make that the question for a future watch.",
  "Decide whether another watch would change your recommendation enough to justify the time.",
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
  session: ObservationSession,
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
    const cue = visibleFlaggedCue(session, fm);
    const cueDomains = [...new Set(cue?.attributesHinted.map((attribute) => ATTRIBUTE_DOMAINS[attribute]) ?? [])];
    if (cueDomains.length > 0) {
      for (const domain of cueDomains) counts[domain] += 1 / cueDomains.length;
    } else {
      counts[momentTypeToDomain(fm.moment.momentType)] += 1;
    }
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

function visibleFlaggedCue(session: ObservationSession, flagged: SessionFlaggedMoment) {
  return session.cueReadings?.find((cue) =>
    cue.momentId === flagged.moment.id
    && cue.playerId === flagged.moment.playerId
    && cue.phaseIndex === flagged.phaseIndex
    && cue.clarity !== "missed",
  );
}

/** Use the scout's recorded read and visible cue; never hidden execution quality. */
function describeFlaggedEvidence(session: ObservationSession, flagged: SessionFlaggedMoment[]) {
  let positive = false;
  let negative = false;
  const reactions = { promising: 0, concerning: 0, inconclusive: 0 };
  for (const flag of flagged) {
    if (flag.reaction === "promising") reactions.promising += 1;
    else if (flag.reaction === "concerning") reactions.concerning += 1;
    else reactions.inconclusive += 1;
    const cue = visibleFlaggedCue(session, flag);
    const usableDirection = cue && cue.clarity !== "glimpse" ? cue.direction : undefined;
    positive ||= flag.reaction === "promising" || usableDirection === "positive";
    negative ||= flag.reaction === "concerning" || usableDirection === "negative";
  }
  const stance = positive && negative ? "mixed"
    : negative ? "concern"
    : positive ? "promising"
    : "unresolved";
  return { stance, ...reactions };
}

function evidenceQuestion(session: ObservationSession, player: SessionPlayer): string {
  const flagged = session.flaggedMoments.filter((flag) => flag.moment.playerId === player.playerId);
  const { stance } = describeFlaggedEvidence(session, flagged);
  if (stance === "concern") {
    return `Your notes raise concerns about ${player.name}. What would a different context need to show before you reconsidered?`;
  }
  if (stance === "mixed") {
    return `Your notes and cue readings for ${player.name} contain conflicting signals. Which uncertainty would another watch resolve?`;
  }
  if (stance === "promising") {
    return `There are encouraging signals in your notes on ${player.name}. Would they hold up in another context?`;
  }
  return `Your read of ${player.name} remains open. Choose a specific question before spending another session on the player.`;
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
  const focusedPlayers = session.players.filter((player) => player.focusedPhases.length > 0)
    .sort((left, right) => right.focusedPhases.length - left.focusedPhases.length);
  if (focusedPlayers.length === 0) {
    return "No player received recorded direct focus during this session.";
  }
  const primary = focusedPlayers[0];
  if (focusedPlayers.length === 1) {
    const lenses = new Set(primary.focusHistory?.map((focus) => focus.lens) ?? []);
    return `Your direct focus stayed on ${primary.name}${lenses.size > 1 ? " through several lenses" : formatLensPhrase(primary.currentLens)}.`;
  }
  const leaders = focusedPlayers.filter((player) => player.focusedPhases.length === primary.focusedPhases.length);
  return leaders.length > 1
    ? `You divided direct focus across ${focusedPlayers.length} players; ${leaders.map((player) => player.name).join(", ")} shared the longest watch.`
    : `You divided direct focus across ${focusedPlayers.length} players; ${primary.name} received the longest watch.`;
}

function describeSessionTakeaway(session: ObservationSession): string {
  const flaggedCount = session.flaggedMoments.length;
  const noun = MODE_FLAGGED_NOUN[session.mode];
  if (flaggedCount === 0) return `You recorded no flagged ${noun.plural}. The session leaves your judgment open.`;
  const evidence = describeFlaggedEvidence(session, session.flaggedMoments);
  const parts = [
    `You recorded ${flaggedCount} ${flaggedCount === 1 ? noun.singular : noun.plural} for follow-up: ${evidence.promising} promising, ${evidence.concerning} concerning, ${evidence.inconclusive} inconclusive.`,
  ];
  const interpretationCount = Object.keys(session.evidenceDecisions ?? {}).length;
  if (interpretationCount > 0) {
    parts.push(`Your notebook contains ${interpretationCount} recorded evidence interpretation${interpretationCount === 1 ? "" : "s"}.`);
  } else {
    parts.push("Review the recorded evidence before deciding what it supports.");
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
/** @deprecated Historical save compatibility only; new reflections do not call this. */
export function buildHypothesisFromMoments(
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
  _players?: Record<string, Player>,
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
    domain = dominantDomainFromFlagged(session, targetMoments);
  } else if (targetPlayer.currentLens) {
    domain = lensToDomain(targetPlayer.currentLens);
  } else {
    domain = "technical";
  }

  // Reliability scales with scout intuition, capped at 0.85.
  const reliability = Math.min(0.3 + scoutIntuition / 30, 0.85);

  const evidence = describeFlaggedEvidence(session, targetMoments);
  const domainLabel = domain === "hidden" ? "character" : domain;
  const narrative = evidence.stance === "concern"
    ? `Your ${domainLabel} read of ${targetPlayer.name} carries concerns from this session. That is a question to test, not a verdict on the player's future.`
    : evidence.stance === "mixed"
      ? `There are conflicting signals in your read of ${targetPlayer.name}. Keep the ${domainLabel} question open until another context helps separate them.`
      : evidence.stance === "promising"
        ? `There are encouraging signals in your ${domainLabel} notes on ${targetPlayer.name}. They may reward another look, but this session cannot settle the player's future.`
        : interpolate(rng.pick(GUT_FEELING_NARRATIVES[domain]), { playerName: targetPlayer.name });

  // Build a trigger reason string.
  const triggerReasonParts: string[] = [];
  if (targetMoments.length > 0) {
    triggerReasonParts.push(
      `${targetMoments.length} flagged moment${targetMoments.length > 1 ? "s" : ""}: ${evidence.promising} promising, ${evidence.concerning} concerning, ${evidence.inconclusive} inconclusive`,
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

  // --- Optional broad projection signal when the perk is active ---
  let paEstimate: { low: number; high: number } | undefined;
  if (perkModifiers?.paEstimate === true) {
    const visibleCues = (session.cueReadings ?? []).filter(
      (cue) => cue.playerId === targetPlayer.playerId && cue.clarity !== "missed",
    );
    const cueSignal = visibleCues.length > 0
      ? visibleCues.reduce((sum, cue) => sum + cue.score, 0) / visibleCues.length
      : targetMoments.length > 0
        ? targetMoments.reduce((sum, flag) => sum + (flag.reaction === "promising" ? 0.65 : flag.reaction === "concerning" ? 0.35 : 0.5), 0) / targetMoments.length
        : 0.5;
    const hash = [...`${session.id}:${targetPlayer.playerId}`].reduce(
      (total, character) => total + character.charCodeAt(0),
      0,
    );
    const drift = ((hash % 9) - 4) * (1 - reliability) * 3;
    const center = Math.max(45, Math.min(175, 70 + cueSignal * 85 + reliability * 12 + drift));
    const equipmentPrecision = Math.min(8, (paEstimateAccuracyBonus ?? 0) * 20);
    const perkPrecision = Math.min(4, Math.max(0, 10 - (perkModifiers.paEstimateMargin ?? 10)));
    const margin = Math.max(20, Math.round(38 - reliability * 10 - equipmentPrecision - perkPrecision));
    paEstimate = {
      low: Math.max(1, Math.floor((center - margin) / 5) * 5),
      high: Math.min(200, Math.ceil((center + margin) / 5) * 5),
    };
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
  const focused = session.players.filter((player) => player.focusedPhases.length > 0);
  const primaryPlayer = mostFocusedPlayer(session.players)
    ?? session.players.find((player) => session.flaggedMoments.some((flag) => flag.moment.playerId === player.playerId));
  if (primaryPlayer) prompts.push(evidenceQuestion(session, primaryPlayer));

  if (focused.length > 3) {
    prompts.push(`You spread direct focus across ${focused.length} players. Consider narrowing the next watch to two or three if you need deeper evidence.`);
  } else if (focused.length === 1) {
    prompts.push(`You kept direct focus on ${focused[0].name}. A different lens or setting could test the parts of your judgment this watch left open.`);
  } else if (focused.length > 1) {
    prompts.push(`You divided direct focus between ${focused.length} players. Decide which unresolved question most deserves another session.`);
  } else {
    prompts.push("No player received recorded direct focus. Decide whether a targeted watch would add useful evidence.");
  }

  if (session.mode === "investigation") {
    prompts.push("Cross-check the information from this conversation against first-hand evidence before making a claim.");
  } else if (session.mode === "analysis") {
    prompts.push("Check the source and sample size before treating a data point as a lasting quality.");
  } else if ((session.venueAtmosphere?.chaosLevel ?? 0) > 0.5) {
    prompts.push("The recorded conditions were noisy. A calmer setting could help test whether your read holds.");
  } else if (session.flaggedMoments.some((flag) => visibleFlaggedCue(session, flag)?.pressureContext)) {
    prompts.push("Some of your recorded evidence came under pressure. Seek a comparable situation before deciding whether it represents a pattern.");
  }
  if (prompts.length < 3) prompts.push(rng.pick(GENERIC_PROMPTS));
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
 * Builds structured evidence and a bounded reflection reward.
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
  // Reflection rewards completion and a rare gut insight. Structured evidence
  // has its own bounded progression path and cannot be farmed as hypotheses.
  const insightPointsFromReflection =
    5 +
    (gutFeelingCandidate !== null ? 3 : 0);

  // --- Session summary ---
  const sessionSummary = generateSessionSummary(session);

  return {
    suggestedHypotheses: [],
    gutFeelingCandidate,
    reflectionPrompts,
    insightPointsFromReflection,
    sessionSummary,
  };
}
