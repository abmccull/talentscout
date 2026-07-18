import type {
  GameDate,
  GameState,
  NarrativeEventType,
  Player,
  PlayerMatchRating,
  PlayerMovementEvent,
  ScoutReport,
  TournamentEvent,
} from "@/engine/core/types";
import { gameWeeksBetween, getSeasonLength } from "@/engine/core/gameDate";
import { selectLatestReportsByCase } from "@/engine/reports/reportAccountability";

/** Player-facing context proven by the same record that supports a claim. */
export interface NarrativeTruthContext {
  playerName?: string;
  clubName?: string;
  tournamentName?: string;
  countryName?: string;
}

export type NarrativeEvidenceSource =
  | "match-rating"
  | "injury-record"
  | "player-movement"
  | "alumni-milestone"
  | "tournament"
  | "recommendation-review"
  | "performance-pulse"
  | "club-decision"
  | "rival-activity"
  | "simulation-command";

/** A stable reference to the authoritative state behind material prose. */
export interface NarrativeEvidenceReference {
  source: NarrativeEvidenceSource;
  sourceId: string;
  relatedIds: readonly string[];
  context?: NarrativeTruthContext;
}

export interface FactualNarrativeTruthContract {
  kind: "fact";
  resolveEvidence: (state: GameState) => NarrativeEvidenceReference | null;
}

export interface RumorNarrativeTruthContract {
  kind: "rumor";
  sourceLabel: string;
  resolveSubject?: (state: GameState) => NarrativeEvidenceReference | null;
}

export interface CommandNarrativeTruthContract {
  kind: "command";
  commandId: string;
  /** Resolve only after the command produced an authoritative state receipt. */
  resolveReceipt: (state: GameState) => NarrativeEvidenceReference | null;
}

/**
 * Material narrative is either proven, explicitly presented as sourced rumor,
 * or backed by a command that can really execute. The current tranche uses the
 * factual branch; the other branches prevent future content from weakening the
 * contract when rumor and interactive-event authoring migrate onto it.
 */
export type NarrativeTruthContract =
  | FactualNarrativeTruthContract
  | RumorNarrativeTruthContract
  | CommandNarrativeTruthContract;

export interface NarrativeTruthResolution {
  kind: NarrativeTruthContract["kind"];
  evidence?: NarrativeEvidenceReference;
  sourceLabel?: string;
}

export type NarrativeCallbackDomain = "career" | "prospect" | "club" | "rival";

/**
 * A low-intensity story beat backed by a completed simulation receipt. These
 * signals never resolve a transfer, case, or review; they only make an existing
 * result eligible for the shared narrative cadence.
 */
export interface NarrativeCallbackSignal {
  domain: NarrativeCallbackDomain;
  fingerprint: string;
  title: string;
  summary: string;
  occurredAt: GameDate;
  evidence: NarrativeEvidenceReference;
  narrativeType: NarrativeEventType;
  weight: number;
}

const CALLBACK_LOOKBACK_WEEKS = 16;

function callbackPlayer(state: GameState, playerId: string): Player | undefined {
  return state.players?.[playerId]
    ?? state.retiredPlayers?.[playerId]
    ?? Object.values(state.unsignedYouth ?? {})
      .find((candidate) => candidate.player.id === playerId)?.player;
}

function callbackPlayerName(state: GameState, playerId: string): string {
  const player = callbackPlayer(state, playerId);
  return player ? `${player.firstName} ${player.lastName}`.trim() : "the prospect";
}

function callbackIsRecent(state: GameState, occurredAt: GameDate): boolean {
  const age = gameWeeksBetween(
    state.fixtures ?? {},
    occurredAt,
    { season: state.currentSeason, week: state.currentWeek },
  );
  return age >= 0 && age <= CALLBACK_LOOKBACK_WEEKS;
}

export function narrativeCallbackEventId(
  signal: Pick<NarrativeCallbackSignal, "domain" | "evidence">,
): string {
  return `callback:${signal.domain}:${signal.evidence.source}:${signal.evidence.sourceId}`;
}

function callbackAlreadyShown(
  state: GameState,
  signal: Pick<NarrativeCallbackSignal, "domain" | "evidence">,
): boolean {
  const id = narrativeCallbackEventId(signal);
  return (state.narrativeEvents ?? []).some((event) => event.id === id)
    || (state.storyDirectorV2?.callbackFingerprints ?? []).includes(id);
}

