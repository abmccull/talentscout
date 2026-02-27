/**
 * Observation Session State Machine
 *
 * Manages the lifecycle of an interactive observation session:
 * SETUP → ACTIVE → REFLECTION → COMPLETE
 *
 * Pure functions — no side effects, no mutations. The gameStore
 * calls these and applies results to state.
 */

import type { RNG } from "@/engine/rng";
import type {
  ObservationSession,
  ObservationMode,
  SessionConfig,
  SessionPhase,
  SessionPlayer,
  SessionResult,
  SessionFlaggedMoment,
  FocusAllocation,
  Hypothesis,
  HypothesisEvidence,
  HypothesisState,
  LensType,
} from "@/engine/observation/types";
import type { AttributeDomain } from "@/engine/core/types";
import { ACTIVITY_MODE_MAP, VENUE_PHASE_RANGES } from "@/engine/observation/types";

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Focus tokens available per half for each session mode.
 * Full Observation gets the most because it spans an entire match.
 * Quick Interaction gets none — no focus token mechanic applies.
 */
const TOKENS_PER_HALF: Record<ObservationMode, number> = {
  fullObservation: 3,
  investigation: 2,
  analysis: 1,
  quickInteraction: 0,
};

/** Insight points awarded for specific scout actions during a session. */
const IP_PER_FLAGGED_MOMENT = 5;
const IP_PER_HYPOTHESIS_RESOLVED = 10;
const IP_PER_REFLECTION_NOTE = 3;

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Generates a session-scoped unique id from the seed and a counter string.
 * Keeps IDs deterministic for a given seed so sessions are reproducible.
 */
function makeId(seed: string, suffix: string): string {
  // Simple deterministic ID: hash the seed and suffix into a hex-like string.
  // Not a real UUID — but unique within a session for all practical purposes.
  let h = 0x9e3779b9;
  const str = `${seed}:${suffix}`;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 0x517cc1b727220a95 & 0xffffffff);
    h ^= h >>> 16;
  }
  const hex = (h >>> 0).toString(16).padStart(8, "0");
  return `${hex}-${suffix.replace(/[^a-z0-9]/gi, "").slice(0, 8)}`;
}

/**
 * Derives the phase count from the VENUE_PHASE_RANGES lookup.
 * Falls back to a default of 6 phases if the activity type is not mapped.
 */
function resolvePhaseCount(activityType: string, rng: RNG): number {
  const range = VENUE_PHASE_RANGES[activityType];
  if (!range) {
    return rng.nextInt(4, 8);
  }
  return rng.nextInt(range[0], range[1]);
}

/**
 * Builds an array of empty SessionPhase skeletons.
 * Phase content (moments, dialogueNodes, dataPoints, choices) is populated
 * later by mode-specific generators (fullObservation.ts, etc.).
 */
function buildEmptyPhases(
  phaseCount: number,
  mode: ObservationMode,
  seed: string,
): SessionPhase[] {
  const phases: SessionPhase[] = [];

  for (let i = 0; i < phaseCount; i++) {
    // Approximate match-minute for this phase (full observation maps to 90min).
    // For non-match modes this is treated as a sequential step counter.
    const minute =
      mode === "fullObservation"
        ? Math.round((i / (phaseCount - 1)) * 90)
        : i + 1;

    phases.push({
      index: i,
      minute,
      description: "",
      moments: [],
      dialogueNodes: undefined,
      dataPoints: undefined,
      choices: undefined,
      atmosphereEvent: undefined,
      isHalfTime: false,
    });
  }

  return phases;
}

/**
 * Marks the halftime phase in the phases array.
 * The halftime phase is the one closest to the 50% mark of the session.
 * Only applicable to fullObservation mode — other modes never have halftime.
 */
function markHalftimePhase(
  phases: SessionPhase[],
  mode: ObservationMode,
): SessionPhase[] {
  if (mode !== "fullObservation" || phases.length < 3) {
    return phases;
  }

  const halfIndex = Math.floor(phases.length / 2);
  return phases.map((phase, i) => ({
    ...phase,
    isHalfTime: i === halfIndex,
  }));
}

