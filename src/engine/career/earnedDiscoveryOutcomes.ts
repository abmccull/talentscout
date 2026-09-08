import type { Fixture, GameState, PlayerMatchRating, ScoutReport } from "@/engine/core/types";
import type { PlayerSeasonHistory } from "@/engine/world/worldHistoryTypes";
import { resolvePlayerEntity } from "@/lib/playerResolution";

type DiscoveryOutcomeState = Pick<GameState,
  "discoveryRecords" | "reports" | "currentSeason" | "currentWeek"
  | "fixtures" | "matchRatings" | "worldHistory"
  | "players" | "retiredPlayers" | "unsignedYouth"
>;

export interface EarnedDiscoveryOutcome {
  playerId: string;
  nationality?: string;
  successfulSeasons: number[];
  standoutSeasons: number[];
}

function validDate(season: number, week: number): boolean {
  return Number.isInteger(season) && season > 0 && Number.isInteger(week) && week > 0;
}

function compareDate(aSeason: number, aWeek: number, bSeason: number, bWeek: number): number {
  return aSeason - bSeason || aWeek - bWeek;
}

function backsPlayer(report: ScoutReport): boolean {
  const action = report.evidenceAssessment?.recommendation ?? report.recommendedAction;
  // New authored actions take precedence over a legacy conviction label. A pass
  // or monitoring note is not a recommendation, even with optimistic estimates.
  return action !== undefined
    ? new Set<string>(["inviteForTrial", "offerAcademyPlace"]).has(action)
    : new Set<string>(["recommend", "strongRecommend", "tablePound"]).has(report.conviction);
}

/**
 * Retrospective discovery credit from documented recommendations and actual
 * rated appearances. Never reads CA, PA, generated talent tiers, snapshot CA,
 * or the ability-derived careerOutcome label. Missing historical evidence is
 * unknown, not proof of success. Existing achievement unlocks are untouched.
 *
 * A successful season needs 10+ post-report rated appearances averaging 7.0.
 * A standout season needs 20+ averaging 7.5. Full season archives are eligible
 * only after the report season; they cannot tell us which games preceded it.
 */
export function getEarnedDiscoveryOutcomes(state: DiscoveryOutcomeState): EarnedDiscoveryOutcome[] {
  if (!validDate(state.currentSeason, state.currentWeek)) return [];
  const reports = Object.values(state.reports ?? {});
  // Scan the world's match/archive ledgers once, not once per discovery. Most
  // participants are unrelated to this scout and need no award evaluation.
  const trackedIds = new Set((state.discoveryRecords ?? []).map((record) => record.playerId));
  const archivedByPlayer = new Map<string, Array<{ season: number; player: PlayerSeasonHistory }>>();
  for (const archive of state.worldHistory?.seasons ?? []) {
    for (const player of archive.players) {
      if (!trackedIds.has(player.playerId)) continue;
      const history = archivedByPlayer.get(player.playerId) ?? [];
      history.push({ season: archive.season, player });
      archivedByPlayer.set(player.playerId, history);
    }
  }
  const matchesByPlayer = new Map<string, Array<{ fixture: Fixture; rating: PlayerMatchRating }>>();
  for (const [fixtureId, ratings] of Object.entries(state.matchRatings ?? {})) {
    const fixture = state.fixtures?.[fixtureId];
    if (!fixture?.played) continue;
    for (const [playerId, rating] of Object.entries(ratings)) {
      if (!trackedIds.has(playerId)) continue;
      const matches = matchesByPlayer.get(playerId) ?? [];
      matches.push({ fixture, rating });
      matchesByPlayer.set(playerId, matches);
    }
  }
  const earned: EarnedDiscoveryOutcome[] = [];
  const seen = new Set<string>();
  for (const discovery of state.discoveryRecords ?? []) {
    if (seen.has(discovery.playerId)
      || !validDate(discovery.discoveredSeason, discovery.discoveredWeek)) continue;
    seen.add(discovery.playerId);
    const report = reports.filter((candidate) => candidate.playerId === discovery.playerId
      && backsPlayer(candidate)
      && validDate(candidate.submittedSeason, candidate.submittedWeek)
      && compareDate(candidate.submittedSeason, candidate.submittedWeek,
        discovery.discoveredSeason, discovery.discoveredWeek) >= 0
      && compareDate(candidate.submittedSeason, candidate.submittedWeek,
        state.currentSeason, state.currentWeek) < 0)
      .sort((a, b) => compareDate(a.submittedSeason, a.submittedWeek, b.submittedSeason, b.submittedWeek)
        || a.id.localeCompare(b.id))[0];
    if (!report) continue;

    const seasons = new Map<number, { appearances: number; ratingTotal: number }>();
    let archivedNationality: string | undefined;
    const archivedSeasons = new Set<number>();
    for (const archive of archivedByPlayer.get(discovery.playerId) ?? []) {
      if (!Number.isInteger(archive.season) || archive.season <= report.submittedSeason
        || archive.season >= state.currentSeason || archivedSeasons.has(archive.season)) continue;
      const player = archive.player;
      const performance = player?.performance;
      if (!performance || !Number.isInteger(performance.appearances) || performance.appearances <= 0
        || !Number.isFinite(performance.averageRating)
        || performance.averageRating < 1 || performance.averageRating > 10) continue;
      archivedNationality ??= player?.nationality;
      archivedSeasons.add(archive.season);
      seasons.set(archive.season, {
        appearances: performance.appearances,
        ratingTotal: performance.appearances * performance.averageRating,
      });
    }
    const seenFixtures = new Set<string>();
    for (const { fixture, rating } of matchesByPlayer.get(discovery.playerId) ?? []) {
      const season = fixture.season;
      if (!fixture?.played || season === undefined || !validDate(season, fixture.week)
        || archivedSeasons.has(season) || seenFixtures.has(fixture.id)
        || compareDate(season, fixture.week, report.submittedSeason, report.submittedWeek) <= 0
        || compareDate(season, fixture.week, state.currentSeason, state.currentWeek) > 0
        || !rating || rating.playerId !== discovery.playerId || rating.fixtureId !== fixture.id
        || !Number.isFinite(rating.rating) || rating.rating < 1 || rating.rating > 10
        || (rating.minutesPlayed !== undefined
          ? !Number.isFinite(rating.minutesPlayed) || rating.minutesPlayed <= 0
          : rating.started !== true)) continue;
      seenFixtures.add(fixture.id);
      const performance = seasons.get(season) ?? { appearances: 0, ratingTotal: 0 };
      performance.appearances += 1;
      performance.ratingTotal += rating.rating;
      seasons.set(season, performance);
    }
    const successfulSeasons: number[] = [];
    const standoutSeasons: number[] = [];
    for (const [season, performance] of seasons) {
      const average = performance.ratingTotal / performance.appearances;
      if (performance.appearances >= 10 && average >= 7) successfulSeasons.push(season);
      if (performance.appearances >= 20 && average >= 7.5) standoutSeasons.push(season);
    }
    if (successfulSeasons.length === 0) continue;
    earned.push({
      playerId: discovery.playerId,
      nationality: resolvePlayerEntity({
        players: state.players ?? {}, unsignedYouth: state.unsignedYouth ?? {},
        retiredPlayers: state.retiredPlayers,
      }, discovery.playerId)?.player.nationality ?? archivedNationality,
      successfulSeasons: successfulSeasons.sort((a, b) => a - b),
      standoutSeasons: standoutSeasons.sort((a, b) => a - b),
    });
  }
  return earned.sort((a, b) => a.playerId.localeCompare(b.playerId));
}
