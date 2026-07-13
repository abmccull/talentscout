/**
 * Durable hypothesis evidence integration.
 *
 * A hypothesis advances only when the scout deliberately gathered relevant
 * evidence (direct focus or a flagged moment). Several moments from one
 * session share an independence key, so one match cannot impersonate several
 * independent confirmations.
 */

import type { AttributeDomain } from "@/engine/core/types";
import type {
  Hypothesis,
  HypothesisEvidence,
  HypothesisEvidenceSignal,
  HypothesisState,
  ObservationSession,
  PlayerMoment,
} from "@/engine/observation/types";

const RESOLUTION_INSIGHT_BONUS = 10;

const EVIDENCE_WEIGHTS: Record<HypothesisEvidence["strength"], number> = {
  weak: 0.5,
  moderate: 1,
  strong: 2,
};

export function momentTypeToEvidenceDomain(
  momentType: PlayerMoment["momentType"],
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

function evidenceStrength(moments: PlayerMoment[]): HypothesisEvidence["strength"] {
  const distanceFromNeutral = moments.reduce(
    (total, moment) => total + Math.abs(moment.quality - 5.5),
    0,
  );
  if (moments.length >= 3 || distanceFromNeutral >= 7) return "strong";
  if (moments.length >= 2 || distanceFromNeutral >= 3) return "moderate";
  return "weak";
}

function signalSupportsHypothesis(
  hypothesis: Hypothesis,
  signal: Exclude<HypothesisEvidenceSignal, "mixed">,
): boolean {
  // Auto-generated hypotheses persist their expected signal. Old saves and
  // manually-authored hypotheses retain the historical positive-claim default.
  return signal === (hypothesis.expectedSignal ?? "positive");
}

function makeEvidence(
  session: ObservationSession,
  hypothesis: Hypothesis,
  signal: Exclude<HypothesisEvidenceSignal, "mixed">,
  moments: PlayerMoment[],
): HypothesisEvidence {
  const direction = signalSupportsHypothesis(hypothesis, signal) ? "for" : "against";
  const context = session.activityType;
  const independenceKey = `session:${session.id}:${hypothesis.playerId}:${hypothesis.domain}`;
  const signalLabel = signal === "positive" ? "positive" : "concerning";

  return {
    id: `evidence_${session.id}_${hypothesis.id}_${signal}`,
    week: session.startedAtWeek,
    season: session.startedAtSeason,
    direction,
    description:
      `${moments.length} ${signalLabel} ${hypothesis.domain} `
      + `moment${moments.length === 1 ? "" : "s"} gathered during ${context}.`,
    strength: evidenceStrength(moments),
    sourceType: "observation",
    sourceId: session.id,
    context,
    independenceKey,
    signal,
  };
}

/**
 * Collect at most two evidence entries (positive and negative) from one
 * session. If both exist they share an independence key and therefore cancel
 * or reinforce only as one independent source during resolution.
 */
export function collectSessionEvidenceForHypothesis(
  session: ObservationSession,
  hypothesis: Hypothesis,
): HypothesisEvidence[] {
  if (hypothesis.state === "confirmed" || hypothesis.state === "debunked") return [];

  const sessionPlayer = session.players.find(
    (player) => player.playerId === hypothesis.playerId,
  );
  if (!sessionPlayer) return [];

  const focusedPhases = new Set(sessionPlayer.focusedPhases);
  const flaggedMomentIds = new Set(
    session.flaggedMoments
      .filter((flagged) => flagged.moment.playerId === hypothesis.playerId)
      .map((flagged) => flagged.moment.id),
  );

  const relevantMoments: PlayerMoment[] = [];
  for (const phase of session.phases) {
    for (const moment of phase.moments) {
      if (moment.playerId !== hypothesis.playerId) continue;
      if (momentTypeToEvidenceDomain(moment.momentType) !== hypothesis.domain) continue;
      if (!focusedPhases.has(phase.index) && !flaggedMomentIds.has(moment.id)) continue;
      relevantMoments.push(moment);
    }
  }

  const positive = relevantMoments.filter((moment) => moment.quality >= 7);
  const negative = relevantMoments.filter((moment) => moment.quality <= 4);
  const evidence: HypothesisEvidence[] = [];
  if (positive.length > 0) {
    evidence.push(makeEvidence(session, hypothesis, "positive", positive));
  }
  if (negative.length > 0) {
    evidence.push(makeEvidence(session, hypothesis, "negative", negative));
  }
  return evidence;
}

interface EvidenceScore {
  supporting: number;
  opposing: number;
  supportingSources: number;
  opposingSources: number;
}

/** Score independent sources rather than raw moment count. */
export function scoreHypothesisEvidence(evidence: HypothesisEvidence[]): EvidenceScore {
  const groups = new Map<string, HypothesisEvidence[]>();
  evidence.forEach((item, index) => {
    const key = item.independenceKey ?? item.id ?? `legacy:${index}`;
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  });

  let supporting = 0;
  let opposing = 0;
  let supportingSources = 0;
  let opposingSources = 0;
  for (const group of groups.values()) {
    const forWeight = group
      .filter((item) => item.direction === "for")
      .reduce((sum, item) => sum + EVIDENCE_WEIGHTS[item.strength], 0);
    const againstWeight = group
      .filter((item) => item.direction === "against")
      .reduce((sum, item) => sum + EVIDENCE_WEIGHTS[item.strength], 0);
    const net = forWeight - againstWeight;
    if (net > 0) {
      supporting += net;
      supportingSources += 1;
    } else if (net < 0) {
      opposing += Math.abs(net);
      opposingSources += 1;
    }
  }

  return { supporting, opposing, supportingSources, opposingSources };
}

export function deriveHypothesisState(
  priorState: HypothesisState,
  evidence: HypothesisEvidence[],
): HypothesisState {
  if (priorState === "confirmed" || priorState === "debunked") return priorState;
  const score = scoreHypothesisEvidence(evidence);

  if (
    score.supporting >= 4
    && score.supportingSources >= 2
    && score.supporting >= score.opposing + 2
  ) {
    return "confirmed";
  }
  if (
    score.opposing >= 4
    && score.opposingSources >= 2
    && score.opposing >= score.supporting + 2
  ) {
    return "debunked";
  }
  if (score.supporting >= 2 && score.supporting > score.opposing) return "supported";
  if (score.opposing >= 2 && score.opposing > score.supporting) return "contradicted";
  return "open";
}

export interface SessionEvidenceApplication {
  session: ObservationSession;
  addedEvidenceCount: number;
  resolvedHypothesisCount: number;
}

/** Apply newly gathered independent evidence to all carried hypotheses. */
export function applySessionEvidenceToHypotheses(
  session: ObservationSession,
): SessionEvidenceApplication {
  let addedEvidenceCount = 0;
  let resolvedHypothesisCount = 0;

  const hypotheses = session.hypotheses.map((hypothesis) => {
    const candidates = collectSessionEvidenceForHypothesis(session, hypothesis);
    if (candidates.length === 0) return hypothesis;

    const existingIds = new Set(hypothesis.evidence.map((item) => item.id).filter(Boolean));
    const existingIndependenceKeys = new Set(
      hypothesis.evidence.map((item) => item.independenceKey).filter(Boolean),
    );
    const additions = candidates.filter(
      (candidate) =>
        !existingIds.has(candidate.id)
        && !existingIndependenceKeys.has(candidate.independenceKey),
    );
    if (additions.length === 0) return hypothesis;

    addedEvidenceCount += additions.length;
    const evidence = [...hypothesis.evidence, ...additions];
    const state = deriveHypothesisState(hypothesis.state, evidence);
    if (
      (state === "confirmed" || state === "debunked")
      && state !== hypothesis.state
    ) {
      resolvedHypothesisCount += 1;
    }

    return {
      ...hypothesis,
      evidence,
      state,
      lastUpdatedWeek: session.startedAtWeek,
      lastUpdatedSeason: session.startedAtSeason,
    };
  });

  return {
    session: {
      ...session,
      hypotheses,
      insightPointsEarned:
        session.insightPointsEarned
        + resolvedHypothesisCount * RESOLUTION_INSIGHT_BONUS,
    },
    addedEvidenceCount,
    resolvedHypothesisCount,
  };
}

