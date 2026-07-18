import type {
  Club,
  Fixture,
  League,
  Player,
  PlayerMatchRating,
  Weather,
} from "@/engine/core/types";
import { RNG } from "@/engine/rng";

export const ABSTRACT_COMPETITION_SIMULATION_DETAIL = "abstract" as const;

export type CompetitionCoverageTier = "full" | "abstract" | "contactOnly";

export interface AbstractCompetitionLeague extends League {
  coverageTier?: CompetitionCoverageTier;
}

export interface AbstractCompetitionFixture extends Fixture {
  simulationDetail?: "full" | "abstract";
}

export interface AbstractPlayedFixture extends AbstractCompetitionFixture {
  played: true;
  homeGoals: number;
  awayGoals: number;
  attendance: number;
  weather: Weather;
  playerRatings: Record<string, PlayerMatchRating>;
}

export interface AbstractCompetitionWeekInput {
  worldSeed: string;
  season: number;
  week: number;
  leagues: Record<string, League>;
  clubs: Record<string, Club>;
  players: Record<string, Player>;
  fixtures?: Record<string, Fixture>;
  matchRatings?: Record<string, Record<string, PlayerMatchRating>>;
  /**
   * Optional global season length from the parent world. When it is longer
   * than the league's abstract round count, rounds are spaced across that
   * larger calendar without inventing extra competition rows.
   */
  seasonLength?: number;
}

export interface AbstractCompetitionWeekResult {
  fixturesPlayed: AbstractPlayedFixture[];
  matchRatingsByFixture: Record<string, Record<string, PlayerMatchRating>>;
  skippedFixtureIds: string[];
}

interface ScheduledFixture {
  homeClubId: string;
  awayClubId: string;
}

interface Participant {
  player: Player;
  started: boolean;
  minutesPlayed: number;
}

type PositionGroup = "gk" | "def" | "mid" | "att";

interface FixtureLookupIndex {
  byPairKey: Map<string, Fixture>;
}

type FixtureLookupResolver = () => FixtureLookupIndex | undefined;

const ABSTRACT_ROUND_CACHE = new Map<string, ScheduledFixture[][]>();

