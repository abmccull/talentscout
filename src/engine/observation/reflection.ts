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
import { getInvestigationSpeakers } from "./investigationParticipants";

/** Flagging preserves a scout's read; it never reveals an unseen event. */
export function getRetainedFlaggedMomentReaction(
  session: Pick<ObservationSession, "mode" | "cueReadings" | "evidenceDecisions">,
  flagged: SessionFlaggedMoment,
): SessionFlaggedMoment["reaction"] {
  if (session.mode !== "fullObservation") return flagged.reaction;
  const cue = session.cueReadings?.find((reading) =>
    reading.momentId === flagged.moment.id && reading.playerId === flagged.moment.playerId);
  if (!cue || cue.clarity === "missed" || cue.clarity === "glimpse"
    || session.evidenceDecisions?.[cue.id]?.classification === "noConclusion") return "needs_more_data";
  return flagged.reaction;
}

export function getPerceivedFlaggedMomentDescription(
  session: Pick<ObservationSession, "cueReadings">,
  flagged: SessionFlaggedMoment,
): string {
  const cue = session.cueReadings?.find((reading) =>
    reading.momentId === flagged.moment.id && reading.playerId === flagged.moment.playerId,
  );
  return cue?.detail ?? flagged.moment.vagueDescription;
}

/** Persist the perceived attribute scope, never the simulator's hidden hints. */
export function getRetainedFlaggedMomentAttributes(
  session: Pick<ObservationSession, "mode" | "cueReadings" | "evidenceDecisions">,
  flagged: SessionFlaggedMoment,
): SessionFlaggedMoment["moment"]["attributesHinted"] {
  if (session.mode !== "fullObservation") return [...flagged.moment.attributesHinted];
  const cue = session.cueReadings?.find((reading) =>
    reading.momentId === flagged.moment.id && reading.playerId === flagged.moment.playerId);
  if (!cue || cue.clarity === "missed" || cue.clarity === "glimpse"
    || session.evidenceDecisions?.[cue.id]?.classification === "noConclusion") return [];
  return [...cue.attributesHinted];
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
  technical: ["Your attention keeps returning to {playerName}'s technique."],
  physical: ["You want another look at {playerName}'s movement and physical work."],
  mental: ["You keep reconsidering how {playerName} responded to the situation."],
  tactical: ["You want to test your read of {playerName}'s tactical decisions."],
  hidden: ["You are still weighing what the encounter with {playerName} might mean."],
};

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
    const speakers = getInvestigationSpeakers(session);
    if (primary && speakers.length > 0) {
      return `Most of the conversation revolved around ${primary.name}, with ${speakers.join(" and ")} shaping the read.`;
    }
    if (primary) {
      return `Most of the conversation centered on ${primary.name}.`;
    }
    return "You spent the meeting gathering context rather than locking onto one clear subject.";
  }

  const focusedPlayers = session.players
    .filter((p) => p.focusedPhases.length > 0)
    .sort((a, b) => b.focusedPhases.length - a.focusedPhases.length);
  if (focusedPlayers.length === 0) {
    return "You kept your focus broad rather than locking onto one player for long.";
  }

  if (focusedPlayers.length === 1) {
    const player = focusedPlayers[0];
    return `Most of your attention stayed on ${player.name}${formatLensPhrase(player.currentLens)}.`;
  }

  if (focusedPlayers.length === 2) {
    const [primary, secondary] = focusedPlayers;
    if (primary.focusedPhases.length === secondary.focusedPhases.length) {
      return `You divided your attention between ${primary.name}${formatLensPhrase(primary.currentLens)} and ${secondary.name}${formatLensPhrase(secondary.currentLens)}.`;
    }
    return `Most of your attention stayed on ${primary.name}${formatLensPhrase(primary.currentLens)}, with ${secondary.name}${formatLensPhrase(secondary.currentLens)} as a secondary focus.`;
  }

  const [primary, secondary, tertiary] = focusedPlayers;
  const longestLook = primary.focusedPhases.length > secondary.focusedPhases.length
    ? `, though ${primary.name} drew the longest look`
    : "";
  return `Your focus moved between ${primary.name}${formatLensPhrase(primary.currentLens)}, ${secondary.name}${formatLensPhrase(secondary.currentLens)}, and ${tertiary.name}${formatLensPhrase(tertiary.currentLens)}${longestLook}.`;
}

