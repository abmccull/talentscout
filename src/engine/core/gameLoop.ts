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
} from "./types";
import {
  processNPCScoutingWeek,
  restNPCScout,
  evaluateBoardDirectives,
} from "../career/index";
import {
  processYouthAging,
  processPlayerRetirement,
} from "../youth/generation";
import { processAlumniWeek } from "../youth/alumni";
import { generateSeasonEvents } from "./seasonEvents";

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
}

export interface SimulatedFixture extends Fixture {
  played: true;
  homeGoals: number;
  awayGoals: number;
  attendance: number;
  weather: Weather;
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
  transfers: Transfer[];
  injuries: InjuryResult[];
  newMessages: InboxMessage[];
  reputationChange: number;
  /** Whether end-of-season processing was triggered this tick. */
  endOfSeasonTriggered: boolean;
  /** Per-NPC-scout results: updated scouts and any new reports (tier 4+). */
  npcScoutResults: NPCScoutWeekResult[];
  /** Board directive evaluation result, set only at season-end for tier 5. */
  boardDirectiveResult?: BoardDirectiveEvaluationResult;
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
): number {
  if (club.playerIds.length === 0) return 100;

  let found = 0;
  const total = club.playerIds.reduce((sum, pid) => {
    const p = players[pid];
    if (p) {
      found++;
      return sum + p.currentAbility;
    }
    return sum;
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
): SimulatedFixture {
  const homeClub = clubs[fixture.homeClubId];
  const awayClub = clubs[fixture.awayClubId];

  const weather = pickWeather(rng);
  const weatherMod = weatherAbilityModifier(weather);

  const homeAbility = homeClub
    ? clubAverageAbility(homeClub, players) * weatherMod
    : 100;
  const awayAbility = awayClub
    ? clubAverageAbility(awayClub, players) * weatherMod
    : 100;

  // Home advantage: ~0.3 expected goals bonus
  const homeAdvantage = 0.3;

  // Expected goals: ratio-based, tuned so roughly 2.6 goals per game on average
  const totalAbility = homeAbility + awayAbility;
  const homeExpected = (homeAbility / totalAbility) * 2.6 + homeAdvantage;
  const awayExpected = (awayAbility / totalAbility) * 2.6;

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

  return {
    ...fixture,
    played: true,
    homeGoals,
    awayGoals,
    attendance,
    weather,
  };
}

/**
 * Simulate all unplayed fixtures for the current week across all leagues.
 */
function simulateWeekFixtures(
  state: GameState,
  rng: RNG,
): SimulatedFixture[] {
  const results: SimulatedFixture[] = [];

  for (const fixture of Object.values(state.fixtures)) {
    if (fixture.week === state.currentWeek && !fixture.played) {
      results.push(
        simulateFixture(fixture, state.clubs, state.players, rng),
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
  rng: RNG,
): PlayerDevelopmentResult {
  const mult = developmentMultiplier(player.age, player.developmentProfile, rng);

  // Weekly development chance — only ~15% of weeks produce an attribute tick
  // to simulate monthly granularity in a weekly tick system.
  const developmentChance = 0.15;
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
 * Process development for all players in the world.
 * Only processes young players (under 32) for performance reasons;
 * older players have stable or predictably declining attributes.
 */
function processPlayerDevelopment(
  state: GameState,
  rng: RNG,
): PlayerDevelopmentResult[] {
  const results: PlayerDevelopmentResult[] = [];

  for (const player of Object.values(state.players)) {
    // Skip heavily injured players — no development during long-term injury
    if (player.injuryWeeksRemaining > 6) continue;
    // Skip players past their useful development window
    if (player.age > 35) continue;

    const result = computePlayerDevelopment(player, rng);

    // Only include results that actually have changes
    const hasChanges =
      Object.keys(result.changes).length > 0 || result.abilityChange !== 0;

    if (hasChanges) {
      results.push(result);
    }
  }

  return results;
}

// =============================================================================
// INJURIES
// =============================================================================

/**
 * Compute injury probability for a player based on their attributes.
 * Players with high injuryProneness hidden attribute have higher base risk.
 * Already-injured players are skipped.
 */
function computeInjuryProbability(player: Player): number {
  if (player.injured) return 0;

  const proneness = player.attributes.injuryProneness ?? 10; // 1–20
  // proneness 1 = safest (0.5x), proneness 20 = most risk (2.5x)
  const pronenessMultiplier = 0.5 + (proneness / 20) * 2;
  return BASE_INJURY_PROBABILITY * pronenessMultiplier;
}

/**
 * Generate a random injury duration in weeks.
 * Most injuries are short (1–3 weeks); serious ones (4–12 weeks) are rarer.
 */
function generateInjuryDuration(rng: RNG): number {
  return rng.pickWeighted([
    { item: 1, weight: 40 },
    { item: 2, weight: 25 },
    { item: 3, weight: 15 },
    { item: 4, weight: 8 },
    { item: 6, weight: 6 },
    { item: 8, weight: 4 },
    { item: 12, weight: 2 },
  ]);
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
      newInjuries.push({
        playerId: player.id,
        weeksOut: generateInjuryDuration(rng),
      });
    }
  }

  return newInjuries;
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
 */
function maybeGenerateAssignment(
  state: GameState,
  rng: RNG,
): InboxMessage | null {
  // Only employed scouts receive assignments
  if (!state.scout.currentClubId) return null;
  // ~30% chance per week of receiving a new assignment
  if (!rng.chance(0.3)) return null;

  const club = state.clubs[state.scout.currentClubId];
  if (!club) return null;

  // Pick a random player from the world to scout (not already reported)
  const allPlayerIds = Object.keys(state.players);
  const alreadyReported = new Set(
    Object.values(state.reports).map((r) => r.playerId),
  );
  const unreported = allPlayerIds.filter((id) => !alreadyReported.has(id));
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

    messages.push({
      id: makeMessageId("injury", rng),
      week: state.currentWeek,
      season: state.currentSeason,
      type: "news",
      title: `Injury: ${player.firstName} ${player.lastName} out for ${injury.weeksOut} weeks`,
      body: `${player.firstName} ${player.lastName} has picked up an injury and will be sidelined for approximately ${injury.weeksOut} weeks. Any current reports on this player may need revising.`,
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
 * Compute reputation change for the scout this week.
 * Driven by: reports submitted (quality), table-pounds, successful finds.
 *
 * This is a lightweight heuristic — full reputation calculation happens
 * at the end of season performance review. Weekly changes are small.
 */
function computeReputationChange(state: GameState): number {
  // Small passive reputation decay to prevent stagnation
  // Active reputation gains come from submitting quality reports
  const seasonLength = getSeasonLength(state.fixtures);
  const recentReports = Object.values(state.reports).filter(
    (r) => {
      if (r.submittedWeek === state.currentWeek - 1 && r.submittedSeason === state.currentSeason) {
        return true;
      }
      // Cross-season boundary: week 1 should also check last week of previous season
      if (state.currentWeek === 1 && r.submittedWeek === seasonLength && r.submittedSeason === state.currentSeason - 1) {
        return true;
      }
      return false;
    },
  );

  if (recentReports.length === 0) return 0;

  const avgQuality =
    recentReports.reduce((sum, r) => sum + r.qualityScore, 0) /
    recentReports.length;

  // High quality reports (>75) earn small reputation gains
  if (avgQuality >= 75) return 1;
  if (avgQuality >= 50) return 0;
  return -1; // Low quality reports hurt reputation
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
  // 1. Simulate fixtures
  const fixturesPlayed = simulateWeekFixtures(state, rng);

  // 2. Check if standings changed (they did if any fixtures were played)
  const standingsUpdated = fixturesPlayed.length > 0;

  // 3. Player development
  const playerDevelopment = processPlayerDevelopment(state, rng);

  // 4. AI transfers
  const transfers = processAITransfers(state, rng);

  // 5. Injuries
  const injuries = processInjuries(state, rng);

  // 6. Inbox messages (after computing transfers and injuries so we can ref them)
  const endOfSeasonTriggered = isEndOfSeason(state.currentWeek, state.fixtures);
  const newMessages = generateInboxMessages(state, transfers, injuries, rng);

  if (endOfSeasonTriggered) {
    newMessages.push(generateEndOfSeasonMessage(state, rng));
  }

  // 7. Reputation change
  const reputationChange = computeReputationChange(state);

  // 8. NPC scout processing (tier 4+): assigned scouts generate reports,
  //    unassigned scouts recover fatigue via rest.
  const npcScoutResults = processNPCScouts(state, rng);

  // 9. Manager event messages (tier 4+): periodic meeting reminders and
  //    low-trust warnings. Appended after primary messages are generated.
  const managerMessages = generateManagerMessages(state, rng);
  newMessages.push(...managerMessages);

  // 10. Board directive evaluation (tier 5, season-end only).
  const boardDirectiveResult = evaluateBoardDirectivesForTick(state, endOfSeasonTriggered);

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

  // 13. Alumni milestone tracking
  const alumniResult = processAlumniWeek(
    rng,
    state.alumniRecords,
    state.players,
    state.clubs,
    state.currentWeek,
    state.currentSeason,
  );

  // Merge alumni messages into inbox messages
  newMessages.push(...alumniResult.newMessages);

  return {
    fixturesPlayed,
    standingsUpdated,
    playerDevelopment,
    transfers,
    injuries,
    newMessages,
    reputationChange,
    endOfSeasonTriggered,
    npcScoutResults,
    boardDirectiveResult,
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
    alumniRecords: alumniResult.updatedAlumni,
    gutFeelings: undefined, // generated during observation processing in store
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

  // ---- Injuries: apply new injuries and decrement existing ones ----
  // First, decrement existing injury timers
  for (const [id, player] of Object.entries(updatedPlayers)) {
    if (player.injured && player.injuryWeeksRemaining > 0) {
      const newRemaining = player.injuryWeeksRemaining - 1;
      updatedPlayers[id] = {
        ...player,
        injuryWeeksRemaining: newRemaining,
        injured: newRemaining > 0,
      };
    }
  }

  // Apply new injuries
  const newlyInjuredPlayerIds = new Set<string>();
  for (const injury of tickResult.injuries) {
    const player = updatedPlayers[injury.playerId];
    if (!player) continue;
    newlyInjuredPlayerIds.add(injury.playerId);
    updatedPlayers[injury.playerId] = {
      ...player,
      injured: true,
      injuryWeeksRemaining: injury.weeksOut,
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

  // ---- Alumni records update ----
  const updatedAlumniRecords = tickResult.alumniRecords ?? state.alumniRecords;

  // ---- Scout updates ----
  // Board directive evaluation may add an additional reputation change (tier 5).
  // Note: fatigue recovery is handled by the calendar system (applyWeekResults),
  // so we only apply reputation changes here.
  const boardReputationChange = tickResult.boardDirectiveResult?.reputationChange ?? 0;
  const updatedScout = {
    ...state.scout,
    reputation: clamp(
      state.scout.reputation + tickResult.reputationChange + boardReputationChange,
      0,
      100,
    ),
  };

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

    return {
      ...state,
      fixtures: updatedFixtures,
      players: updatedPlayers,
      clubs: updatedClubs,
      leagues: updatedLeagues,
      scout: updatedScout,
      inbox: updatedInbox,
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
    };
  }

  return {
    ...state,
    fixtures: updatedFixtures,
    players: updatedPlayers,
    clubs: updatedClubs,
    scout: updatedScout,
    inbox: updatedInbox,
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
  };
}
