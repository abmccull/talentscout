import { hasRecordedSeniorAppearance, isSourcedAlumniEvent } from "./alumniEvidence";
import { getFixtureSeason } from "@/engine/world/fixtures";
import { collectCanonicalAppearances, summarizeCanonicalAppearances } from "@/engine/match/canonicalPerformance";
/**
 * Alumni tracking — long-term payoff loop for placed youth.
 *
 * When a scout places an unsigned youth at a club, an alumni record is created.
 * The system projects career milestones from played participation and applied
 * movement facts and generates one notification for each recorded event.
 *
 * F12 extends this with:
 *  - Career update timeline (debut, goals, injury and applied movements)
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
  PlayerMovementEvent,
} from "@/engine/core/types";

type CanonicalFixtures = Record<string, import("@/engine/core/types").Fixture>;
type CanonicalRatings = Record<string, Record<string, import("@/engine/core/types").PlayerMatchRating>>;

export interface AlumniWeekEvidence {
  fixtures: CanonicalFixtures;
  matchRatings: CanonicalRatings;
  /** Only applied movements, after authoritative lifecycle resolution. */
  movements: readonly PlayerMovementEvent[];
}

const EMPTY_EVIDENCE: AlumniWeekEvidence = { fixtures: {}, matchRatings: {}, movements: [] };

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Return true if the alumni record already has a milestone of the given type.
 */
