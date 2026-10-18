import type { GameState, RecommendationReview } from "@/engine/core/types";
import { expandPlayerMovementHistory } from "@/engine/world/movementRowsArchive";
import { expandSeasonRating } from "@/engine/players/seasonRatingArchive";
import { expandPlayerInjuryHistory } from "@/engine/players/playerStateArchive";
import { expandHistoricalInjury } from "@/engine/players/injuryArchive";
import { resolvePlayerEntity } from "@/lib/playerResolution";

/** Supporting read model only; retained dates and identities remain authoritative. */
export function readYouthConsequenceEvidence(state: GameState, playerId: string) {
  const entity = resolvePlayerEntity(state, playerId);
  const player = entity?.player;
  return {
    playerId, resolved: !!entity, retired: entity?.isRetired,
    clubId: player?.clubId, contractClubId: player?.contractClubId,
    seasonRatings: (player?.seasonRatings ?? []).map(expandSeasonRating),
    injuries: (expandPlayerInjuryHistory(player?.injuryHistory, player?.id ?? playerId)?.injuries ?? [])
      .map((entry) => expandHistoricalInjury(entry, player?.id ?? playerId)),
    movements: expandPlayerMovementHistory(state.playerMovementHistory ?? []).filter((entry) => entry.playerId === playerId),
  };
}

type Clock = { season: number; week: number };
const validDate = (date: Clock) => Number.isInteger(date.season) && date.season > 0
  && Number.isInteger(date.week) && date.week > 0;
const atOrBefore = (date: Clock, due: Clock) => validDate(date)
  && (date.season < due.season || date.season === due.season && date.week <= due.week);

export function validateYouthConsequenceReviewEvidence(
  state: GameState,
  review: Pick<RecommendationReview, "playerId" | "dueSeason" | "dueWeek" | "evidence">,
): string[] {
  const due = { season: review.dueSeason, week: review.dueWeek };
  if (!validDate(due)) return ["invalid-review-due-date"];
  const facts = readYouthConsequenceEvidence(state, review.playerId);
  const failures: string[] = [];
  for (const evidence of review.evidence ?? []) {
    if (evidence.source === "movement") {
      const movement = facts.movements.find((entry) => entry.id === evidence.sourceId);
      if (!movement || !atOrBefore(movement, due)) failures.push(`unresolved-or-future-movement:${evidence.sourceId}`);
    } else if (evidence.source === "seasonRating") {
      const season = Number(evidence.sourceId?.match(/_s(\d+)$/)?.[1]);
      if (!Number.isInteger(season) || season < 1 || season >= due.season
        || evidence.sourceId !== `season_rating_${review.playerId}_s${season}`
        || !facts.seasonRatings.some((entry) => entry.season === season)) failures.push(`unresolved-or-future-season:${evidence.sourceId}`);
    } else if (evidence.source === "injury") {
      const injury = facts.injuries.find((entry) => entry.id === evidence.sourceId);
      if (!injury || injury.playerId !== review.playerId
        || !atOrBefore({ season: injury.occurredSeason, week: injury.occurredWeek }, due)) {
        failures.push(`unresolved-or-future-injury:${evidence.sourceId}`);
      }
    }
  }
  return failures;
}
