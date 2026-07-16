import type {
  GameState,
  NarrativeEventType,
  Player,
  PlayerMatchRating,
  PlayerMovementEvent,
  ScoutReport,
  TournamentEvent,
} from "@/engine/core/types";
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
