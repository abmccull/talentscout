import type {
  AgencyEmployee,
  ClientRelationship,
  FinancialRecord,
  GameDate,
  GameState,
  RetainerContract,
} from "@/engine/core/types";
import { addGameWeeksWithSeasonLength, LEGACY_SEASON_LENGTH_WEEKS } from "@/engine/core/gameDate";
import { normalizeAgencyStrategyState } from "../agencyStrategy";

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function normalizeRegion(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized ? normalized : undefined;
}

export function distinctRegions(values: readonly (string | undefined)[]): string[] {
  return [...new Set(values.map(normalizeRegion).filter((value): value is string => Boolean(value)))].sort();
}

export function gameDate(state: GameState): GameDate {
  return { season: state.currentSeason, week: state.currentWeek };
}

export function seasonLength(_state: GameState): number {
  return Math.max(1, LEGACY_SEASON_LENGTH_WEEKS);
}

export function activeClients(finances: FinancialRecord): ClientRelationship[] {
  return (finances.clientRelationships ?? []).filter((client) => client.status === "active");
}

export function activeRetainers(finances: FinancialRecord): RetainerContract[] {
  return (finances.retainerContracts ?? []).filter((contract) => contract.status === "active");
}

export function currentFocusRegion(state: GameState): string | undefined {
  return normalizeRegion(
    normalizeAgencyStrategyState(state.finances?.agencyStrategyState)?.focusRegionId
      ?? state.scout.homeCountry
      ?? Object.keys(state.regionalKnowledge ?? {})[0]
      ?? state.countries?.[0],
  );
}

export function alternateRegions(state: GameState, focusRegionId: string | undefined): string[] {
  return distinctRegions([
    ...(state.contacts ? Object.values(state.contacts).map((contact) => contact.country ?? contact.region) : []),
    ...(state.finances?.satelliteOffices ?? []).map((office) => office.region),
    ...(state.countries ?? []),
  ]).filter((region) => region !== focusRegionId);
}

export function lastAgencyDilemmaDate(state: GameState): GameDate | undefined {
  const dates = [
    ...Object.values(state.consequenceState.decisions)
      .filter((decision) => decision.source.kind === "agencyDilemma")
      .map((decision) => decision.offeredAt),
    ...(state.consequenceState.history ?? [])
      .filter((record) => record.source.kind === "agencyDilemma")
      .map((record) => record.offeredAt),
  ];
  return dates.sort((left, right) =>
    (right.season - left.season) || (right.week - left.week),
  )[0];
}

export function hasOpenAgencyDilemma(state: GameState): boolean {
  return Object.values(state.consequenceState.decisions).some((decision) =>
    decision.status === "offered" && decision.source.kind === "agencyDilemma",
  );
}

export function sortedByRevenue(clients: readonly ClientRelationship[]): ClientRelationship[] {
  return [...clients].sort((left, right) =>
    right.totalRevenue - left.totalRevenue
    || right.satisfaction - left.satisfaction
    || left.clubId.localeCompare(right.clubId),
  );
}

export function sortedEmployees(employees: readonly AgencyEmployee[]): AgencyEmployee[] {
  return [...employees].sort((left, right) =>
    right.quality - left.quality
    || left.fatigue - right.fatigue
    || left.id.localeCompare(right.id),
  );
}

export function createContextDecisionId(
  state: GameState,
  value: {
    id: string;
    anchorClientId?: string;
    regionId?: string;
    deputyEmployeeId?: string;
    targetClubId?: string;
  },
): string {
  return `agency-dilemma:s${state.currentSeason}w${state.currentWeek}:${value.id}:${value.anchorClientId ?? value.regionId ?? value.deputyEmployeeId ?? value.targetClubId ?? "general"}`;
}

export function createLockedUntil(now: GameDate) {
  return addGameWeeksWithSeasonLength(now, 4, LEGACY_SEASON_LENGTH_WEEKS);
}
