/** Canonical persisted game date. Week numbers are always scoped to a season. */
export interface GameDate {
  season: number;
  week: number;
}

// =============================================================================
// ATTRIBUTE SYSTEM
// =============================================================================

export type AttributeDomain =
  | "technical"
  | "physical"
  | "mental"
  | "tactical"
  | "hidden";

export type TechnicalAttribute =
  | "firstTouch"
  | "passing"
  | "dribbling"
  | "crossing"
  | "shooting"
  | "heading"
  | "tackling"
  | "finishing";

export type PhysicalAttribute =
  | "pace"
  | "strength"
  | "stamina"
  | "agility"
  | "jumping"
  | "balance";

export type MentalAttribute =
  | "composure"
  | "positioning"
  | "workRate"
  | "decisionMaking"
  | "leadership"
  | "anticipation";

export type TacticalAttribute =
  | "offTheBall"
  | "pressing"
  | "defensiveAwareness"
  | "vision"
  | "marking"
  | "teamwork";

/**
 * Hidden attributes are not directly observable during a match.
 * Scouts must infer them over many observations or via contact tips.
 */
export type HiddenAttribute =
  | "injuryProneness"
  | "consistency"
  | "bigGameTemperament"
  | "professionalism";

export type PlayerAttribute =
  | TechnicalAttribute
  | PhysicalAttribute
  | MentalAttribute
  | TacticalAttribute
  | HiddenAttribute;

/**
 * Maps every PlayerAttribute to its AttributeDomain.
 * Used by the perception engine to determine which scout skill applies
 * when generating an observation reading.
 */
export const ATTRIBUTE_DOMAINS: Record<PlayerAttribute, AttributeDomain> = {
  firstTouch: "technical",
  passing: "technical",
  dribbling: "technical",
  crossing: "technical",
  shooting: "technical",
  heading: "technical",
  tackling: "technical",
  finishing: "technical",
  pace: "physical",
  strength: "physical",
  stamina: "physical",
  agility: "physical",
  jumping: "physical",
  balance: "physical",
  composure: "mental",
  positioning: "mental",
  workRate: "mental",
  decisionMaking: "mental",
  leadership: "mental",
  anticipation: "mental",
  offTheBall: "tactical",
  pressing: "tactical",
  defensiveAwareness: "tactical",
  vision: "tactical",
  marking: "tactical",
  teamwork: "tactical",
  injuryProneness: "hidden",
  consistency: "hidden",
  bigGameTemperament: "hidden",
  professionalism: "hidden",
} as const;

/** Ordered list of all technical attribute keys. Useful for iteration. */
export const TECHNICAL_ATTRIBUTES: readonly TechnicalAttribute[] = [
  "firstTouch",
  "passing",
  "dribbling",
  "crossing",
  "shooting",
  "heading",
  "tackling",
  "finishing",
] as const;

export const PHYSICAL_ATTRIBUTES: readonly PhysicalAttribute[] = [
  "pace",
  "strength",
  "stamina",
  "agility",
  "jumping",
  "balance",
] as const;

export const MENTAL_ATTRIBUTES: readonly MentalAttribute[] = [
  "composure",
  "positioning",
  "workRate",
  "decisionMaking",
  "leadership",
  "anticipation",
] as const;

export const TACTICAL_ATTRIBUTES: readonly TacticalAttribute[] = [
  "offTheBall",
  "pressing",
  "defensiveAwareness",
  "vision",
  "marking",
  "teamwork",
] as const;

export const HIDDEN_ATTRIBUTES: readonly HiddenAttribute[] = [
  "injuryProneness",
  "consistency",
  "bigGameTemperament",
  "professionalism",
] as const;

export const ALL_ATTRIBUTES: readonly PlayerAttribute[] = [
  ...TECHNICAL_ATTRIBUTES,
  ...PHYSICAL_ATTRIBUTES,
  ...MENTAL_ATTRIBUTES,
  ...TACTICAL_ATTRIBUTES,
  ...HIDDEN_ATTRIBUTES,
] as const;

// =============================================================================
// PERSONALITY TRAITS
// =============================================================================

/**
 * Personality traits describe the behavioural and psychological makeup of a
 * player. Each player has 2–4 true traits (hidden) and a separate set of
 * traits that have been revealed through scouting observations.
 *
 * Traits influence report quality but are never directly visible as numeric
 * attributes — they are qualitative descriptors discovered over time.
 */
