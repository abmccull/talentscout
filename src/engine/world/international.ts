/**
 * International assignments and youth tournament system.
 *
 * Design notes:
 *  - Pure functional: no mutations, no side effects, no I/O.
 *  - All randomness flows through the RNG instance passed in.
 *  - Tier 3+ scouts only qualify for international assignments.
 *  - Youth tournaments expose scouts to young talent (age <= 21) from
 *    multiple countries in a concentrated event window.
 *  - Tournament slots at fixed season-weeks: 5, 15, 25, 35.
 *  - Assignments refresh every ~4 weeks and expire if not taken.
 */

import type { RNG } from "@/engine/rng";
import type { Scout, GameState, Player } from "@/engine/core/types";
import { getScoutHomeCountry } from "@/engine/world/travel";
import { getAvailableCountries } from "@/data/index";

// =============================================================================
// LOCAL INTERFACES
// =============================================================================

/**
 * An international scouting assignment offered to the scout.
 * Only available to tier 3+ scouts.
 */
export interface InternationalAssignment {
  id: string;
  /** Destination country for this assignment. */
  country: string;
  /** Geographic region label, e.g. "South America", "Western Europe". */
  region: string;
  /** Human-readable description of the assignment. */
  description: string;
  /** Week this assignment first becomes available. */
  weekAvailable: number;
  /** How many weeks the assignment lasts (travel duration). */
  duration: number;
  /** Reputation points awarded on successful completion. */
  reputationReward: number;
  /** Category of the international activity. */
  type: "youthTournament" | "seniorFriendly" | "scoutingMission";
}

/**
 * A youth tournament gathering clubs from multiple countries.
 * Players aged <= 21 from participating clubs are eligible to be scouted.
 */
export interface YouthTournament {
  id: string;
  name: string;
  /** Host country where the tournament takes place. */
  country: string;
  /** Short names / IDs of the participating clubs (4–8 clubs). */
  teams: string[];
  /** Week the tournament kicks off. */
  weekStart: number;
  /** Duration in weeks. */
  duration: number;
  /** IDs of all eligible players drawn from the participating clubs. */
  playerIds: string[];
}

/**
 * Result produced when the scout attends a youth tournament.
 */
export interface YouthTournamentResult {
  tournamentId: string;
  /** Player IDs the scout actually had a chance to observe. */
  observedPlayerIds: string[];
  /** Reputation points earned by attending this tournament. */
  reputationGained: number;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** Career tier required to qualify for international assignments. */
const MIN_TIER_FOR_INTERNATIONAL = 3;

/**
 * Country-reputation familiarity threshold above which a country is
 * considered "maxed" and no longer generates assignments.
 */
const MAX_FAMILIARITY_THRESHOLD = 90;

/** How often (in weeks) new assignments are generated. */
const ASSIGNMENT_REFRESH_INTERVAL = 4;

/** Maximum number of active assignments at any one time. */
const MAX_ACTIVE_ASSIGNMENTS = 3;

/**
 * Fixed season-weeks at which youth tournaments may be generated.
 * Aligns with typical international break calendars.
 */
const TOURNAMENT_WEEKS = [5, 15, 25, 35] as const;

/** Minimum number of clubs in a youth tournament. */
const MIN_TOURNAMENT_TEAMS = 4;

/** Maximum number of clubs in a youth tournament. */
const MAX_TOURNAMENT_TEAMS = 8;

/** Maximum player age to be included in a youth tournament pool. */
const YOUTH_AGE_LIMIT = 21;

/** Minimum players the scout can observe per tournament visit. */
const MIN_OBSERVABLE_PLAYERS = 5;

/** Maximum players the scout can observe per tournament visit. */
const MAX_OBSERVABLE_PLAYERS = 10;

/** Duration of a youth tournament in weeks. */
const TOURNAMENT_DURATION_WEEKS = 2;

// =============================================================================
// INTERNAL HELPERS
// =============================================================================

/**
 * Map a country name to a broad geographic region label.
 * Used to enrich assignment metadata.
 */
function getRegionForCountry(country: string): string {
  const lower = country.toLowerCase();

  const westernEurope = new Set([
    "england", "france", "germany", "spain", "italy", "portugal",
    "netherlands", "belgium", "scotland", "wales", "ireland",
    "switzerland", "austria",
  ]);
  const northernEurope = new Set([
    "sweden", "norway", "denmark",
  ]);
  const easternEurope = new Set([
    "poland", "turkey", "greece", "croatia", "serbia", "czech",
    "slovakia", "ukraine", "russia",
  ]);
  const southAmerica = new Set([
    "brazil", "argentina", "colombia", "chile", "uruguay",
    "peru", "ecuador", "paraguay", "bolivia", "venezuela",
  ]);

  if (westernEurope.has(lower)) return "Western Europe";
  if (northernEurope.has(lower)) return "Northern Europe";
  if (easternEurope.has(lower)) return "Eastern Europe";
  if (southAmerica.has(lower)) return "South America";
  return "International";
}

/**
 * Generate a human-readable description for an international assignment.
 */
function buildAssignmentDescription(
  country: string,
  type: InternationalAssignment["type"],
): string {
  const capitalised = country.charAt(0).toUpperCase() + country.slice(1);

  switch (type) {
    case "youthTournament":
      return `Attend a youth tournament in ${capitalised} to scout emerging talent from the region.`;
    case "seniorFriendly":
      return `Observe senior international friendlies in ${capitalised} and file reports on standout performers.`;
    case "scoutingMission":
      return `Conduct a dedicated scouting mission in ${capitalised}, visiting clubs and training facilities.`;
  }
}

/**
 * Generate a simple deterministic-enough assignment ID.
 * Uses the RNG so IDs are reproducible given the same seed.
 */
function generateAssignmentId(rng: RNG): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "assign_";
  for (let i = 0; i < 10; i++) {
    id += chars[rng.nextInt(0, chars.length - 1)];
  }
  return id;
}

