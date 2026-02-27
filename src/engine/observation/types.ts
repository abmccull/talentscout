/**
 * Observation Engine Types
 *
 * Type definitions for the Universal Observation Engine — an interactive
 * scouting system that replaces background-processed activities with
 * player-driven observation sessions across all 4 specializations.
 *
 * Modes:
 *  - fullObservation:   Live match/session watching with focus token management
 *  - investigation:     Dialogue-tree based information gathering
 *  - analysis:          Data exploration and pattern recognition
 *  - quickInteraction:  Single-screen strategic decision sessions
 */

import type {
  ActivityType,
  Specialization,
  PlayerAttribute,
  AttributeDomain,
} from "@/engine/core/types";

// =============================================================================
// PRIMITIVES & ENUMS
// =============================================================================

/** The four interactive session modes, each with a distinct UX pattern. */
export type ObservationMode =
  | "fullObservation"
  | "investigation"
  | "analysis"
  | "quickInteraction";

/** State machine states for an ObservationSession. */
export type SessionState = "setup" | "active" | "reflection" | "complete";

/**
 * The attribute domain lens a scout applies when focusing on a player.
 * Mirrors AttributeDomain but adds 'general' for unfocused observation.
 */
export type LensType = "technical" | "physical" | "mental" | "tactical" | "general";

/** Whether a hypothesis is open, accumulating evidence, or resolved. */
export type HypothesisState =
  | "open"
  | "supported"
  | "contradicted"
  | "confirmed"
  | "debunked";

// =============================================================================
// FOCUS TOKEN SYSTEM
// =============================================================================

/**
 * A single allocation of a focus token to a player for a lens + phase range.
 * Tokens spent here are deducted from FocusTokenState.available.
 */
export interface FocusAllocation {
  /** The player this focus token is assigned to. */
  playerId: string;
  /** The attribute lens active during this allocation. */
  lens: LensType;
  /** Phase index (0-based) when focus was allocated. */
  startPhase: number;
  /** How many consecutive phases this allocation has been active. */
  phasesActive: number;
}

/**
 * Manages the focus token budget for a session.
 * Tokens typically refresh at half-time for match-type sessions.
 */
export interface FocusTokenState {
  /** Tokens currently available to spend. */
  available: number;
  /** Maximum tokens per half (typically 3). */
  total: number;
  /** All active and historical focus allocations in this session. */
  allocations: FocusAllocation[];
  /**
   * Tracks how many phases have elapsed since a lens was switched per player.
   * Key format: `${playerId}:${lensType}`. Used to apply warm-up penalties.
   */
  warmupPhases: Record<string, number>;
}

// =============================================================================
// PLAYER MOMENTS (Full Observation)
// =============================================================================

/**
 * A single observable moment involving a player during a session phase.
 * What the scout perceives depends on whether that player is focused.
 */
export interface PlayerMoment {
  /** Unique identifier within the session. */
  id: string;
  /** The player this moment belongs to. */
  playerId: string;
  /** Category of action this moment represents. */
  momentType:
    | "technicalAction"
    | "physicalTest"
    | "mentalResponse"
    | "tacticalDecision"
    | "characterReveal";
  /**
   * Raw quality of the moment on a 1–10 scale.
   * Feeds into attribute reading confidence calculations.
   */
  quality: number;
  /** Attributes that this moment provides evidence about. */
  attributesHinted: PlayerAttribute[];
  /** Detailed description shown when the scout is actively focusing on this player. */
  description: string;
  /** Vague description shown when the player is not focused — peripheral vision only. */
  vagueDescription: string;
  /** Whether this moment occurred under pressure (multiplies reading confidence). */
  pressureContext: boolean;
  /** True if this moment is exceptional enough to be worth flagging immediately. */
  isStandout: boolean;
}

// =============================================================================
// DIALOGUE SYSTEM (Investigation Mode)
// =============================================================================

/**
 * Consequence that flows from a dialogue choice or triggers automatically
 * at the end of a dialogue node with no options.
 */