export type PersonalityTrait =
  | "ambitious"
  | "loyal"
  | "professional"
  | "temperamental"
  | "determined"
  | "easygoing"
  | "leader"
  | "introvert"
  | "flair"
  | "controversialCharacter"
  | "modelCitizen"
  | "pressurePlayer"
  | "bigGamePlayer"
  | "inconsistent"
  | "injuryProne"
  | "lateDeveloper";

// =============================================================================
// PLAYER ROLES & BEHAVIORAL TRAITS
// =============================================================================

/**
 * Tactical roles define how a player behaves within a formation.
 * Each position has 2-4 compatible roles.
 */
export type PlayerRole =
  | "shotStopper"
  | "sweeper"
  | "ballPlayingDefender"
  | "noNonsenseCB"
  | "libero"
  | "fullBack"
  | "wingBack"
  | "invertedFullBack"
  | "anchorMan"
  | "halfBack"
  | "deepLyingPlaymaker"
  | "boxToBox"
  | "mezzala"
  | "advancedPlaymaker"
  | "carrilero"
  | "enganche"
  | "shadowStriker"
  | "trequartista"
  | "winger"
  | "invertedWinger"
  | "insideForward"
  | "poacher"
  | "targetMan"
  | "advancedForward"
  | "pressingForward";

export type RoleDuty = "defend" | "support" | "attack";

/**
 * Behavioral traits describe what a player does on the pitch.
 * Distinct from personality traits (who they are off the pitch).
 * Discovered through match observations.
 */
export type PlayerTrait =
  | "placesShots"
  | "triesTricks"
  | "cutsInside"
  | "runsWithBall"
  | "movesIntoChannels"
  | "shootsFromDistance"
  | "triesKillerBalls"
  | "staysBack"
  | "divesStraightIn"
  | "marksPlayerTightly"
  | "dictatesTempo"
  | "playsShortPasses"
  | "switchesPlayToFlank"
  | "playsOneTwo"
  | "holdsUpBall"
  | "bringsOthersIntoPlay"
  | "arrivesLateInBox"
  | "playsWithBackToGoal"
  | "driftsWide"
  | "dropsDeep";

// =============================================================================
// TACTICAL STYLE
// =============================================================================

/**
 * High-level tactical identity for a club. Drives tactical fit scoring
 * and determines which player attributes are most valued.
 */
export type TacticalIdentity =
  | "possessionBased"
  | "highPress"
  | "counterAttacking"
  | "directPlay"
  | "balanced"
  | "wingPlay";

export type MatchEventType =
  | "goal"
  | "assist"
  | "shot"
  | "pass"
  | "dribble"
  | "tackle"
  | "header"
  | "save"
  | "foul"
  | "cross"
  | "sprint"
  | "positioning"
  | "error"
  | "leadership"
  | "aerialDuel"
  | "interception"
  | "throughBall"
  | "holdUp"
  | "injury"
  | "substitution"
  | "card";

/**
 * A club's tactical style, describing how they play.
 * Generated from scouting philosophy and club reputation.
 */
export interface TacticalStyle {
  defensiveLine: number;
  pressingIntensity: number;
  tempo: number;
  width: number;
  directness: number;
  tacticalIdentity: TacticalIdentity;
  eventDistribution?: Partial<Record<MatchEventType, number>>;
  strengthAgainst?: TacticalIdentity[];
  weakAgainst?: TacticalIdentity[];
}

// =============================================================================
// PLAYER
// =============================================================================

export type Position =
  | "GK"
  | "CB"
  | "LB"
  | "RB"
  | "CDM"
  | "CM"
  | "CAM"
  | "LW"
  | "RW"
  | "ST";

export const ALL_POSITIONS: readonly Position[] = [
  "GK",
  "CB",
  "LB",
  "RB",
  "CDM",
  "CM",
  "CAM",
  "LW",
  "RW",
  "ST",
] as const;

export type Foot = "left" | "right" | "both";

export type DevelopmentProfile =
  | "earlyBloomer"
  | "lateBloomer"
  | "steadyGrower"
  | "volatile";

export type WonderkidTier =
  | "generational"
  | "worldClass"
  | "qualityPro"
  | "journeyman";