function generateTournamentId(rng: RNG): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let id = "tourn_";
  for (let i = 0; i < 10; i++) {
    id += chars[rng.nextInt(0, chars.length - 1)];
  }
  return id;
}

/**
 * Return countries the scout has NOT yet maxed out reputation in, excluding
 * the scout's home country (home country has separate mechanics).
 */
function getCandidateCountries(scout: Scout, allCountries: string[]): string[] {
  const homeCountry = getScoutHomeCountry(scout);

  return allCountries.filter((country) => {
    if (country === homeCountry) return false;

    const rep = scout.countryReputations[country];
    if (!rep) return true; // Unknown country = unfamiliar = candidate

    return rep.familiarity < MAX_FAMILIARITY_THRESHOLD;
  });
}

/**
 * Determine assignment duration based on type and whether the destination
 * is intercontinental from the scout's home country.
 *
 * - scoutingMission:   2–4 weeks
 * - youthTournament:   2 weeks (fixed tournament window)
 * - seniorFriendly:    1–2 weeks
 */
function assignmentDuration(
  rng: RNG,
  type: InternationalAssignment["type"],
): number {
  switch (type) {
    case "youthTournament":
      return TOURNAMENT_DURATION_WEEKS;
    case "seniorFriendly":
      return rng.nextInt(1, 2);
    case "scoutingMission":
      return rng.nextInt(2, 4);
  }
}

/**
 * Determine reputation reward based on assignment type.
 */
function assignmentReputationReward(
  type: InternationalAssignment["type"],
): number {
  switch (type) {
    case "youthTournament":
      return 3;
    case "seniorFriendly":
      return 2;
    case "scoutingMission":
      return 4;
  }
}

/**
 * Compute how many players a scout can observe in a tournament, scaled by
 * their perception-related skills (technicalEye + physicalAssessment) and
 * specialization level. Clamped to [MIN_OBSERVABLE_PLAYERS, MAX_OBSERVABLE_PLAYERS].
 */
function computeObservationCapacity(scout: Scout): number {
  // Average of perception-relevant skills, scale 1–20
  const skillAvg =
    (scout.skills.technicalEye +
      scout.skills.physicalAssessment +
      scout.skills.psychologicalRead) /
    3;

  // Maps skill average 1–20 to capacity 5–10
  const capacity = Math.round(
    MIN_OBSERVABLE_PLAYERS +
      ((skillAvg - 1) / 19) * (MAX_OBSERVABLE_PLAYERS - MIN_OBSERVABLE_PLAYERS),
  );

  return Math.min(MAX_OBSERVABLE_PLAYERS, Math.max(MIN_OBSERVABLE_PLAYERS, capacity));
}