export interface DialogueConsequence {
  /** Narrative text shown to the player describing what happens. */
  narrativeText: string;
  /** Change to the contact relationship score (-5 to +5 typical range). */
  relationshipDelta?: number;
  /** Update to an active hypothesis — push it toward supported or contradicted. */
  hypothesisUpdate?: {
    hypothesisId: string;
    direction: "for" | "against";
  };
  /** A direct attribute reveal as a result of this dialogue branch. */
  attributeReveal?: {
    playerId: string;
    attribute: PlayerAttribute;
    /** Confidence of the reveal on a 0–1 scale. */
    confidence: number;
  };
  /** Bonus insight points awarded for this outcome. */
  insightBonus?: number;
}

/**
 * A single choice the scout can make within a DialogueNode.
 */
export interface DialogueOption {
  /** Unique identifier within the parent DialogueNode. */
  id: string;
  /** The text of the choice as shown to the player. */
  text: string;
  /**
   * Minimum relationship score required to unlock this option.
   * Undefined means no restriction.
   */
  requiresRelationship?: number;
  /** How risky this approach is — affects possible outcomes. */
  riskLevel: "safe" | "moderate" | "bold";
  /** What happens when the player picks this option. */
  outcome: DialogueConsequence;
}

/**
 * A node in the investigation dialogue tree.
 * Each node represents a conversational beat with one speaker.
 */
export interface DialogueNode {
  /** Unique identifier within the session phase. */
  id: string;
  /** Name of the person speaking (contact, player, coach, parent, etc.). */
  speaker: string;
  /** The text of what the speaker says. */
  text: string;
  /** Choices available to the scout at this node. */
  options: DialogueOption[];
  /** Auto-applied consequence when the node resolves with no active choice. */
  consequence?: DialogueConsequence;
}

// =============================================================================
// DATA POINTS (Analysis Mode)
// =============================================================================

/**
 * A single unit of data presented during an Analysis mode session.
 * The scout interacts by flagging, annotating, and cross-referencing points.
 */
export interface DataPoint {
  /** Unique identifier within the session phase. */
  id: string;
  /** Player this data point relates to. Undefined for team/league-level data. */
  playerId?: string;
  /** Human-readable label for the data point (e.g. "Progressive Passes / 90"). */
  label: string;
  /** The data value — numeric or categorical. */
  value: number | string;
  /** How to interpret this data point. */
  category: "statistical" | "comparison" | "trend" | "anomaly";
  /** Whether this point is visually highlighted as particularly significant. */
  isHighlighted: boolean;
  /** Attributes this data point provides indirect evidence about. */
  relatedAttributes?: PlayerAttribute[];
}

// =============================================================================
// STRATEGIC CHOICES (Quick Interaction Mode)
// =============================================================================

/**
 * A single strategic option in a Quick Interaction session.
 * These sessions present 2–4 choices with no phase timeline.
 */
export interface StrategicChoice {
  /** Unique identifier within the session. */
  id: string;
  /** Short label for the choice. */
  text: string;
  /** Longer description of what this option entails. */
  description: string;
  /** Narrative description of what happens when this choice is selected. */
  effect: string;
  /** The category of real-world impact this choice produces. */
  outcomeType: "territory" | "priority" | "network" | "technique";
}

// =============================================================================
// ATMOSPHERE SYSTEM
// =============================================================================

/**
 * A dynamic event that occurs during a session phase, altering conditions.
 * Can amplify certain attributes (crowd noise helps spot composure),
 * dampen others (chaos obscures technical fine detail), or create distractions.
 */
export interface AtmosphereEvent {
  /** Unique identifier within the session. */
  id: string;
  /** Narrative description of the event. */
  description: string;
  /** How this event modifies the observation environment. */
  effect: "amplify" | "dampen" | "distraction" | "reveal";
  /** The attributes affected by this event (if applicable). */
  affectedAttributes?: PlayerAttribute[];
  /**
   * Change to overall observation noise for this phase.
   * Positive = more noise (harder to read), negative = clearer conditions.
   */
  noiseDelta: number;
}