function hasMilestone(record: AlumniRecord, type: AlumniMilestoneType): boolean {
  return record.milestones.some((m) => m.type === type && isSourcedAlumniEvent(m));
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

function deriveAlumniStatus(
  player: Player,
  retiredPlayerIds: readonly string[],
  recordedSeniorAppearance: boolean,
): AlumniStatus {
  if (retiredPlayerIds.includes(player.id)) return "retired";
  if (!player.clubId) return "released";
  if (player.onLoan === true) return "loaned";
  return recordedSeniorAppearance ? "firstTeam" : "academy";
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

/** Project alumni facts after the current week's matches and movements commit.
 * No CA/PA gate or random roll can manufacture a played match achievement.
 * Call-ups, captaincy and Team-of-the-Week require a future canonical event
 * authority; legacy history remains intact until then.
 */
export function processAlumniWeek(
  _rng: RNG,
  alumniRecords: AlumniRecord[],
  players: Record<string, Player>,
  clubs: Record<string, Club>,
  week: number,
  season: number,
  retiredPlayerIds: string[] = [],
  evidence: AlumniWeekEvidence = EMPTY_EVIDENCE,
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
  const appearancesByPlayer = collectCanonicalAppearances(evidence.fixtures, evidence.matchRatings, season);
  const knownAppearanceHistory = new Map(appearancesByPlayer);
  // Recover a missing sourced first event from surviving facts, including an
  // earlier retained season. Aggregated history cannot invent a fixture/date.
  if (alumniRecords.some(record => !hasMilestone(record, "firstTeamDebut") || !hasMilestone(record, "firstGoal"))) {
    const earliestPlacementSeason = alumniRecords.reduce((earliest, record) => Math.min(earliest, record.placedSeason), season);
    const priorSeasons = [...new Set(Object.values(evidence.fixtures).map(getFixtureSeason))]
      .filter((known): known is number => known !== undefined && known >= earliestPlacementSeason && known < season)
      .sort((left, right) => left - right);
    for (const priorSeason of priorSeasons) {
      for (const [playerId, appearances] of collectCanonicalAppearances(evidence.fixtures, evidence.matchRatings, priorSeason)) {
        knownAppearanceHistory.set(playerId, [...(knownAppearanceHistory.get(playerId) ?? []), ...appearances]);
      }
    }
  }

  for (const record of alumniRecords) {
    const player = players[record.playerId];
    if (!player) { updatedAlumni.push(record); continue; }
    const name = `${player.firstName} ${player.lastName}`;
    const afterPlacement = (date: { season?: number; week: number }) =>
      (date.season ?? season) > record.placedSeason
      || ((date.season ?? season) === record.placedSeason && date.week > record.placedWeek);
    const fixtureDate = (fixture: import("@/engine/core/types").Fixture) => ({
      week: fixture.week, season: getFixtureSeason(fixture) ?? season,
    });
    const isDatedPastAppearance = (fixture: import("@/engine/core/types").Fixture): boolean => {
      const recordedSeason = getFixtureSeason(fixture);
      return recordedSeason !== undefined && Number.isInteger(fixture.week) && fixture.week >= 1
        && (recordedSeason < season || (recordedSeason === season && fixture.week <= week));
    };
    const appearances = (appearancesByPlayer.get(player.id) ?? [])
      .filter(({ fixture }) => isDatedPastAppearance(fixture) && afterPlacement(fixtureDate(fixture)))
      .sort((left, right) => left.fixture.week - right.fixture.week || left.fixture.id.localeCompare(right.fixture.id));
    const history = (knownAppearanceHistory.get(player.id) ?? []).filter(({ fixture }) => isDatedPastAppearance(fixture) && afterPlacement(fixtureDate(fixture)))
      .sort((left, right) => fixtureDate(left.fixture).season - fixtureDate(right.fixture).season
        || left.fixture.week - right.fixture.week || left.fixture.id.localeCompare(right.fixture.id));
    const weekAppearances = appearances.filter(({ fixture }) => fixture.week === week);
    const tickMilestones: AlumniMilestone[] = [];
    const tickCareerUpdates: AlumniCareerUpdate[] = [];
    const addMilestone = (type: AlumniMilestoneType, sourceId: string, description: string, occurred = { week, season }) => {
      if (type !== "transfer" && hasMilestone(record, type)) return;
      if (record.milestones.some((milestone) => milestone.type === type && milestone.sourceId === sourceId)) return;
      tickMilestones.push({ type, sourceId, week: occurred.week, season: occurred.season, description, notified: true });
    };
    const addUpdate = (type: AlumniCareerUpdateType, sourceId: string, description: string, occurred = { week, season }) => {
      if (record.careerUpdates.some((update) => update.type === type && update.sourceId === sourceId)) return;
      tickCareerUpdates.push({ type, sourceId, week: occurred.week, season: occurred.season, description });
    };

    for (const movement of evidence.movements.filter((event) => event.playerId === player.id
      && event.season === season && event.week === week && afterPlacement(event))) {
      const destination = movement.toClubId ? clubs[movement.toClubId]?.name ?? "their new club" : undefined;
      if ((movement.type === "permanentTransfer" || movement.type === "loanBuyOption") && destination) {
        addMilestone("transfer", movement.id, `${name} has completed a permanent move to ${destination}.`);
        addUpdate("transfer", movement.id, `Completed a permanent move to ${destination}.`);
      } else if (movement.type === "release") {
        addUpdate("released", movement.id, `Released by ${clubs[movement.fromClubId ?? ""]?.name ?? "their club"}.`);
      } else if (movement.type === "loanStart" && destination) {
        addUpdate("loanMove", movement.id, `Joined ${destination} on loan.`);
      } else if ((movement.type === "loanReturn" || movement.type === "loanRecall") && destination) {
        addUpdate("loanMove", movement.id, `Returned from loan to ${destination}.`);
      } else if (movement.type === "freeAgentSigning" && destination) {
        addUpdate("transfer", movement.id, `Signed for ${destination} as a free agent.`);
      }
    }

    const currentAppearance = weekAppearances[0];
    const firstAppearance = history[0];
    if (currentAppearance && firstAppearance && !hasMilestone(record, "firstTeamDebut")) {
      const occurred = fixtureDate(firstAppearance.fixture);
      addMilestone("firstTeamDebut", firstAppearance.fixture.id,
        `${name}'s first recorded senior appearance was in Season ${occurred.season}, Week ${occurred.week}.`, occurred);
      addUpdate("debut", firstAppearance.fixture.id, "First recorded senior appearance.", occurred);
    }
    const firstGoal = history.find(({ rating }) => (rating.stats.goals ?? 0) > 0);
    if (currentAppearance && firstGoal && !hasMilestone(record, "firstGoal")) {
      const occurred = fixtureDate(firstGoal.fixture);
      addMilestone("firstGoal", firstGoal.fixture.id,
        `${name}'s first recorded professional goal was in Season ${occurred.season}, Week ${occurred.week}.`, occurred);
      addUpdate("firstGoal", firstGoal.fixture.id, "First recorded professional goal.", occurred);
    }

    // Public performance recognition, not a revelation of hidden potential.
    const performance = summarizeCanonicalAppearances(appearances);
    const standoutYoungProfessional = player.age <= 21
      && (performance?.appearances ?? 0) >= 6 && (performance?.averageRating ?? 0) >= 7.5;
    if (currentAppearance && standoutYoungProfessional && !hasMilestone(record, "wonderkidStatus")) {
      addMilestone("wonderkidStatus", currentAppearance.fixture.id,
        `${name} has become a standout young professional: ${performance!.appearances} recorded senior appearances at a ${performance!.averageRating.toFixed(1)} average rating this season.`);
    }

    const injury = player.currentInjury;
    if (player.injured && injury && !hasCareerUpdateInSeason(record, "injury", season)) {
      addUpdate("injury", injury.id, `Recovering from a recorded injury${player.injuryWeeksRemaining > 0 ? `; ${player.injuryWeeksRemaining} weeks remain` : ""}.`);
    }
    const recordedSeniorAppearance = hasRecordedSeniorAppearance(record) || appearances.length > 0;
    const newStatus = deriveAlumniStatus(player, retiredPlayerIds, recordedSeniorAppearance);
    let becameContact = record.becameContact;
    if (!becameContact && newStatus === "firstTeam" && standoutYoungProfessional) {
      becameContact = true;
      const clubName = clubs[player.clubId]?.name ?? "their club";
      const contact: Contact = { id: `contact_alumni_${record.id}`, name, type: "clubStaff",
        organization: clubName, relationship: 60, reliability: 55, knownPlayerIds: [],
        region: player.nationality, country: player.nationality };
      contactPromotions.push({ alumniId: record.id, contact });
      newMessages.push({ id: `alumni-contact-${record.id}`, week, season, type: "event",
        title: `Alumni Graduated: ${name} is now a Contact`,
        body: `${name}'s recorded professional progress at ${clubName} has opened a new relationship in your contact network.`,
        read: false, actionRequired: false, relatedId: contact.id, relatedEntityType: "contact" });
    }

    for (const milestone of tickMilestones) {
      newMessages.push({ id: `alumni-${record.id}-${milestone.type}-${milestone.sourceId}`, week, season,
        type: "event", title: `Alumni Update: ${name}`, body: milestone.description,
        read: false, actionRequired: false, relatedId: player.id, relatedEntityType: "player" });
      newMilestones.push(milestone);
    }
    for (const update of tickCareerUpdates) {
      if (tickMilestones.some((milestone) => milestone.sourceId === update.sourceId)) continue;
      newMessages.push({ id: `alumni-${record.id}-${update.type}-${update.sourceId}`, week, season,
        type: "event", title: `Alumni Career Update: ${name}`, body: update.description,
        read: false, actionRequired: false, relatedId: player.id, relatedEntityType: "player" });
    }
    updatedAlumni.push({ ...record, currentClubId: player.clubId,
      milestones: [...record.milestones, ...tickMilestones], careerUpdates: [...record.careerUpdates, ...tickCareerUpdates],
      currentStatus: newStatus, becameContact });
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
  const seasonTotals = summarizeCanonicalAppearances(
    collectCanonicalAppearances(fixtures, matchRatings, season).get(player.id),
  );
  if (!seasonTotals || seasonTotals.appearances === 0) return record;

  const avgRating = seasonTotals.averageRating;

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
 * Criteria: recorded senior participation and a sourced recognition milestone.
 * Must not have already been promoted.
 */
export function isEligibleForContactPromotion(record: AlumniRecord): boolean {
  if (record.becameContact) return false;
  if (record.currentStatus !== "firstTeam" || !hasRecordedSeniorAppearance(record)) return false;

  return (
    record.milestones.some(
      (m) => Boolean(m.sourceId) && (m.type === "internationalCallUp" || m.type === "wonderkidStatus"),
    )
  );
}

/**
 * F12: Compute placement success rate for all alumni.
 *
 * Success requires recorded senior participation. Legacy unsupported narrative
 * is kept in history but cannot establish a verified breakthrough.
 */
export function calculatePlacementSuccessRate(
  alumniRecords: AlumniRecord[],
): number {
  if (alumniRecords.length === 0) return 0;
  const successes = alumniRecords.filter(
    (r) =>
      hasRecordedSeniorAppearance(r),
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

  const firstTeamBreakthroughs = alumniRecords.filter(hasRecordedSeniorAppearance).length;

  const internationalCapsFromFinds = alumniRecords.filter((r) =>
    r.milestones.some((m) => m.type === "internationalCallUp" && Boolean(m.sourceId)),
  ).length;

  const wonderkidCount = alumniRecords.filter((r) =>
    r.milestones.some((m) => m.type === "wonderkidStatus" && Boolean(m.sourceId)),
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

/** Refresh derived alumni outcomes without resetting extended career history. */
export function projectAlumniLegacyScore(stored: LegacyScore, alumniRecords?: AlumniRecord[]): LegacyScore {
  // Unavailable legacy evidence cannot replace persisted career credit. A known
  // empty collection still derives zero through the normal projection below.
  if (alumniRecords === undefined) return { ...stored };
  const alumni = calculateLegacyScore(alumniRecords);
  return { ...stored, youthFound: alumni.youthFound,
    firstTeamBreakthroughs: alumni.firstTeamBreakthroughs,
    internationalCapsFromFinds: alumni.internationalCapsFromFinds,
    totalScore: alumni.totalScore };
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
 * milestoneCount is the number of sourced milestones across every record.
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

    milestoneCount += record.milestones.filter(isSourcedAlumniEvent).length;
  }

  return { totalPlaced, activeAlumni, highestCA, milestoneCount };
}