/**
 * Converts the player pool from SessionConfig into lightweight SessionPlayer
 * records, with the targeted player (if any) always included at the front.
 */
function buildSessionPlayers(config: SessionConfig): SessionPlayer[] {
  const players: SessionPlayer[] = config.playerPool.map((p) => ({
    playerId: p.playerId,
    name: p.name,
    position: p.position,
    isFocused: false,
    focusedPhases: [],
    currentLens: undefined,
  }));

  // Ensure targetPlayerId appears first in the list (for UI prominence).
  if (config.targetPlayerId) {
    const targetIdx = players.findIndex(
      (p) => p.playerId === config.targetPlayerId,
    );
    if (targetIdx > 0) {
      const [target] = players.splice(targetIdx, 1);
      players.unshift(target);
    }
  }

  return players;
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Creates a new ObservationSession from config.
 *
 * The returned session is in 'setup' state with skeleton phases ready for
 * content population by the mode-specific generator (e.g. fullObservation.ts).
 */
export function createSession(
  config: SessionConfig,
  rng: RNG,
): ObservationSession {
  const mode: ObservationMode =
    ACTIVITY_MODE_MAP[config.activityType] ?? "fullObservation";

  const phaseCount = resolvePhaseCount(config.activityType, rng);
  const emptyPhases = buildEmptyPhases(phaseCount, mode, config.seed);
  const phases = markHalftimePhase(emptyPhases, mode);

  const tokensPerHalf = TOKENS_PER_HALF[mode];
  const identitySuffix =
    config.activityInstanceId
      ? `instance-${config.activityInstanceId}`
      : `session-${config.week}-${config.season}`;
  const sessionId = makeId(config.seed, identitySuffix);

  return {
    id: sessionId,
    activityInstanceId: config.activityInstanceId,
    mode,
    activityType: config.activityType,
    specialization: config.specialization,
    state: "setup",
    phases,
    currentPhaseIndex: 0,
    focusTokens: {
      available: tokensPerHalf,
      total: tokensPerHalf,
      allocations: [],
      warmupPhases: {},
    },
    flaggedMoments: [],
    hypotheses: [],
    insightPointsEarned: 0,
    reflectionNotes: [],
    venueAtmosphere: undefined,
    players: buildSessionPlayers(config),
    startedAtWeek: config.week,
    startedAtSeason: config.season,
  };
}

/**
 * Transitions a session from 'setup' to 'active'.
 * Validates that the session has phases before allowing the transition.
 */
export function startSession(
  session: ObservationSession,
): ObservationSession {
  if (session.state !== "setup") {
    // Already started or past the active phase — return unchanged.
    return session;
  }

  if (session.phases.length === 0) {
    // Guard: can't start a session with no phases (generator should populate).
    return session;
  }

  return {
    ...session,
    state: "active",
  };
}

/**
 * Advances the session to the next phase.
 *
 * - If the next phase is a halftime phase, refreshes focus tokens.
 * - If this was the final phase, transitions to 'reflection'.
 * - Returns the updated session as a new object.
 */
export function advanceSessionPhase(
  session: ObservationSession,
): ObservationSession {
  if (session.state !== "active") {
    return session;
  }

  const nextPhaseIndex = session.currentPhaseIndex + 1;
  const isLastPhase = nextPhaseIndex >= session.phases.length;

  // Increment phasesActive on all active focus allocations before advancing.
  const updatedAllocations: FocusAllocation[] = session.focusTokens.allocations.map(
    (alloc) => ({ ...alloc, phasesActive: alloc.phasesActive + 1 }),
  );

  // Increment warmupPhases counters for all active lens+player keys.
  const updatedWarmup: Record<string, number> = { ...session.focusTokens.warmupPhases };
  for (const alloc of updatedAllocations) {
    const key = `${alloc.playerId}:${alloc.lens}`;
    updatedWarmup[key] = (updatedWarmup[key] ?? 0) + 1;
  }

  let updatedFocusTokens = {
    ...session.focusTokens,
    allocations: updatedAllocations,
    warmupPhases: updatedWarmup,
  };

  // Refresh tokens when the upcoming phase is a halftime phase.
  if (!isLastPhase && isHalfTimePhase(session, nextPhaseIndex)) {
    updatedFocusTokens = {
      ...updatedFocusTokens,
      available: session.focusTokens.total,
    };
  }

  if (isLastPhase) {
    return {
      ...session,
      state: "reflection",
      currentPhaseIndex: session.phases.length - 1,
      focusTokens: updatedFocusTokens,
    };
  }

  return {
    ...session,
    currentPhaseIndex: nextPhaseIndex,
    focusTokens: updatedFocusTokens,
  };
}

/**
 * Transitions the session from 'reflection' to 'complete'.
 * Should be called after the player finishes writing hypotheses and notes.
 */
export function completeSession(
  session: ObservationSession,
): ObservationSession {
  if (session.state !== "reflection") {
    return session;
  }

  return {
    ...session,
    state: "complete",
  };
}

/**
 * Allocates a focus token to a player with a specific attribute lens.
 *
 * - Decrements available tokens by 1.
 * - Records the allocation in focusTokens.allocations.
 * - Initializes warmup tracking for the new lens (lens switches start at 0
 *   warmup phases, producing partial attribute reads on the first phase).
 * - Updates the SessionPlayer's isFocused and currentLens.
 *
 * Returns the session unchanged if no tokens are available or the session is
 * not in 'active' state.
 */
export function allocateFocus(
  session: ObservationSession,
  playerId: string,
  lens: LensType,
): ObservationSession {
  if (session.state !== "active") {
    return session;
  }

  if (session.focusTokens.available <= 0) {
    return session;
  }

  const player = session.players.find((p) => p.playerId === playerId);
  if (!player) {
    return session;
  }

  const newAllocation: FocusAllocation = {
    playerId,
    lens,
    startPhase: session.currentPhaseIndex,
    phasesActive: 0,
  };

  // Initialise warmup for this player+lens combination (0 = first phase of use).
  const warmupKey = `${playerId}:${lens}`;
  const updatedWarmup: Record<string, number> = {
    ...session.focusTokens.warmupPhases,
    [warmupKey]: 0,
  };

  const updatedFocusTokens = {
    ...session.focusTokens,
    available: session.focusTokens.available - 1,
    allocations: [...session.focusTokens.allocations, newAllocation],
    warmupPhases: updatedWarmup,
  };

  const updatedPlayers = session.players.map((p) =>
    p.playerId === playerId
      ? {
          ...p,
          isFocused: true,
          currentLens: lens,
          focusedPhases: p.focusedPhases.includes(session.currentPhaseIndex)
            ? p.focusedPhases
            : [...p.focusedPhases, session.currentPhaseIndex],
        }
      : p,
  );

  return {
    ...session,
    focusTokens: updatedFocusTokens,
    players: updatedPlayers,
  };
}

/**
 * Removes focus from a player.
 *
 * The focus token is NOT refunded — this is an intentional design decision
 * to make token allocation feel meaningful and irreversible within a half.
 */
export function removeFocus(
  session: ObservationSession,
  playerId: string,
): ObservationSession {
  const updatedPlayers = session.players.map((p) =>
    p.playerId === playerId
      ? { ...p, isFocused: false, currentLens: undefined }
      : p,
  );

  return {
    ...session,
    players: updatedPlayers,
  };
}

/**
 * Flags a moment from the current phase for follow-up or report inclusion.
 *
 * Rules:
 * - Only allowed during 'active' state.
 * - Maximum 1 flag per phase (prevents spamming flags as a high-score mechanic).
 * - The moment must exist in the current phase's moments array.
 */
export function flagMoment(
  session: ObservationSession,
  momentId: string,
  reaction: SessionFlaggedMoment["reaction"],
): ObservationSession {
  if (session.state !== "active") {
    return session;
  }

  // Enforce max 1 flag per phase.
  const alreadyFlaggedThisPhase = session.flaggedMoments.some(
    (fm) => fm.phaseIndex === session.currentPhaseIndex,
  );
  if (alreadyFlaggedThisPhase) {
    return session;
  }

  const currentPhase = session.phases[session.currentPhaseIndex];
  if (!currentPhase) {
    return session;
  }

  const moment = currentPhase.moments.find((m) => m.id === momentId);
  if (!moment) {
    return session;
  }

  const flaggedMoment: SessionFlaggedMoment = {
    id: makeId(session.id, `flag-${session.currentPhaseIndex}-${momentId}`),
    phaseIndex: session.currentPhaseIndex,
    moment,
    reaction,
    minute: currentPhase.minute,
  };

  return {
    ...session,
    flaggedMoments: [...session.flaggedMoments, flaggedMoment],
    insightPointsEarned: session.insightPointsEarned + IP_PER_FLAGGED_MOMENT,
  };
}

/**
 * Creates a new open hypothesis the scout will gather evidence for.
 * Only callable during 'reflection' state, when the scout reviews the session.
 */
export function addHypothesis(
  session: ObservationSession,
  playerId: string,
  text: string,
  domain: AttributeDomain,
  week: number,
): ObservationSession {
  if (session.state !== "reflection") {
    return session;
  }

  const hypothesis: Hypothesis = {
    id: makeId(session.id, `hyp-${playerId}-${week}-${session.hypotheses.length}`),
    playerId,
    text,
    domain,
    state: "open",
    createdAtWeek: week,
    evidence: [],
  };

  return {
    ...session,
    hypotheses: [...session.hypotheses, hypothesis],
  };
}

/**
 * Adds a piece of evidence to an existing hypothesis and recalculates its state.
 *
 * Evidence resolution rules:
 *   3+ 'for' evidence       → 'confirmed'
 *   3+ 'against' evidence   → 'debunked'
 *   2   'for' evidence      → 'supported'
 *   2   'against' evidence  → 'contradicted'
 *   anything else           → remains 'open'
 */
export function updateHypothesis(
  session: ObservationSession,
  hypothesisId: string,
  direction: "for" | "against",
  description: string,
  week: number,
): ObservationSession {
  const hypothesisIdx = session.hypotheses.findIndex(
    (h) => h.id === hypothesisId,
  );
  if (hypothesisIdx === -1) {
    return session;
  }

  const hypothesis = session.hypotheses[hypothesisIdx];

  // Resolved hypotheses do not accumulate further evidence.
  if (hypothesis.state === "confirmed" || hypothesis.state === "debunked") {
    return session;
  }

  // Snapshot the pre-update state as a full HypothesisState for the
  // wasResolved comparison below. Using a cast keeps the type wide so
  // TypeScript's control-flow narrowing (from the guard above) does not
  // restrict the comparison when newState is 'confirmed' or 'debunked'.
  const priorState = hypothesis.state as HypothesisState;

  const newEvidence: HypothesisEvidence = {
    week,
    direction,
    description,
    strength: "moderate",
  };

  const updatedEvidence = [...hypothesis.evidence, newEvidence];

  const forCount = updatedEvidence.filter((e) => e.direction === "for").length;
  const againstCount = updatedEvidence.filter(
    (e) => e.direction === "against",
  ).length;

  let newState: HypothesisState = hypothesis.state;
  if (forCount >= 3) {
    newState = "confirmed";
  } else if (againstCount >= 3) {
    newState = "debunked";
  } else if (forCount >= 2) {
    newState = "supported";
  } else if (againstCount >= 2) {
    newState = "contradicted";
  } else {
    newState = "open";
  }

  const wasResolved =
    (newState === "confirmed" || newState === "debunked") &&
    priorState !== newState;

  const updatedHypothesis: Hypothesis = {
    ...hypothesis,
    state: newState,
    evidence: updatedEvidence,
  };

  const updatedHypotheses = session.hypotheses.map((h, i) =>
    i === hypothesisIdx ? updatedHypothesis : h,
  );

  return {
    ...session,
    hypotheses: updatedHypotheses,
    insightPointsEarned: wasResolved
      ? session.insightPointsEarned + IP_PER_HYPOTHESIS_RESOLVED
      : session.insightPointsEarned,
  };
}

/**
 * Appends a free-text reflection note to the session.
 * Only callable during the 'reflection' phase.
 */
export function addReflectionNote(
  session: ObservationSession,
  note: string,
): ObservationSession {
  if (session.state !== "reflection") {
    return session;
  }

  const trimmed = note.trim();
  if (!trimmed) {
    return session;
  }

  return {
    ...session,
    reflectionNotes: [...session.reflectionNotes, trimmed],
    insightPointsEarned:
      session.insightPointsEarned + IP_PER_REFLECTION_NOTE,
  };
}

/**
 * Computes the final SessionResult from a completed session.
 *
 * Should only be called when session.state === 'complete', but is deliberately
 * not gated — callers can derive a partial result at any state if needed for
 * autosave or preview purposes.
 */
export function getSessionResult(session: ObservationSession): SessionResult {
  const focusedPlayerIds = Array.from(
    new Set(session.focusTokens.allocations.map((a) => a.playerId)),
  );

  const phasesCompleted =
    session.state === "complete" || session.state === "reflection"
      ? session.phases.length
      : session.currentPhaseIndex + 1;

  // Derive a quality tier from insight points earned relative to session length.
  // This is a simple heuristic — richer logic can replace it later.
  const ipPerPhase =
    phasesCompleted > 0 ? session.insightPointsEarned / phasesCompleted : 0;
  let qualityTier: string;
  if (ipPerPhase >= 12) {
    qualityTier = "exceptional";
  } else if (ipPerPhase >= 8) {
    qualityTier = "excellent";
  } else if (ipPerPhase >= 5) {
    qualityTier = "good";
  } else if (ipPerPhase >= 2) {
    qualityTier = "average";
  } else {
    qualityTier = "poor";
  }

  // Only hypotheses that were added or updated in this session are included.
  // For now, include all hypotheses tracked on this session object.
  const hypothesesUpdated = session.hypotheses;

  return {
    sessionId: session.id,
    activityInstanceId: session.activityInstanceId,
    mode: session.mode,
    activityType: session.activityType,
    flaggedMoments: session.flaggedMoments,
    hypothesesUpdated,
    insightPointsEarned: session.insightPointsEarned,
    reflectionNotes: session.reflectionNotes,
    qualityTier,
    phasesCompleted,
    totalPhases: session.phases.length,
    focusedPlayerIds,
  };
}

// =============================================================================
// UTILITY QUERIES
// =============================================================================

/**
 * Returns the number of focus tokens refreshed at half-time for a given mode.
 *
 * fullObservation → 3
 * investigation   → 2
 * analysis        → 1
 * quickInteraction → 0
 */
export function getPhaseTokenRefresh(mode: ObservationMode): number {
  return TOKENS_PER_HALF[mode];
}

/**
 * Returns true if the phase at phaseIndex is the half-time phase of the session.
 *
 * The half-time phase is the one closest to the midpoint of the session
 * (i.e. index === Math.floor(phases.length / 2)).
 *
 * This check relies on the SessionPhase.isHalfTime flag that is set by
 * markHalftimePhase during session construction, falling back to the index
 * calculation if the flag is absent (e.g. phases added dynamically after creation).
 */
export function isHalfTimePhase(
  session: ObservationSession,
  phaseIndex: number,
): boolean {
  const phase = session.phases[phaseIndex];
  if (!phase) {
    return false;
  }

  // Prefer the canonical flag set at creation time.
  if (phase.isHalfTime === true) {
    return true;
  }

  // Fallback: structural midpoint calculation.
  if (session.mode !== "fullObservation") {
    return false;
  }

  return phaseIndex === Math.floor(session.phases.length / 2);
}
