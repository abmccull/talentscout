import type {
  GameState,
  Player,
  PlayerMatchRating,
  PlayerMovementEvent,
  Position,
} from "@/engine/core/types";

const RECRUITMENT_TYPES = new Set<PlayerMovementEvent["type"]>([
  "permanentTransfer",
  "freeAgentSigning",
  "loanBuyOption",
]);

export interface RecruitmentCohortOutcome {
  movementId: string;
  playerId: string;
  position: Position;
  ageAtArrival: number;
  crossBorder: boolean;
  appearances: number;
  averageRating?: number;
  retainedSeasons: number;
  outcome: "success" | "failure" | "unresolved";
}

export interface ClubRecruitmentMemory {
  clubId: string;
  evaluatedSignings: number;
  successes: number;
  failures: number;
  unresolved: number;
  confidence: number;
  youngSuccessRate?: number;
  crossBorderSuccessRate?: number;
  positionSuccessRate: Partial<Record<Position, number>>;
  outcomes: RecruitmentCohortOutcome[];
  reasons: string[];
}

function isRecordedAppearance(rating: PlayerMatchRating): boolean {
  if (rating.minutesPlayed !== undefined) return rating.minutesPlayed > 0;
  return rating.started ?? true;
}

function ratingsAfterArrival(
  state: GameState,
  playerId: string,
  movement: PlayerMovementEvent,
  clubId: string,
): PlayerMatchRating[] {
  return Object.entries(state.matchRatings ?? {}).flatMap(([fixtureId, ratings]) => {
    const fixture = state.fixtures[fixtureId];
    if (!fixture?.played) return [];
    if (fixture.homeClubId !== clubId && fixture.awayClubId !== clubId) return [];
    const fixtureSeason = fixture.season ?? state.currentSeason;
    if (
      fixtureSeason < movement.season
      || (fixtureSeason === movement.season && fixture.week < movement.week)
    ) return [];
    const rating = ratings[playerId];
    return rating && isRecordedAppearance(rating) ? [rating] : [];
  });
}

function countryForClub(state: GameState, clubId: string | undefined): string | undefined {
  if (!clubId) return undefined;
  const club = state.clubs[clubId];
  return club ? state.leagues[club.leagueId]?.country : undefined;
}

function laterExit(
  movements: readonly PlayerMovementEvent[],
  arrival: PlayerMovementEvent,
  clubId: string,
): PlayerMovementEvent | undefined {
  return movements.find((movement) =>
    movement.playerId === arrival.playerId
    && (
      movement.season > arrival.season
      || (movement.season === arrival.season && movement.week > arrival.week)
    )
    && (
      movement.type === "release"
      || movement.type === "footballExit"
      || movement.type === "retirement"
      || (movement.type === "permanentTransfer" && movement.fromClubId === clubId)
    )
  );
}

function classifyOutcome(input: {
  appearances: number;
  averageRating?: number;
  retainedSeasons: number;
  exited: boolean;
}): RecruitmentCohortOutcome["outcome"] {
  if (input.appearances >= 8 && (input.averageRating ?? 0) >= 6.8) return "success";
  if (input.retainedSeasons >= 2 && input.appearances >= 5 && (input.averageRating ?? 0) >= 6.5) {
    return "success";
  }
  if (input.exited && input.retainedSeasons <= 2) return "failure";
  if (input.appearances >= 8 && (input.averageRating ?? 10) < 6.2) return "failure";
  return "unresolved";
}

function averageRate(outcomes: readonly RecruitmentCohortOutcome[]): number | undefined {
  const resolved = outcomes.filter((outcome) => outcome.outcome !== "unresolved");
  if (resolved.length === 0) return undefined;
  return Math.round(
    resolved.filter((outcome) => outcome.outcome === "success").length / resolved.length * 100,
  );
}

/**
 * Derive a club's recruitment memory from observable movements and canonical
 * match participation. No hidden ability is used, and no second history ledger
 * is required: the movement ledger remains the source of truth.
 */