function describeSessionTakeaway(session: ObservationSession): string {
  if (session.mode === "investigation") {
    const decisions = session.phases.flatMap((phase) =>
      Object.values(phase.dialogueChoiceResolutions ?? {}),
    );
    if (decisions.length > 0) {
      return `You retained ${decisions.length} conversation ${decisions.length === 1 ? "decision" : "decisions"} and the responses they produced. These accounts provide context; direct observation is still needed to test a claim about the player.`;
    }
  }
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
        ? "Choose what you need to see more clearly on the next visit."
        : "Review the saved cues and separate what you observed from what remains uncertain."
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
  const reactions = targetMoments.map((moment) => getRetainedFlaggedMomentReaction(session, moment));
  const concerns = reactions.filter((reaction) => reaction === "concerning").length;
  const promising = reactions.filter((reaction) => reaction === "promising").length;
  const interpretation = concerns > 0 && promising > 0
    ? "Your saved reactions pull in both directions. Look for a context that could separate them."
    : concerns > 0
    ? "The concern you flagged deserves another test before you treat it as a recurring weakness."
    : promising > 0
    ? "The promising cue deserves another test before you treat it as a recurring strength."
    : "The saved read remains open. Attention alone does not establish a strength or weakness.";
  const anchor = targetMoments.find((moment) =>
    getRetainedFlaggedMomentReaction(session, moment) === "concerning") ?? targetMoments[0];
  const narrative = [
    interpolate(rawNarrative, { playerName: targetPlayer.name }),
    interpretation,
    anchor ? `The passage you kept: “${getPerceivedFlaggedMomentDescription(session, anchor)}”` : "",
    "Treat this as a question to investigate, not an additional piece of evidence.",
  ].filter(Boolean).join(" ");

  // Build a trigger reason string.
  const triggerReasonParts: string[] = [];
  if (targetMoments.length > 0) {
    triggerReasonParts.push(
      `${targetMoments.length} flagged moment${targetMoments.length > 1 ? "s" : ""}`,
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
  const visibleCues = (session.cueReadings ?? []).filter(
    (cue) => cue.playerId === targetPlayer.playerId
      && cue.clarity !== "missed" && cue.clarity !== "glimpse"
      && session.evidenceDecisions?.[cue.id]?.classification !== "noConclusion",
  );
  if (perkModifiers?.paEstimate === true && visibleCues.length > 0) {
    const cueSignal = visibleCues.reduce((sum, cue) => sum + cue.score, 0) / visibleCues.length;
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
  if (session.mode === "investigation") {
    const decisions = session.phases.flatMap((phase) =>
      Object.values(phase.dialogueChoiceResolutions ?? {}),
    );
    const last = decisions.at(-1);
    prompts.push(last
      ? `You chose: “${last.optionText}” Which part of the response can another source independently check?`
      : "No conversation decision was recorded. What would you ask before relying on this account?");
    prompts.push("Separate what the source witnessed from what they inferred about the player.");
  } else if (session.mode === "analysis") {
    const selected = session.phases.flatMap((phase) =>
      (phase.dataPoints ?? []).filter((point) => point.id === phase.selectedDataPointId),
    );
    const point = selected.at(-1);
    prompts.push(point
      ? `You selected “${point.label}”. Which match context or sample limitation would change its meaning?`
      : "No analysis point was selected. Choose a specific signal before making a player claim.");
    prompts.push("What would a live observation need to show before you trusted this interpretation?");
  } else {
    const flagged = session.flaggedMoments.at(-1);
    if (flagged) {
      const name = session.players.find((player) => player.playerId === flagged.moment.playerId)?.name ?? "the player";
      prompts.push(`At ${flagged.minute} minutes, you kept this read of ${name}: “${getPerceivedFlaggedMomentDescription(session, flagged)}” What would challenge that interpretation?`);
    } else {
      prompts.push("You did not retain a passage. Choose a player and a question for the next observation before making a claim.");
    }
    const focused = mostFocusedPlayer(session.players);
    prompts.push(focused
      ? `Your attention stayed longest on ${focused.name}. Which unanswered question deserves a different context next time?`
      : "You did not allocate focused attention to a player. A narrower watch may make the next passage easier to read.");
  }
  if ((session.venueAtmosphere?.chaosLevel ?? 0) > 0.5) {
    prompts.push("The viewing conditions were unsettled. Which parts of your read need checking in calmer conditions?");
  }
  if (session.hypotheses.length > 0) {
    prompts.push("Which of your recorded hypotheses has the strongest counterexample? Plan a test that could overturn it.");
  } else {
    prompts.push("What remains unknown? Keeping a question open is more useful than inventing certainty.");
  }
  // Keep the RNG argument for callers; prompts are determined by recorded decisions.
  void rng;
  return prompts.slice(0, 4);
}

/**
 * Generates a narrative summary paragraph for the completed session.
 * Mentions venue, phases, focused players, flagged moments, and hypotheses.
 */
export function generateSessionSummary(session: ObservationSession): string {
  const totalPhases = session.plannedPhaseCount ?? session.phases.length;
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