function recommendationCallbackSignals(state: GameState): NarrativeCallbackSignal[] {
  return Object.values(state.recommendationReviews ?? {}).flatMap((review) => {
    if (
      review.status !== "complete"
      || review.completedWeek === undefined
      || review.completedSeason === undefined
    ) return [];
    const occurredAt = { week: review.completedWeek, season: review.completedSeason };
    if (!callbackIsRecent(state, occurredAt)) return [];
    const name = callbackPlayerName(state, review.playerId);
    const scoredDimensions = review.playerFacingDimensions ?? [];
    const positive = scoredDimensions.filter((dimension) => dimension.status === "positive").length;
    const mixed = scoredDimensions.filter((dimension) => dimension.status === "mixed").length;
    const negative = scoredDimensions.filter((dimension) => dimension.status === "negative").length;
    const score = typeof review.overallScore === "number"
      ? ` The evidence review scored ${Math.round(review.overallScore)}/100.`
      : "";
    const dimensionSummary = scoredDimensions.length > 0
      ? ` Across the reviewed areas: ${positive} positive, ${mixed} mixed, and ${negative} negative.`
      : " The review remains limited to the outcomes recorded so far.";
    return [{
      domain: "prospect" as const,
      fingerprint: `recommendation-review:${review.id}`,
      title: `${name}: the recommendation is on the record`,
      summary: `${review.checkpoint === "oneSeason" ? "One season" : "Two seasons"} after your recommendation, the formal review is complete.${score}${dimensionSummary}`,
      occurredAt,
      evidence: {
        source: "recommendation-review" as const,
        sourceId: review.id,
        relatedIds: [review.playerId, review.clubId, review.caseId, review.reportId],
        context: { playerName: name },
      },
      narrativeType: "reportCitedInBoardMeeting" as const,
      weight: 1.3,
    }];
  });
}

function performanceCallbackSignals(state: GameState): NarrativeCallbackSignal[] {
  return (state.scout.performancePulses ?? []).flatMap((pulse) => {
    const occurredAt = {
      season: pulse.season,
      week: Math.max(1, Math.min(
        pulse.period * 4,
        getSeasonLength(state.fixtures ?? {}, pulse.season),
      )),
    };
    if (!callbackIsRecent(state, occurredAt)) return [];
    const reportLabel = pulse.reportsSubmitted === 1 ? "report" : "reports";
    const development = pulse.professionalDevelopment
      ? " Formal study also counted toward the period's professional development."
      : "";
    return [{
      domain: "career" as const,
      fingerprint: `performance-pulse:${state.scout.id}:${pulse.season}:${pulse.period}`,
      title: `Your latest professional review: Grade ${pulse.grade}`,
      summary: `Your form is ${pulse.trend}. The review covers ${pulse.reportsSubmitted} ${reportLabel}, ${pulse.reportQualityAvg}% average report quality, and ${pulse.accuracyRate}% recorded accuracy.${development}`,
      occurredAt,
      evidence: {
        source: "performance-pulse" as const,
        sourceId: `${state.scout.id}:s${pulse.season}:p${pulse.period}`,
        relatedIds: [state.scout.id],
      },
      narrativeType: "reportCitedInBoardMeeting" as const,
      weight: 0.85,
    }];
  });
}

function clubDecisionCallbackSignals(state: GameState): NarrativeCallbackSignal[] {
  const outcomeText = {
    accepted: "accepted your recommendation",
    rejected: "declined your recommendation",
    trial: "asked to see the player on trial",
    followUpRequested: "asked you for more evidence",
  } as const;
  return Object.values(state.clubDecisions ?? {}).flatMap((decision) => {
    const occurredAt = { week: decision.decidedWeek, season: decision.decidedSeason };
    if (!callbackIsRecent(state, occurredAt)) return [];
    const playerId = (decision.reportId
      ? state.reports?.[decision.reportId]?.playerId
      : undefined)
      ?? state.scoutingCases?.[decision.caseId]?.playerId;
    const club = state.clubs?.[decision.clubId];
    const clubName = club?.name ?? "The club";
    const name = playerId ? callbackPlayerName(state, playerId) : "the prospect";
    return [{
      domain: "club" as const,
      fingerprint: `club-decision:${decision.id}`,
      title: `${clubName} has answered`,
      summary: `${clubName} ${outcomeText[decision.outcome]} on ${name}. The decision and the evidence behind it now form part of your professional record.`,
      occurredAt,
      evidence: {
        source: "club-decision" as const,
        sourceId: decision.id,
        relatedIds: [decision.clubId, decision.caseId, ...(playerId ? [playerId] : [])],
        context: { clubName, ...(playerId ? { playerName: name } : {}) },
      },
      narrativeType: "reportCitedInBoardMeeting" as const,
      weight: 1.2,
    }];
  });
}