export function deriveClubRecruitmentMemory(
  state: GameState,
  clubId: string,
  lookbackSeasons = 5,
): ClubRecruitmentMemory {
  const cutoffSeason = Math.max(1, state.currentSeason - lookbackSeasons);
  const movements = [...(state.playerMovementHistory ?? [])].sort((left, right) =>
    left.season - right.season || left.week - right.week || left.id.localeCompare(right.id)
  );
  const arrivals = movements.filter((movement) =>
    RECRUITMENT_TYPES.has(movement.type)
    && movement.toClubId === clubId
    && movement.season >= cutoffSeason
  );

  const outcomes = arrivals.flatMap((movement): RecruitmentCohortOutcome[] => {
    const player: Player | undefined = state.players[movement.playerId]
      ?? state.retiredPlayers[movement.playerId];
    if (!player) return [];
    const ratings = ratingsAfterArrival(state, player.id, movement, clubId);
    const averageRating = ratings.length > 0
      ? Math.round(ratings.reduce((total, rating) => total + rating.rating, 0) / ratings.length * 10) / 10
      : undefined;
    const exit = laterExit(movements, movement, clubId);
    const exitSeason = exit?.season ?? state.currentSeason;
    const retainedSeasons = Math.max(0, exitSeason - movement.season);
    const sourceCountry = countryForClub(state, movement.fromClubId);
    const destinationCountry = countryForClub(state, clubId);
    const ageAtArrival = Math.max(15, player.age - Math.max(0, state.currentSeason - movement.season));

    return [{
      movementId: movement.id,
      playerId: player.id,
      position: player.position,
      ageAtArrival,
      crossBorder: Boolean(sourceCountry && destinationCountry && sourceCountry !== destinationCountry),
      appearances: ratings.length,
      ...(averageRating !== undefined ? { averageRating } : {}),
      retainedSeasons,
      outcome: classifyOutcome({
        appearances: ratings.length,
        averageRating,
        retainedSeasons,
        exited: Boolean(exit),
      }),
    }];
  });

  const successes = outcomes.filter((outcome) => outcome.outcome === "success").length;
  const failures = outcomes.filter((outcome) => outcome.outcome === "failure").length;
  const resolvedCount = successes + failures;
  const positionSuccessRate = {} as Partial<Record<Position, number>>;
  for (const position of new Set(outcomes.map((outcome) => outcome.position))) {
    const rate = averageRate(outcomes.filter((outcome) => outcome.position === position));
    if (rate !== undefined) positionSuccessRate[position] = rate;
  }
  const youngSuccessRate = averageRate(outcomes.filter((outcome) => outcome.ageAtArrival <= 23));
  const crossBorderSuccessRate = averageRate(outcomes.filter((outcome) => outcome.crossBorder));
  const confidence = Math.min(100, Math.round(resolvedCount / 8 * 100));

  return {
    clubId,
    evaluatedSignings: outcomes.length,
    successes,
    failures,
    unresolved: outcomes.length - resolvedCount,
    confidence,
    ...(youngSuccessRate !== undefined ? { youngSuccessRate } : {}),
    ...(crossBorderSuccessRate !== undefined ? { crossBorderSuccessRate } : {}),
    positionSuccessRate,
    outcomes,
    reasons: outcomes.length === 0
      ? ["No recent signings have enough observable history to shape recruitment behaviour."]
      : [
          `${successes} successful and ${failures} failed recent signings are supported by movement and match evidence.`,
          confidence >= 60
            ? "The club has enough evidence to lean into proven recruitment lanes."
            : "The sample remains limited, so historical outcomes should only nudge future decisions.",
        ],
  };
}

/** A bounded multiplier: history nudges doctrine, it never dictates a signing. */
export function scoreRecruitmentMemoryFit(
  memory: ClubRecruitmentMemory,
  candidate: Pick<Player, "age" | "position">,
  crossBorder: boolean,
): number {
  if (memory.confidence === 0) return 1;
  const confidenceWeight = memory.confidence / 100;
  const signals = [
    memory.positionSuccessRate[candidate.position],
    candidate.age <= 23 ? memory.youngSuccessRate : undefined,
    crossBorder ? memory.crossBorderSuccessRate : undefined,
  ].filter((value): value is number => value !== undefined);
  if (signals.length === 0) return 1;
  const average = signals.reduce((total, value) => total + value, 0) / signals.length;
  const centered = (average - 50) / 50;
  return Math.round((1 + centered * 0.18 * confidenceWeight) * 1000) / 1000;
}
