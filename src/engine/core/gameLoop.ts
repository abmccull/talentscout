/**
 * Game Loop — the central weekly tick processor for TalentScout.
 *
 * Design philosophy:
 *  - Pure functions: every function takes state + RNG in, returns new state out.
 *  - No side effects: no I/O, no timers, no external calls.
 *  - Deterministic: given the same seed and same inputs, the same world unfolds.
 *  - Composable: each sub-system (fixtures, development, transfers, injuries) is
 *    an independent function that can be tested in isolation.
 *
 * The main entry points are:
 *   processWeeklyTick(state, rng) → TickResult
 *   advanceWeek(state, tickResult) → GameState
 */

import type { RNG } from "../rng/index";
import type {
  GameState,
  Fixture,
  Player,
  Club,
  InboxMessage,
  PlayerAttribute,
  PhysicalAttribute,
  AttributeDeltas,
  StandingEntry,
  Weather,
  DevelopmentProfile,
  NPCScout,
  NPCScoutReport,
  BoardDirective,
  UnsignedYouth,
  AlumniMilestone,
  AlumniRecord,
  GutFeeling,
  Position,
  PlayerMatchRating,
  Injury,
  InjuryHistory,
  InjuryType,
  InjurySeverity,
  RegionalKnowledge,
  CulturalInsight,
  Contact,
  BoardSatisfactionDelta,
} from "./types";
import { ALL_ATTRIBUTES } from "./types";
import { getDifficultyModifiers } from "./difficulty";
import {
  processNPCScoutingWeek,
  restNPCScout,
  evaluateBoardDirectives,
} from "../career/index";
import {
  processYouthAging,
  processPlayerRetirement,
} from "../youth/generation";
import { processAlumniWeek, generateAlumniSeasonSummary } from "../youth/alumni";
import { generateSeasonEvents, getActiveSeasonEvents } from "./seasonEvents";
import { applySeasonEventEffects } from "./seasonEventEffects";
import {
  generateSimulatedMatchRatings,
  computeFormFromRatings,
} from "../match/ratings";
import { processRegionalKnowledgeGrowth } from "../specializations/regionalKnowledge";
import {
  decrementSuspensions,
  clearSeasonCards,
  processCardAccumulation,
} from "../match/discipline";
import { processActiveNegotiations } from "../firstTeam/negotiation";
import { processBoardWeekly } from "../firstTeam/boardAI";
import { processWeeklyGossip } from "../network/gossip";
import { processWeeklyReferrals } from "../network/referrals";
import { processWeeklyContactDecay, processExclusiveWindows } from "../network/contacts";
import type { CardEvent, DisciplinaryRecord, TransferNegotiation, BoardReaction, BoardProfile, TacticalMatchup } from "./types";
import { calculateTacticalMatchup } from "../match/tactics";

// =============================================================================
// PUBLIC RESULT TYPES
// =============================================================================

export interface Transfer {
  playerId: string;
  fromClubId: string;
  toClubId: string;
  fee: number;
  week: number;
  season: number;
}

export interface PlayerDevelopmentResult {
  playerId: string;
  changes: AttributeDeltas;
  abilityChange: number; // change to currentAbility
}

export interface InjuryResult {
  playerId: string;
  weeksOut: number;
  /** Rich injury object with type, severity, and history data. */
  injury: Injury;
}

export interface BreakthroughResult {
  playerId: string;
  changes: AttributeDeltas;
  abilityChange: number;
  /** The attribute names that improved, used for the notification message. */
  improvedAttributes: PlayerAttribute[];
}

export interface InjurySetbackResult {
  playerId: string;
  changes: AttributeDeltas;
}

export interface SimulatedFixture extends Fixture {
  played: true;
  homeGoals: number;
  awayGoals: number;
  attendance: number;
  weather: Weather;
  /** Goal scorers for this fixture — used for rating generation. */
  scorers?: Array<{ playerId: string; minute: number }>;
  /** Per-player match ratings generated for this fixture. */
  playerRatings?: Record<string, import("./types").PlayerMatchRating>;
}

/**
 * Updated state for one NPC scout after a week of processing.
 * Carries the mutated scout object alongside any reports it generated.
 */
export interface NPCScoutWeekResult {
  npcScoutId: string;
  updatedNPCScout: NPCScout;
  reportsGenerated: NPCScoutReport[];
}

/**
 * Result from evaluating board directives at end-of-season.
 * Absent when the season has not ended or the scout is not tier 5.
 */
export interface BoardDirectiveEvaluationResult {
  completed: BoardDirective[];
  failed: BoardDirective[];
  reputationChange: number;
}

/**
 * The full result of processing one week's tick.
 * Contains all changes that occurred during the week as data — none of these
 * are applied to state yet. Call advanceWeek() to produce the new GameState.
 */
export interface TickResult {
  fixturesPlayed: SimulatedFixture[];
  standingsUpdated: boolean;
  playerDevelopment: PlayerDevelopmentResult[];
  /** Rare breakthrough events for young in-form players. */
  breakthroughs: BreakthroughResult[];
  transfers: Transfer[];
  injuries: InjuryResult[];
  newMessages: InboxMessage[];
  reputationChange: number;
  /** Physical attribute setbacks for players recovering from serious injuries. */
  injurySetbacks: InjurySetbackResult[];
  /** Whether end-of-season processing was triggered this tick. */
  endOfSeasonTriggered: boolean;
  /** Per-NPC-scout results: updated scouts and any new reports (tier 4+). */
  npcScoutResults: NPCScoutWeekResult[];
  /** Board directive evaluation result, set only at season-end for tier 5. */
  boardDirectiveResult?: BoardDirectiveEvaluationResult;
  /** Form momentum updates for all players this week. */
  formMomentumUpdates: FormMomentumUpdate[];
  /** Itemised reputation changes this week with human-readable reasons (A4). */
  satisfactionDeltas: BoardSatisfactionDelta[];
  /** Youth aging results: auto-signed, retired, updated pool. */
  youthAgingResult?: {
    autoSigned: Array<{ youthId: string; clubId: string }>;
    retired: string[];
    updatedUnsignedYouth: Record<string, UnsignedYouth>;
  };
  /** Player retirements this tick. */
  playerRetirements?: {
    retiredPlayerIds: string[];
    updatedClubs: Record<string, Club>;
  };
  /** Newly generated unsigned youth this tick. */
  newUnsignedYouth?: UnsignedYouth[];
  /** New academy intake players this tick. */
  newAcademyIntake?: Player[];
  /** Alumni milestones triggered this tick. */
  alumniMilestones?: AlumniMilestone[];
  /** Updated alumni records after processing this week. */
  alumniRecords?: AlumniRecord[];
  /** Gut feelings triggered this tick. */
  gutFeelings?: GutFeeling[];
  /** Regional knowledge growth results (F13). */
  regionalKnowledgeResult?: {
    regionalKnowledge: Record<string, RegionalKnowledge>;
    newDiscoveries: Array<{ countryId: string; leagueId: string; leagueName: string }>;
    newInsights: Array<{ countryId: string; insight: CulturalInsight }>;
    newContacts: Array<{ countryId: string; contactId: string }>;
  };
  /** Season event effects applied this tick (state changes from active events). */
  seasonEventState?: GameState;
  /**
   * Achievement IDs whose conditions are satisfied as of this tick's state.
   * Populated by the store layer after advanceWeek() produces the new GameState,
   * since achievement definitions live outside the engine module.
   */
  satisfiedAchievementIds?: string[];
  /** Card events generated from simulated fixtures this tick. */
  cardEvents?: CardEvent[];
  /** Updated disciplinary records after processing cards. */
  updatedDisciplinaryRecords?: Record<string, DisciplinaryRecord>;
  /** Suspension notifications generated this tick. */
  suspensionNotifications?: Array<{ playerId: string; weeks: number; reason: string }>;
  /** Alumni contact promotions — alumni who graduated to the contact network (F12). */
  alumniContactPromotions?: Array<{ alumniId: string; contact: Contact }>;
  /** Updated active negotiations after weekly processing (F4). */
  updatedNegotiations?: TransferNegotiation[];
  /** Updated contacts after F3 contact network depth processing. */
  updatedContacts?: Record<string, Contact>;
  /** Board AI reaction result (F10, tier 5 weekly). */
  boardReactions?: BoardReaction[];
  /** Updated board profile after weekly evaluation (F10). */
  updatedBoardProfile?: BoardProfile;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Minimum season length in weeks. Actual season length is determined
 * dynamically from the maximum fixture week across all leagues.
 */
const MIN_SEASON_LENGTH_WEEKS = 38;

/**
 * Fatigue recovered per week from natural rest (no rest activity).
 * Rest activities grant an additional bonus on top.
 */
const BASE_WEEKLY_FATIGUE_RECOVERY = 10;

/** Maximum fatigue. At 100 the scout is completely burned out. */
const MAX_FATIGUE = 100;

/** Probability that any fit player gets injured in a given week. */
const BASE_INJURY_PROBABILITY = 0.02;

/** Baseline probability of an AI club completing a transfer in any week. */
const AI_TRANSFER_PROBABILITY = 0.04;

/** Weekly probability of a breakthrough event for an eligible young player. */
const BREAKTHROUGH_CHANCE = 0.015;

/** Minimum club reputation to grant the coaching environment bonus. */
const HIGH_REPUTATION_THRESHOLD = 70;

/** Development chance multiplier for players at high-reputation clubs. */
const COACHING_BONUS_MULTIPLIER = 1.15;

/** Minimum injury duration (weeks) to trigger a physical setback on recovery. */
const SERIOUS_INJURY_THRESHOLD = 4;

// =============================================================================
// INTERNAL HELPERS
// =============================================================================

/**
 * Generate a new unique ID string (not cryptographically secure — used for
 * game entity IDs only where determinism matters more than security).
 */
function generateId(prefix: string, rng: RNG): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "";
  for (let i = 0; i < 12; i++) {
    id += chars[rng.nextInt(0, chars.length - 1)];
  }
  return `${prefix}_${id}`;
}

/**
 * Clamp a number to [min, max] inclusive.
 */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

// =============================================================================
// FIXTURE SIMULATION
// =============================================================================

/**
 * Compute the average current ability of a club's squad.
 * Returns 100 (an average pro) if the club has no players on record.
 */
function clubAverageAbility(
  club: Club,
  players: Record<string, Player>,
  disciplinaryRecords: Record<string, DisciplinaryRecord> = {},
): number {
  if (club.playerIds.length === 0) return 100;

  let found = 0;
  const total = club.playerIds.reduce((sum, pid) => {
    const p = players[pid];
    if (!p) return sum;
    // Exclude suspended players from the ability calculation
    const record = disciplinaryRecords[pid];
    if (record && record.suspensionWeeksRemaining > 0) return sum;
    // Exclude injured players
    if (p.injured) return sum;
    found++;
    return sum + p.currentAbility;
  }, 0);

  return found > 0 ? total / found : 100;
}

/**
 * Pick a weather condition for a fixture, weighted toward typical conditions.
 */
function pickWeather(rng: RNG): Weather {
  return rng.pickWeighted<Weather>([
    { item: "clear", weight: 35 },
    { item: "cloudy", weight: 30 },
    { item: "rain", weight: 15 },
    { item: "heavyRain", weight: 8 },
    { item: "windy", weight: 8 },
    { item: "snow", weight: 4 },
  ]);
}

/**
 * Apply a weather modifier to a team's effective ability.
 * Heavy conditions tend to reduce quality and close the gap between teams.
 */
function weatherAbilityModifier(weather: Weather): number {
  const modifiers: Record<Weather, number> = {
    clear: 1.0,
    cloudy: 0.98,
    rain: 0.92,
    heavyRain: 0.85,
    snow: 0.80,
    windy: 0.90,
  };
  return modifiers[weather];
}

/**
 * Generate an attendance figure for a fixture.
 * Better clubs and home advantage boost attendance.
 */