/**
 * Describes the environmental and atmospheric conditions of an observation venue.
 * These modifiers apply across the entire session and shape which attributes
 * are easier or harder to observe accurately.
 */
export interface VenueAtmosphere {
  /** Type identifier for the venue (maps to YouthVenueType or ActivityType). */
  venueType: string;
  /**
   * Overall chaos level on a 0–1 scale.
   * Higher chaos increases reading noise for all attributes.
   */
  chaosLevel: number;
  /** Attributes that are easier to observe in this environment. */
  amplifiedAttributes: PlayerAttribute[];
  /** Attributes that are harder to observe in this environment. */
  dampenedAttributes: PlayerAttribute[];
  /** Optional weather description affecting outdoor venues. */
  weather?: string;
  /**
   * Crowd intensity on a 0–1 scale.
   * High intensity amplifies mental and hidden attribute signals.
   */
  crowdIntensity: number;
  /** Short narrative description of the venue's atmosphere. */
  description: string;
}

// =============================================================================
// HYPOTHESIS SYSTEM (Investigation Mode)
// =============================================================================

/**
 * A single piece of evidence supporting or contradicting a hypothesis.
 */
export interface HypothesisEvidence {
  /** Game week this evidence was gathered. */
  week: number;
  /** Whether the evidence supports or contradicts the hypothesis. */
  direction: "for" | "against";
  /** Narrative description of what was observed or learned. */
  description: string;
  /** How strongly this evidence affects the hypothesis state. */
  strength: "weak" | "moderate" | "strong";
}

/**
 * A working theory the scout is testing about a player's attributes.
 * Hypotheses accumulate evidence across multiple sessions before resolving.
 */
export interface Hypothesis {
  /** Unique identifier. */
  id: string;
  /** The player this hypothesis is about. */
  playerId: string;
  /** The hypothesis statement (e.g. "He struggles under high-pressure moments"). */
  text: string;
  /** The attribute domain this hypothesis relates to. */
  domain: AttributeDomain;
  /** Current resolution state of the hypothesis. */
  state: HypothesisState;
  /** Game week the hypothesis was first formed. */
  createdAtWeek: number;
  /** Ordered list of evidence gathered for and against this hypothesis. */
  evidence: HypothesisEvidence[];
}

// =============================================================================
// FLAGGED MOMENTS
// =============================================================================

/**
 * A moment the scout has actively flagged for follow-up or report inclusion.
 * This is an enriched version of the core FlaggedMoment — includes the full
 * PlayerMoment data, a scout reaction, and an optional annotation note.
 */
export interface SessionFlaggedMoment {
  /** Unique identifier within the session. */
  id: string;
  /** 0-based index of the phase in which this moment occurred. */
  phaseIndex: number;
  /** The underlying player moment that was flagged. */
  moment: PlayerMoment;
  /** The scout's immediate qualitative reaction to this moment. */
  reaction: "promising" | "concerning" | "interesting" | "needs_more_data";
  /** Match minute or session step number at the time of the moment. */
  minute: number;
  /** Optional free-text annotation written by the scout. */
  note?: string;
}

// =============================================================================
// SESSION PHASES
// =============================================================================

/**
 * A single phase (step) within an ObservationSession.
 * Each mode populates different optional phase fields.
 */
export interface SessionPhase {
  /** 0-based index of this phase within the session. */
  index: number;
  /**
   * The match minute or step number this phase represents.
   * For non-match sessions this is a sequential step counter.
   */
  minute: number;
  /** Narrative description of what is happening in this phase. */
  description: string;

  // --- Full Observation fields ---
  /** Observable player moments in this phase (fullObservation mode). */
  moments: PlayerMoment[];

  // --- Investigation fields ---
  /** Dialogue nodes to process in this phase (investigation mode). */
  dialogueNodes?: DialogueNode[];

  // --- Analysis fields ---
  /** Data points presented in this phase (analysis mode). */
  dataPoints?: DataPoint[];

  // --- Quick Interaction fields ---
  /** Strategic choices presented in this phase (quickInteraction mode). */
  choices?: StrategicChoice[];