const WEATHER_BY_PHASE: ReadonlyArray<ReadonlyArray<Weather>> = [
  ["clear", "cloudy", "rain"],
  ["cloudy", "rain", "windy"],
  ["cloudy", "heavyRain", "windy", "snow"],
  ["clear", "cloudy", "rain", "windy"],
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundToSingleDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

function uniqueSorted(ids: readonly string[]): string[] {
  return [...new Set(ids)].sort((left, right) => left.localeCompare(right));
}

function fixtureLookupKey(
  leagueId: string,
  season: number,
  week: number,
  homeClubId: string,
  awayClubId: string,
): string {
  return `${leagueId}|${season}|${week}|${homeClubId}|${awayClubId}`;
}

export function isAbstractCompetitionLeague(
  league: League,
): league is AbstractCompetitionLeague {
  return (league as AbstractCompetitionLeague).coverageTier === "abstract";
}

function buildSingleRoundRobin(clubIds: readonly string[]): ScheduledFixture[][] {
  const ids = uniqueSorted(clubIds);
  if (ids.length < 2) return [];

  const rotation = ids.slice();
  if (rotation.length % 2 !== 0) {
    rotation.push("__bye__");
  }

  const rounds: ScheduledFixture[][] = [];
  const fixed = rotation[0];
  const moving = rotation.slice(1);
  const total = rotation.length;
  const matchesPerRound = total / 2;

  for (let roundIndex = 0; roundIndex < total - 1; roundIndex += 1) {
    const ring = [fixed, ...moving];
    const round: ScheduledFixture[] = [];

    for (let slot = 0; slot < matchesPerRound; slot += 1) {
      const left = ring[slot];
      const right = ring[total - 1 - slot];
      if (left === "__bye__" || right === "__bye__") continue;

      if (roundIndex % 2 === 0) {
        round.push({ homeClubId: left, awayClubId: right });
      } else {
        round.push({ homeClubId: right, awayClubId: left });
      }
    }

    rounds.push(round);

    const tail = moving.pop();
    if (tail) {
      moving.unshift(tail);
    }
  }

  return rounds;
}

function buildDoubleRoundRobin(clubIds: readonly string[]): ScheduledFixture[][] {
  const cacheKey = uniqueSorted(clubIds).join("|");
  const cached = ABSTRACT_ROUND_CACHE.get(cacheKey);
  if (cached) return cached;

  const firstLeg = buildSingleRoundRobin(clubIds);
  const secondLeg = firstLeg.map((round) =>
    round.map((fixture) => ({
      homeClubId: fixture.awayClubId,
      awayClubId: fixture.homeClubId,
    })),
  );
  const rounds = [...firstLeg, ...secondLeg];
  ABSTRACT_ROUND_CACHE.set(cacheKey, rounds);
  return rounds;
}

export function getAbstractLeagueSeasonLength(league: Pick<League, "clubIds">): number {
  return buildDoubleRoundRobin(league.clubIds).length;
}

function getRoundIndexForWeek(
  totalRounds: number,
  week: number,
  seasonLength?: number,
): number | undefined {
  if (week < 1 || totalRounds <= 0) return undefined;
  const effectiveSeasonLength = seasonLength && seasonLength >= totalRounds
    ? seasonLength
    : totalRounds;
  if (week > effectiveSeasonLength) return undefined;

  const currentIndex = Math.floor(((week - 1) * totalRounds) / effectiveSeasonLength);
  const previousIndex = week > 1
    ? Math.floor(((week - 2) * totalRounds) / effectiveSeasonLength)
    : -1;

  if (currentIndex === previousIndex || currentIndex >= totalRounds) {
    return undefined;
  }

  return currentIndex;
}

function createAbstractFixtureId(
  leagueId: string,
  season: number,
  week: number,
  homeClubId: string,
  awayClubId: string,
): string {
  return `abstract-${leagueId}-s${season}-w${week}-${homeClubId}-${awayClubId}`;
}

function findExistingFixture(
  fixtures: Record<string, Fixture> | undefined,
  resolveLookup: FixtureLookupResolver,
  leagueId: string,
  season: number,
  week: number,
  homeClubId: string,
  awayClubId: string,
): Fixture | undefined {
  if (!fixtures) return undefined;

  const canonicalId = createAbstractFixtureId(
    leagueId,
    season,
    week,
    homeClubId,
    awayClubId,
  );
  const exact = fixtures[canonicalId];
  if (exact) return exact;

  return resolveLookup()?.byPairKey.get(
    fixtureLookupKey(leagueId, season, week, homeClubId, awayClubId),
  );
}

function buildFixtureLookupIndex(
  fixtures: Record<string, Fixture> | undefined,
): FixtureLookupIndex | undefined {
  if (!fixtures) return undefined;

  const byPairKey = new Map<string, Fixture>();
  for (const fixture of Object.values(fixtures)) {
    if (!fixture.leagueId || !fixture.homeClubId || !fixture.awayClubId || !fixture.week) continue;
    const season = fixture.season;
    if (typeof season !== "number") continue;
    byPairKey.set(
      fixtureLookupKey(
        fixture.leagueId,
        season,
        fixture.week,
        fixture.homeClubId,
        fixture.awayClubId,
      ),
      fixture,
    );
  }

  return { byPairKey };
}

function isResolvedFixture(
  fixture: Fixture | undefined,
  matchRatings: Record<string, Record<string, PlayerMatchRating>> | undefined,
): boolean {
  if (!fixture || fixture.played !== true) return false;
  const ratings = matchRatings?.[fixture.id];
  return Boolean(ratings && Object.keys(ratings).length > 0);
}

function positionGroup(position: Player["position"]): PositionGroup {
  switch (position) {
    case "GK":
      return "gk";
    case "CB":
    case "LB":
    case "RB":
      return "def";
    case "CDM":
    case "CM":
    case "CAM":
      return "mid";
    case "LW":
    case "RW":
    case "ST":
    default:
      return "att";
  }
}

function selectionScore(player: Player): number {
  const disciplinePenalty = player.injured ? 120 : 0;
  return (
    player.currentAbility * 100
    + (player.form + 3) * 25
    + (player.morale ?? 5) * 12
    - disciplinePenalty
  );
}

function comparePlayers(left: Player, right: Player): number {
  return selectionScore(right) - selectionScore(left)
    || right.currentAbility - left.currentAbility
    || right.form - left.form
    || (right.morale ?? 5) - (left.morale ?? 5)
    || left.id.localeCompare(right.id);
}

function getClubRoster(
  club: Club,
  players: Record<string, Player>,
): Player[] {
  const seniorRosterIds = uniqueSorted([
    ...club.playerIds,
    ...(club.loanedInPlayerIds ?? []),
  ]);

  const seniorRoster = seniorRosterIds
    .map((playerId) => players[playerId])
    .filter((player): player is Player => Boolean(player))
    .filter((player) => player.clubId === club.id);

  if (seniorRoster.length >= 11) {
    const fit = seniorRoster.filter((player) => !player.injured);
    return (fit.length >= 11 ? fit : seniorRoster).sort(comparePlayers);
  }

  // A thin senior list should call up registered academy players. Previously
  // academy cover was considered only when the senior list was completely
  // empty, so a club with one remaining senior and a healthy youth squad tried
  // to play every abstract fixture with that single player.
  const emergencyRosterIds = uniqueSorted([
    ...seniorRosterIds,
    ...(club.academyPlayerIds ?? []),
  ]);
  const emergencyRoster = emergencyRosterIds
    .map((playerId) => players[playerId])
    .filter((player): player is Player => Boolean(player))
    .filter((player) => player.clubId === club.id);
  const fitEmergencyRoster = emergencyRoster.filter((player) => !player.injured);
  return (fitEmergencyRoster.length >= 11 ? fitEmergencyRoster : emergencyRoster)
    .sort(comparePlayers);
}

function takeBestPlayers(
  pool: Player[],
  selected: Map<string, Player>,
  count: number,
  predicate: (player: Player) => boolean,
): void {
  for (const player of pool) {
    if (selected.size >= 11 || count <= 0) break;
    if (!selected.has(player.id) && predicate(player)) {
      selected.set(player.id, player);
      count -= 1;
    }
  }
}

function selectParticipants(
  club: Club,
  players: Record<string, Player>,
  rng: RNG,
): Participant[] {
  const roster = getClubRoster(club, players);
  if (roster.length === 0) return [];

  const selected = new Map<string, Player>();
  takeBestPlayers(roster, selected, 1, (player) => positionGroup(player.position) === "gk");
  takeBestPlayers(roster, selected, 4, (player) => positionGroup(player.position) === "def");
  takeBestPlayers(roster, selected, 3, (player) => positionGroup(player.position) === "mid");
  takeBestPlayers(roster, selected, 3, (player) => positionGroup(player.position) === "att");
  takeBestPlayers(roster, selected, 11, () => true);

  const starters = [...selected.values()].sort(comparePlayers).slice(0, 11);
  const starterIds = new Set(starters.map((player) => player.id));
  const bench = roster.filter((player) => !starterIds.has(player.id)).slice(0, 5);

  const participants: Participant[] = starters.map((player) => ({
    player,
    started: true,
    minutesPlayed: 90,
  }));

  const maxSubs = Math.min(3, bench.length);
  if (maxSubs === 0) return participants;

  const subCount = rng.nextInt(1, maxSubs);
  const replacedStarterIds = new Set<string>();

  for (const substitute of bench.slice(0, subCount)) {
    const preferredGroup = positionGroup(substitute.position);
    const candidates = participants.filter((participant) =>
      !replacedStarterIds.has(participant.player.id)
      && participant.started
      && positionGroup(participant.player.position) === preferredGroup,
    );
    const fallback = participants.filter((participant) =>
      !replacedStarterIds.has(participant.player.id)
      && participant.started
      && positionGroup(participant.player.position) !== "gk",
    );
    const targetPool = candidates.length > 0 ? candidates : fallback;
    if (targetPool.length === 0) continue;

    const replaced = [...targetPool].sort(
      (left, right) =>
        selectionScore(left.player) - selectionScore(right.player)
        || left.player.id.localeCompare(right.player.id),
    )[0];
    const minute = rng.nextInt(58, 82);
    replaced.minutesPlayed = Math.min(replaced.minutesPlayed, minute);
    replacedStarterIds.add(replaced.player.id);
    participants.push({
      player: substitute,
      started: false,
      minutesPlayed: 90 - minute,
    });
  }

  return participants.sort(
    (left, right) =>
      Number(right.started) - Number(left.started)
      || right.minutesPlayed - left.minutesPlayed
      || comparePlayers(left.player, right.player),
  );
}

function averageStrength(participants: readonly Participant[]): number {
  if (participants.length === 0) return 80;
  const total = participants.reduce(
    (sum, participant) => sum + participant.player.currentAbility,
    0,
  );
  return total / participants.length;
}

function samplePoisson(lambda: number, rng: RNG): number {
  const limit = Math.exp(-clamp(lambda, 0.15, 4.5));
  let product = 1;
  let draws = 0;
  while (product > limit && draws < 8) {
    draws += 1;
    product *= Math.max(rng.next(), 1e-9);
  }
  return Math.max(0, draws - 1);
}

function pickWeather(season: number, week: number, rng: RNG): Weather {
  const phase = (season + week) % WEATHER_BY_PHASE.length;
  const options = WEATHER_BY_PHASE[phase];
  return options[rng.nextInt(0, options.length - 1)];
}

function pickWeightedParticipant(
  participants: readonly Participant[],
  rng: RNG,
  preferredGroups: readonly PositionGroup[],
  excludePlayerId?: string,
): Participant | undefined {
  const weighted = participants
    .filter((participant) =>
      participant.minutesPlayed > 0
      && participant.player.id !== excludePlayerId
      && preferredGroups.includes(positionGroup(participant.player.position)),
    )
    .map((participant) => ({
      item: participant,
      weight: Math.max(
        1,
        participant.minutesPlayed
        + Math.round(participant.player.currentAbility / 3)
        + (positionGroup(participant.player.position) === "att" ? 20 : 0)
        + (positionGroup(participant.player.position) === "mid" ? 10 : 0),
      ),
    }));

  if (weighted.length > 0) {
    return rng.pickWeighted(weighted);
  }

  const fallback = participants
    .filter((participant) =>
      participant.minutesPlayed > 0
      && participant.player.id !== excludePlayerId,
    )
    .map((participant) => ({
      item: participant,
      weight: Math.max(1, participant.minutesPlayed + Math.round(participant.player.currentAbility / 4)),
    }));

  return fallback.length > 0 ? rng.pickWeighted(fallback) : undefined;
}

function calculateAttendance(
  homeClub: Club,
  awayClub: Club,
  league: League,
  homeGoals: number,
  awayGoals: number,
): number {
  const base = 1200 + homeClub.reputation * 260 + awayClub.reputation * 120;
  const tierAdjustment = Math.max(0, league.tier - 1) * 900;
  const dramaBonus = (homeGoals + awayGoals) * 240;
  return Math.round(clamp(base - tierAdjustment + dramaBonus, 600, 82_000));
}

function buildRatings(
  fixtureId: string,
  teamParticipants: readonly Participant[],
  opponentParticipants: readonly Participant[],
  goalsFor: number,
  goalsAgainst: number,
  rng: RNG,
): Record<string, PlayerMatchRating> {
  const statsByPlayerId = new Map<string, PlayerMatchRating["stats"]>();
  for (const participant of teamParticipants) {
    statsByPlayerId.set(participant.player.id, {});
  }

  for (let goalIndex = 0; goalIndex < goalsFor; goalIndex += 1) {
    const scorer = pickWeightedParticipant(teamParticipants, rng, ["att", "mid", "def"]);
    // A depleted club can temporarily reach a fixture without a registered
    // participant. Keep the world transaction valid and leave the goal
    // unattributed instead of asking the RNG to select from an empty pool.
    if (!scorer) break;
    const scorerStats = statsByPlayerId.get(scorer.player.id) ?? {};
    scorerStats.goals = (scorerStats.goals ?? 0) + 1;
    scorerStats.shots = (scorerStats.shots ?? 0) + 1 + rng.nextInt(0, 2);
    statsByPlayerId.set(scorer.player.id, scorerStats);

    if (rng.chance(0.72)) {
      const assister = pickWeightedParticipant(
        teamParticipants,
        rng,
        ["mid", "att", "def"],
        scorer.player.id,
      );
      // One-player emergency squads can still produce a scorer, but there is
      // no valid teammate to credit with an assist.
      if (assister) {
        const assistStats = statsByPlayerId.get(assister.player.id) ?? {};
        assistStats.assists = (assistStats.assists ?? 0) + 1;
        assistStats.keyPasses = (assistStats.keyPasses ?? 0) + 1 + rng.nextInt(0, 2);
        statsByPlayerId.set(assister.player.id, assistStats);
      }
    }
  }

  const opponentStrength = averageStrength(opponentParticipants);
  const teamWon = goalsFor > goalsAgainst;
  const teamDrew = goalsFor === goalsAgainst;
  const ratings: Record<string, PlayerMatchRating> = {};

  for (const participant of teamParticipants) {
    const group = positionGroup(participant.player.position);
    const stats = { ...(statsByPlayerId.get(participant.player.id) ?? {}) };

    if (group === "gk") {
      stats.saves = Math.max(0, goalsAgainst + rng.nextInt(0, 3) - 1);
      stats.goalsConceded = goalsAgainst;
      if (goalsAgainst === 0) stats.cleanSheet = true;
    } else if (group === "def") {
      stats.tackles = (stats.tackles ?? 0) + rng.nextInt(1, participant.started ? 4 : 2);
      stats.interceptions = (stats.interceptions ?? 0) + rng.nextInt(1, participant.started ? 3 : 2);
      if (goalsAgainst === 0) stats.cleanSheet = true;
    } else if (group === "mid") {
      stats.tackles = (stats.tackles ?? 0) + rng.nextInt(0, 3);
      stats.keyPasses = (stats.keyPasses ?? 0) + rng.nextInt(0, 3);
      stats.dribbles = (stats.dribbles ?? 0) + rng.nextInt(0, 3);
      stats.shots = (stats.shots ?? 0) + rng.nextInt(0, 2);
    } else {
      stats.dribbles = (stats.dribbles ?? 0) + rng.nextInt(0, 4);
      stats.shots = (stats.shots ?? 0) + rng.nextInt(0, 3);
      stats.keyPasses = (stats.keyPasses ?? 0) + rng.nextInt(0, 2);
    }

    const resultBonus = teamWon ? 0.45 : teamDrew ? 0.08 : -0.24;
    const abilityBonus = (participant.player.currentAbility - opponentStrength) / 135;
    const formBonus = participant.player.form * 0.07;
    const minutesBonus = (participant.minutesPlayed / 90) * 0.33;
    const startBonus = participant.started ? 0.18 : 0.05;
    const goalBonus = (stats.goals ?? 0) * 0.86;
    const assistBonus = (stats.assists ?? 0) * 0.42;
    const cleanSheetBonus = stats.cleanSheet === true ? 0.22 : 0;
    const concessionPenalty = goalsAgainst >= 3 && (group === "gk" || group === "def")
      ? (goalsAgainst - 2) * -0.16
      : 0;
    const randomSwing = rng.nextFloat(-0.18, 0.18);

    const rating = roundToSingleDecimal(clamp(
      6.0
      + resultBonus
      + abilityBonus
      + formBonus
      + minutesBonus
      + startBonus
      + goalBonus
      + assistBonus
      + cleanSheetBonus
      + concessionPenalty
      + randomSwing,
      5.2,
      9.6,
    ));

    const numericStatTotal = Object.values(stats).reduce<number>(
      (sum, value) => (typeof value === "number" ? sum + value : sum),
      0,
    );

    ratings[participant.player.id] = {
      playerId: participant.player.id,
      fixtureId,
      started: participant.started,
      minutesPlayed: participant.minutesPlayed,
      rating,
      eventCount: numericStatTotal + (stats.cleanSheet === true ? 1 : 0),
      stats,
      source: "simulated",
    };
  }

  return ratings;
}

function simulateFixture(
  league: League,
  homeClub: Club,
  awayClub: Club,
  players: Record<string, Player>,
  season: number,
  week: number,
  fixtureId: string,
  rng: RNG,
  existingFixture?: Fixture,
): AbstractPlayedFixture {
  const homeParticipants = selectParticipants(homeClub, players, new RNG(`${fixtureId}:home`));
  const awayParticipants = selectParticipants(awayClub, players, new RNG(`${fixtureId}:away`));

  const homeStrength = averageStrength(homeParticipants);
  const awayStrength = averageStrength(awayParticipants);
  const homeExpectedGoals = clamp(
    1.18 + (homeStrength - awayStrength) / 34 + 0.18,
    0.3,
    3.6,
  );
  const awayExpectedGoals = clamp(
    1.02 + (awayStrength - homeStrength) / 36,
    0.2,
    3.3,
  );
  // Do not create goals that cannot be attributed to any active participant.
  // The lifecycle/intake systems can restore the roster at the next boundary;
  // the current fixture remains deterministic and recoverable in the meantime.
  const homeGoals = homeParticipants.length > 0 ? samplePoisson(homeExpectedGoals, rng) : 0;
  const awayGoals = awayParticipants.length > 0 ? samplePoisson(awayExpectedGoals, rng) : 0;
  const weather = pickWeather(season, week, rng);
  const playerRatings = {
    ...buildRatings(
      fixtureId,
      homeParticipants,
      awayParticipants,
      homeGoals,
      awayGoals,
      new RNG(`${fixtureId}:home-ratings`),
    ),
    ...buildRatings(
      fixtureId,
      awayParticipants,
      homeParticipants,
      awayGoals,
      homeGoals,
      new RNG(`${fixtureId}:away-ratings`),
    ),
  };

  return {
    ...existingFixture,
    id: fixtureId,
    homeClubId: homeClub.id,
    awayClubId: awayClub.id,
    leagueId: league.id,
    season,
    week,
    played: true,
    homeGoals,
    awayGoals,
    attendance: calculateAttendance(homeClub, awayClub, league, homeGoals, awayGoals),
    weather,
    simulationDetail: ABSTRACT_COMPETITION_SIMULATION_DETAIL,
    playerRatings,
  };
}

export function simulateAbstractCompetitionWeek(
  input: AbstractCompetitionWeekInput,
): AbstractCompetitionWeekResult {
  const fixturesPlayed: AbstractPlayedFixture[] = [];
  const matchRatingsByFixture: Record<string, Record<string, PlayerMatchRating>> = {};
  const skippedFixtureIds: string[] = [];
  let fixtureLookup: FixtureLookupIndex | undefined;
  let fixtureLookupBuilt = false;
  const resolveFixtureLookup = (): FixtureLookupIndex | undefined => {
    if (!fixtureLookupBuilt) {
      fixtureLookup = buildFixtureLookupIndex(input.fixtures);
      fixtureLookupBuilt = true;
    }
    return fixtureLookup;
  };

  const abstractLeagues = Object.values(input.leagues)
    .filter(isAbstractCompetitionLeague)
    .sort((left, right) => left.id.localeCompare(right.id));

  for (const league of abstractLeagues) {
    const rounds = buildDoubleRoundRobin(league.clubIds);
    const roundIndex = getRoundIndexForWeek(
      rounds.length,
      input.week,
      input.seasonLength,
    );
    if (roundIndex === undefined) continue;

    for (const scheduled of rounds[roundIndex] ?? []) {
      const homeClub = input.clubs[scheduled.homeClubId];
      const awayClub = input.clubs[scheduled.awayClubId];
      if (!homeClub || !awayClub) continue;

      const existingFixture = findExistingFixture(
        input.fixtures,
        resolveFixtureLookup,
        league.id,
        input.season,
        input.week,
        scheduled.homeClubId,
        scheduled.awayClubId,
      );
      if (isResolvedFixture(existingFixture, input.matchRatings)) {
        skippedFixtureIds.push(existingFixture!.id);
        continue;
      }

      const fixtureId = existingFixture?.id ?? createAbstractFixtureId(
        league.id,
        input.season,
        input.week,
        scheduled.homeClubId,
        scheduled.awayClubId,
      );
      const fixtureSeed = [
        input.worldSeed,
        "abstract-competition",
        league.id,
        input.season,
        input.week,
        scheduled.homeClubId,
        scheduled.awayClubId,
      ].join(":");
      const played = simulateFixture(
        league,
        homeClub,
        awayClub,
        input.players,
        input.season,
        input.week,
        fixtureId,
        new RNG(fixtureSeed),
        existingFixture,
      );
      fixturesPlayed.push(played);
      matchRatingsByFixture[played.id] = played.playerRatings;
    }
  }

  fixturesPlayed.sort((left, right) => left.id.localeCompare(right.id));

  return {
    fixturesPlayed,
    matchRatingsByFixture,
    skippedFixtureIds: skippedFixtureIds.sort((left, right) => left.localeCompare(right)),
  };
}