function generateAttendance(
  homeClub: Club,
  rng: RNG,
): number {
  // Base attendance scales with club reputation
  const base = homeClub.reputation * 400; // rep 50 → ~20 000
  const variance = rng.gaussian(0, base * 0.1);
  return Math.round(clamp(base + variance, 500, 90000));
}

/**
 * Pick goal scorers for a simulated fixture, weighted by attacking attributes.
 */
function pickScorers(
  rng: RNG,
  homePlayers: Player[],
  homeGoals: number,
  awayPlayers: Player[],
  awayGoals: number,
): Array<{ playerId: string; minute: number }> {
  const ATTACKING: Set<Position> = new Set(["ST", "LW", "RW", "CAM"]);

  const pickForTeam = (players: Player[], goals: number) => {
    if (players.length === 0 || goals === 0) return [];
    const weighted = players.map((p) => ({
      item: p.id,
      weight: Math.max(
        1,
        (p.attributes.shooting ?? 10) * 0.4
          + (p.attributes.finishing ?? 10) * 0.6
          + (ATTACKING.has(p.position) ? 3 : 0),
      ),
    }));
    const usedMinutes = new Set<number>();
    return Array.from({ length: goals }, () => {
      const playerId = rng.pickWeighted(weighted);
      let minute: number;
      do { minute = rng.nextInt(1, 90); } while (usedMinutes.has(minute));
      usedMinutes.add(minute);
      return { playerId, minute };
    }).sort((a, b) => a.minute - b.minute);
  };

  return [
    ...pickForTeam(homePlayers, homeGoals),
    ...pickForTeam(awayPlayers, awayGoals),
  ];
}

/**
 * Simulate a single fixture and return the updated fixture with scores.
 *
 * Model: Elo-style expected goals based on ability differential, with
 * Poisson-inspired goal distribution via Gaussian approximation and
 * home advantage.
 */
function simulateFixture(
  fixture: Fixture,
  clubs: Record<string, Club>,
  players: Record<string, Player>,
  rng: RNG,
  disciplinaryRecords: Record<string, DisciplinaryRecord> = {},
): SimulatedFixture {
  const homeClub = clubs[fixture.homeClubId];
  const awayClub = clubs[fixture.awayClubId];

  const weather = pickWeather(rng);
  const weatherMod = weatherAbilityModifier(weather);

  const homeAbility = homeClub
    ? clubAverageAbility(homeClub, players, disciplinaryRecords) * weatherMod
    : 100;
  const awayAbility = awayClub
    ? clubAverageAbility(awayClub, players, disciplinaryRecords) * weatherMod
    : 100;

  // Calculate tactical matchup between the two clubs' styles
  let tacticalMatchup: TacticalMatchup | undefined;
  if (homeClub?.tacticalStyle && awayClub?.tacticalStyle) {
    tacticalMatchup = calculateTacticalMatchup(
      homeClub.tacticalStyle,
      awayClub.tacticalStyle,
    );
  }

  // Home advantage: ~0.3 expected goals bonus
  const homeAdvantage = 0.3;

  // Apply tactical matchup modifiers to expected goals
  // A positive modifier (tactical advantage) increases expected goals slightly
  const homeTacticalMod = tacticalMatchup ? 1 + tacticalMatchup.homeModifier * 0.5 : 1;
  const awayTacticalMod = tacticalMatchup ? 1 + tacticalMatchup.awayModifier * 0.5 : 1;

  // Expected goals: ratio-based, tuned so roughly 2.6 goals per game on average
  const totalAbility = homeAbility + awayAbility;
  const homeExpected = (homeAbility / totalAbility) * 2.6 * homeTacticalMod + homeAdvantage;
  const awayExpected = (awayAbility / totalAbility) * 2.6 * awayTacticalMod;

  // Simulate goals: Gaussian approximation of Poisson, floored at 0
  const homeGoals = Math.max(
    0,
    Math.round(rng.gaussian(homeExpected, Math.sqrt(homeExpected))),
  );
  const awayGoals = Math.max(
    0,
    Math.round(rng.gaussian(awayExpected, Math.sqrt(awayExpected))),
  );

  const attendance = homeClub
    ? generateAttendance(homeClub, rng)
    : rng.nextInt(5000, 30000);

  // Pick scorers for rating generation — exclude injured players
  const homePlayers = homeClub
    ? homeClub.playerIds.map((id) => players[id]).filter((p): p is Player => !!p && !p.injured)
    : [];
  const awayPlayers = awayClub
    ? awayClub.playerIds.map((id) => players[id]).filter((p): p is Player => !!p && !p.injured)
    : [];
  const scorers = pickScorers(rng, homePlayers, homeGoals, awayPlayers, awayGoals);

  // Generate simulated match ratings for all players in both squads
  let playerRatings: Record<string, PlayerMatchRating> | undefined;
  if (homePlayers.length > 0 || awayPlayers.length > 0) {
    playerRatings = generateSimulatedMatchRatings(
      rng, homePlayers, awayPlayers, homeGoals, awayGoals, scorers, fixture.id,
    );
  }

  return {
    ...fixture,
    played: true,
    homeGoals,
    awayGoals,
    attendance,
    weather,
    scorers,
    playerRatings,
  };
}

/**
 * Simulate all unplayed fixtures for the current week across all leagues.
 */
function simulateWeekFixtures(
  state: GameState,
  rng: RNG,
  disciplinaryRecords?: Record<string, DisciplinaryRecord>,
): SimulatedFixture[] {
  const results: SimulatedFixture[] = [];
  const records = disciplinaryRecords ?? state.disciplinaryRecords ?? {};

  for (const fixture of Object.values(state.fixtures)) {
    if (fixture.week === state.currentWeek && !fixture.played) {
      results.push(
        simulateFixture(fixture, state.clubs, state.players, rng, records),
      );
    }
  }

  return results;
}

// =============================================================================
// STANDINGS UPDATE
// =============================================================================

/**
 * Build a standings map from all played fixtures in a league.
 * Returns a record keyed by clubId.
 */
export function buildStandings(
  leagueId: string,
  fixtures: Record<string, Fixture>,
  clubs: Record<string, Club>,
): Record<string, StandingEntry> {
  const standings: Record<string, StandingEntry> = {};

  // Initialise an entry for every club in the league
  for (const club of Object.values(clubs)) {
    if (club.leagueId === leagueId) {
      standings[club.id] = {
        clubId: club.id,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        points: 0,
      };
    }
  }

  // Tally results from played fixtures in this league
  for (const fixture of Object.values(fixtures)) {
    if (fixture.leagueId !== leagueId || !fixture.played) continue;
    if (fixture.homeGoals === undefined || fixture.awayGoals === undefined) continue;

    const home = standings[fixture.homeClubId];
    const away = standings[fixture.awayClubId];
    if (!home || !away) continue;

    const hg = fixture.homeGoals;
    const ag = fixture.awayGoals;

    home.played += 1;
    away.played += 1;
    home.goalsFor += hg;
    home.goalsAgainst += ag;
    away.goalsFor += ag;
    away.goalsAgainst += hg;
    home.goalDifference = home.goalsFor - home.goalsAgainst;
    away.goalDifference = away.goalsFor - away.goalsAgainst;

    if (hg > ag) {
      home.won += 1;
      home.points += 3;
      away.lost += 1;
    } else if (hg < ag) {
      away.won += 1;
      away.points += 3;
      home.lost += 1;
    } else {
      home.drawn += 1;
      home.points += 1;
      away.drawn += 1;
      away.points += 1;
    }
  }

  return standings;
}

// =============================================================================
// FORM MOMENTUM
// =============================================================================

/**
 * Compute updated form momentum for a player based on the quality of their
 * recent match events. Called once per week during the tick.
 *
 * Streak rules:
 *  - Track consecutive matches at similar quality (within 1.0 of each other).
 *  - If 4+ consecutive matches above 7.0 quality: rising trend, momentum = matches - 3.
 *  - If 4+ consecutive matches below 5.0 quality: falling trend, momentum = matches - 3.
 *  - Otherwise: stable trend, momentum decays by 1 per week toward 0.
 *
 * Form locking:
 *  - When a player transitions into a streak (momentum reaches 1+), form is
 *    "locked" for 2 extra weeks — it cannot swing in the opposite direction.
 *  - formLockWeeks decrements each week; while > 0 form is held steady.
 */
interface FormMomentumUpdate {
  playerId: string;
  formMomentum: number;
  formTrend: "rising" | "stable" | "falling";
  formLockWeeks: number;
  /** Adjusted form value (may be clamped by lock). */
  form: number;
}

function computeFormMomentum(
  player: Player,
  weekFixtures: SimulatedFixture[],
  allPlayers: Record<string, Player>,
  rng: RNG,
): FormMomentumUpdate {
  const currentMomentum = player.formMomentum ?? 0;
  const currentTrend = player.formTrend ?? "stable";
  const currentLock = player.formLockWeeks ?? 0;

  // Find if this player's club played this week and determine match quality
  const clubFixture = weekFixtures.find(
    (f) => f.homeClubId === player.clubId || f.awayClubId === player.clubId,
  );

  if (!clubFixture || player.injured) {
    // No match this week — momentum decays, lock ticks down
    const decayedMomentum = Math.max(0, currentMomentum - 1);
    const decayedLock = Math.max(0, currentLock - 1);
    const trend: "rising" | "stable" | "falling" =
      decayedMomentum === 0 ? "stable" : currentTrend;

    return {
      playerId: player.id,
      formMomentum: decayedMomentum,
      formTrend: trend,
      formLockWeeks: decayedLock,
      form: player.form,
    };
  }

  // Simulate a match quality rating for this player (7.0 +/- noise based on CA)
  // Higher CA players tend toward higher ratings
  const baseRating = 5.0 + (player.currentAbility / 200) * 3.0;
  const matchRating = rng.gaussian(baseRating, 1.2);
  const clampedRating = Math.min(10, Math.max(1, matchRating));

  // Determine new streak state
  const isHotMatch = clampedRating >= 7.0;
  const isColdMatch = clampedRating < 5.0;

  let newMomentum: number;
  let newTrend: "rising" | "stable" | "falling";
  let newLock: number;
  let newForm: number;

  if (isHotMatch && (currentTrend === "rising" || currentTrend === "stable")) {
    // Continuing or starting a hot streak
    const consecutiveHot = currentTrend === "rising" ? currentMomentum + 3 + 1 : 1;
    if (consecutiveHot >= 4) {
      newMomentum = Math.min(10, consecutiveHot - 3);
      newTrend = "rising";
      // Lock form when first entering a streak or continuing
      newLock = newMomentum >= 1 && currentTrend !== "rising" ? 2 : Math.max(0, currentLock - 1);
      if (currentTrend !== "rising" && newMomentum >= 1) {
        // Just entered hot streak — lock for 2 weeks
        newLock = 2;
      }
    } else {
      newMomentum = 0;
      newTrend = "stable";
      newLock = Math.max(0, currentLock - 1);
    }
  } else if (isColdMatch && (currentTrend === "falling" || currentTrend === "stable")) {
    // Continuing or starting a cold streak
    const consecutiveCold = currentTrend === "falling" ? currentMomentum + 3 + 1 : 1;
    if (consecutiveCold >= 4) {
      newMomentum = Math.min(10, consecutiveCold - 3);
      newTrend = "falling";
      newLock = newMomentum >= 1 && currentTrend !== "falling" ? 2 : Math.max(0, currentLock - 1);
      if (currentTrend !== "falling" && newMomentum >= 1) {
        newLock = 2;
      }
    } else {
      newMomentum = 0;
      newTrend = "stable";
      newLock = Math.max(0, currentLock - 1);
    }
  } else {
    // Streak broken or neither hot nor cold
    if (currentLock > 0) {
      // Form is locked — resist the change, keep current trend
      newMomentum = currentMomentum;
      newTrend = currentTrend;
      newLock = currentLock - 1;
    } else {
      // No lock — reset to stable, decay momentum
      newMomentum = Math.max(0, currentMomentum - 1);
      newTrend = newMomentum > 0 ? currentTrend : "stable";
      newLock = 0;
    }
  }

  // Compute new form value
  // Base form from match rating: map [1,10] to [-3,3]
  const rawForm = ((clampedRating - 5.5) / 4.5) * 3;

  if (newLock > 0 || (currentLock > 0 && newTrend !== "stable")) {
    // Form is locked — keep it at current level (resist swings)
    newForm = player.form;
  } else {
    // Blend old form with new: weighted average for smoother transitions
    newForm = Math.round((player.form * 0.4 + rawForm * 0.6) * 10) / 10;
    newForm = Math.min(3, Math.max(-3, newForm));
  }

  void allPlayers; // reserved for future cross-team comparisons

  return {
    playerId: player.id,
    formMomentum: newMomentum,
    formTrend: newTrend,
    formLockWeeks: newLock,
    form: newForm,
  };
}