function rivalCallbackSignals(state: GameState): NarrativeCallbackSignal[] {
  const descriptions = {
    spotted: "has been seen watching",
    targetAcquired: "has added",
    reportSubmitted: "has submitted a club report on",
    playerSigned: "has helped their club complete a move for",
  } as const;
  return (state.rivalActivities ?? []).flatMap((activity) => {
    const occurredAt = { week: activity.week, season: activity.season };
    if (!callbackIsRecent(state, occurredAt)) return [];
    const rival = state.rivalScouts?.[activity.rivalId];
    const rivalName = rival?.name ?? "A rival scout";
    const playerId = activity.playerId;
    const name = playerId ? callbackPlayerName(state, playerId) : "the same market";
    const sourceId = [
      activity.rivalId,
      activity.type,
      playerId ?? activity.fixtureId ?? "market",
      `s${activity.season}`,
      `w${activity.week}`,
    ].join(":");
    return [{
      domain: "rival" as const,
      fingerprint: `rival-activity:${sourceId}`,
      title: `${rivalName} is moving`,
      summary: `${rivalName} ${descriptions[activity.type]} ${name}. This is recorded market activity, not a guarantee of where the player will go.`,
      occurredAt,
      evidence: {
        source: "rival-activity" as const,
        sourceId,
        relatedIds: [activity.rivalId, ...(playerId ? [playerId] : []), ...(activity.fixtureId ? [activity.fixtureId] : [])],
        context: playerId ? { playerName: name } : undefined,
      },
      narrativeType: "rivalPoach" as const,
      weight: 1.05,
    }];
  });
}

/** Return unseen, receipt-backed callbacks in deterministic priority order. */
export function getNarrativeCallbackSignals(state: GameState): NarrativeCallbackSignal[] {
  return [
    ...recommendationCallbackSignals(state),
    ...clubDecisionCallbackSignals(state),
    ...rivalCallbackSignals(state),
    ...performanceCallbackSignals(state),
  ]
    .filter((signal) => !callbackAlreadyShown(state, signal))
    .sort((left, right) =>
      right.weight - left.weight
      || right.occurredAt.season - left.occurredAt.season
      || right.occurredAt.week - left.occurredAt.week
      || left.fingerprint.localeCompare(right.fingerprint)
    );
}

export function resolveNarrativeTruth(
  contract: NarrativeTruthContract,
  state: GameState,
): NarrativeTruthResolution | null {
  if (contract.kind === "fact") {
    const evidence = contract.resolveEvidence(state);
    return evidence ? { kind: "fact", evidence } : null;
  }
  if (contract.kind === "rumor") {
    const evidence = contract.resolveSubject?.(state) ?? undefined;
    return { kind: "rumor", sourceLabel: contract.sourceLabel, evidence };
  }
  const receipt = contract.resolveReceipt(state);
  if (!receipt || receipt.source !== "simulation-command") return null;
  return { kind: "command", evidence: receipt };
}

export const MATERIAL_FACTUAL_NARRATIVE_TYPES = [
  "debutHatTrick",
  "targetInjured",
  "hiddenGemVindication",
  "injurySetback",
  "debutBrilliance",
  "internationalTournament",
] as const satisfies readonly NarrativeEventType[];

export type MaterialFactualNarrativeType =
  (typeof MATERIAL_FACTUAL_NARRATIVE_TYPES)[number];

function playerName(player: Player): string {
  return `${player.firstName} ${player.lastName}`;
}

function latestReports(state: GameState): ScoutReport[] {
  return selectLatestReportsByCase(Object.values(state.reports ?? {}));
}

function reportIsBeforeMovement(
  report: ScoutReport,
  movement: PlayerMovementEvent,
): boolean {
  return movement.season > report.submittedSeason
    || (
      movement.season === report.submittedSeason
      && movement.week >= report.submittedWeek
    );
}

function recordedAppearances(player: Player): number {
  return (player.seasonRatings ?? []).reduce(
    (total, season) => total + season.appearances,
    0,
  );
}

function playerRatings(
  state: GameState,
  playerId: string,
): PlayerMatchRating[] {
  return Object.values(state.matchRatings ?? {})
    .map((fixtureRatings) => fixtureRatings[playerId])
    .filter((rating): rating is PlayerMatchRating => Boolean(rating));
}

function findReportedDebutHatTrick(
  state: GameState,
): NarrativeEvidenceReference | null {
  for (const report of latestReports(state)) {
    const player = state.players?.[report.playerId];
    if (!player || recordedAppearances(player) > 0) continue;

    const ratings = playerRatings(state, player.id);
    if (ratings.length !== 1) continue;
    const rating = ratings[0];
    if ((rating.stats.goals ?? 0) < 3) continue;

    return {
      source: "match-rating",
      sourceId: `${rating.fixtureId}:${player.id}`,
      relatedIds: [player.id, rating.fixtureId],
      context: { playerName: playerName(player) },
    };
  }
  return null;
}