  // --- Shared optional fields ---
  /** An atmosphere event that fires at the start of this phase. */
  atmosphereEvent?: AtmosphereEvent;
  /**
   * True when this phase represents a half-time break in a match session.
   * Focus tokens refresh when this is true.
   */
  isHalfTime?: boolean;
}

// =============================================================================
// SESSION PLAYER
// =============================================================================

/**
 * A player who is visible and trackable within a session.
 * The full PlayerProfile lives in GameState; this is a lightweight session view.
 */
export interface SessionPlayer {
  /** Reference to the PlayerProfile id in GameState. */
  playerId: string;
  /** Display name for the session UI. */
  name: string;
  /** Playing position (e.g. "CAM", "CB"). */
  position: string;
  /** Whether the scout currently has a focus token allocated to this player. */
  isFocused: boolean;
  /** Phase indices (0-based) during which the scout focused on this player. */
  focusedPhases: number[];
  /** The lens currently active for this player, if focused. */
  currentLens?: LensType;
}

// =============================================================================
// CORE SESSION TYPE
// =============================================================================

/**
 * The primary state machine for an interactive observation session.
 * Created by the session factory, mutated by player actions, and resolved
 * into a SessionResult when state reaches 'complete'.
 */
export interface ObservationSession {
  /** Unique session identifier (UUID). */
  id: string;
  /**
   * Scheduled activity instance key that spawned this session.
   * Uses calendar `instanceId` where available, with a deterministic fallback.
   */
  activityInstanceId?: string;
  /** The interactive mode for this session. */
  mode: ObservationMode;
  /** The activity type that spawned this session. */
  activityType: ActivityType;
  /** Scout specialization active for this session. */
  specialization: Specialization;
  /** Current state machine state. */
  state: SessionState;
  /** All phases in this session, in order. */
  phases: SessionPhase[];
  /** Index of the phase currently being processed (0-based). */
  currentPhaseIndex: number;
  /** Focus token budget and allocation tracking. */
  focusTokens: FocusTokenState;
  /** Moments the scout has explicitly flagged during the session. */
  flaggedMoments: SessionFlaggedMoment[];
  /** Active hypotheses the scout is investigating. */
  hypotheses: Hypothesis[];
  /** Insight points accumulated during this session. */
  insightPointsEarned: number;
  /** Reflection notes written by the scout (populated in 'reflection' state). */
  reflectionNotes: string[];
  /** Environmental/atmospheric context for this session. */
  venueAtmosphere?: VenueAtmosphere;
  /** All players visible in this session. */
  players: SessionPlayer[];
  /** Game week this session started. */
  startedAtWeek: number;
  /** Season this session started. */
  startedAtSeason: number;
}

// =============================================================================
// SESSION CONFIG & RESULT
// =============================================================================

/**
 * Input configuration for creating a new ObservationSession.
 * Passed to the session factory function.
 */
export interface SessionConfig {
  /** The scheduled activity type determining mode and phase count. */
  activityType: ActivityType;
  /** Scheduled activity instance key (calendar instanceId or deterministic fallback). */
  activityInstanceId?: string;
  /** The scout's active specialization for this session. */
  specialization: Specialization;
  /** Venue type string for atmosphere generation. Defaults to activityType. */
  venueType?: string;
  /** If set, this session is a follow-up focused on a specific player. */
  targetPlayerId?: string;
  /** The pool of players available to observe in this session. */
  playerPool: { playerId: string; name: string; position: string }[];
  /** RNG seed for deterministic session generation. */
  seed: string;
  /** Current game week. */
  week: number;
  /** Current season. */
  season: number;
}

/**
 * The resolved output of a completed ObservationSession.
 * Consumed by the report generation and attribute update pipeline.
 */
