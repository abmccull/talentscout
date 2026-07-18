/**
 * Alumni tracking — long-term payoff loop for placed youth.
 *
 * When a scout places an unsigned youth at a club, an alumni record is created.
 * The system then tracks the player's career milestones (first team debut,
 * international callup, wonderkid status) and generates inbox messages when
 * milestones are achieved.
 *
 * F12 extends this with:
 *  - Career update timeline (debut, goals, injury, captaincy, etc.)
 *  - Status tracking (academy, firstTeam, loaned, released, retired, transferred)
 *  - Season-by-season stats generation
 *  - Alumni-to-contact promotion for high-achievers
 *
 * All functions are pure: no side effects, no mutation.
 */

import type { RNG } from "@/engine/rng";
import type {
  AlumniRecord,
  AlumniMilestone,
  AlumniMilestoneType,
  AlumniCareerUpdate,
  AlumniCareerUpdateType,
  AlumniSeasonStats,
  AlumniStatus,
  CareerSnapshot,
  Contact,
  LegacyScore,
  Player,
  Club,
  UnsignedYouth,
  InboxMessage,
} from "@/engine/core/types";

type CanonicalFixtures = Record<string, import("@/engine/core/types").Fixture>;
type CanonicalRatings = Record<string, Record<string, import("@/engine/core/types").PlayerMatchRating>>;

interface CanonicalSeasonTotals {
  appearances: number;
  goals: number;
  assists: number;
  ratingTotal: number;
}

const ALUMNI_SEASON_SUMMARY_CACHE = new WeakMap<
  CanonicalRatings,
  WeakMap<CanonicalFixtures, Map<number, Map<string, CanonicalSeasonTotals>>>
>();

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Build a deterministic message ID using the RNG for entropy.
 * Pattern mirrors gameLoop.ts: `msg_alumni_<6-digit-int>`.
 */
function makeAlumniMessageId(rng: RNG): string {
  return `msg_alumni_${rng.nextInt(100000, 999999)}`;
}

/**
 * Return true if the alumni record already has a milestone of the given type.
 */
function hasMilestone(record: AlumniRecord, type: AlumniMilestoneType): boolean {
  return record.milestones.some((m) => m.type === type);
}

/**
 * Return true if the alumni record already has a career update of the given
 * type in the specified season (to avoid duplicates per season).
 */
function hasCareerUpdateInSeason(
  record: AlumniRecord,
  type: AlumniCareerUpdateType,
  season: number,
): boolean {
  return record.careerUpdates.some(
    (u) => u.type === type && u.season === season,
  );
}

/**
 * Return true if the alumni record already has a career update of the given
 * type at any point (for once-only events like debut).
 */
function hasCareerUpdate(
  record: AlumniRecord,
  type: AlumniCareerUpdateType,
): boolean {
  return record.careerUpdates.some((u) => u.type === type);
}

function getSeasonPlayerTotals(
  season: number,
  fixtures: CanonicalFixtures,
  matchRatings: CanonicalRatings,
): Map<string, CanonicalSeasonTotals> {
  let fixturesCache = ALUMNI_SEASON_SUMMARY_CACHE.get(matchRatings);
  if (!fixturesCache) {
    fixturesCache = new WeakMap();
    ALUMNI_SEASON_SUMMARY_CACHE.set(matchRatings, fixturesCache);
  }

  let seasonCache = fixturesCache.get(fixtures);
  if (!seasonCache) {
    seasonCache = new Map();
    fixturesCache.set(fixtures, seasonCache);
  }

  const cached = seasonCache.get(season);
  if (cached) return cached;

  const totalsByPlayerId = new Map<string, CanonicalSeasonTotals>();
  for (const [fixtureId, fixtureRatings] of Object.entries(matchRatings)) {
    const fixture = fixtures[fixtureId];
    if (!fixture || fixture.played !== true || (fixture.season ?? season) !== season) continue;

    for (const rating of Object.values(fixtureRatings)) {
      if ((rating.minutesPlayed ?? 0) <= 0) continue;
      const current = totalsByPlayerId.get(rating.playerId) ?? {
        appearances: 0,
        goals: 0,
        assists: 0,
        ratingTotal: 0,
      };
      current.appearances += 1;
      current.goals += rating.stats.goals ?? 0;
      current.assists += rating.stats.assists ?? 0;
      current.ratingTotal += rating.rating;
      totalsByPlayerId.set(rating.playerId, current);
    }
  }

  seasonCache.set(season, totalsByPlayerId);
  return totalsByPlayerId;
}