export interface Player {
  id: string;
  firstName: string;
  lastName: string;
  age: number;
  dateOfBirth: { day: number; month: number; year: number };
  nationality: string;
  position: Position;
  secondaryPositions: Position[];
  preferredFoot: Foot;
  clubId: string;
  contractClubId?: string;
  contractExpiry: number;
  wage: number;
  marketValue: number;
  attributes: Record<PlayerAttribute, number>;
  currentAbility: number;
  potentialAbility: number;
  developmentProfile: DevelopmentProfile;
  wonderkidTier: WonderkidTier;
  form: number;
  formMomentum?: number;
  formTrend?: "rising" | "stable" | "falling";
  formLockWeeks?: number;
  morale: number;
  injured: boolean;
  injuryWeeksRemaining: number;
  retirementOutlook?: {
    status: "settled" | "considering" | "ready";
    reasons: string[];
    updatedSeason: number;
  };
  currentInjury?: Injury;
  injuryHistory?: InjuryHistory;
  personalityTraits: PersonalityTrait[];
  personalityRevealed: PersonalityTrait[];
  naturalRole?: PlayerRole;
  secondaryRole?: PlayerRole;
  playerTraits: PlayerTrait[];
  playerTraitsRevealed: PlayerTrait[];
  recentMatchRatings: MatchFormEntry[];
  seasonRatings: SeasonRatingRecord[];
  developmentHistory?: import("../../world/developmentEnvironment").PlayerDevelopmentHistoryEntry[];
  personalityProfile?: PersonalityProfile;
  disciplinaryRecord?: DisciplinaryRecord;
  loanParentClubId?: string;
  loanEndWeek?: number;
  loanEndSeason?: number;
  onLoan?: boolean;
}

// =============================================================================
// MATCH RATING SYSTEM
// =============================================================================

export interface PlayerMatchRating {
  playerId: string;
  fixtureId: string;
  started?: boolean;
  minutesPlayed?: number;
  rating: number;
  eventCount: number;
  stats: MatchPlayerStats;
  source: "attended" | "simulated";
}

export interface MatchPlayerStats {
  goals?: number;
  assists?: number;
  shots?: number;
  keyPasses?: number;
  crosses?: number;
  dribbles?: number;
  tackles?: number;
  interceptions?: number;
  aerialDuelsWon?: number;
  saves?: number;
  goalsConceded?: number;
  cleanSheet?: boolean;
  errors?: number;
  avgEventQuality?: number;
}

export interface MatchFormEntry {
  fixtureId: string;
  week: number;
  season: number;
  rating: number;
}

export interface SeasonRatingRecord {
  season: number;
  avgRating: number;
  appearances: number;
  goals: number;
  assists: number;
  cleanSheets: number;
}

// =============================================================================
// UTILITY TYPES
// =============================================================================

/**
 * Partial map of attribute changes. undefined means "no change" for that key.
 * Used in development tick results and attribute delta calculations.
 */
export type AttributeDeltas = Partial<Record<PlayerAttribute, number>>;

// =============================================================================
// PERSONALITY PROFILE SYSTEM (F9)
// =============================================================================

export type PersonalityArchetype =
  | "leader"
  | "mercenary"
  | "homesick"
  | "ambitious"
  | "loyal"
  | "disruptive"
  | "introvert"
  | "professional"
  | "hothead"
  | "clutch";

export interface PersonalityProfile {
  archetype: PersonalityArchetype;
  traits: PersonalityTrait[];
  transferWillingness: number;
  dressingRoomImpact: number;
  formVolatility: number;
  bigMatchModifier: number;
  hiddenUntilRevealed: boolean;
  revealedTraits: PersonalityTrait[];
}

// =============================================================================
// INJURY SYSTEM
// =============================================================================

export type InjuryType =
  | "muscle"
  | "ligament"
  | "fracture"
  | "concussion"
  | "knock"
  | "fatigue";

export type InjurySeverity =
  | "minor"
  | "moderate"
  | "serious"
  | "career-threatening";

export interface Injury {
  id: string;
  playerId: string;
  type: InjuryType;
  severity: InjurySeverity;
  recoveryWeeks: number;
  weeksRemaining: number;
  occurredInMatch?: string;
  minute?: number;
  reinjuryRisk: number;
  occurredWeek: number;
  occurredSeason: number;
}

export interface InjuryHistory {
  playerId: string;
  injuries: Injury[];
  totalWeeksMissed: number;
  injuryProneness: number;
  reinjuryWindowWeeksLeft: number;
}

// =============================================================================
// DISCIPLINE / CARD SYSTEM
// =============================================================================

export type CardReason =
  | "recklessTackle"
  | "professionalFoul"
  | "dissent"
  | "timewasting"
  | "handball"
  | "violentConduct";

export interface CardEvent {
  type: "yellow" | "red";
  playerId: string;
  fixtureId: string;
  minute: number;
  reason: CardReason;
}

export interface DisciplinaryRecord {
  playerId: string;
  season: number;
  yellowCards: number;
  redCards: number;
  suspensionWeeksRemaining: number;
  cardHistory: CardEvent[];
}