/**
 * Process form momentum updates for all players in the world.
 */
function processFormMomentum(
  state: GameState,
  weekFixtures: SimulatedFixture[],
  rng: RNG,
): FormMomentumUpdate[] {
  const results: FormMomentumUpdate[] = [];

  for (const player of Object.values(state.players)) {
    results.push(
      computeFormMomentum(player, weekFixtures, state.players, rng),
    );
  }

  return results;
}

// =============================================================================
// PLAYER DEVELOPMENT
// =============================================================================

/**
 * Get the growth multiplier for a player based on age and development profile.
 * Positive = improving, negative = declining.
 */
function developmentMultiplier(
  age: number,
  profile: DevelopmentProfile,
  rng: RNG,
): number {
  // Base growth/decline curve (peaks around age 26 for steadyGrower)
  const peakAge: Record<DevelopmentProfile, number> = {
    earlyBloomer: 22,
    lateBloomer: 29,
    steadyGrower: 26,
    volatile: 25,
  };

  const peak = peakAge[profile];
  const yearsFromPeak = age - peak;

  let base: number;
  if (yearsFromPeak < 0) {
    // Pre-peak: growing
    base = Math.max(0, Math.min(1, 1 - Math.abs(yearsFromPeak) * 0.08));
  } else {
    // Post-peak: declining
    base = -yearsFromPeak * 0.02;
  }

  // Profile-specific modifiers
  if (profile === "volatile") {
    // Volatile players have extra noise
    base += rng.gaussian(0, 0.4);
  }
  if (profile === "earlyBloomer") {
    // Faster rise AND faster fall
    base *= 1.3;
  }
  if (profile === "lateBloomer") {
    // Slower rise up to peak, then very gradual decline
    base *= age < peak ? 0.5 : 0.8;
  }

  return base;
}

/**
 * Compute attribute and ability changes for a single player for one week.
 *
 * Most weeks produce no visible change (development happens over months);
 * attribute changes accumulate gradually via small fractional nudges. We
 * store integer attributes so changes are applied probabilistically to
 * avoid floating-point drift in the persistent state.
 */
function computePlayerDevelopment(
  player: Player,
  club: Club | undefined,
  rng: RNG,
  developmentRateModifier: number = 1.0,
): PlayerDevelopmentResult {
  const baseMult = developmentMultiplier(player.age, player.developmentProfile, rng);
  // Apply difficulty development rate modifier (only to growth, not decline)
  const mult = baseMult > 0 ? baseMult * developmentRateModifier : baseMult;

  // Weekly development chance — form bonus: +3 → 20%, baseline 15%, -3 → 10%
  const formBonus = player.form * 0.017;
  let developmentChance = clamp(0.15 + formBonus, 0.05, 0.25);
  // B6: Coaching environment bonus: players at high-reputation clubs develop 15% faster.
  if (club && club.reputation > HIGH_REPUTATION_THRESHOLD) {
    developmentChance *= COACHING_BONUS_MULTIPLIER;
  }
  // B7: Form momentum modifies development chance
  const momentum = player.formMomentum ?? 0;
  const trend = player.formTrend ?? "stable";
  if (trend === "rising" && momentum > 0) {
    developmentChance += Math.min(0.15, momentum * 0.03);
  } else if (trend === "falling" && momentum > 0) {
    developmentChance -= momentum * 0.02;
  }
  developmentChance = Math.max(0.01, developmentChance); // floor at 1%
  if (!rng.chance(developmentChance)) {
    return { playerId: player.id, changes: {}, abilityChange: 0 };
  }

  const changes: AttributeDeltas = {};
  const allAttributes = Object.keys(player.attributes) as PlayerAttribute[];

  // Pick 1–3 attributes to potentially change this tick
  const shuffled = rng.shuffle(allAttributes);
  const toConsider = shuffled.slice(0, rng.nextInt(1, 3));

  for (const attr of toConsider) {
    const currentValue = player.attributes[attr];
    const delta = mult > 0 ? 1 : -1;

    // Growth: probability driven by distance from ceiling (potentialAbility/20 ≈ attr ceiling)
    // Decline: probability driven by how long past peak
    const attrCeiling = Math.round((player.potentialAbility / 200) * 20);
    const roomToGrow = attrCeiling - currentValue;

    if (mult > 0 && roomToGrow > 0) {
      // Growth probability: easier to grow when far from ceiling
      const growProb = Math.min(0.4, (roomToGrow / 20) * Math.abs(mult));
      if (rng.chance(growProb)) {
        changes[attr] = delta;
      }
    } else if (mult < 0 && currentValue > 1) {
      // Decline probability proportional to how far past peak
      const declineProb = Math.min(0.25, Math.abs(mult) * 0.5);
      if (rng.chance(declineProb)) {
        changes[attr] = delta;
      }
    }
  }

  // Current ability nudge — small change aligned with attribute trend
  const attributeChanges = Object.values(changes).reduce(
    (sum, v) => sum + (v ?? 0),
    0,
  );
  const abilityChange = attributeChanges > 0 ? 1 : attributeChanges < 0 ? -1 : 0;

  return { playerId: player.id, changes, abilityChange };
}

/**
 * Check for a rare development breakthrough for a young, in-form player.
 *
 * Eligibility:
 *  - Age 17-25
 *  - form >= +1 (player is performing well)
 *  - 1.5% weekly chance (~once per season for a player in sustained good form)
 *
 * When triggered, 2-3 random attributes gain +2-3 points each (may exceed
 * the normal ceiling), and currentAbility increases by +3-5.
 */
function computeBreakthroughDevelopment(
  player: Player,
  rng: RNG,
): BreakthroughResult | null {
  // Eligibility gates
  if (player.age < 17 || player.age > 25) return null;
  if (player.form < 1) return null;
  if (!rng.chance(BREAKTHROUGH_CHANCE)) return null;

  const changes: AttributeDeltas = {};
  const improvedAttributes: PlayerAttribute[] = [];

  // Pick 2-3 random attributes to boost
  const shuffled = rng.shuffle([...ALL_ATTRIBUTES]);
  const count = rng.nextInt(2, 3);
  const selected = shuffled.slice(0, count);

  for (const attr of selected) {
    const boost = rng.nextInt(2, 3);
    changes[attr] = boost;
    improvedAttributes.push(attr);
  }

  // Current ability boost (+3-5)
  const abilityChange = rng.nextInt(3, 5);

  return {
    playerId: player.id,
    changes,
    abilityChange,
    improvedAttributes,
  };
}

/**
 * When a player recovers from a serious injury (duration > 4 weeks),
 * reduce 1-2 physical attributes by 1 point. This creates meaningful
 * injury consequences for scouting decisions.
 */
function computeInjurySetback(
  player: Player,
  originalDuration: number,
  rng: RNG,
): InjurySetbackResult | null {
  if (originalDuration <= SERIOUS_INJURY_THRESHOLD) return null;

  const changes: AttributeDeltas = {};

  // Physical attributes most affected by serious injuries
  const physicalCandidates: PhysicalAttribute[] = ["pace", "stamina", "agility"];
  const shuffled = rng.shuffle(physicalCandidates);
  const count = rng.nextInt(1, 2);
  const selected = shuffled.slice(0, count);

  for (const attr of selected) {
    if (player.attributes[attr] > 1) {
      changes[attr] = -1;
    }
  }

  if (Object.keys(changes).length === 0) return null;

  return { playerId: player.id, changes };
}

/**
 * Generate an inbox message for a player breakthrough event.
 */
function generateBreakthroughMessage(
  player: Player,
  breakthrough: BreakthroughResult,
  state: GameState,
  rng: RNG,
): InboxMessage {
  const attrNames = breakthrough.improvedAttributes
    .map((a) => a.replace(/([A-Z])/g, " $1").toLowerCase().trim())
    .join(" and ");

  return {
    id: makeMessageId("breakthrough", rng),
    week: state.currentWeek,
    season: state.currentSeason,
    type: "news",
    title: `Development Breakthrough: ${player.firstName} ${player.lastName}`,
    body: `${player.firstName} ${player.lastName} has shown remarkable improvement! Their ${attrNames} ${breakthrough.improvedAttributes.length > 1 ? "have" : "has"} significantly improved.`,
    read: false,
    actionRequired: false,
    relatedId: player.id,
  };
}

/**
 * Process development for all players in the world.
 * Only processes young players (under 32) for performance reasons;
 * older players have stable or predictably declining attributes.
 */
function processPlayerDevelopment(
  state: GameState,
  rng: RNG,
): { development: PlayerDevelopmentResult[]; breakthroughs: BreakthroughResult[]; breakthroughMessages: InboxMessage[] } {
  const development: PlayerDevelopmentResult[] = [];
  const breakthroughs: BreakthroughResult[] = [];
  const breakthroughMessages: InboxMessage[] = [];
  const devRateMod = getDifficultyModifiers(state.difficulty).developmentRate;

  for (const player of Object.values(state.players)) {
    // Skip heavily injured players — no development during long-term injury
    if (player.injuryWeeksRemaining > 6) continue;
    // Skip players past their useful development window
    if (player.age > 35) continue;

    const club = state.clubs[player.clubId];
    const result = computePlayerDevelopment(player, club, rng, devRateMod);

    // Only include results that actually have changes
    const hasChanges =
      Object.keys(result.changes).length > 0 || result.abilityChange !== 0;

    if (hasChanges) {
      development.push(result);
    }

    // Breakthrough check — after normal development, young in-form players
    // have a rare chance to exceed their ceiling.
    const breakthrough = computeBreakthroughDevelopment(player, rng);
    if (breakthrough) {
      breakthroughs.push(breakthrough);
      breakthroughMessages.push(
        generateBreakthroughMessage(player, breakthrough, state, rng),
      );
    }
  }

  return { development, breakthroughs, breakthroughMessages };
}

// =============================================================================
// INJURIES
// =============================================================================

/** Injury type distribution weights: muscle 40%, knock 25%, ligament 15%, fatigue 10%, fracture 7%, concussion 3%. */
const INJURY_TYPE_WEIGHTS: { item: InjuryType; weight: number }[] = [
  { item: "muscle", weight: 40 },
  { item: "knock", weight: 25 },
  { item: "ligament", weight: 15 },
  { item: "fatigue", weight: 10 },
  { item: "fracture", weight: 7 },
  { item: "concussion", weight: 3 },
];

/** Recovery time ranges (weeks) per injury type: [min, max]. */
const RECOVERY_RANGES: Record<InjuryType, [number, number]> = {
  knock: [1, 2],
  muscle: [2, 6],
  fatigue: [1, 3],
  ligament: [4, 12],
  fracture: [6, 16],
  concussion: [2, 4],
};

/** Derive severity from recovery weeks. */
function deriveSeverity(recoveryWeeks: number): InjurySeverity {
  if (recoveryWeeks <= 2) return "minor";
  if (recoveryWeeks <= 5) return "moderate";
  if (recoveryWeeks <= 10) return "serious";
  return "career-threatening";
}