export interface SessionResult {
  /** ID of the session that produced this result. */
  sessionId: string;
  /** Scheduled activity instance key resolved for this session, if supplied. */
  activityInstanceId?: string;
  /** The mode the session ran in. */
  mode: ObservationMode;
  /** The activity type that was completed. */
  activityType: ActivityType;
  /** All moments the scout flagged during the session. */
  flaggedMoments: SessionFlaggedMoment[];
  /** Hypotheses that were updated during this session. */
  hypothesesUpdated: Hypothesis[];
  /** Total insight points earned. */
  insightPointsEarned: number;
  /** Reflection notes written during the reflection phase. */
  reflectionNotes: string[];
  /** Quality tier label from the activity quality system (e.g. "elite", "good"). */
  qualityTier: string;
  /** Number of phases the scout completed before ending the session. */
  phasesCompleted: number;
  /** Total number of phases in the session. */
  totalPhases: number;
  /** IDs of players that received at least one focus token during the session. */
  focusedPlayerIds: string[];
}

// =============================================================================
// ACTIVITY → MODE MAP
// =============================================================================

/**
 * Maps every interactive ActivityType to its ObservationMode.
 * Non-interactive activities (rest, travel, study, writeReport, etc.) are
 * deliberately excluded — they are handled by the background processing pipeline.
 */
export const ACTIVITY_MODE_MAP: Record<string, ObservationMode> = {
  // --- Full Observation ---
  schoolMatch: "fullObservation",
  grassrootsTournament: "fullObservation",
  streetFootball: "fullObservation",
  academyTrialDay: "fullObservation",
  youthFestival: "fullObservation",
  attendMatch: "fullObservation",
  reserveMatch: "fullObservation",
  trainingVisit: "fullObservation",
  trialMatch: "fullObservation",
  scoutingMission: "fullObservation",

  // --- Investigation ---
  followUpSession: "investigation",
  parentCoachMeeting: "investigation",
  contractNegotiation: "investigation",
  networkMeeting: "investigation",

  // --- Analysis ---
  databaseQuery: "analysis",
  watchVideo: "analysis",
  deepVideoAnalysis: "analysis",
  algorithmCalibration: "analysis",
  marketInefficiency: "analysis",
  oppositionAnalysis: "analysis",

  // --- Quick Interaction ---
  statsBriefing: "quickInteraction",
  dataConference: "quickInteraction",
  assignTerritory: "quickInteraction",
  analyticsTeamMeeting: "quickInteraction",
} satisfies Partial<Record<ActivityType, ObservationMode>>;

// =============================================================================
// PHASE COUNT RANGES
// =============================================================================

/**
 * Maps each interactive activity/venue type to a [minPhases, maxPhases] tuple.
 * The session factory picks a random count within this range using the session seed.
 */
export const VENUE_PHASE_RANGES: Record<string, [number, number]> = {
  // Youth / Full Observation
  schoolMatch: [8, 12],
  grassrootsTournament: [10, 14],
  streetFootball: [6, 8],
  academyTrialDay: [8, 10],
  youthFestival: [10, 14],

  // Investigation
  followUpSession: [4, 6],
  parentCoachMeeting: [3, 5],

  // First-team / Full Observation
  attendMatch: [12, 18],
  reserveMatch: [8, 12],
  trainingVisit: [6, 8],
  trialMatch: [8, 12],
  scoutingMission: [10, 14],

  // Investigation (first-team)
  contractNegotiation: [4, 8],
  networkMeeting: [3, 5],

  // Analysis
  databaseQuery: [3, 5],
  watchVideo: [6, 8],
  deepVideoAnalysis: [8, 10],
  algorithmCalibration: [3, 4],
  marketInefficiency: [4, 6],
  oppositionAnalysis: [4, 6],

  // Quick Interaction
  statsBriefing: [2, 3],
  dataConference: [2, 3],
  assignTerritory: [2, 3],
  analyticsTeamMeeting: [2, 3],
} satisfies Partial<Record<ActivityType, [number, number]>>;

// =============================================================================
// INTERACTIVE ACTIVITY SET
// =============================================================================

/**
 * The set of all ActivityType values that have interactive observation sessions.
 * Use this to gate the interactive session launcher in the UI layer.
 */
export const INTERACTIVE_ACTIVITIES = new Set<ActivityType>(
  Object.keys(ACTIVITY_MODE_MAP) as ActivityType[],
);