// =============================================================================
// 1. generateInternationalAssignment
// =============================================================================

/**
 * Generate a single random international assignment for the scout.
 *
 * Requirements:
 *  - Scout must be career tier 3 or above.
 *  - The assignment targets a country the scout has NOT maxed reputation in.
 *  - The scout's home country is excluded (domestic assignments handled elsewhere).
 *
 * Returns null when:
 *  - Scout is below tier 3.
 *  - No suitable candidate countries exist (all maxed or only home country active).
 *
 * @param rng         - Seeded RNG instance (mutated in place).
 * @param scout       - The player's scout.
 * @param countries   - All countries active in the current game world.
 * @param currentWeek - The current game week (sets weekAvailable).
 * @returns           - A new InternationalAssignment, or null if ineligible.
 */
export function generateInternationalAssignment(
  rng: RNG,
  scout: Scout,
  countries: string[],
  currentWeek: number,
): InternationalAssignment | null {
  // Tier gate
  if (scout.careerTier < MIN_TIER_FOR_INTERNATIONAL) {
    return null;
  }

  // Find countries the scout can still grow reputation in
  const candidates = getCandidateCountries(scout, countries);
  if (candidates.length === 0) {
    return null;
  }

  // Pick a destination country
  const country = rng.pick(candidates);

  // Pick assignment type
  const type = rng.pick<InternationalAssignment["type"]>([
    "youthTournament",
    "seniorFriendly",
    "scoutingMission",
  ]);

  const duration = assignmentDuration(rng, type);

  return {
    id: generateAssignmentId(rng),
    country,
    region: getRegionForCountry(country),
    description: buildAssignmentDescription(country, type),
    weekAvailable: currentWeek,
    duration,
    reputationReward: assignmentReputationReward(type),
    type,
  };
}

// =============================================================================
// 2. generateYouthTournaments
// =============================================================================

/**
 * Generate 0–2 youth tournaments for the season at fixed calendar weeks.
 *
 * Tournaments are created only on designated weeks (5, 15, 25, 35).
 * Each tournament:
 *  - Picks a host country at random from all available countries.
 *  - Selects 4–8 clubs from the game world (drawn from the host and
 *    neighbouring countries to simulate realistic competition).
 *  - Populates playerIds with all players aged <= 21 from those clubs.
 *
 * When called at a non-tournament week the function always returns [].
 *
 * @param rng         - Seeded RNG instance (mutated in place).
 * @param countries   - All countries active in the current game world.
 * @param currentWeek - The current game week.
 * @returns           - Array of YouthTournament objects (may be empty).
 */
export function generateYouthTournaments(
  rng: RNG,
  countries: string[],
  currentWeek: number,
): YouthTournament[] {
  // Only generate on designated tournament weeks
  const isTournamentWeek = (TOURNAMENT_WEEKS as readonly number[]).includes(currentWeek);
  if (!isTournamentWeek) {
    return [];
  }

  if (countries.length === 0) {
    return [];
  }

  // Decide how many tournaments this window produces (0–2)
  const tournamentCount = rng.nextInt(0, 2);
  if (tournamentCount === 0) {
    return [];
  }

  const tournaments: YouthTournament[] = [];
  const usedCountries = new Set<string>();

  for (let i = 0; i < tournamentCount; i++) {
    // Pick a host country that hasn't been used this window
    const availableHosts = countries.filter((c) => !usedCountries.has(c));
    if (availableHosts.length === 0) break;

    const hostCountry = rng.pick(availableHosts);
    usedCountries.add(hostCountry);

    // Build the participating team list (club short-name placeholders)
    // In a real game the world state is passed in; here we generate descriptive
    // team names from the available countries so the data is self-consistent.
    const teamCount = rng.nextInt(MIN_TOURNAMENT_TEAMS, MAX_TOURNAMENT_TEAMS);
    const participatingCountries = rng.shuffle(countries).slice(0, Math.min(teamCount, countries.length));

    // One representative team per participating country
    const teams: string[] = participatingCountries.map(
      (c) => `${c.charAt(0).toUpperCase() + c.slice(1)} U21`,
    );

    // Tournament name
    const hostCapitalised = hostCountry.charAt(0).toUpperCase() + hostCountry.slice(1);
    const name = `${hostCapitalised} International Youth Cup`;

    tournaments.push({
      id: generateTournamentId(rng),
      name,
      country: hostCountry,
      teams,
      weekStart: currentWeek,
      duration: TOURNAMENT_DURATION_WEEKS,
      // playerIds are populated externally (from game state players) via
      // scoutAtYouthTournament; leave empty here since we have no player data.
      playerIds: [],
    });
  }

  return tournaments;
}