/**
 * Derive the current status of an alumni player based on game state signals.
 */
function deriveAlumniStatus(
  record: AlumniRecord,
  player: Player,
  retiredPlayerIds: string[],
): AlumniStatus {
  // Retired takes priority
  if (retiredPlayerIds.includes(player.id)) {
    return "retired";
  }
  // Player was released (no club or club differs and CA dropped significantly)
  if (!player.clubId) {
    return "released";
  }
  // Transferred — player at a different club from where they were originally placed
  // AND they moved away from the current tracked club
  if (player.clubId !== record.placedClubId && player.clubId !== record.currentClubId) {
    return "transferred";
  }
  // First team breakthrough
  if (player.currentAbility >= 80 && player.age >= 17) {
    return "firstTeam";
  }
  // Still in academy
  return "academy";
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Creates a new alumni record for a placed youth.
 *
 * The record's ID is derived from the youth ID, its milestone and snapshot
 * arrays are empty, and both club fields start as the placement club.
 */
export function createAlumniRecord(
  youth: UnsignedYouth,
  clubId: string,
  week: number,
  season: number,
  source?: {
    caseId?: string;
    placementReportId?: string;
    originatingReportId?: string;
  },
): AlumniRecord {
  return {
    id: `alumni_${youth.id}`,
    caseId: source?.caseId,
    placementReportId: source?.placementReportId,
    originatingReportId: source?.originatingReportId,
    playerId: youth.player.id,
    placedClubId: clubId,
    currentClubId: clubId,
    milestones: [],
    careerSnapshots: [],
    placedWeek: week,
    placedSeason: season,
    careerUpdates: [],
    currentStatus: "academy",
    seasonStats: [],
    becameContact: false,
  };
}

/**
 * Process alumni records for one game week.
 *
 * For each alumni record, checks whether the linked player has hit any new
 * career milestones and, if so, creates the milestone entry and an inbox
 * message to notify the scout.
 *
 * F12 enhancements:
 *  - Generates career updates (debut, firstGoal, injury, captaincy, etc.)
 *  - Tracks current status (academy/firstTeam/loaned/released/retired/transferred)
 *  - Detects alumni eligible for contact promotion
 *
 * Milestone conditions:
 *  - firstTeamDebut:      CA >= 80, age >= 17, not yet awarded
 *  - firstGoal:           CA >= 90, age >= 17, firstTeamDebut already earned,
 *                         15% chance per week
 *  - internationalCallUp: CA >= 120, age <= 23, 5% chance per week
 *  - wonderkidStatus:     PA >= 150, CA >= 100, age <= 21
 *  - transfer:            player.clubId differs from alumni.currentClubId
 *
 * Returns updated records, the new milestones only (for the caller to persist
 * or inspect), and the inbox messages that should be appended to the inbox.
 */
export function processAlumniWeek(
  rng: RNG,
  alumniRecords: AlumniRecord[],
  players: Record<string, Player>,
  clubs: Record<string, Club>,
  week: number,
  season: number,
  retiredPlayerIds?: string[],
): {
  updatedAlumni: AlumniRecord[];
  newMilestones: AlumniMilestone[];
  newMessages: InboxMessage[];
  contactPromotions: Array<{ alumniId: string; contact: Contact }>;
} {
  const updatedAlumni: AlumniRecord[] = [];
  const newMilestones: AlumniMilestone[] = [];
  const newMessages: InboxMessage[] = [];
  const contactPromotions: Array<{ alumniId: string; contact: Contact }> = [];
  const retired = retiredPlayerIds ?? [];

  for (const record of alumniRecords) {
    const player = players[record.playerId];

    if (!player) {
      // Player no longer in world (transferred out of tracked pool, retired
      // before the retiredPlayerIds pass runs, etc.): keep record unchanged.
      updatedAlumni.push(record);
      continue;
    }

    // Accumulate any new milestones discovered this tick.
    const tickMilestones: AlumniMilestone[] = [];
    const tickCareerUpdates: AlumniCareerUpdate[] = [];
    let currentClubId = record.currentClubId;

    // -----------------------------------------------------------------------
    // Transfer check — must run first so currentClubId is up to date for
    // subsequent milestone descriptions.
    // -----------------------------------------------------------------------
    if (!hasMilestone(record, "transfer") || player.clubId !== currentClubId) {
      // We allow multiple transfer milestones (each represents a new move), so
      // re-check even if one was already recorded.
      if (player.clubId !== currentClubId) {
        const newClubName = clubs[player.clubId]?.name ?? "a new club";
        const milestone: AlumniMilestone = {
          type: "transfer",
          week,
          season,
          description: `${player.firstName} ${player.lastName} has moved to ${newClubName}.`,
          notified: false,
        };
        tickMilestones.push(milestone);

        tickCareerUpdates.push({
          week,
          season,
          type: "transfer",
          description: `Transferred to ${newClubName}.`,
        });

        // Update tracked club immediately so descriptions below are accurate.
        currentClubId = player.clubId;
      }
    }

    // -----------------------------------------------------------------------
    // firstTeamDebut
    // -----------------------------------------------------------------------
    if (
      !hasMilestone(record, "firstTeamDebut") &&
      player.currentAbility >= 80 &&
      player.age >= 17
    ) {
      const clubName = clubs[currentClubId]?.name ?? "their club";
      const milestone: AlumniMilestone = {
        type: "firstTeamDebut",
        week,
        season,
        description: `${player.firstName} ${player.lastName} has made their first team debut at ${clubName}, breaking through at age ${player.age}.`,
        notified: false,
      };
      tickMilestones.push(milestone);

      if (!hasCareerUpdate(record, "debut")) {
        tickCareerUpdates.push({
          week,
          season,
          type: "debut",
          description: `Made first team debut at ${clubName} at age ${player.age}.`,
        });
      }
    }

    // -----------------------------------------------------------------------
    // firstGoal — requires firstTeamDebut to have been earned (including any
    // earned in this same tick, hence we check tickMilestones too).
    // -----------------------------------------------------------------------
    const hasDebut =
      hasMilestone(record, "firstTeamDebut") ||
      tickMilestones.some((m) => m.type === "firstTeamDebut");

    if (
      !hasMilestone(record, "firstGoal") &&
      player.currentAbility >= 90 &&
      player.age >= 17 &&
      hasDebut &&
      rng.chance(0.15)
    ) {
      const milestone: AlumniMilestone = {
        type: "firstGoal",
        week,
        season,
        description: `${player.firstName} ${player.lastName} has scored their first professional goal.`,
        notified: false,
      };
      tickMilestones.push(milestone);

      if (!hasCareerUpdate(record, "firstGoal")) {
        tickCareerUpdates.push({
          week,
          season,
          type: "firstGoal",
          description: `Scored their first professional goal.`,
        });
      }
    }

    // -----------------------------------------------------------------------
    // internationalCallUp
    // -----------------------------------------------------------------------
    if (
      !hasMilestone(record, "internationalCallUp") &&
      player.currentAbility >= 120 &&
      player.age <= 23 &&
      rng.chance(0.05)
    ) {
      const milestone: AlumniMilestone = {
        type: "internationalCallUp",
        week,
        season,
        description: `${player.firstName} ${player.lastName} has received their first international call-up at age ${player.age}.`,
        notified: false,
      };
      tickMilestones.push(milestone);

      if (!hasCareerUpdate(record, "internationalCall")) {
        tickCareerUpdates.push({
          week,
          season,
          type: "internationalCall",
          description: `Received first international call-up at age ${player.age}.`,
        });
      }
    }

    // -----------------------------------------------------------------------
    // wonderkidStatus
    // -----------------------------------------------------------------------
    if (
      !hasMilestone(record, "wonderkidStatus") &&
      player.potentialAbility >= 150 &&
      player.currentAbility >= 100 &&
      player.age <= 21
    ) {
      const milestone: AlumniMilestone = {
        type: "wonderkidStatus",
        week,
        season,
        description: `${player.firstName} ${player.lastName} has been recognised as a wonderkid — potential of ${player.potentialAbility} with current ability already at ${player.currentAbility}.`,
        notified: false,
      };
      tickMilestones.push(milestone);
    }

    // -----------------------------------------------------------------------
    // F12: Additional career updates (beyond milestones)
    // -----------------------------------------------------------------------

    // Captaincy — high CA + leadership traits at first team, once per career
    if (
      !hasCareerUpdate(record, "captaincy") &&
      player.currentAbility >= 110 &&
      player.age >= 20 &&
      hasDebut &&
      rng.chance(0.02)
    ) {
      const clubName = clubs[currentClubId]?.name ?? "their club";
      tickCareerUpdates.push({
        week,
        season,
        type: "captaincy",
        description: `Named captain of ${clubName}.`,
      });
    }

    // Team of the Week — once per season, requires first team status
    if (
      !hasCareerUpdateInSeason(record, "teamOfWeek", season) &&
      player.currentAbility >= 90 &&
      hasDebut &&
      rng.chance(0.03)
    ) {
      tickCareerUpdates.push({
        week,
        season,
        type: "teamOfWeek",
        description: `Selected for the Team of the Week.`,
      });
    }

    // Injury update — if player is currently injured and we haven't noted it
    // this season
    if (
      player.injured &&
      !hasCareerUpdateInSeason(record, "injury", season)
    ) {
      const weeksStr = player.injuryWeeksRemaining > 0
        ? ` Expected ${player.injuryWeeksRemaining} weeks out.`
        : "";
      tickCareerUpdates.push({
        week,
        season,
        type: "injury",
        description: `Picked up an injury.${weeksStr}`,
      });
    }

    // -----------------------------------------------------------------------
    // F12: Status derivation
    // -----------------------------------------------------------------------
    const newStatus = deriveAlumniStatus(record, player, retired);

    // -----------------------------------------------------------------------
    // F12: Alumni-to-contact promotion
    // When a placed youth reaches first team + international call-up (or
    // wonderkid status), they can become a contact in the scout's network.
    // -----------------------------------------------------------------------
    let becameContact = record.becameContact;
    if (
      !becameContact &&
      newStatus === "firstTeam" &&
      (hasMilestone(record, "internationalCallUp") ||
        tickMilestones.some((m) => m.type === "internationalCallUp") ||
        hasMilestone(record, "wonderkidStatus") ||
        tickMilestones.some((m) => m.type === "wonderkidStatus"))
    ) {
      becameContact = true;
      const clubName = clubs[currentClubId]?.name ?? "Unknown Club";
      const contact: Contact = {
        id: `contact_alumni_${record.id}`,
        name: `${player.firstName} ${player.lastName}`,
        type: "clubStaff",
        organization: clubName,
        relationship: 60,
        reliability: 55,
        knownPlayerIds: [],
        region: player.nationality ?? undefined,
        country: player.nationality ?? undefined,
      };
      contactPromotions.push({ alumniId: record.id, contact });

      newMessages.push({
        id: makeAlumniMessageId(rng),
        week,
        season,
        type: "event",
        title: `Alumni Graduated: ${player.firstName} ${player.lastName} is now a Contact`,
        body: `Your former placement ${player.firstName} ${player.lastName} has become a well-established professional at ${clubName}. They have joined your contact network and can provide insider information on players at their club.`,
        read: false,
        actionRequired: false,
        relatedId: player.id,
        relatedEntityType: "contact",
      });
    }

    // -----------------------------------------------------------------------
    // Generate inbox messages for every new milestone.
    // -----------------------------------------------------------------------
    for (const milestone of tickMilestones) {
      const milestoneLabel: Record<AlumniMilestoneType, string> = {
        firstTeamDebut: "made their first team debut",
        firstGoal: "scored their first professional goal",
        internationalCallUp: "received an international call-up",
        wonderkidStatus: "has been labelled a wonderkid",
        transfer: "has moved to a new club",
      };

      const message: InboxMessage = {
        id: makeAlumniMessageId(rng),
        week,
        season,
        type: "event",
        title: `Alumni Update: ${player.firstName} ${player.lastName} ${milestoneLabel[milestone.type]}`,
        body: milestone.description,
        read: false,
        actionRequired: false,
        relatedId: player.id,
        relatedEntityType: "player",
      };

      newMessages.push(message);
      newMilestones.push(milestone);
    }

    // Build the updated record (immutably).
    const updatedRecord: AlumniRecord = {
      ...record,
      currentClubId,
      milestones: [...record.milestones, ...tickMilestones],
      careerUpdates: [...record.careerUpdates, ...tickCareerUpdates],
      currentStatus: newStatus,
      becameContact,
    };

    updatedAlumni.push(updatedRecord);
  }

  return { updatedAlumni, newMilestones, newMessages, contactPromotions };
}

/**
 * Append or replace a season snapshot on an alumni record.
 *
 * If a snapshot for the given season already exists it is replaced in-place;
 * otherwise the new snapshot is appended.  The returned record is a new object
 * — the input is not mutated.
 */
export function addAlumniSnapshot(
  record: AlumniRecord,
  player: Player,
  season: number,
): AlumniRecord {
  const snapshot: CareerSnapshot = {
    season,
    clubId: player.clubId,
    currentAbility: player.currentAbility,
    position: player.position,
    age: player.age,
  };

  const existingIndex = record.careerSnapshots.findIndex((s) => s.season === season);

  const careerSnapshots =
    existingIndex >= 0
      ? [
          ...record.careerSnapshots.slice(0, existingIndex),
          snapshot,
          ...record.careerSnapshots.slice(existingIndex + 1),
        ]
      : [...record.careerSnapshots, snapshot];

  return { ...record, careerSnapshots };
}

/**
 * F12: Generate season summary stats for an alumni.
 *
 * Consolidates the same explicit fixture participation used by form, loans,
 * transfers, and season history. No second statistical career is invented.
 *
 * Returns a new record with the season stats appended (or replaced if a
 * summary for that season already exists).
 */
export function generateAlumniSeasonSummary(
  record: AlumniRecord,
  player: Player,
  season: number,
  fixtures: CanonicalFixtures,
  matchRatings: CanonicalRatings,
): AlumniRecord {
  const seasonTotals = getSeasonPlayerTotals(season, fixtures, matchRatings).get(player.id);
  if (!seasonTotals || seasonTotals.appearances === 0) return record;

  const avgRating = seasonTotals.ratingTotal / seasonTotals.appearances;

  const stats: AlumniSeasonStats = {
    season,
    appearances: seasonTotals.appearances,
    goals: seasonTotals.goals,
    assists: seasonTotals.assists,
    avgRating: Math.round(Math.max(1, Math.min(10, avgRating)) * 10) / 10,
    clubId: player.clubId,
    source: "canonicalCompetition",
  };

  // Replace existing season entry or append
  const existingIdx = record.seasonStats.findIndex((s) => s.season === season);
  const seasonStats =
    existingIdx >= 0
      ? [
          ...record.seasonStats.slice(0, existingIdx),
          stats,
          ...record.seasonStats.slice(existingIdx + 1),
        ]
      : [...record.seasonStats, stats];

  return { ...record, seasonStats };
}

/**
 * F12: Check if an alumni is eligible for contact promotion.
 *
 * Criteria: first team status + either international call-up or wonderkid
 * status milestone. Must not have already been promoted.
 */
export function isEligibleForContactPromotion(record: AlumniRecord): boolean {
  if (record.becameContact) return false;
  if (record.currentStatus !== "firstTeam") return false;

  return (
    record.milestones.some(
      (m) => m.type === "internationalCallUp" || m.type === "wonderkidStatus",
    )
  );
}

/**
 * F12: Compute placement success rate for all alumni.
 *
 * Success is defined as reaching firstTeam status or having achieved
 * the firstTeamDebut milestone.
 */
export function calculatePlacementSuccessRate(
  alumniRecords: AlumniRecord[],
): number {
  if (alumniRecords.length === 0) return 0;
  const successes = alumniRecords.filter(
    (r) =>
      r.currentStatus === "firstTeam" ||
      r.milestones.some((m) => m.type === "firstTeamDebut"),
  ).length;
  return Math.round((successes / alumniRecords.length) * 100);
}

/**
 * Derive the scout's legacy score from all alumni records.
 *
 * Scoring formula:
 *   youthFound                  * 5
 *   firstTeamBreakthroughs      * 20
 *   internationalCapsFromFinds  * 50
 *   wonderkid milestones        * 100
 */
export function calculateLegacyScore(alumniRecords: AlumniRecord[]): LegacyScore {
  const youthFound = alumniRecords.length;

  const firstTeamBreakthroughs = alumniRecords.filter((r) =>
    r.milestones.some((m) => m.type === "firstTeamDebut"),
  ).length;

  const internationalCapsFromFinds = alumniRecords.filter((r) =>
    r.milestones.some((m) => m.type === "internationalCallUp"),
  ).length;

  const wonderkidCount = alumniRecords.filter((r) =>
    r.milestones.some((m) => m.type === "wonderkidStatus"),
  ).length;

  const totalScore =
    youthFound * 5 +
    firstTeamBreakthroughs * 20 +
    internationalCapsFromFinds * 50 +
    wonderkidCount * 100;

  return {
    youthFound,
    firstTeamBreakthroughs,
    internationalCapsFromFinds,
    totalScore,
    // Extended fields — populated with defaults here; richer values are
    // computed and stored separately (e.g., in the HallOfFame screen).
    clubsWorkedAt: 0,
    countriesScouted: 0,
    careerHighTier: 0,
    totalSeasons: 0,
    bestDiscoveryName: "",
    bestDiscoveryPA: 0,
    scenariosCompleted: 0,
  };
}

/**
 * Return the reputation bonus the scout earns when a placed alumni hits a
 * given milestone type.
 */
export function calculateAlumniReputationBonus(milestoneType: AlumniMilestoneType): number {
  const bonuses: Record<AlumniMilestoneType, number> = {
    firstTeamDebut: 8,
    firstGoal: 5,
    internationalCallUp: 12,
    wonderkidStatus: 20,
    transfer: 3,
  };
  return bonuses[milestoneType];
}

/**
 * Produce a summary of the scout's alumni pool.
 *
 * activeAlumni counts records whose player ID is still present in the players
 * map (i.e. has not retired / been removed).
 * highestCA is the maximum currentAbility across active alumni (0 if none).
 * milestoneCount is the sum of all milestones across every record.
 */
export function getAlumniSummary(
  alumniRecords: AlumniRecord[],
  players: Record<string, Player>,
): {
  totalPlaced: number;
  activeAlumni: number;
  highestCA: number;
  milestoneCount: number;
} {
  const totalPlaced = alumniRecords.length;

  let activeAlumni = 0;
  let highestCA = 0;
  let milestoneCount = 0;

  for (const record of alumniRecords) {
    const player = players[record.playerId];

    if (player) {
      activeAlumni += 1;
      if (player.currentAbility > highestCA) {
        highestCA = player.currentAbility;
      }
    }

    milestoneCount += record.milestones.length;
  }

  return { totalPlaced, activeAlumni, highestCA, milestoneCount };
}
