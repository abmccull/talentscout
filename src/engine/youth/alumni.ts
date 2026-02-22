/**
 * Alumni tracking — long-term payoff loop for placed youth.
 *
 * When a scout places an unsigned youth at a club, an alumni record is created.
 * The system then tracks the player's career milestones (first team debut,
 * international callup, wonderkid status) and generates inbox messages when
 * milestones are achieved.
 *
 * All functions are pure: no side effects, no mutation.
 */

import type { RNG } from "@/engine/rng";
import type {
  AlumniRecord,
  AlumniMilestone,
  AlumniMilestoneType,
  CareerSnapshot,
  LegacyScore,
  Player,
  Club,
  UnsignedYouth,
  InboxMessage,
} from "@/engine/core/types";

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
): AlumniRecord {
  return {
    id: `alumni_${youth.id}`,
    playerId: youth.player.id,
    placedClubId: clubId,
    currentClubId: clubId,
    milestones: [],
    careerSnapshots: [],
    placedWeek: week,
    placedSeason: season,
  };
}

/**
 * Process alumni records for one game week.
 *
 * For each alumni record, checks whether the linked player has hit any new
 * career milestones and, if so, creates the milestone entry and an inbox
 * message to notify the scout.
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
): {
  updatedAlumni: AlumniRecord[];
  newMilestones: AlumniMilestone[];
  newMessages: InboxMessage[];
} {
  // Silence unused param — clubs accepted for forward-compatibility (e.g. club
  // name look-up in future milestone descriptions without breaking the API).
  void clubs;

  const updatedAlumni: AlumniRecord[] = [];
  const newMilestones: AlumniMilestone[] = [];
  const newMessages: InboxMessage[] = [];

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
    let currentClubId = record.currentClubId;

    // -----------------------------------------------------------------------
    // Transfer check — must run first so currentClubId is up to date for
    // subsequent milestone descriptions.
    // -----------------------------------------------------------------------
    if (!hasMilestone(record, "transfer") || player.clubId !== currentClubId) {
      // We allow multiple transfer milestones (each represents a new move), so
      // re-check even if one was already recorded.
      if (player.clubId !== currentClubId) {
        const milestone: AlumniMilestone = {
          type: "transfer",
          week,
          season,
          description: `${player.firstName} ${player.lastName} has moved to a new club.`,
          notified: false,
        };
        tickMilestones.push(milestone);

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
      const milestone: AlumniMilestone = {
        type: "firstTeamDebut",
        week,
        season,
        description: `${player.firstName} ${player.lastName} has made their first team debut, breaking through at age ${player.age}.`,
        notified: false,
      };
      tickMilestones.push(milestone);
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
    };

    updatedAlumni.push(updatedRecord);
  }

  return { updatedAlumni, newMilestones, newMessages };
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