/**
 * Compute injury probability for a player based on their attributes,
 * injury history (proneness accumulation), and reinjury risk window.
 * Already-injured players are skipped.
 */
function computeInjuryProbability(player: Player): number {
  if (player.injured) return 0;

  const proneness = player.attributes.injuryProneness ?? 10; // 1-20
  // proneness 1 = safest (0.5x), proneness 20 = most risk (2.5x)
  const pronenessMultiplier = 0.5 + (proneness / 20) * 2;

  // Accumulated injury-proneness from history (0-1 scale)
  const historyProneness = player.injuryHistory?.injuryProneness ?? 0;
  // Each 0.1 of history proneness adds ~10% more risk
  const historyMultiplier = 1 + historyProneness;

  // Reinjury risk window: chance is doubled for 4 weeks after return
  const reinjuryWindow = player.injuryHistory?.reinjuryWindowWeeksLeft ?? 0;
  const reinjuryMultiplier = reinjuryWindow > 0 ? 2.0 : 1.0;

  return BASE_INJURY_PROBABILITY * pronenessMultiplier * historyMultiplier * reinjuryMultiplier;
}

/**
 * Pick an injury type and generate recovery duration based on type-specific ranges.
 */
function generateInjuryObject(
  rng: RNG,
  player: Player,
  state: GameState,
): Injury {
  const injuryType = rng.pickWeighted(INJURY_TYPE_WEIGHTS);
  const [minWeeks, maxWeeks] = RECOVERY_RANGES[injuryType];
  const recoveryWeeks = rng.nextInt(minWeeks, maxWeeks);
  const severity = deriveSeverity(recoveryWeeks);

  return {
    id: generateId("inj", rng),
    playerId: player.id,
    type: injuryType,
    severity,
    recoveryWeeks,
    weeksRemaining: recoveryWeeks,
    reinjuryRisk: 0, // Set when player returns
    occurredWeek: state.currentWeek,
    occurredSeason: state.currentSeason,
  };
}

/**
 * Update a player's injury history when a new injury occurs.
 * Increases injuryProneness accumulation with each injury.
 */
function addToInjuryHistory(
  player: Player,
  injury: Injury,
): InjuryHistory {
  const existing: InjuryHistory = player.injuryHistory ?? {
    playerId: player.id,
    injuries: [],
    totalWeeksMissed: 0,
    injuryProneness: 0,
    reinjuryWindowWeeksLeft: 0,
  };

  // Each injury adds 0.03 to proneness (capped at 0.5)
  const newProneness = Math.min(0.5, existing.injuryProneness + 0.03);

  return {
    ...existing,
    injuries: [...existing.injuries, injury],
    totalWeeksMissed: existing.totalWeeksMissed + injury.recoveryWeeks,
    injuryProneness: newProneness,
    // Reset reinjury window — it will activate when the injury heals
    reinjuryWindowWeeksLeft: 0,
  };
}

/**
 * Process injuries for all players this week.
 * Also decrements injuryWeeksRemaining for players already injured.
 * Returns new injuries only (not existing ones being decremented).
 */
function processInjuries(state: GameState, rng: RNG): InjuryResult[] {
  const newInjuries: InjuryResult[] = [];

  for (const player of Object.values(state.players)) {
    const prob = computeInjuryProbability(player);
    if (prob > 0 && rng.chance(prob)) {
      const injury = generateInjuryObject(rng, player, state);
      newInjuries.push({
        playerId: player.id,
        weeksOut: injury.recoveryWeeks,
        injury,
      });
    }
  }

  return newInjuries;
}

// =============================================================================
// SIMULATED CARD GENERATION (for non-attended fixtures)
// =============================================================================

/**
 * Card reason weights for simulated cards.
 */
type SimCardReason = "recklessTackle" | "professionalFoul" | "dissent" | "timewasting" | "handball" | "violentConduct";

const SIM_YELLOW_REASONS: Array<{ item: SimCardReason; weight: number }> = [
  { item: "recklessTackle", weight: 40 },
  { item: "professionalFoul", weight: 25 },
  { item: "dissent", weight: 15 },
  { item: "timewasting", weight: 10 },
  { item: "handball", weight: 10 },
];

const SIM_RED_REASONS: Array<{ item: SimCardReason; weight: number }> = [
  { item: "violentConduct", weight: 30 },
  { item: "recklessTackle", weight: 30 },
  { item: "professionalFoul", weight: 25 },
  { item: "handball", weight: 10 },
  { item: "dissent", weight: 5 },
];

/**
 * Generate simulated card events for a fixture.
 * Each player has a small chance of receiving a card based on attributes.
 *
 * Average match: ~3 yellows, ~0.05 reds (realistic football statistics).
 */
function generateSimulatedCards(
  rng: RNG,
  fixtureId: string,
  homePlayers: Player[],
  awayPlayers: Player[],
  disciplinaryRecords: Record<string, DisciplinaryRecord>,
): CardEvent[] {
  const cards: CardEvent[] = [];
  const allPlayers = [...homePlayers, ...awayPlayers];

  for (const player of allPlayers) {
    // Skip suspended/injured players (they aren't playing)
    const record = disciplinaryRecords[player.id];
    if (record && record.suspensionWeeksRemaining > 0) continue;
    if (player.injured) continue;

    // Base probability: ~3 yellows per match across ~22 players = ~14% per player
    let yellowProb = 0.14;
    let redProb = 0.002; // ~1 red per ~50 matches, ~22 players

    // Temperament modifier
    const isTemperamental = player.personalityTraits?.includes("temperamental") ?? false;
    if (isTemperamental) {
      yellowProb *= 1.8;
      redProb *= 2.0;
    }

    // Defensive awareness: lower awareness = slightly higher card risk
    const defAwareness = player.attributes.defensiveAwareness ?? 10;
    if (defAwareness < 8) {
      yellowProb *= 1 + (8 - defAwareness) * 0.05;
    }

    // Defensive positions get cards more often
    const defensivePositions = new Set(["CB", "LB", "RB", "CDM"]);
    if (defensivePositions.has(player.position)) {
      yellowProb *= 1.3;
    }

    const roll = rng.nextFloat(0, 1);
    if (roll < redProb) {
      cards.push({
        type: "red",
        playerId: player.id,
        fixtureId,
        minute: rng.nextInt(1, 90),
        reason: rng.pickWeighted(SIM_RED_REASONS),
      });
    } else if (roll < redProb + yellowProb) {
      cards.push({
        type: "yellow",
        playerId: player.id,
        fixtureId,
        minute: rng.nextInt(1, 90),
        reason: rng.pickWeighted(SIM_YELLOW_REASONS),
      });
    }
  }

  return cards;
}

// =============================================================================
// AI TRANSFERS
// =============================================================================

/**
 * Determine if a player is transfer-eligible: out of contract soon,
 * unhappy, or explicitly listed.
 */
function isTransferEligible(player: Player, currentSeason: number): boolean {
  if (player.injured) return false;
  const contractingExpiringSoon = player.contractExpiry <= currentSeason + 1;
  const unhappy = player.morale <= 3;
  return contractingExpiringSoon || unhappy;
}

/**
 * Find a suitable destination club for a player.
 * Simple heuristic: club with closest reputation to player's market value tier,
 * sufficient budget, and a different league (for variety).
 */
function findTransferDestination(
  player: Player,
  fromClub: Club,
  clubs: Record<string, Club>,
  rng: RNG,
): Club | null {
  // Target market value tier: reputation roughly proportional to player quality
  const targetReputation = Math.round((player.currentAbility / 200) * 100);

  const candidates = Object.values(clubs).filter((club) => {
    if (club.id === fromClub.id) return false;
    if (club.budget < player.marketValue * 0.5) return false;
    const repDiff = Math.abs(club.reputation - targetReputation);
    return repDiff <= 20; // Only clubs within 20 reputation points
  });

  if (candidates.length === 0) return null;
  return rng.pick(candidates);
}

/**
 * Process AI club transfer activity for this week.
 * Clubs buy/sell players probabilistically based on their philosophy,
 * budget, and squad needs.
 */
function processAITransfers(state: GameState, rng: RNG): Transfer[] {
  const transfers: Transfer[] = [];
  // Track cumulative spending per club to prevent budget overspending
  const spentBudget = new Map<string, number>();

  for (const player of Object.values(state.players)) {
    if (!isTransferEligible(player, state.currentSeason)) continue;
    if (!rng.chance(AI_TRANSFER_PROBABILITY)) continue;

    const fromClub = state.clubs[player.clubId];
    if (!fromClub) continue;

    const destination = findTransferDestination(
      player,
      fromClub,
      state.clubs,
      rng,
    );
    if (!destination) continue;

    // Transfer fee: market value with ±20% variance
    const feeVariance = rng.nextFloat(0.8, 1.2);
    const fee = Math.round(player.marketValue * feeVariance);

    // Destination must still have budget (accounting for other transfers this tick)
    const alreadySpent = spentBudget.get(destination.id) ?? 0;
    if (destination.budget - alreadySpent < fee) continue;

    spentBudget.set(destination.id, alreadySpent + fee);

    transfers.push({
      playerId: player.id,
      fromClubId: fromClub.id,
      toClubId: destination.id,
      fee,
      week: state.currentWeek,
      season: state.currentSeason,
    });
  }

  return transfers;
}

// =============================================================================
// INBOX MESSAGE GENERATION
// =============================================================================

/**
 * Build an inbox message ID from a descriptive prefix.
 */
function makeMessageId(prefix: string, rng: RNG): string {
  return generateId(`msg_${prefix}`, rng);
}

/**
 * Generate an assignment message from the scout's club.
 * Triggered probabilistically — not every week has an assignment.
 *
 * Assignments are filtered by the scout's primary specialization:
 *  - youth:     only players aged ≤ 21 (prospects / academy players)
 *  - firstTeam: only players aged ≥ 20 (senior professionals)
 *  - regional:  any age, but prefer the scout's home country
 *  - data:      any age (data analysts work across all profiles)
 */
function maybeGenerateAssignment(
  state: GameState,
  rng: RNG,
): InboxMessage | null {
  // Only employed scouts receive assignments
  if (!state.scout.currentClubId) return null;
  // Youth scouts discover talent organically — they don't receive
  // club-driven scouting assignments for signed players.
  if (state.scout.primarySpecialization === "youth") return null;
  // ~30% chance per week of receiving a new assignment
  if (!rng.chance(0.3)) return null;

  const club = state.clubs[state.scout.currentClubId];
  if (!club) return null;

  // Pick a random player from the world to scout (not already reported)
  const allPlayerIds = Object.keys(state.players);
  const alreadyReported = new Set(
    Object.values(state.reports).map((r) => r.playerId),
  );
  let unreported = allPlayerIds.filter((id) => !alreadyReported.has(id));
  if (unreported.length === 0) return null;

  // Filter candidates by scout specialization (youth scouts early-return above)
  const spec = state.scout.primarySpecialization;
  if (spec === "firstTeam") {
    unreported = unreported.filter((id) => {
      const p = state.players[id];
      return p && p.age >= 20;
    });
  }
  if (unreported.length === 0) return null;

  const targetId = rng.pick(unreported);
  const targetPlayer = state.players[targetId];
  if (!targetPlayer) return null;

  return {
    id: makeMessageId("assignment", rng),
    week: state.currentWeek,
    season: state.currentSeason,
    type: "assignment",
    title: `Scout ${targetPlayer.firstName} ${targetPlayer.lastName}`,
    body: `The club has asked you to compile a report on ${targetPlayer.firstName} ${targetPlayer.lastName} (${targetPlayer.position}, ${targetPlayer.age}). Please submit your findings as soon as possible.`,
    read: false,
    actionRequired: true,
    relatedId: targetId,
  };
}

/**
 * Generate news messages based on this week's events (transfers, injuries).
 */