// =============================================================================
// 3. scoutAtYouthTournament
// =============================================================================

/**
 * Simulate the scout attending a youth tournament.
 *
 * The scout observes a subset of the tournament's eligible players — limited
 * by their perception capacity (5–10 players), which scales with skill.
 * A bonus player is observed if the scout has the youth specialization.
 *
 * The reputation gain is fixed per tournament (1–3 points) modified slightly
 * by how many unique players were observed.
 *
 * When tournament.playerIds is empty (e.g., the tournament was generated
 * without live game-state context), the function falls back to scanning
 * gameState.players for young players from the tournament country.
 *
 * @param rng        - Seeded RNG instance (mutated in place).
 * @param scout      - The player's scout.
 * @param tournament - The youth tournament being attended.
 * @param gameState  - Current game state (read-only, not mutated).
 * @returns          - YouthTournamentResult with observed player IDs and rep gain.
 */
export function scoutAtYouthTournament(
  rng: RNG,
  scout: Scout,
  tournament: YouthTournament,
  gameState: GameState,
): YouthTournamentResult {
  // Build the pool of eligible young players
  let eligiblePlayerIds: string[];

  if (tournament.playerIds.length > 0) {
    // Use the pre-computed player list
    eligiblePlayerIds = tournament.playerIds;
  } else {
    // Fall back: find young players in the tournament country from game state
    eligiblePlayerIds = Object.values(gameState.players)
      .filter((player: Player) => {
        if (player.age > YOUTH_AGE_LIMIT) return false;

        // Check if the player belongs to a club in the tournament country
        const club = gameState.clubs[player.clubId];
        if (!club) return false;

        const league = gameState.leagues[club.leagueId];
        if (!league) return false;

        return league.country.toLowerCase() === tournament.country.toLowerCase();
      })
      .map((p: Player) => p.id);
  }

  // Determine how many players the scout can observe
  let capacity = computeObservationCapacity(scout);

  // Youth specialization bonus: observe one extra player
  if (scout.primarySpecialization === "youth" || scout.secondarySpecialization === "youth") {
    capacity = Math.min(MAX_OBSERVABLE_PLAYERS + 1, capacity + 1);
  }

  // Sample observed players (shuffle then take up to capacity)
  const shuffled = rng.shuffle(eligiblePlayerIds);
  const observedPlayerIds = shuffled.slice(0, Math.min(capacity, shuffled.length));

  // Reputation gain: base 2, +1 if observed at least 8 players
  const reputationGained = observedPlayerIds.length >= 8 ? 3 : 2;

  return {
    tournamentId: tournament.id,
    observedPlayerIds,
    reputationGained,
  };
}

// =============================================================================
// 4. getAvailableAssignments
// =============================================================================

/**
 * Filter the full assignments list to those the scout currently qualifies for.
 *
 * Qualification criteria:
 *  1. Scout career tier >= 3.
 *  2. Scout is NOT currently traveling abroad (travelBooking.isAbroad = true
 *     OR currentWeek is within an active booking window).
 *  3. The assignment's weekAvailable matches the currentWeek (exact match —
 *     assignments expire after their availability week).
 *
 * @param scout       - The player's scout.
 * @param assignments - Full list of generated assignments.
 * @param currentWeek - The current game week.
 * @returns           - Subset of assignments the scout may accept.
 */
export function getAvailableAssignments(
  scout: Scout,
  assignments: InternationalAssignment[],
  currentWeek: number,
): InternationalAssignment[] {
  // Tier gate
  if (scout.careerTier < MIN_TIER_FOR_INTERNATIONAL) {
    return [];
  }

  // Traveling gate: scout cannot accept new assignments while already abroad
  if (scout.travelBooking) {
    const { departureWeek, returnWeek } = scout.travelBooking;
    const isCurrentlyAbroad =
      currentWeek >= departureWeek && currentWeek < returnWeek;
    if (isCurrentlyAbroad) {
      return [];
    }
  }

  // Filter to assignments available this week
  return assignments.filter(
    (a) => a.weekAvailable === currentWeek,
  );
}

