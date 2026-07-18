import type {
  Club,
  Fixture,
  GameState,
  League,
  ManagerProfile,
  Player,
  PlayerMatchRating,
} from "@/engine/core/types";

type CoverageLeague = League & { coverageTier?: "full" | "abstract" | "contactOnly" };

export interface AbstractCompetitionHarness {
  leagues: Record<string, League>;
  clubs: Record<string, Club>;
  players: Record<string, Player>;
  managerProfiles: Record<string, ManagerProfile>;
}

function makeLeague(
  id: string,
  coverageTier: CoverageLeague["coverageTier"],
  clubIds: string[],
): CoverageLeague {
  return {
    id,
    name: `${id} League`,
    shortName: id.toUpperCase(),
    country: "Testland",
    tier: 1,
    clubIds,
    season: 3,
    coverageTier,
  };
}

function makeClub(id: string, leagueId: string): Club {
  return {
    id,
    name: `${id} FC`,
    shortName: id.slice(0, 3).toUpperCase(),
    leagueId,
    reputation: 55,
    budget: 2_000_000,
    scoutingPhilosophy: "academyFirst",
    managerId: `${id}-manager`,
    playerIds: [],
    academyPlayerIds: [],
    youthAcademyRating: 12,
  };
}

function makePlayer(
  id: string,
  clubId: string,
  position: Player["position"],
  currentAbility: number,
  index: number,
): Player {
  return {
    id,
    firstName: "Test",
    lastName: id,
    age: 18 + (index % 6),
    dateOfBirth: { day: 1, month: 1, year: 2000 - index },
    nationality: "Testland",
    position,
    secondaryPositions: [],
    preferredFoot: "right",
    clubId,
    contractClubId: clubId,
    contractExpiry: 6,
    wage: 1_000,
    marketValue: 500_000,
    attributes: {} as Player["attributes"],
    currentAbility,
    potentialAbility: currentAbility + 12,
    developmentProfile: "steadyGrower",
    wonderkidTier: "qualityPro",
    form: (index % 3) - 1,
    morale: 6 + (index % 3),
    injured: false,
    injuryWeeksRemaining: 0,
    personalityTraits: [],
    personalityRevealed: [],
    playerTraits: [],
    playerTraitsRevealed: [],
    recentMatchRatings: [],
    seasonRatings: [],
  };
}

function seedClubSquad(
  club: Club,
  players: Record<string, Player>,
  strengthBase: number,
): void {
  const positions: Player["position"][] = [
    "GK",
    "LB",
    "CB",
    "CB",
    "RB",
    "CDM",
    "CM",
    "CAM",
    "LW",
    "RW",
    "ST",
    "CM",
    "ST",
    "CB",
  ];

  positions.forEach((position, index) => {
    const player = makePlayer(
      `${club.id}-${index}`,
      club.id,
      position,
      strengthBase + (positions.length - index),
      index,
    );
    players[player.id] = player;
    club.playerIds.push(player.id);
  });
}

function makeManager(clubId: string, preferredFormation = "4-3-3"): ManagerProfile {
  return {
    clubId,
    managerName: `${clubId} manager`,
    preference: "balanced",
    reportInfluence: 0.5,
    preferredFormation,
  };
}

export function buildAbstractCompetitionHarness(): AbstractCompetitionHarness {
  const abstractClubIds = ["abstract-a", "abstract-b", "abstract-c", "abstract-d"];
  const fullClubIds = ["full-a", "full-b"];
  const leagues: Record<string, League> = {
    "league-abstract": makeLeague("league-abstract", "abstract", abstractClubIds),
    "league-full": makeLeague("league-full", "full", fullClubIds),
  };
  const clubs: Record<string, Club> = {};
  const players: Record<string, Player> = {};
  const managerProfiles: Record<string, ManagerProfile> = {};

  abstractClubIds.forEach((clubId, index) => {
    clubs[clubId] = makeClub(clubId, "league-abstract");
    seedClubSquad(clubs[clubId], players, 118 - index * 3);
    managerProfiles[clubId] = makeManager(clubId);
  });

  fullClubIds.forEach((clubId, index) => {
    clubs[clubId] = makeClub(clubId, "league-full");
    seedClubSquad(clubs[clubId], players, 104 - index * 2);
    managerProfiles[clubId] = makeManager(clubId);
  });

  return { leagues, clubs, players, managerProfiles };
}

export function mergeAbstractFixtures(
  fixturesPlayed: readonly Fixture[],
  existing: Record<string, Fixture> = {},
): Record<string, Fixture> {
  return {
    ...existing,
    ...Object.fromEntries(fixturesPlayed.map((fixture) => [fixture.id, fixture])),
  };
}

export function mergeAbstractMatchRatings(
  matchRatingsByFixture: Record<string, Record<string, PlayerMatchRating>>,
  existing: Record<string, Record<string, PlayerMatchRating>> = {},
): Record<string, Record<string, PlayerMatchRating>> {
  return {
    ...existing,
    ...matchRatingsByFixture,
  };
}

export function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function minimalGameState(overrides: Partial<GameState>): GameState {
  return overrides as GameState;
}
