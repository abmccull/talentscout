/**
 * Academy recruitment briefs turn a club's academy needs into time-limited,
 * auditable scouting work. The module is deliberately pure: callers own
 * persistence and all variation comes from the supplied seeded RNG.
 */

import type { RNG } from "@/engine/rng";
import type {
  Club,
  ClubDecision,
  ConvictionLevel,
  PlacementReport,
  Player,
  PlayerMovementEvent,
  Position,
  ScoutReport,
  ScoutingCase,
  YouthBriefPriority,
  YouthRecruitmentBrief,
} from "@/engine/core/types";

const DEFAULT_SEASON_LENGTH = 38;

const POSITION_TARGETS: Record<Position, number> = {
  GK: 2,
  CB: 4,
  LB: 2,
  RB: 2,
  CDM: 2,
  CM: 3,
  CAM: 2,
  LW: 2,
  RW: 2,
  ST: 3,
};

const CONVICTION_RANK: Record<ConvictionLevel, number> = {
  note: 0,
  recommend: 1,
  strongRecommend: 2,
  tablePound: 3,
};

export type AcademyRecruitmentBriefStatus = YouthRecruitmentBrief["status"];
export type AcademyRecruitmentBriefPriority = "medium" | "high" | "critical";
export type AcademyRecruitmentBriefReason = "vacancy" | "thinDepth" | "succession";

/**
 * Persisted club request for a youth placement. `expiresWeek` is exclusive:
 * a brief issued in week 10 with an expiry in week 18 can be fulfilled through
 * week 17 and becomes unavailable at the start of week 18.
 */
export interface AcademyRecruitmentBrief extends YouthRecruitmentBrief {
  /** Convenience primary target; canonical persistence uses requiredPositions. */
  targetPosition: Position;
  priority: AcademyRecruitmentBriefPriority;
  reason: AcademyRecruitmentBriefReason;
  rationale: string;
  ageRange: [number, number];
  minimumReportQuality: number;
  minimumConviction: ConvictionLevel;
  /** Aliases retained for readable audit output. */
  issuedWeek: number;
  issuedSeason: number;
  fulfilledPlayerId?: string;
  fulfilledPlayerAge?: number;
  fulfilledScoutId?: string;
  fulfilledCaseId?: string;
  fulfilledReportId?: string;
  fulfilledPlacementReportId?: string;
  fulfilledDecisionId?: string;
  fulfilledMovementId?: string;
  fulfilledWeek?: number;
  fulfilledSeason?: number;
  expiredWeek?: number;
  expiredSeason?: number;
}

export interface AcademyRecruitmentBriefGenerationOptions {
  existingBriefs?: AcademyRecruitmentBrief[];
  /** Maximum concurrently active briefs for this club. Defaults to two. */
  maxActiveBriefs?: number;
  seasonLength?: number;
}

export type AcademyBriefFulfillmentFailure =
  | "briefNotActive"
  | "briefExpired"
  | "caseNotPlaced"
  | "caseMismatch"
  | "reportMismatch"
  | "placementMismatch"
  | "decisionNotAccepted"
  | "positionMismatch"
  | "ageMismatch"
  | "reportQualityTooLow"
  | "convictionTooLow"
  | "missingCanonicalYouthSigning";

export interface AcademyBriefFulfillmentInput {
  brief: AcademyRecruitmentBrief;
  player: Player;
  /** Age at the placement date. Defaults to the player's current age. */
  playerAgeAtPlacement?: number;
  scoutingCase: ScoutingCase;
  report: ScoutReport;
  placementReport: PlacementReport;
  clubDecision: ClubDecision;
  movementHistory: PlayerMovementEvent[];
  currentWeek: number;
  currentSeason: number;
  seasonLength?: number;
}

export interface AcademyBriefFulfillmentResult {
  fulfilled: boolean;
  brief: AcademyRecruitmentBrief;
  movement?: PlayerMovementEvent;
  failures: AcademyBriefFulfillmentFailure[];
}