function generateNewsMessages(
  state: GameState,
  transfers: Transfer[],
  injuries: InjuryResult[],
  rng: RNG,
): InboxMessage[] {
  const messages: InboxMessage[] = [];

  // Transfer news (only for notable players — high CA)
  for (const transfer of transfers) {
    const player = state.players[transfer.playerId];
    if (!player || player.currentAbility < 130) continue;
    if (!rng.chance(0.5)) continue; // Not all transfers make the news

    const fromClub = state.clubs[transfer.fromClubId];
    const toClub = state.clubs[transfer.toClubId];

    messages.push({
      id: makeMessageId("news", rng),
      week: state.currentWeek,
      season: state.currentSeason,
      type: "news",
      title: `Transfer: ${player.firstName} ${player.lastName} moves clubs`,
      body: `${player.firstName} ${player.lastName} has completed a transfer from ${fromClub?.name ?? "Unknown"} to ${toClub?.name ?? "Unknown"} for an undisclosed fee.`,
      read: false,
      actionRequired: false,
      relatedId: player.id,
    });
  }

  // Injury news for players the scout has observed
  const observedPlayerIds = new Set(
    Object.values(state.observations).map((o) => o.playerId),
  );

  for (const injury of injuries) {
    if (!observedPlayerIds.has(injury.playerId)) continue;

    const player = state.players[injury.playerId];
    if (!player) continue;

    const injType = injury.injury.type;
    const injSeverity = injury.injury.severity;
    const typeLabel = injType.charAt(0).toUpperCase() + injType.slice(1);

    messages.push({
      id: makeMessageId("injury", rng),
      week: state.currentWeek,
      season: state.currentSeason,
      type: "news",
      title: `Injury: ${player.firstName} ${player.lastName} — ${typeLabel} (${injSeverity})`,
      body: `${player.firstName} ${player.lastName} has suffered a ${injSeverity} ${injType} injury and will be sidelined for approximately ${injury.weeksOut} weeks. Any current reports on this player may need revising.`,
      read: false,
      actionRequired: false,
      relatedId: player.id,
    });
  }

  return messages;
}

/**
 * Check if any pending job offers are expiring this week and generate
 * urgent reminder messages.
 */
function generateExpiringOfferMessages(
  state: GameState,
  rng: RNG,
): InboxMessage[] {
  const messages: InboxMessage[] = [];

  for (const offer of state.jobOffers) {
    if (offer.expiresWeek !== state.currentWeek) continue;

    const club = state.clubs[offer.clubId];
    messages.push({
      id: makeMessageId("offer_expiry", rng),
      week: state.currentWeek,
      season: state.currentSeason,
      type: "jobOffer",
      title: `Job offer expires today: ${club?.name ?? "Unknown Club"}`,
      body: `Your job offer from ${club?.name ?? "Unknown Club"} (${offer.role}) expires at the end of this week. Accept or decline before you advance to the next week.`,
      read: false,
      actionRequired: true,
      relatedId: offer.id,
    });
  }

  return messages;
}

/**
 * Generate a youth-scout-specific tip from a contact about an unsigned youth.
 *
 * These replace the generic senior-player assignments for youth specialists,
 * giving flavourful leads about tournaments, hidden gems, or promising kids
 * that a contact has spotted. ~25% chance per week.
 */
function maybeGenerateYouthTip(
  state: GameState,
  rng: RNG,
): InboxMessage | null {
  if (state.scout.primarySpecialization !== "youth") return null;
  if (!rng.chance(0.25)) return null;

  // Need unsigned youth to tip about
  const activeYouth = Object.values(state.unsignedYouth ?? {}).filter(
    (y) => !y.placed && !y.retired,
  );
  if (activeYouth.length === 0) return null;

  // Prefer youth the scout hasn't discovered yet
  const undiscovered = activeYouth.filter(
    (y) => !y.discoveredBy.includes(state.scout.id),
  );
  const pool = undiscovered.length > 0 ? undiscovered : activeYouth;

  const youth = rng.pick(pool);
  const player = youth.player;

  // Pick a contact source (or use a generic one)
  const contactEntries = Object.values(state.contacts ?? {});
  const youthContacts = contactEntries.filter(
    (c) =>
      c.type === "academyCoach" ||
      c.type === "schoolCoach" ||
      c.type === "grassrootsOrganizer" ||
      c.type === "youthAgent" ||
      c.type === "academyDirector" ||
      c.type === "localScout",
  );
  const contact =
    youthContacts.length > 0 ? rng.pick(youthContacts) : null;
  const sourceName = contact ? contact.name : "A local contact";
  const sourceRole = contact
    ? contact.type.replace(/([A-Z])/g, " $1").toLowerCase().trim()
    : "scout";

  // Tip templates — varied flavour
  const tips = [
    {
      title: `Tip: Promising youngster in ${youth.country}`,
      body: `${sourceName} (${sourceRole}) mentioned a ${player.age}-year-old ${player.position} named ${player.firstName} ${player.lastName} who's been turning heads at local matches. "${player.firstName} has something special — you should take a look." Consider scheduling a school match or grassroots tournament to spot this player.`,
    },
    {
      title: `Tip: Academy buzz about ${player.firstName} ${player.lastName}`,
      body: `${sourceName} (${sourceRole}) says there's growing buzz around ${player.firstName} ${player.lastName}, a ${player.age}-year-old ${player.position} from ${youth.country}. "Clubs are starting to notice — if you want first look, go soon." A youth tournament or academy visit might give you a chance to observe.`,
    },
    {
      title: `Tip: Hidden gem spotted in ${youth.country}`,
      body: `${sourceName} (${sourceRole}) passed along a lead: "${player.firstName} ${player.lastName} is the real deal — raw but incredibly talented for ${player.age}." The youngster plays ${player.position} and has been under the radar so far. Worth scheduling an observation visit.`,
    },
    {
      title: `Tip: Tournament standout — ${player.firstName} ${player.lastName}`,
      body: `${sourceName} (${sourceRole}) flagged a standout from a recent youth event: ${player.firstName} ${player.lastName} (${player.position}, ${player.age}). "Dominated the tournament — every touch was quality." Check the grassroots circuit or upcoming youth tournaments to see for yourself.`,
    },
    {
      title: `Tip: School talent worth watching`,
      body: `${sourceName} (${sourceRole}) reached out about ${player.firstName} ${player.lastName}, a ${player.age}-year-old ${player.position} from ${youth.country}. "This kid is outgrowing school football fast — won't stay hidden much longer." A school match visit could be your chance.`,
    },
  ];

  const tip = rng.pick(tips);

  return {
    id: makeMessageId("youth_tip", rng),
    week: state.currentWeek,
    season: state.currentSeason,
    type: "event",
    title: tip.title,
    body: tip.body,
    read: false,
    actionRequired: false,
    relatedId: youth.player.id,
    relatedEntityType: "player",
  };
}

/**
 * Collect all new inbox messages generated this week.
 */
function generateInboxMessages(
  state: GameState,
  transfers: Transfer[],
  injuries: InjuryResult[],
  rng: RNG,
): InboxMessage[] {
  const messages: InboxMessage[] = [];

  const assignment = maybeGenerateAssignment(state, rng);
  if (assignment) messages.push(assignment);

  // Youth scouts receive tips about unsigned youth instead of only
  // generic club assignments
  const youthTip = maybeGenerateYouthTip(state, rng);
  if (youthTip) messages.push(youthTip);

  messages.push(...generateNewsMessages(state, transfers, injuries, rng));
  messages.push(...generateExpiringOfferMessages(state, rng));

  return messages;
}

// =============================================================================
// SCOUT FATIGUE
// =============================================================================

/**
 * Compute the week's net fatigue change for the scout.
 * Fatigue is advanced by scheduled activities and recovered by rest and
 * the scout's endurance attribute.
 *
 * Assumption: the caller passes the total fatigue cost of all activities
 * the scout performed this week. The game loop doesn't execute the schedule
 * itself — that's handled by the UI layer before calling processWeeklyTick.
 * This function applies the end-of-week natural recovery.
 */
function computeFatigueRecovery(scout: { attributes: { endurance: number } }): number {
  const enduranceBonus = Math.floor(scout.attributes.endurance / 4);
  return BASE_WEEKLY_FATIGUE_RECOVERY + enduranceBonus;
}

// =============================================================================
// END-OF-SEASON TRIGGERS
// =============================================================================

/**
 * Determine if this week is the final week of the season.
 * End-of-season triggers performance reviews, contract renewals, etc.
 */
/**
 * Compute the actual season length from the generated fixtures.
 * Returns the maximum fixture week across all leagues, or the minimum
 * season length if no fixtures exist.
 */
function getSeasonLength(fixtures: Record<string, Fixture>): number {
  let maxWeek = MIN_SEASON_LENGTH_WEEKS;
  for (const fixture of Object.values(fixtures)) {
    if (fixture.week > maxWeek) maxWeek = fixture.week;
  }
  return maxWeek;
}

function isEndOfSeason(currentWeek: number, fixtures: Record<string, Fixture>): boolean {
  return currentWeek >= getSeasonLength(fixtures);
}

/**
 * Generate an end-of-season notification message.
 */
function generateEndOfSeasonMessage(
  state: GameState,
  rng: RNG,
): InboxMessage {
  return {
    id: makeMessageId("season_end", rng),
    week: state.currentWeek,
    season: state.currentSeason,
    type: "event",
    title: `Season ${state.currentSeason} Complete`,
    body: `The ${state.currentSeason} season has concluded. Your performance review is now available. Review your achievements and prepare for the new season.`,
    read: false,
    actionRequired: true,
    relatedId: undefined,
  };
}

// =============================================================================
// REPUTATION CHANGE
// =============================================================================

/**
 * Compute reputation change for the scout this week, returning both a
 * net numeric delta and an itemised list of reasons for transparency.
 *
 * Driven by: reports submitted (quality), table-pounds, successful finds,
 * idle-week penalties, board directives, etc.
 *
 * This is a lightweight heuristic — full reputation calculation happens
 * at the end of season performance review. Weekly changes are small.
 */
function computeReputationChangeDetailed(
  state: GameState,
): { total: number; deltas: BoardSatisfactionDelta[] } {
  const deltas: BoardSatisfactionDelta[] = [];
  const week = state.currentWeek;
  const season = state.currentSeason;

  // ── Reports submitted last week ─────────────────────────────────────────
  const recentReports = Object.values(state.reports).filter(
    (r) =>
      r.submittedWeek === state.currentWeek - 1 &&
      r.submittedSeason === state.currentSeason,
  );

  if (recentReports.length > 0) {
    const avgQuality =
      recentReports.reduce((sum, r) => sum + r.qualityScore, 0) /
      recentReports.length;

    if (avgQuality >= 75) {
      deltas.push({
        reason: `${recentReports.length} quality report${recentReports.length !== 1 ? "s" : ""} submitted`,
        delta: 1,
        week,
        season,
      });
    } else if (avgQuality < 50) {
      deltas.push({
        reason: "Low quality reports",
        delta: -1,
        week,
        season,
      });
    }
  }

  // ── Idle week: no scheduled activities at all ────────────────────────────
  const scheduledCount = state.schedule.activities.filter(
    (a) => a !== null,
  ).length;
  if (scheduledCount === 0) {
    deltas.push({
      reason: "Idle week (no scouting activity)",
      delta: -1,
      week,
      season,
    });
  }

  // ── Successful signing: a report led to a "signed" club response ────────
  const recentSignings = Object.values(state.reports).filter(
    (r) =>
      r.clubResponse === "signed" &&
      r.submittedWeek >= state.currentWeek - 2 &&
      r.submittedSeason === state.currentSeason,
  );
  if (recentSignings.length > 0) {
    deltas.push({
      reason: `Successful signing recommendation`,
      delta: 2,
      week,
      season,
    });
  }

  // ── Missed directive deadline ────────────────────────────────────────────
  if (state.scout.careerTier >= 5) {
    const overdueDirectives = state.scout.boardDirectives.filter(
      (d) => !d.completed && d.deadline <= season && state.currentWeek >= 36,
    );
    if (overdueDirectives.length > 0) {
      deltas.push({
        reason: `Missed directive deadline (${overdueDirectives.length})`,
        delta: -2,
        week,
        season,
      });
    }
  }

  const total = deltas.reduce((sum, d) => sum + d.delta, 0);
  return { total, deltas };
}

