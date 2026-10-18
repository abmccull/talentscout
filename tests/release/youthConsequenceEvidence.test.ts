import { describe, expect, it } from "vitest";
import type { GameState, InjuryHistory, Player, RecommendationReview } from "@/engine/core/types";
import { compactPlayerMovementHistory } from "@/engine/world/movementRowsArchive";
import { compactSeasonRating } from "@/engine/players/seasonRatingArchive";
import { compactHistoricalInjury } from "@/engine/players/injuryArchive";
import { compactPlayerInjuryHistory } from "@/engine/players/playerStateArchive";
import { readYouthConsequenceEvidence, validateYouthConsequenceReviewEvidence } from "./youthConsequenceEvidence";

function fixture(compact: boolean) {
  const player = { id: "scouted", clubId: "academy", contractClubId: "academy",
    seasonRatings: [{ season: 2, avgRating: 6.5, appearances: 10, goals: 1, assists: 2, cleanSheets: 0 }],
    injuryHistory: { playerId: "scouted", totalWeeksMissed: 2, injuryProneness: 1, reinjuryWindowWeeksLeft: 0,
      injuries: [{ id: "injury", playerId: "scouted", type: "muscle", severity: "minor", recoveryWeeks: 2,
        weeksRemaining: 2, reinjuryRisk: 0, occurredSeason: 2, occurredWeek: 12 }] },
  } as Player;
  const state = { players: {}, unsignedYouth: {}, retiredPlayers: { scouted: player },
    playerMovementHistory: [
      { id: "signing", playerId: "scouted", type: "youthSigning", season: 2, week: 10, toClubId: "academy" },
      ...Array.from({ length: 40 }, (_, index) => ({ id: `other-${index}`, playerId: "other", type: "contractRenewal", season: 2, week: index + 1 })),
    ],
  } as unknown as GameState;
  if (compact) {
    state.playerMovementHistory = compactPlayerMovementHistory(state.playerMovementHistory);
    expect(Array.isArray(state.playerMovementHistory)).toBe(false);
    player.seasonRatings = player.seasonRatings!.map(compactSeasonRating);
    const history = player.injuryHistory as InjuryHistory;
    history.injuries = history.injuries.map((injury) => compactHistoricalInjury(injury, player.id));
    player.injuryHistory = compactPlayerInjuryHistory(history, player.id);
    expect(Array.isArray(player.injuryHistory)).toBe(true);
  }
  const review: Pick<RecommendationReview, "playerId" | "dueSeason" | "dueWeek" | "evidence"> = {
    playerId: "scouted", dueSeason: 3, dueWeek: 10,
    evidence: [
      { source: "movement", sourceId: "signing", description: "Recorded signing" },
      { source: "seasonRating", sourceId: "season_rating_scouted_s2", description: "Completed season" },
      { source: "injury", sourceId: "injury", description: "Recorded injury" },
    ],
  };
  return { state, player, review };
}

describe("dated youth consequence evidence", () => {
  it("resolves equivalent compact and ordinary archived facts without rewriting the saved state", () => {
    const ordinary = fixture(false), packed = fixture(true);
    const before = JSON.stringify(packed.state);
    expect(readYouthConsequenceEvidence(packed.state, "scouted")).toEqual(readYouthConsequenceEvidence(ordinary.state, "scouted"));
    expect(validateYouthConsequenceReviewEvidence(packed.state, packed.review)).toEqual([]);
    expect(JSON.stringify(packed.state)).toBe(before);
  });
  it.each([false, true])("refuses missing, another-player, or future evidence (compact=%s)", (compact) => {
    const { state, review } = fixture(compact);
    for (const sourceId of ["missing", "other-0"]) {
      expect(validateYouthConsequenceReviewEvidence(state, { ...review, evidence: [{ source: "movement", sourceId, description: "Unproven" }] })).not.toEqual([]);
    }
    expect(validateYouthConsequenceReviewEvidence(state, { ...review, dueSeason: 2, dueWeek: 9 })).not.toEqual([]);
    expect(validateYouthConsequenceReviewEvidence(state, { ...review, evidence: [{ source: "seasonRating", sourceId: "season_rating_scouted_s3", description: "Future season" }] })).not.toEqual([]);
    expect(validateYouthConsequenceReviewEvidence(state, { ...review, dueSeason: 2, dueWeek: 11,
      evidence: [{ source: "injury", sourceId: "injury", description: "Future injury" }] })).not.toEqual([]);
    expect(validateYouthConsequenceReviewEvidence(state, { ...review, dueSeason: 2, dueWeek: 10,
      evidence: [{ source: "movement", sourceId: "signing", description: "Same-week signing" }] })).toEqual([]);
    expect(validateYouthConsequenceReviewEvidence(state, { ...review, dueWeek: Number.NaN })).not.toEqual([]);
  });
  it("keeps unknown historical facts empty rather than manufacturing a date or player", () => {
    const { state, review } = fixture(true);
    expect(readYouthConsequenceEvidence(state, "missing")).toMatchObject({ resolved: false, seasonRatings: [], injuries: [], movements: [] });
    expect(validateYouthConsequenceReviewEvidence(state, { ...review, playerId: "missing" })).not.toEqual([]);
  });
  it("rejects another player's season receipt even when the subject has a rating in that season", () => {
    const { state, review } = fixture(true);
    expect(validateYouthConsequenceReviewEvidence(state, { ...review,
      evidence: [{ source: "seasonRating", sourceId: "season_rating_other_s2", description: "Another player" }] })).not.toEqual([]);
  });
  it("rejects retained injury records explicitly belonging to another player", () => {
    const { state, player, review } = fixture(false);
    const injury = (player.injuryHistory as InjuryHistory).injuries[0];
    if (Array.isArray(injury)) throw new Error("Expected ordinary fixture");
    injury.playerId = "other";
    expect(validateYouthConsequenceReviewEvidence(state, { ...review,
      evidence: [{ source: "injury", sourceId: "injury", description: "Another player" }] })).not.toEqual([]);
  });
});