function findObservedInjury(
  state: GameState,
  seriousOnly: boolean,
): NarrativeEvidenceReference | null {
  const eligiblePlayerIds = seriousOnly
    ? latestReports(state)
      .filter((report) =>
        report.conviction === "recommend"
        || report.conviction === "strongRecommend"
        || report.conviction === "tablePound"
      )
      .map((report) => report.playerId)
    : Object.values(state.observations ?? {}).map((observation) => observation.playerId);

  for (const playerId of new Set(eligiblePlayerIds)) {
    const player = state.players?.[playerId];
    const injury = player?.currentInjury;
    if (!player || !player.injured || !injury) continue;
    if (
      seriousOnly
      && injury.severity !== "serious"
      && injury.severity !== "career-threatening"
    ) continue;

    return {
      source: "injury-record",
      sourceId: injury.id,
      relatedIds: [player.id, injury.id],
      context: { playerName: playerName(player) },
    };
  }
  return null;
}

function findReportedMovement(
  state: GameState,
): NarrativeEvidenceReference | null {
  const movementTypes = new Set<PlayerMovementEvent["type"]>([
    "permanentTransfer",
    "freeAgentSigning",
    "youthSigning",
  ]);
  const movements = [...(state.playerMovementHistory ?? [])]
    .filter((movement) => movementTypes.has(movement.type) && Boolean(movement.toClubId))
    .sort((left, right) =>
      right.season - left.season
      || right.week - left.week
      || right.id.localeCompare(left.id)
    );

  for (const report of latestReports(state)) {
    const movement = movements.find((candidate) =>
      candidate.playerId === report.playerId
      && reportIsBeforeMovement(report, candidate)
    );
    if (!movement) continue;
    const player = state.players?.[report.playerId]
      ?? state.retiredPlayers?.[report.playerId];
    const destination = movement.toClubId
      ? state.clubs?.[movement.toClubId]
      : undefined;
    if (!player || !destination) continue;

    return {
      source: "player-movement",
      sourceId: movement.id,
      relatedIds: [player.id, destination.id, movement.id],
      context: {
        playerName: playerName(player),
        clubName: destination.name,
      },
    };
  }
  return null;
}

function findAlumniDebut(
  state: GameState,
): NarrativeEvidenceReference | null {
  for (const alumni of state.alumniRecords ?? []) {
    const milestone = (alumni.milestones ?? []).find(
      (item) => item.type === "firstTeamDebut",
    );
    if (!milestone) continue;
    const player = state.players?.[alumni.playerId]
      ?? state.retiredPlayers?.[alumni.playerId];
    if (!player) continue;

    return {
      source: "alumni-milestone",
      sourceId: `${alumni.id}:firstTeamDebut:${milestone.season}:${milestone.week}`,
      relatedIds: [player.id, alumni.id],
      context: { playerName: playerName(player) },
    };
  }
  return null;
}

function tournamentIsCurrentOrUpcoming(
  tournament: TournamentEvent,
  state: GameState,
): boolean {
  if (tournament.season !== state.currentSeason) return false;
  return tournament.endWeek >= state.currentWeek
    && tournament.startWeek <= state.currentWeek + 4;
}

function findInternationalTournament(
  state: GameState,
): NarrativeEvidenceReference | null {
  const tournament = Object.values(state.youthTournaments ?? {})
    .filter((candidate) =>
      candidate.category === "international"
      && candidate.discovered
      && tournamentIsCurrentOrUpcoming(candidate, state)
    )
    .sort((left, right) =>
      left.startWeek - right.startWeek
      || left.id.localeCompare(right.id)
    )[0];
  if (!tournament) return null;

  return {
    source: "tournament",
    sourceId: tournament.id,
    relatedIds: [tournament.id],
    context: {
      tournamentName: tournament.name,
      countryName: tournament.country,
    },
  };
}

export const FACTUAL_NARRATIVE_TRUTH_CONTRACTS = {
  debutHatTrick: {
    kind: "fact",
    resolveEvidence: findReportedDebutHatTrick,
  },
  targetInjured: {
    kind: "fact",
    resolveEvidence: (state) => findObservedInjury(state, false),
  },
  hiddenGemVindication: {
    kind: "fact",
    resolveEvidence: findReportedMovement,
  },
  injurySetback: {
    kind: "fact",
    resolveEvidence: (state) => findObservedInjury(state, true),
  },
  debutBrilliance: {
    kind: "fact",
    resolveEvidence: findAlumniDebut,
  },
  internationalTournament: {
    kind: "fact",
    resolveEvidence: findInternationalTournament,
  },
} satisfies Record<MaterialFactualNarrativeType, FactualNarrativeTruthContract>;