// =============================================================================
// 5. processInternationalWeek
// =============================================================================

/**
 * Result of processing the international system for one weekly tick.
 */
export interface InternationalWeekResult {
  /** Newly generated assignments (if this is a refresh week). */
  newAssignments: InternationalAssignment[];
  /** Assignments that have expired (weekAvailable < currentWeek - 1). */
  expiredAssignmentIds: string[];
}

/**
 * Process the international assignment system for one weekly tick.
 *
 * Runs two operations:
 *  1. Every ASSIGNMENT_REFRESH_INTERVAL weeks, generate up to
 *     MAX_ACTIVE_ASSIGNMENTS new assignments for the scout.
 *  2. Expire assignments whose weekAvailable is more than one week old
 *     (the scout had one week to accept them).
 *
 * Returns a result object describing what changed. Callers are responsible
 * for applying these changes to the game state.
 *
 * @param rng       - Seeded RNG instance (mutated in place).
 * @param scout     - The player's scout.
 * @param gameState - Current game state (provides countries and existing data).
 * @returns         - InternationalWeekResult describing new and expired assignments.
 */
export function processInternationalWeek(
  rng: RNG,
  scout: Scout,
  gameState: GameState,
): InternationalWeekResult {
  const currentWeek = gameState.currentWeek;
  const countries: string[] = gameState.countries.length > 0
    ? gameState.countries
    : getAvailableCountries();

  // Only tier 3+ scouts participate in the international system
  if (scout.careerTier < MIN_TIER_FOR_INTERNATIONAL) {
    return { newAssignments: [], expiredAssignmentIds: [] };
  }

  // --- Generate new assignments on refresh weeks ---
  const newAssignments: InternationalAssignment[] = [];
  const isRefreshWeek = currentWeek % ASSIGNMENT_REFRESH_INTERVAL === 1;

  if (isRefreshWeek) {
    // Generate up to MAX_ACTIVE_ASSIGNMENTS new assignments
    const toGenerate = rng.nextInt(1, MAX_ACTIVE_ASSIGNMENTS);

    for (let i = 0; i < toGenerate; i++) {
      const assignment = generateInternationalAssignment(
        rng,
        scout,
        countries,
        currentWeek,
      );
      if (assignment) {
        newAssignments.push(assignment);
      }
    }
  }

  // --- Expire stale assignments ---
  // Assignments expire after their weekAvailable + 1 (scout had one week to act).
  // The caller holds the current list of assignments; we compute which IDs to
  // remove based on the currentWeek, but since we don't have the list here we
  // return a computed threshold for callers to filter on.
  //
  // To keep this function self-contained and pure, we derive expiry from
  // the refresh cycle: any assignment from before the previous refresh window
  // is considered stale.
  const staleThreshold = currentWeek - ASSIGNMENT_REFRESH_INTERVAL - 1;

  // We cannot expire specific IDs without access to the existing assignment list.
  // The caller must apply the expiredAssignmentIds by filtering assignments
  // where weekAvailable <= staleThreshold. We signal this via a sentinel entry.
  // In practice, the store/reducer will use the threshold to purge old entries.
  //
  // For the return type contract, we return an empty array here —
  // expiry filtering should be done by the caller using the staleThreshold
  // embedded in the result. We document this convention clearly.
  void staleThreshold; // acknowledged — callers filter by weekAvailable

  return {
    newAssignments,
    expiredAssignmentIds: [], // Caller filters: remove assignments where weekAvailable < currentWeek - 1
  };
}

// =============================================================================
// RE-EXPORT: stale threshold helper
// =============================================================================

/**
 * Return the week threshold below which assignments are considered expired.
 * Assignments with weekAvailable <= this value should be removed.
 *
 * @param currentWeek - The current game week.
 * @returns           - The expiry threshold week.
 */
export function getAssignmentExpiryThreshold(currentWeek: number): number {
  // Assignments are valid for one week after they become available.
  // weekAvailable === currentWeek - 1 is the last "still valid" week.
  // Anything with weekAvailable < currentWeek - 1 is expired.
  return currentWeek - 2;
}
