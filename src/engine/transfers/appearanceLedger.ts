import type { Club, GameState, Player, PlayerMatchRating } from "@/engine/core/types";

export type AppearanceLedgerState =
  Pick<GameState, "currentSeason" | "clubs">
  & Partial<Pick<GameState, "fixtures" | "matchRatings">>;

interface AppearanceLedgerCacheEntry {
  season: number;
  fixturesRef: AppearanceLedgerState["fixtures"];
  clubsRef: AppearanceLedgerState["clubs"];
  appearanceCounts: Map<string, Map<string, number>>;
}

const appearanceLedgerCache = new WeakMap<
  NonNullable<AppearanceLedgerState["matchRatings"]>,
  AppearanceLedgerCacheEntry
>();

function participated(rating: PlayerMatchRating | undefined): boolean {
  if (!rating) return false;
  return rating.minutesPlayed !== undefined ? rating.minutesPlayed > 0 : rating.started ?? true;
}

function rosterForClub(club: Club): Set<string> {
  return new Set([
    ...club.playerIds,
    ...(club.loanedInPlayerIds ?? []),
  ]);
}

function incrementCount(
  appearanceCounts: Map<string, Map<string, number>>,
  clubId: string,
  playerId: string,
): void {
  let clubCounts = appearanceCounts.get(clubId);
  if (!clubCounts) {
    clubCounts = new Map<string, number>();
    appearanceCounts.set(clubId, clubCounts);
  }
  clubCounts.set(playerId, (clubCounts.get(playerId) ?? 0) + 1);
}

function buildAppearanceLedger(state: AppearanceLedgerState): AppearanceLedgerCacheEntry | null {
  if (!state.fixtures || !state.matchRatings) return null;

  const appearanceCounts = new Map<string, Map<string, number>>();
  const rosterByClubId = new Map<string, Set<string>>();

  for (const [fixtureId, ratings] of Object.entries(state.matchRatings)) {
    const fixture = state.fixtures[fixtureId];
    if (
      !fixture?.played
      || fixture.season !== state.currentSeason
    ) {
      continue;
    }

    let homeRoster = rosterByClubId.get(fixture.homeClubId);
    if (!homeRoster) {
      const homeClub = state.clubs[fixture.homeClubId];
      homeRoster = homeClub ? rosterForClub(homeClub) : new Set<string>();
      rosterByClubId.set(fixture.homeClubId, homeRoster);
    }

    let awayRoster = rosterByClubId.get(fixture.awayClubId);
    if (!awayRoster) {
      const awayClub = state.clubs[fixture.awayClubId];
      awayRoster = awayClub ? rosterForClub(awayClub) : new Set<string>();
      rosterByClubId.set(fixture.awayClubId, awayRoster);
    }

    for (const rating of Object.values(ratings)) {
      if (!participated(rating)) continue;
      if (homeRoster.has(rating.playerId)) {
        incrementCount(appearanceCounts, fixture.homeClubId, rating.playerId);
      }
      if (awayRoster.has(rating.playerId)) {
        incrementCount(appearanceCounts, fixture.awayClubId, rating.playerId);
      }
    }
  }

  return {
    season: state.currentSeason,
    fixturesRef: state.fixtures,
    clubsRef: state.clubs,
    appearanceCounts,
  };
}

function getAppearanceLedger(state: AppearanceLedgerState): AppearanceLedgerCacheEntry | null {
  const matchRatings = state.matchRatings;
  if (!matchRatings) return null;

  const cached = appearanceLedgerCache.get(matchRatings);
  if (
    cached
    && cached.season === state.currentSeason
    && cached.fixturesRef === state.fixtures
    && cached.clubsRef === state.clubs
  ) {
    return cached;
  }

  const rebuilt = buildAppearanceLedger(state);
  if (!rebuilt) return null;
  appearanceLedgerCache.set(matchRatings, rebuilt);
  return rebuilt;
}

function scanCurrentSeasonAppearances(
  playerId: string,
  clubId: string,
  state: AppearanceLedgerState,
): number {
  if (!state.fixtures || !state.matchRatings) return 0;

  let appearances = 0;
  for (const [fixtureId, ratings] of Object.entries(state.matchRatings)) {
    const fixture = state.fixtures[fixtureId];
    if (
      !fixture?.played
      || fixture.season !== state.currentSeason
      || (fixture.homeClubId !== clubId && fixture.awayClubId !== clubId)
    ) {
      continue;
    }
    if (participated(ratings[playerId])) appearances += 1;
  }
  return appearances;
}

export function getCurrentSeasonAppearances(
  player: Pick<Player, "id">,
  clubId: string,
  state: AppearanceLedgerState,
): number {
  const ledger = getAppearanceLedger(state);
  if (!ledger) {
    return scanCurrentSeasonAppearances(player.id, clubId, state);
  }
  return ledger.appearanceCounts.get(clubId)?.get(player.id) ?? 0;
}