// =============================================================================
// NPC SCOUT PROCESSING (TIER 4+)
// =============================================================================

/**
 * Process all NPC scouts for the current week.
 *
 * For each NPC scout with an assigned territory: call processNPCScoutingWeek()
 * to generate reports and accrue fatigue. For scouts without a territory
 * assignment: apply rest recovery via restNPCScout().
 *
 * Only executes if the player scout is career tier 4 or above.
 */
function processNPCScouts(
  state: GameState,
  rng: RNG,
): NPCScoutWeekResult[] {
  // NPC scouting is a tier 4+ feature
  if (state.scout.careerTier < 4) return [];

  const results: NPCScoutWeekResult[] = [];

  for (const npcScout of Object.values(state.npcScouts)) {
    if (npcScout.territoryId) {
      // Scout is assigned to a territory — generate reports for this week
      const territory = state.territories[npcScout.territoryId];
      if (!territory) {
        // Territory reference is dangling — treat as unassigned (rest)
        results.push({
          npcScoutId: npcScout.id,
          updatedNPCScout: restNPCScout(npcScout),
          reportsGenerated: [],
        });
        continue;
      }

      const { npcScout: updatedNPCScout, reports } = processNPCScoutingWeek(
        rng,
        npcScout,
        territory,
        state.players,
        state.currentWeek,
        state.currentSeason,
        state.clubs,
      );

      results.push({
        npcScoutId: npcScout.id,
        updatedNPCScout,
        reportsGenerated: reports,
      });
    } else {
      // Unassigned — apply rest recovery so scouts don't decay while idle
      results.push({
        npcScoutId: npcScout.id,
        updatedNPCScout: restNPCScout(npcScout),
        reportsGenerated: [],
      });
    }
  }

  return results;
}

// =============================================================================
// MANAGER EVENT MESSAGES (TIER 4+)
// =============================================================================

/**
 * Generate manager-related inbox messages for this week.
 *
 * Fires on two conditions (tier 4+ only):
 *  1. Every 4 weeks: a meeting reminder if the scout has a manager relationship.
 *  2. At any time: a low-trust warning if trust < 30.
 *
 * Both messages are informational; actual meeting processing happens when the
 * player schedules and executes a managerMeeting activity.
 */
function generateManagerMessages(
  state: GameState,
  rng: RNG,
): InboxMessage[] {
  if (state.scout.careerTier < 4) return [];

  const relationship = state.scout.managerRelationship;
  if (!relationship) return [];

  const messages: InboxMessage[] = [];

  // Periodic meeting reminder every 4 weeks
  if (state.currentWeek % 4 === 0) {
    messages.push({
      id: makeMessageId("mgr_reminder", rng),
      week: state.currentWeek,
      season: state.currentSeason,
      type: "event",
      title: `Schedule a meeting with ${relationship.managerName}`,
      body: `It has been a month since your last check-in. ${relationship.managerName} expects a progress update. Schedule a manager meeting this week to maintain your working relationship.`,
      read: false,
      actionRequired: false,
      relatedId: undefined,
    });
  }

  // Low trust warning (trust threshold: < 30)
  const LOW_TRUST_THRESHOLD = 30;
  if (relationship.trust < LOW_TRUST_THRESHOLD) {
    messages.push({
      id: makeMessageId("mgr_warning", rng),
      week: state.currentWeek,
      season: state.currentSeason,
      type: "event",
      title: `Warning: Low trust with ${relationship.managerName}`,
      body: `Your trust level with ${relationship.managerName} has fallen to ${relationship.trust}. If it drops further your position may be at risk. Attend a meeting and deliver quality reports to rebuild the relationship.`,
      read: false,
      actionRequired: true,
      relatedId: undefined,
    });
  }

  return messages;
}

// =============================================================================
// BOARD DIRECTIVE EVALUATION (TIER 5, SEASON END)
// =============================================================================

/**
 * Evaluate active board directives at the end of the season (week 38).
 * Only runs for tier 5 scouts. Returns undefined when conditions are not met.
 */
function evaluateBoardDirectivesForTick(
  state: GameState,
  endOfSeasonTriggered: boolean,
): BoardDirectiveEvaluationResult | undefined {
  if (!endOfSeasonTriggered) return undefined;
  if (state.scout.careerTier < 5) return undefined;

  const directives = state.scout.boardDirectives;
  if (directives.length === 0) return undefined;

  return evaluateBoardDirectives(
    state.scout,
    directives,
    state.currentSeason,
  );
}

// =============================================================================
// MAIN TICK PROCESSOR
// =============================================================================

/**
 * Process one week's worth of game simulation.
 *
 * This function is the heart of the game loop. It:
 *  1. Simulates all fixtures for the current week
 *  2. Updates league standings
 *  3. Processes player development (attribute progression/decline)
 *  4. Simulates AI club transfer activity
 *  5. Rolls injuries for all players
 *  6. Generates inbox messages (assignments, news, offer reminders)
 *  7. Advances scout fatigue and computes weekly reputation change
 *  8. Checks for end-of-season triggers
 *
 * IMPORTANT: This function does NOT mutate state. Call advanceWeek() to
 * apply the TickResult to produce a new GameState.
 *
 * @param state  The current game state (not mutated).
 * @param rng    The seeded PRNG (IS mutated — advances its internal state).
 * @returns      A TickResult describing all events that occurred this week.
 */
export function processWeeklyTick(state: GameState, rng: RNG): TickResult {
  // 0. Decrement suspensions at the start of the week
  const currentDisciplinary = decrementSuspensions(state.disciplinaryRecords ?? {});

  // 1. Simulate fixtures (pass decremented disciplinary records so suspended players are excluded)
  const fixturesPlayed = simulateWeekFixtures(state, rng, currentDisciplinary);

  // 2. Check if standings changed (they did if any fixtures were played)
  const standingsUpdated = fixturesPlayed.length > 0;

  // 2b. Generate card events for simulated fixtures
  const allCardEvents: CardEvent[] = [];
  for (const played of fixturesPlayed) {
    const homeClub = state.clubs[played.homeClubId];
    const awayClub = state.clubs[played.awayClubId];
    const homePlayers = homeClub
      ? homeClub.playerIds.map((id) => state.players[id]).filter((p): p is Player => !!p)
      : [];
    const awayPlayers = awayClub
      ? awayClub.playerIds.map((id) => state.players[id]).filter((p): p is Player => !!p)
      : [];
    const fixtureCards = generateSimulatedCards(
      rng, played.id, homePlayers, awayPlayers, currentDisciplinary,
    );
    allCardEvents.push(...fixtureCards);
  }

  // 2c. Process card accumulation and suspensions
  const { updatedRecords: postCardRecords, suspensions } = processCardAccumulation(
    allCardEvents, currentDisciplinary, state.currentSeason,
  );

  // 3. Player development (normal growth + rare breakthroughs)
  const { development: playerDevelopment, breakthroughs, breakthroughMessages } =
    processPlayerDevelopment(state, rng);

  // 4. AI transfers
  const transfers = processAITransfers(state, rng);

  // 5. Injuries
  const injuries = processInjuries(state, rng);

  // 5b. Injury setbacks: when a new serious injury occurs (duration > 4 weeks),
  //     compute physical attribute reductions applied alongside the injury.
  const injurySetbacks: InjurySetbackResult[] = [];
  for (const injury of injuries) {
    if (injury.weeksOut > SERIOUS_INJURY_THRESHOLD) {
      const player = state.players[injury.playerId];
      if (player) {
        const setback = computeInjurySetback(player, injury.weeksOut, rng);
        if (setback) {
          injurySetbacks.push(setback);
        }
      }
    }
  }

  // 6. Inbox messages (after computing transfers and injuries so we can ref them)
  const endOfSeasonTriggered = isEndOfSeason(state.currentWeek, state.fixtures);
  const newMessages = generateInboxMessages(state, transfers, injuries, rng);

  // Append breakthrough notifications
  newMessages.push(...breakthroughMessages);

  if (endOfSeasonTriggered) {
    newMessages.push(generateEndOfSeasonMessage(state, rng));
  }

  // 7. Reputation change (with itemised deltas for transparency UI — A4)
  const { total: reputationChange, deltas: satisfactionDeltas } =
    computeReputationChangeDetailed(state);

  // 8. NPC scout processing (tier 4+): assigned scouts generate reports,
  //    unassigned scouts recover fatigue via rest.
  const npcScoutResults = processNPCScouts(state, rng);

  // 9. Manager event messages (tier 4+): periodic meeting reminders and
  //    low-trust warnings. Appended after primary messages are generated.
  const managerMessages = generateManagerMessages(state, rng);
  newMessages.push(...managerMessages);

  // 10. Board directive evaluation (tier 5, season-end only).
  const boardDirectiveResult = evaluateBoardDirectivesForTick(state, endOfSeasonTriggered);

  // 10a. Board satisfaction summary inbox message (A4, only when net change is non-zero).
  const netSatisfactionDelta = satisfactionDeltas.reduce((sum, d) => sum + d.delta, 0);
  if (netSatisfactionDelta !== 0) {
    const breakdown = satisfactionDeltas
      .map((d) => `${d.delta > 0 ? "+" : ""}${d.delta} ${d.reason}`)
      .join(", ");
    const direction = netSatisfactionDelta > 0 ? "improved" : "declined";
    newMessages.push({
      id: makeMessageId("satisfaction", rng),
      week: state.currentWeek,
      season: state.currentSeason,
      type: "feedback",
      title: `Board Satisfaction ${direction} (${netSatisfactionDelta > 0 ? "+" : ""}${netSatisfactionDelta})`,
      body: `Your reputation this week: ${netSatisfactionDelta > 0 ? "+" : ""}${netSatisfactionDelta} (net). ${breakdown}.`,
      read: false,
      actionRequired: false,
      relatedId: undefined,
    });
  }

  // 10b. Board AI weekly processing (F10, tier 5): evaluate satisfaction and reactions.
  const boardAIResult = processBoardWeekly(state, rng);
  if (boardAIResult) {
    newMessages.push(...boardAIResult.messages);
  }

  // 11. Youth scouting: aging and retirement
  const youthAgingResult = processYouthAging(
    rng,
    state.unsignedYouth,
    state.clubs,
    state.currentSeason,
  );

  // 12. Player retirement (season-end only)
  const playerRetirements = endOfSeasonTriggered
    ? processPlayerRetirement(rng, state.players, state.clubs, state.currentSeason)
    : undefined;

  // 13. Alumni milestone tracking (F12: pass retiredPlayerIds for status derivation)
  const alumniResult = processAlumniWeek(
    rng,
    state.alumniRecords,
    state.players,
    state.clubs,
    state.currentWeek,
    state.currentSeason,
    state.retiredPlayerIds,
  );

  // Merge alumni messages into inbox messages
  newMessages.push(...alumniResult.newMessages);

  // 13b. F12: Generate season summaries for all active alumni at end of season
  let alumniWithSeasonStats = alumniResult.updatedAlumni;
  if (endOfSeasonTriggered) {
    alumniWithSeasonStats = alumniWithSeasonStats.map((record) => {
      const player = state.players[record.playerId];
      if (!player) return record;
      return generateAlumniSeasonSummary(rng, record, player, state.currentSeason);
    });
  }

  // 14. Season event effects: apply mechanical effects from active events
  const activeEvents = getActiveSeasonEvents(
    state.seasonEvents,
    state.currentWeek,
  );
  const seasonEventResult = applySeasonEventEffects(state, activeEvents, rng);
  newMessages.push(...seasonEventResult.messages);

  // 15. Regional knowledge growth (F13)
  let regionalKnowledgeResult: TickResult["regionalKnowledgeResult"];
  if (state.regionalKnowledge && Object.keys(state.regionalKnowledge).length > 0) {
    const rkResult = processRegionalKnowledgeGrowth(state, rng);
    regionalKnowledgeResult = rkResult;

    // Generate inbox messages for discoveries and insights
    for (const disc of rkResult.newDiscoveries) {
      newMessages.push({
        id: generateId("msg", rng),
        week: state.currentWeek,
        season: state.currentSeason,
        type: "news",
        title: `Hidden League Discovered: ${disc.leagueName}`,
        body: `Your growing knowledge of the region has revealed the ${disc.leagueName}. This lower-tier league may contain undiscovered talent that mainstream scouts overlook.`,
        read: false,
        actionRequired: false,
      });
    }
    for (const ins of rkResult.newInsights) {
      newMessages.push({
        id: generateId("msg", rng),
        week: state.currentWeek,
        season: state.currentSeason,
        type: "news",
        title: `Cultural Insight: ${ins.insight.type.replace(/([A-Z])/g, " $1").trim()}`,
        body: `${ins.insight.description} — ${ins.insight.gameplayEffect}`,
        read: false,
        actionRequired: false,
      });
    }
  }

  // 16. Generate suspension notifications for observed players
  const observedPlayerIds = new Set(
    Object.values(state.observations).map((o) => o.playerId),
  );
  for (const susp of suspensions) {
    if (!observedPlayerIds.has(susp.playerId)) continue;
    const player = state.players[susp.playerId];
    if (!player) continue;
    newMessages.push({
      id: makeMessageId("suspension", rng),
      week: state.currentWeek,
      season: state.currentSeason,
      type: "news",
      title: `Suspension: ${player.firstName} ${player.lastName}`,
      body: `${player.firstName} ${player.lastName} has been suspended for ${susp.weeks} match${susp.weeks > 1 ? "es" : ""} due to ${susp.reason}.`,
      read: false,
      actionRequired: false,
      relatedId: player.id,
    });
  }

  // 17. Process active transfer negotiations (F4)
  const negotiationResult = processActiveNegotiations(state, rng);
  newMessages.push(...negotiationResult.messages);

  // 18. F3: Contact Network Depth — gossip, referrals, trust decay, betrayal, exclusives
  const contactDecayResult = processWeeklyContactDecay(state, rng);
  newMessages.push(...contactDecayResult.betrayalMessages);

  // Gossip processing on decayed contacts
  const gossipState: GameState = { ...state, contacts: contactDecayResult.updatedContacts };
  const gossipResult = processWeeklyGossip(gossipState, rng);
  newMessages.push(...gossipResult.gossipMessages);

  // Referral processing
  const referralState: GameState = { ...state, contacts: gossipResult.updatedContacts };
  const referralResult = processWeeklyReferrals(referralState, rng);
  newMessages.push(...referralResult.referralMessages);

  // Exclusive windows processing
  const exclusiveState: GameState = { ...state, contacts: referralResult.updatedContacts };
  const exclusiveResult = processExclusiveWindows(exclusiveState, rng);
  newMessages.push(...exclusiveResult.exclusiveMessages);

  const f3UpdatedContacts = exclusiveResult.updatedContacts;

  // 19. Form momentum updates for all players.
  const formMomentumUpdates = processFormMomentum(state, fixturesPlayed, rng);

  return {
    fixturesPlayed,
    standingsUpdated,
    playerDevelopment,
    breakthroughs,
    transfers,
    injuries,
    injurySetbacks,
    newMessages,
    reputationChange,
    endOfSeasonTriggered,
    npcScoutResults,
    boardDirectiveResult,
    formMomentumUpdates,
    satisfactionDeltas,
    youthAgingResult: {
      autoSigned: youthAgingResult.autoSigned,
      retired: youthAgingResult.retired,
      updatedUnsignedYouth: youthAgingResult.updated,
    },
    playerRetirements,
    // newUnsignedYouth and newAcademyIntake are generated asynchronously
    // in the store layer (they need CountryData which requires async loading)
    newUnsignedYouth: undefined,
    newAcademyIntake: undefined,
    alumniMilestones: alumniResult.newMilestones,
    alumniRecords: alumniWithSeasonStats,
    alumniContactPromotions: alumniResult.contactPromotions.length > 0
      ? alumniResult.contactPromotions
      : undefined,
    gutFeelings: undefined, // generated during observation processing in store
    regionalKnowledgeResult,
    seasonEventState: seasonEventResult.state,
    cardEvents: allCardEvents.length > 0 ? allCardEvents : undefined,
    updatedDisciplinaryRecords: postCardRecords,
    suspensionNotifications: suspensions.length > 0 ? suspensions : undefined,
    updatedNegotiations: negotiationResult.negotiations.length > 0
      ? negotiationResult.negotiations
      : undefined,
    updatedContacts: f3UpdatedContacts,
    boardReactions: boardAIResult?.reactions,
    updatedBoardProfile: boardAIResult?.updatedProfile,
  };
}

