import type {
  AlumniRecord,
  AlumniMilestone,
  GameState,
  Observation,
  PlacementReport,
  Scout,
  ScoutReport,
  UnsignedYouth,
} from "../core/types";

export interface SeasonReviewMetrics {
  countriesScoutedThisSeason: string[];
  regionsScoutedThisSeason: string[];
  homeCountry: string;
  unsignedYouthDiscovered: number;
  successfulPlacements: number;
  alumniMilestonesThisSeason: number;
}

function deriveHomeCountry(scout: Scout): string {
  const entries = Object.entries(scout.countryReputations ?? {});
  if (entries.length === 0) return "";

  let bestCountry = entries[0][0];
  let bestFamiliarity = entries[0][1].familiarity;

  for (const [country, reputation] of entries.slice(1)) {
    if (reputation.familiarity > bestFamiliarity) {
      bestCountry = country;
      bestFamiliarity = reputation.familiarity;
    }
  }

  return bestCountry;
}

function addYouthCoverage(
  youth: UnsignedYouth,
  subRegions: GameState["subRegions"],
  countries: Set<string>,
  regions: Set<string>,
): void {
  countries.add(youth.country);

  if (youth.regionId) {
    const subRegion = subRegions[youth.regionId];
    regions.add(subRegion?.id ?? youth.regionId);
  }
}

function addSeniorCoverage(
  playerId: string,
  state: GameState,
  countries: Set<string>,
): void {
  const player = state.players[playerId];
  if (!player) return;

  const club = state.clubs[player.clubId];
  const league = club ? state.leagues[club.leagueId] : undefined;
  if (league?.country) {
    countries.add(league.country);
  }
}

function addObservationCoverage(
  observation: Observation,
  state: GameState,
  youthByPlayerId: Map<string, UnsignedYouth>,
  countries: Set<string>,
  regions: Set<string>,
): void {
  const youth = youthByPlayerId.get(observation.playerId);
  if (youth) {
    addYouthCoverage(youth, state.subRegions, countries, regions);
    return;
  }

  addSeniorCoverage(observation.playerId, state, countries);
}

function addReportCoverage(
  report: ScoutReport,
  state: GameState,
  countries: Set<string>,
): void {
  addSeniorCoverage(report.playerId, state, countries);
}

function addPlacementCoverage(
  report: PlacementReport,
  state: GameState,
  youthById: Map<string, UnsignedYouth>,
  countries: Set<string>,
  regions: Set<string>,
): void {
  const youth = youthById.get(report.unsignedYouthId);
  if (!youth) return;
  addYouthCoverage(youth, state.subRegions, countries, regions);
}

function buildYouthIndexes(unsignedYouth: Record<string, UnsignedYouth>): {
  youthById: Map<string, UnsignedYouth>;
  youthByPlayerId: Map<string, UnsignedYouth>;
} {
  const youthById = new Map<string, UnsignedYouth>();
  const youthByPlayerId = new Map<string, UnsignedYouth>();

  for (const youth of Object.values(unsignedYouth)) {
    youthById.set(youth.id, youth);
    youthByPlayerId.set(youth.player.id, youth);
  }

  return { youthById, youthByPlayerId };
}

function countSeasonYouthDiscoveries(
  state: GameState,
  season: number,
  youthByPlayerId: Map<string, UnsignedYouth>,
): number {
  return state.discoveryRecords.filter(
    (record) =>
      record.discoveredSeason === season && youthByPlayerId.has(record.playerId),
  ).length;
}

function countSuccessfulPlacements(
  state: GameState,
  season: number,
  youthById: Map<string, UnsignedYouth>,
): number {
  const placedPlayerIds = new Set<string>();

  for (const report of Object.values(state.placementReports)) {
    if (report.season !== season || report.scoutId !== state.scout.id) continue;
    if (report.clubResponse !== "accepted") continue;

    const youth = youthById.get(report.unsignedYouthId);
    if (youth) {
      placedPlayerIds.add(youth.player.id);
    }
  }

  for (const record of state.alumniRecords) {
    if (record.placedSeason === season) {
      placedPlayerIds.add(record.playerId);
    }
  }

  return placedPlayerIds.size;
}

function isCareerImpactMilestone(milestone: AlumniMilestone): boolean {
  return milestone.type !== "transfer";
}

function countSeasonAlumniMilestones(
  alumniRecords: AlumniRecord[],
  season: number,
): number {
  return alumniRecords.reduce(
    (total, record) =>
      total +
      record.milestones.filter(
        (milestone) =>
          milestone.season === season && isCareerImpactMilestone(milestone),
      ).length,
    0,
  );
}

export function deriveSeasonReviewMetrics(
  state: GameState,
  season: number,
): SeasonReviewMetrics {
  const countries = new Set<string>();
  const regions = new Set<string>();
  const { youthById, youthByPlayerId } = buildYouthIndexes(state.unsignedYouth);

  for (const report of Object.values(state.reports)) {
    if (report.scoutId !== state.scout.id || report.submittedSeason !== season) continue;
    addReportCoverage(report, state, countries);
  }

  for (const observation of Object.values(state.observations)) {
    if (observation.season !== season || observation.scoutId !== state.scout.id) {
      continue;
    }
    addObservationCoverage(observation, state, youthByPlayerId, countries, regions);
  }

  for (const report of Object.values(state.placementReports)) {
    if (report.scoutId !== state.scout.id || report.season !== season) continue;
    addPlacementCoverage(report, state, youthById, countries, regions);
  }

  return {
    countriesScoutedThisSeason: [...countries],
    regionsScoutedThisSeason: [...regions],
    homeCountry: deriveHomeCountry(state.scout),
    unsignedYouthDiscovered: countSeasonYouthDiscoveries(
      state,
      season,
      youthByPlayerId,
    ),
    successfulPlacements: countSuccessfulPlacements(state, season, youthById),
    alumniMilestonesThisSeason: countSeasonAlumniMilestones(
      state.alumniRecords,
      season,
    ),
  };
}