interface GameDate {
  week: number;
  season: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function gameDateIndex(date: GameDate, seasonLength: number): number {
  return date.season * seasonLength + date.week - 1;
}

function compareGameDates(left: GameDate, right: GameDate, seasonLength: number): number {
  return gameDateIndex(left, seasonLength) - gameDateIndex(right, seasonLength);
}

/** Add a number of game weeks while preserving the configured season length. */
export function addGameWeeks(
  week: number,
  season: number,
  weeksToAdd: number,
  seasonLength = DEFAULT_SEASON_LENGTH,
): GameDate {
  if (seasonLength <= 0) throw new RangeError("seasonLength must be positive");
  if (week < 1 || week > seasonLength) throw new RangeError("week is outside the season");
  if (weeksToAdd < 0) throw new RangeError("weeksToAdd must be non-negative");

  const zeroBasedWeek = week - 1 + weeksToAdd;
  return {
    week: zeroBasedWeek % seasonLength + 1,
    season: season + Math.floor(zeroBasedWeek / seasonLength),
  };
}

function ageRangeForClub(club: Club): [number, number] {
  switch (club.scoutingPhilosophy) {
    case "academyFirst":
      return [14, 16];
    case "winNow":
      return [16, 17];
    case "marketSmart":
      return [15, 17];
    case "globalRecruiter":
    default:
      return [14, 17];
  }
}

function minimumQualityForClub(club: Club): number {
  return clamp(
    Math.round(40 + club.reputation * 0.2 + club.youthAcademyRating * 0.8),
    45,
    76,
  );
}

function activeAt(
  brief: AcademyRecruitmentBrief,
  week: number,
  season: number,
  seasonLength: number,
): boolean {
  return brief.status === "open" && compareGameDates(
    { week, season },
    { week: brief.expiresWeek, season: brief.expiresSeason },
    seasonLength,
  ) < 0;
}

function academyPlayers(club: Club, players: Record<string, Player>): Player[] {
  const rosterIds = new Set([...(club.academyPlayerIds ?? []), ...club.playerIds]);
  return [...rosterIds]
    .map((id) => players[id])
    .filter((player): player is Player => Boolean(
      player
      && player.age <= 20
      && (player.clubId === club.id || player.contractClubId === club.id),
    ));
}

function positionCoverage(players: Player[], position: Position): number {
  return players.reduce((coverage, player) => {
    if (player.position === position) return coverage + 1;
    if (player.secondaryPositions?.includes(position)) return coverage + 0.35;
    return coverage;
  }, 0);
}

function priorityForGap(coverage: number, target: number): AcademyRecruitmentBriefPriority {
  if (coverage === 0) return "critical";
  if ((target - coverage) / target >= 0.5) return "high";
  return "medium";
}

function reasonForGap(
  coverage: number,
  target: number,
  players: Player[],
  position: Position,
): AcademyRecruitmentBriefReason {
  if (coverage === 0) return "vacancy";
  const positionPlayers = players.filter(
    (player) => player.position === position || player.secondaryPositions?.includes(position),
  );
  if (positionPlayers.length > 0 && positionPlayers.every((player) => player.age >= 18)) {
    return "succession";
  }
  return coverage < target ? "thinDepth" : "succession";
}

function rationaleFor(
  position: Position,
  reason: AcademyRecruitmentBriefReason,
  coverage: number,
): string {
  if (reason === "vacancy") {
    return `The academy has no established ${position} prospect and needs a credible pathway option.`;
  }
  if (reason === "succession") {
    return `The current ${position} group is approaching senior football, leaving the next intake exposed.`;
  }
  return `The academy has only ${coverage.toFixed(1)} viable ${position} options and needs greater depth.`;
}

function briefDuration(priority: AcademyRecruitmentBriefPriority): number {
  if (priority === "critical") return 8;
  if (priority === "high") return 12;
  return 16;
}

function deterministicNonce(rng: RNG): string {
  return rng.nextInt(0, 0x7fffffff).toString(36).padStart(6, "0");
}

function developmentPriorityForClub(club: Club): YouthBriefPriority {
  if (club.scoutingPhilosophy === "winNow") return "earlyReadiness";
  if (club.scoutingPhilosophy === "marketSmart") return "resale";
  if (club.scoutingPhilosophy === "globalRecruiter") return "character";
  return "highCeiling";
}

function riskToleranceForClub(club: Club): YouthRecruitmentBrief["riskTolerance"] {
  if (club.scoutingPhilosophy === "academyFirst") return "high";
  if (club.scoutingPhilosophy === "winNow") return "low";
  return "medium";
}

function weeklyWageBudgetForClub(club: Club): number {
  const reputationAllowance = club.reputation * 35;
  const academyAllowance = club.youthAcademyRating * 75;
  return clamp(Math.round((reputationAllowance + academyAllowance) / 100) * 100, 500, 5_000);
}

/**
 * Generate briefs from observable academy roster gaps. The function never
 * reads player ability or potential, so club needs cannot leak hidden truth.
 */
export function generateAcademyRecruitmentBriefs(
  rng: RNG,
  club: Club,
  players: Record<string, Player>,
  week: number,
  season: number,
  options: AcademyRecruitmentBriefGenerationOptions = {},
): AcademyRecruitmentBrief[] {
  const seasonLength = options.seasonLength ?? DEFAULT_SEASON_LENGTH;
  const maxActiveBriefs = Math.max(0, options.maxActiveBriefs ?? 2);
  const existingBriefs = options.existingBriefs ?? [];
  const activeBriefs = existingBriefs.filter(
    (brief) => brief.clubId === club.id && activeAt(brief, week, season, seasonLength),
  );
  const slotsAvailable = Math.max(0, maxActiveBriefs - activeBriefs.length);
  if (slotsAvailable === 0) return [];

  const occupiedPositions = new Set(activeBriefs.map((brief) => brief.targetPosition));
  const youthPlayers = academyPlayers(club, players);
  const rankedGaps = (Object.keys(POSITION_TARGETS) as Position[])
    .filter((position) => !occupiedPositions.has(position))
    .map((position) => {
      const target = POSITION_TARGETS[position];
      const coverage = positionCoverage(youthPlayers, position);
      const normalizedGap = Math.max(0, target - coverage) / target;
      return {
        position,
        target,
        coverage,
        normalizedGap,
        // Seeded tie-breaker creates world variation without changing need severity.
        tieBreaker: rng.next(),
      };
    })
    .filter((gap) => gap.normalizedGap > 0)
    .sort((left, right) =>
      right.normalizedGap - left.normalizedGap
      || right.tieBreaker - left.tieBreaker
      || left.position.localeCompare(right.position),
    )
    .slice(0, slotsAvailable);

  const ageRange = ageRangeForClub(club);
  const minimumReportQuality = minimumQualityForClub(club);
  const minimumConviction: ConvictionLevel = minimumReportQuality >= 68
    ? "strongRecommend"
    : "recommend";

  return rankedGaps.map((gap) => {
    const priority = priorityForGap(gap.coverage, gap.target);
    const reason = reasonForGap(gap.coverage, gap.target, youthPlayers, gap.position);
    const expiry = addGameWeeks(
      week,
      season,
      briefDuration(priority),
      seasonLength,
    );
    return {
      id: `academy_brief_${club.id}_s${season}w${week}_${gap.position}_${deterministicNonce(rng)}`,
      clubId: club.id,
      type: "academyPlacement",
      createdWeek: week,
      createdSeason: season,
      requiredPositions: [gap.position],
      targetPosition: gap.position,
      priority,
      reason,
      rationale: rationaleFor(gap.position, reason, gap.coverage),
      ageRange,
      developmentPriority: developmentPriorityForClub(club),
      maxAge: ageRange[1],
      riskTolerance: riskToleranceForClub(club),
      weeklyWageBudget: weeklyWageBudgetForClub(club),
      competitionPressure: clamp(Math.round(club.reputation * 0.55 + rng.nextInt(5, 35)), 0, 100),
      minimumReportQuality,
      minimumConviction,
      issuedWeek: week,
      issuedSeason: season,
      expiresWeek: expiry.week,
      expiresSeason: expiry.season,
      status: "open",
    };
  });
}

/** Expire all due active briefs without mutating the input collection. */
export function expireAcademyRecruitmentBriefs(
  briefs: AcademyRecruitmentBrief[],
  currentWeek: number,
  currentSeason: number,
  seasonLength = DEFAULT_SEASON_LENGTH,
): { briefs: AcademyRecruitmentBrief[]; expiredIds: string[] } {
  const expiredIds: string[] = [];
  const updated = briefs.map((brief) => {
    if (brief.status !== "open") return brief;
    const due = compareGameDates(
      { week: currentWeek, season: currentSeason },
      { week: brief.expiresWeek, season: brief.expiresSeason },
      seasonLength,
    ) >= 0;
    if (!due) return brief;
    expiredIds.push(brief.id);
    return {
      ...brief,
      status: "expired" as const,
      expiredWeek: currentWeek,
      expiredSeason: currentSeason,
    };
  });
  return { briefs: updated, expiredIds };
}

function isPositionMatch(player: Player, position: Position): boolean {
  return player.position === position || player.secondaryPositions?.includes(position) === true;
}

function movementWithinBrief(
  movement: PlayerMovementEvent,
  brief: AcademyRecruitmentBrief,
  placementReport: PlacementReport,
  current: GameDate,
  seasonLength: number,
): boolean {
  const movementDate = { week: movement.week, season: movement.season };
  const earliestDate = compareGameDates(
    { week: brief.issuedWeek, season: brief.issuedSeason },
    { week: placementReport.week, season: placementReport.season },
    seasonLength,
  ) >= 0
    ? { week: brief.issuedWeek, season: brief.issuedSeason }
    : { week: placementReport.week, season: placementReport.season };
  return compareGameDates(movementDate, earliestDate, seasonLength) >= 0
    && compareGameDates(
      movementDate,
      { week: brief.expiresWeek, season: brief.expiresSeason },
      seasonLength,
    ) < 0
    && compareGameDates(movementDate, current, seasonLength) <= 0;
}

/**
 * Fulfil a brief only when the authored report, accepted club decision, placed
 * case, and authoritative youth-signing movement all describe the same event.
 */
export function fulfillAcademyRecruitmentBrief(
  input: AcademyBriefFulfillmentInput,
): AcademyBriefFulfillmentResult {
  const seasonLength = input.seasonLength ?? DEFAULT_SEASON_LENGTH;
  const { brief, player, scoutingCase, report, placementReport, clubDecision } = input;
  if (brief.status === "fulfilled") {
    return { fulfilled: true, brief, failures: [] };
  }
  if (brief.status !== "open") {
    return { fulfilled: false, brief, failures: ["briefNotActive"] };
  }

  const failures: AcademyBriefFulfillmentFailure[] = [];
  const playerAge = input.playerAgeAtPlacement ?? player.age;

  if (scoutingCase.status !== "placed") failures.push("caseNotPlaced");
  if (
    report.caseId !== scoutingCase.id
    || report.playerId !== scoutingCase.playerId
    || report.scoutId !== scoutingCase.scoutId
    || !scoutingCase.reportIds.includes(report.id)
  ) failures.push("caseMismatch");
  if (
    placementReport.caseId !== scoutingCase.id
    || placementReport.reportId !== report.id
    || placementReport.scoutId !== report.scoutId
    || !scoutingCase.placementReportIds.includes(placementReport.id)
  ) failures.push("reportMismatch");
  if (
    placementReport.targetClubId !== brief.clubId
    || placementReport.clubResponse !== "accepted"
  ) failures.push("placementMismatch");
  if (
    clubDecision.outcome !== "accepted"
    || clubDecision.caseId !== scoutingCase.id
    || clubDecision.reportId !== report.id
    || clubDecision.clubId !== brief.clubId
    || clubDecision.placementReportId !== placementReport.id
    || placementReport.decisionId !== clubDecision.id
    || !scoutingCase.decisionIds.includes(clubDecision.id)
  ) failures.push("decisionNotAccepted");
  if (!isPositionMatch(player, brief.targetPosition)) failures.push("positionMismatch");
  if (playerAge < brief.ageRange[0] || playerAge > brief.ageRange[1]) {
    failures.push("ageMismatch");
  }
  if (report.qualityScore < brief.minimumReportQuality) {
    failures.push("reportQualityTooLow");
  }
  if (CONVICTION_RANK[report.conviction] < CONVICTION_RANK[brief.minimumConviction]) {
    failures.push("convictionTooLow");
  }

  const movement = input.movementHistory
    .filter((candidate) =>
      candidate.playerId === player.id
      && candidate.type === "youthSigning"
      && candidate.toClubId === brief.clubId
      && movementWithinBrief(
        candidate,
        brief,
        placementReport,
        { week: input.currentWeek, season: input.currentSeason },
        seasonLength,
      ),
    )
    .sort((left, right) =>
      compareGameDates(
        { week: left.week, season: left.season },
        { week: right.week, season: right.season },
        seasonLength,
      ) || left.id.localeCompare(right.id),
    )[0];

  if (!movement) {
    const expired = compareGameDates(
      { week: input.currentWeek, season: input.currentSeason },
      { week: brief.expiresWeek, season: brief.expiresSeason },
      seasonLength,
    ) >= 0;
    failures.push(expired ? "briefExpired" : "missingCanonicalYouthSigning");
  }

  if (failures.length > 0 || !movement) {
    return { fulfilled: false, brief, failures };
  }

  return {
    fulfilled: true,
    movement,
    failures: [],
    brief: {
      ...brief,
      status: "fulfilled",
      fulfilledPlayerId: player.id,
      fulfilledPlayerAge: playerAge,
      fulfilledScoutId: report.scoutId,
      fulfilledCaseId: scoutingCase.id,
      fulfilledReportId: report.id,
      fulfilledPlacementReportId: placementReport.id,
      fulfilledDecisionId: clubDecision.id,
      fulfilledMovementId: movement.id,
      fulfilledWeek: movement.week,
      fulfilledSeason: movement.season,
      assignedCaseId: scoutingCase.id,
      fulfilledByPlayerId: player.id,
    },
  };
}