// =============================================================================
// STATE ADVANCEMENT
// =============================================================================

/**
 * Apply a TickResult to the current GameState, producing a new GameState.
 *
 * This is a pure function: the input state is not mutated. All record updates
 * use object spread to produce new objects.
 *
 * The new state reflects:
 *  - Fixture results recorded
 *  - Player attributes updated
 *  - Transfer club memberships updated
 *  - Injury flags applied and decremented
 *  - New inbox messages appended
 *  - Scout reputation and fatigue updated
 *  - Week counter advanced (or season rolled over)
 *
 * @param state       The current game state (not mutated).
 * @param tickResult  The result from processWeeklyTick.
 * @returns           A new GameState with all changes applied.
 */
export function advanceWeek(
  state: GameState,
  tickResult: TickResult,
): GameState {
  // ---- Fixtures ----
  const updatedFixtures = { ...state.fixtures };
  for (const played of tickResult.fixturesPlayed) {
    updatedFixtures[played.id] = played;
  }

  // ---- Player development ----
  let updatedPlayers = { ...state.players };

  for (const dev of tickResult.playerDevelopment) {
    const player = updatedPlayers[dev.playerId];
    if (!player) continue;

    const updatedAttributes = { ...player.attributes };
    for (const [attr, delta] of Object.entries(dev.changes) as Array<
      [PlayerAttribute, number | undefined]
    >) {
      if (delta === undefined) continue;
      updatedAttributes[attr] = clamp(
        updatedAttributes[attr] + delta,
        1,
        20,
      );
    }

    updatedPlayers[dev.playerId] = {
      ...player,
      attributes: updatedAttributes,
      currentAbility: clamp(
        player.currentAbility + dev.abilityChange,
        1,
        200,
      ),
    };
  }

  // ---- Breakthroughs: rare jumps that can exceed the normal ceiling ----
  for (const bt of tickResult.breakthroughs) {
    const player = updatedPlayers[bt.playerId];
    if (!player) continue;

    const updatedAttributes = { ...player.attributes };
    for (const [attr, delta] of Object.entries(bt.changes) as Array<
      [PlayerAttribute, number | undefined]
    >) {
      if (delta === undefined) continue;
      updatedAttributes[attr] = clamp(
        updatedAttributes[attr] + delta,
        1,
        20,
      );
    }

    updatedPlayers[bt.playerId] = {
      ...player,
      attributes: updatedAttributes,
      currentAbility: clamp(
        player.currentAbility + bt.abilityChange,
        1,
        200,
      ),
    };
  }

  // ---- Injury setbacks: physical attribute reductions from serious injuries ----
  for (const setback of tickResult.injurySetbacks) {
    const player = updatedPlayers[setback.playerId];
    if (!player) continue;

    const updatedAttributes = { ...player.attributes };
    for (const [attr, delta] of Object.entries(setback.changes) as Array<
      [PlayerAttribute, number | undefined]
    >) {
      if (delta === undefined) continue;
      updatedAttributes[attr] = clamp(
        updatedAttributes[attr] + delta,
        1,
        20,
      );
    }

    updatedPlayers[setback.playerId] = {
      ...player,
      attributes: updatedAttributes,
    };
  }

  // ---- Form momentum: apply momentum, trend, lock, and form updates ----
  for (const fmUpdate of tickResult.formMomentumUpdates) {
    const player = updatedPlayers[fmUpdate.playerId];
    if (!player) continue;
    updatedPlayers[fmUpdate.playerId] = {
      ...player,
      form: clamp(Math.round(fmUpdate.form * 10) / 10, -3, 3),
      formMomentum: fmUpdate.formMomentum,
      formTrend: fmUpdate.formTrend,
      formLockWeeks: fmUpdate.formLockWeeks,
    };
  }

  // ---- Injuries: apply new injuries and decrement existing ones ----
  // First, decrement existing injury timers and handle recovery
  for (const [id, player] of Object.entries(updatedPlayers)) {
    if (player.injured && player.injuryWeeksRemaining > 0) {
      const newRemaining = player.injuryWeeksRemaining - 1;
      const justRecovered = newRemaining === 0;

      // Update current injury's weeksRemaining
      const updatedCurrentInjury = player.currentInjury
        ? { ...player.currentInjury, weeksRemaining: newRemaining }
        : undefined;

      // If player just recovered, activate 4-week reinjury risk window
      const updatedHistory: InjuryHistory | undefined = justRecovered && player.injuryHistory
        ? { ...player.injuryHistory, reinjuryWindowWeeksLeft: 4 }
        : player.injuryHistory;

      updatedPlayers[id] = {
        ...player,
        injuryWeeksRemaining: newRemaining,
        injured: !justRecovered,
        currentInjury: justRecovered ? undefined : updatedCurrentInjury,
        injuryHistory: updatedHistory,
      };
    } else if (!player.injured && player.injuryHistory && player.injuryHistory.reinjuryWindowWeeksLeft > 0) {
      // Decrement reinjury risk window for recovered players
      updatedPlayers[id] = {
        ...player,
        injuryHistory: {
          ...player.injuryHistory,
          reinjuryWindowWeeksLeft: player.injuryHistory.reinjuryWindowWeeksLeft - 1,
        },
      };
    }
  }

  // Apply new injuries
  const newlyInjuredPlayerIds = new Set<string>();
  for (const injuryResult of tickResult.injuries) {
    const player = updatedPlayers[injuryResult.playerId];
    if (!player) continue;
    newlyInjuredPlayerIds.add(injuryResult.playerId);
    updatedPlayers[injuryResult.playerId] = {
      ...player,
      injured: true,
      injuryWeeksRemaining: injuryResult.weeksOut,
      currentInjury: injuryResult.injury,
      injuryHistory: addToInjuryHistory(player, injuryResult.injury),
    };
  }

  // ---- Transfers: update club rosters and player clubId ----
  const updatedClubs = { ...state.clubs };

  // Deduplicate transfers — a player can only move once per week
  const processedPlayerIds = new Set<string>();

  for (const transfer of tickResult.transfers) {
    if (processedPlayerIds.has(transfer.playerId)) continue;
    // Skip transfers for players who were injured this same tick
    if (newlyInjuredPlayerIds.has(transfer.playerId)) continue;
    processedPlayerIds.add(transfer.playerId);

    const player = updatedPlayers[transfer.playerId];
    const fromClub = updatedClubs[transfer.fromClubId];
    const toClub = updatedClubs[transfer.toClubId];

    if (!player || !fromClub || !toClub) continue;

    // Remove from source club and credit the transfer fee
    updatedClubs[transfer.fromClubId] = {
      ...fromClub,
      playerIds: fromClub.playerIds.filter((id) => id !== transfer.playerId),
      budget: fromClub.budget + transfer.fee,
    };

    // Add to destination club and deduct fee from budget
    updatedClubs[transfer.toClubId] = {
      ...toClub,
      playerIds: [...toClub.playerIds, transfer.playerId],
      budget: Math.max(0, toClub.budget - transfer.fee),
    };

    // Update player's club reference and contract
    updatedPlayers[transfer.playerId] = {
      ...player,
      clubId: transfer.toClubId,
      morale: clamp(player.morale + 2, 1, 10), // Transfer usually boosts morale
    };
  }

  // ---- NPC scouts: apply updated states and accumulate new reports ----
  const updatedNPCScouts = { ...state.npcScouts };
  const updatedNPCReports = { ...state.npcReports };

  for (const npcResult of tickResult.npcScoutResults) {
    updatedNPCScouts[npcResult.npcScoutId] = npcResult.updatedNPCScout;
    for (const report of npcResult.reportsGenerated) {
      updatedNPCReports[report.id] = report;
    }
  }

  // ---- Match ratings: store per-fixture ratings and update player form ----
  let updatedMatchRatings = { ...state.matchRatings };
  for (const played of tickResult.fixturesPlayed) {
    if (played.playerRatings) {
      updatedMatchRatings[played.id] = played.playerRatings;

      // Update each player's recentMatchRatings (rolling window of 6) and form
      for (const [playerId, rating] of Object.entries(played.playerRatings)) {
        const player = updatedPlayers[playerId];
        if (!player) continue;

        const newEntry = {
          fixtureId: played.id,
          week: state.currentWeek,
          season: state.currentSeason,
          rating: rating.rating,
        };
        const recent = [...(player.recentMatchRatings ?? []), newEntry].slice(-6);
        const form = computeFormFromRatings(recent, player);

        updatedPlayers[playerId] = {
          ...player,
          recentMatchRatings: recent,
          form,
        };
      }
    }
  }

  // ---- Youth aging: auto-signed youth become regular players ----
  if (tickResult.youthAgingResult) {
    for (const { youthId, clubId } of tickResult.youthAgingResult.autoSigned) {
      const youth = state.unsignedYouth[youthId] ?? tickResult.youthAgingResult.updatedUnsignedYouth[youthId];
      if (youth) {
        const player = { ...youth.player, clubId };
        updatedPlayers[player.id] = player;
        const club = updatedClubs[clubId];
        if (club) {
          updatedClubs[clubId] = {
            ...club,
            playerIds: [...club.playerIds, player.id],
          };
        }
      }
    }
  }

  // ---- Player retirements: remove from clubs ----
  if (tickResult.playerRetirements) {
    for (const [clubId, club] of Object.entries(tickResult.playerRetirements.updatedClubs)) {
      updatedClubs[clubId] = club;
    }
    for (const pid of tickResult.playerRetirements.retiredPlayerIds) {
      delete updatedPlayers[pid];
    }
  }

  // ---- New unsigned youth: add to pool ----
  let youthPool = { ...state.unsignedYouth };
  if (tickResult.newUnsignedYouth) {
    for (const youth of tickResult.newUnsignedYouth) {
      youthPool[youth.id] = youth;
    }
  }

  // ---- New academy intake: add to clubs ----
  if (tickResult.newAcademyIntake) {
    for (const player of tickResult.newAcademyIntake) {
      updatedPlayers[player.id] = player;
      const club = updatedClubs[player.clubId];
      if (club) {
        updatedClubs[player.clubId] = {
          ...club,
          playerIds: [...club.playerIds, player.id],
        };
      }
    }
  }

  // ---- Youth aging: apply pool updates and retirements every tick ----
  if (tickResult.youthAgingResult) {
    for (const [id, youth] of Object.entries(tickResult.youthAgingResult.updatedUnsignedYouth)) {
      youthPool[id] = youth;
    }
    for (const rid of tickResult.youthAgingResult.retired) {
      delete youthPool[rid];
    }
  }

  // ---- Gut feelings ----
  const updatedGutFeelings = [
    ...state.gutFeelings,
    ...(tickResult.gutFeelings ?? []),
  ];

  // ---- Accumulated retired player IDs ----
  const updatedRetiredPlayerIds = [
    ...state.retiredPlayerIds,
    ...(tickResult.playerRetirements?.retiredPlayerIds ?? []),
    ...(tickResult.youthAgingResult?.retired ?? []),
  ];

  // ---- Alumni records update (F12: contact promotions + season summaries) ----
  let updatedAlumniRecords = tickResult.alumniRecords ?? state.alumniRecords;

  // F3 + F12: Apply F3 contact network updates first, then merge alumni promotions.
  let updatedContacts = tickResult.updatedContacts
    ? { ...tickResult.updatedContacts }
    : { ...state.contacts };
  if (tickResult.alumniContactPromotions) {
    for (const promo of tickResult.alumniContactPromotions) {
      updatedContacts[promo.contact.id] = promo.contact;
    }
  }

  // ---- Discipline: apply updated disciplinary records and sync to players ----
  let updatedDisciplinaryRecords = tickResult.updatedDisciplinaryRecords ?? (state.disciplinaryRecords ?? {});

  // Sync disciplinary records onto players for quick access
  for (const [playerId, record] of Object.entries(updatedDisciplinaryRecords)) {
    const player = updatedPlayers[playerId];
    if (player) {
      updatedPlayers[playerId] = { ...player, disciplinaryRecord: record };
    }
  }

  // ---- Scout updates ----
  // Board directive evaluation may add an additional reputation change (tier 5).
  // Note: fatigue recovery is handled by the calendar system (applyWeekResults),
  // so we only apply reputation changes here.
  // Difficulty multiplier scales reputation gains/losses.
  // Season event effects may also modify scout reputation and fatigue.
  const diffMods = getDifficultyModifiers(state.difficulty);
  const boardReputationChange = tickResult.boardDirectiveResult?.reputationChange ?? 0;
  const rawRepChange = tickResult.reputationChange + boardReputationChange;
  const scaledRepChange = Math.round(rawRepChange * diffMods.reputationMultiplier);
  const seasonScout = tickResult.seasonEventState?.scout ?? state.scout;
  const updatedScout = {
    ...seasonScout,
    reputation: clamp(
      seasonScout.reputation + scaledRepChange,
      0,
      100,
    ),
  };

  // ---- A4: Satisfaction history: accumulate deltas with a rolling cap ----
  let allDeltas: BoardSatisfactionDelta[] = [...tickResult.satisfactionDeltas];

  // Add board directive reputation change as a satisfaction delta (tier 5)
  if (boardReputationChange !== 0 && tickResult.boardDirectiveResult) {
    const { completed, failed } = tickResult.boardDirectiveResult;
    if (completed.length > 0) {
      allDeltas.push({
        reason: `Board directive${completed.length !== 1 ? "s" : ""} completed`,
        delta: completed.reduce((s, d) => s + d.rewardReputation, 0),
        week: state.currentWeek,
        season: state.currentSeason,
      });
    }
    if (failed.length > 0) {
      allDeltas.push({
        reason: `Board directive${failed.length !== 1 ? "s" : ""} failed`,
        delta: -failed.reduce((s, d) => s + d.penaltyReputation, 0),
        week: state.currentWeek,
        season: state.currentSeason,
      });
    }
  }

  // Keep only deltas with a non-zero change
  allDeltas = allDeltas.filter((d) => d.delta !== 0);

  // Merge with existing history, cap at most recent entries (~10 weeks of data)
  const MAX_SATISFACTION_HISTORY = 30; // ~10 weeks * ~3 entries/week
  const updatedSatisfactionHistory = [
    ...(state.satisfactionHistory ?? []),
    ...allDeltas,
  ].slice(-MAX_SATISFACTION_HISTORY);

  // ---- Board profile & reactions (F10) ----
  const updatedBoardProfile = tickResult.updatedBoardProfile ?? state.boardProfile;
  const updatedBoardReactions = [
    ...(state.boardReactions ?? []),
    ...(tickResult.boardReactions ?? []),
  ];

  // ---- Regional knowledge (F13) ----
  const updatedRegionalKnowledge = tickResult.regionalKnowledgeResult
    ? tickResult.regionalKnowledgeResult.regionalKnowledge
    : (state.regionalKnowledge ?? {});

  // ---- Inbox ----
  const updatedInbox = [...state.inbox, ...tickResult.newMessages];

  // ---- Advance week or season ----
  let nextWeek = state.currentWeek + 1;
  let nextSeason = state.currentSeason;

  if (tickResult.endOfSeasonTriggered) {
    nextWeek = 1;
    nextSeason = state.currentSeason + 1;

    // Age all players by 1 year at season end
    for (const [id, player] of Object.entries(updatedPlayers)) {
      updatedPlayers[id] = { ...player, age: player.age + 1 };
    }

    // Age unsigned youth +1 year at season end
    // (youthAgingResult pool updates and retirements were already applied above)
    for (const [id, youth] of Object.entries(youthPool)) {
      youthPool[id] = {
        ...youth,
        player: { ...youth.player, age: youth.player.age + 1 },
      };
    }

    // Update season in all leagues
    const updatedLeagues = { ...state.leagues };
    for (const [id, league] of Object.entries(updatedLeagues)) {
      updatedLeagues[id] = { ...league, season: nextSeason };
    }

    // Clear season cards at end of season
    updatedDisciplinaryRecords = clearSeasonCards(updatedDisciplinaryRecords, nextSeason);

    return {
      ...state,
      fixtures: updatedFixtures,
      players: updatedPlayers,
      clubs: updatedClubs,
      leagues: updatedLeagues,
      scout: updatedScout,
      inbox: updatedInbox,
      contacts: updatedContacts,
      npcScouts: updatedNPCScouts,
      npcReports: updatedNPCReports,
      currentWeek: nextWeek,
      currentSeason: nextSeason,
      totalWeeksPlayed: state.totalWeeksPlayed + 1,
      lastSaved: state.lastSaved, // caller should update this on actual save
      schedule: {
        week: nextWeek,
        season: nextSeason,
        activities: Array(7).fill(null) as null[],
        completed: false,
      },
      unsignedYouth: youthPool,
      seasonEvents: generateSeasonEvents(nextSeason),
      gutFeelings: updatedGutFeelings,
      retiredPlayerIds: updatedRetiredPlayerIds,
      alumniRecords: updatedAlumniRecords,
      matchRatings: updatedMatchRatings,
      regionalKnowledge: updatedRegionalKnowledge,
      disciplinaryRecords: updatedDisciplinaryRecords,
      activeNegotiations: tickResult.updatedNegotiations ?? state.activeNegotiations ?? [],
      boardProfile: updatedBoardProfile,
      boardReactions: updatedBoardReactions,
      satisfactionHistory: updatedSatisfactionHistory,
    };
  }

  return {
    ...state,
    fixtures: updatedFixtures,
    players: updatedPlayers,
    clubs: updatedClubs,
    scout: updatedScout,
    inbox: updatedInbox,
    contacts: updatedContacts,
    npcScouts: updatedNPCScouts,
    npcReports: updatedNPCReports,
    currentWeek: nextWeek,
    currentSeason: nextSeason,
    totalWeeksPlayed: state.totalWeeksPlayed + 1,
    lastSaved: state.lastSaved,
    schedule: {
      week: nextWeek,
      season: nextSeason,
      activities: Array(7).fill(null) as null[],
      completed: false,
    },
    unsignedYouth: youthPool,
    gutFeelings: updatedGutFeelings,
    retiredPlayerIds: updatedRetiredPlayerIds,
    alumniRecords: updatedAlumniRecords,
    matchRatings: updatedMatchRatings,
    regionalKnowledge: updatedRegionalKnowledge,
    disciplinaryRecords: updatedDisciplinaryRecords,
    activeNegotiations: tickResult.updatedNegotiations ?? state.activeNegotiations ?? [],
    boardProfile: updatedBoardProfile,
    boardReactions: updatedBoardReactions,
    satisfactionHistory: updatedSatisfactionHistory,
  };
}
