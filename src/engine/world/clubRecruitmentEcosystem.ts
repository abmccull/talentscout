import type {
  Club,
  GameState,
  ManagerProfile,
  PlayerMovementEvent,
  Position,
} from "@/engine/core/types";
import { normalizeCountryKey } from "@/lib/country";
import {
  deriveClubRecruitmentDoctrine,
  type ClubRecruitmentDoctrine,
} from "./recruitmentIdentity";
import {
  deriveClubRecruitmentMemory,
  type ClubRecruitmentMemory,
} from "./recruitmentMemory";
import {
  deriveTerritoryIdentity,
  type TerritoryIdentity,
} from "./territoryIdentity";
import { deriveWorldConditionStakeholderMatrix } from "./worldConditionStakeholders";
import { getWorldConditionModifiers } from "./worldConditions";

export interface RecruitmentLanePreference {
  countryId: string;
  score: number;
  reason: string;
}

export interface ClubRecruitmentEvidenceMix {
  live: number;
  data: number;
  network: number;
}

export interface ClubRecruitmentEcosystem {
  clubId: string;
  countryId?: string;
  doctrine: ClubRecruitmentDoctrine;
  memory: ClubRecruitmentMemory;
  territoryIdentity: TerritoryIdentity | null;
  leadershipCenter: "managerLed" | "directorLed" | "balanced";
  pathwayTolerance: number;
  crossBorderComfort: number;
  evidenceFloor: number;
  marketUrgency: number;
  evidenceMix: ClubRecruitmentEvidenceMix;
  favoredTerritories: RecruitmentLanePreference[];
  trustedLanes: string[];
  fragileLanes: string[];
  roleComfort: Partial<Record<Position, number>>;
  reasons: string[];
}

const RECRUITMENT_TYPES = new Set<PlayerMovementEvent["type"]>([
  "permanentTransfer",
  "freeAgentSigning",
  "loanBuyOption",
]);

function canonicalCountry(value?: string): string | undefined {
  const normalized = normalizeCountryKey(value);
  if (normalized) return normalized;
  const compact = value?.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  return compact || undefined;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Math.round(value)));
}

function clubCountry(state: GameState, club: Club): string | undefined {
  return canonicalCountry(state.leagues[club.leagueId]?.country);
}

function leadershipCenter(doctrine: ClubRecruitmentDoctrine): ClubRecruitmentEcosystem["leadershipCenter"] {
  if (doctrine.managerInfluence >= doctrine.directorInfluence + 8) return "managerLed";
  if (doctrine.directorInfluence >= doctrine.managerInfluence + 8) return "directorLed";
  return "balanced";
}

function laneLabel(countryId: string, clubCountryId?: string): string {
  if (countryId === clubCountryId) return "domestic lane";
  return `${countryId} lane`;
}

function sourceCountryCounts(
  state: GameState,
  club: Club,
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const movement of state.playerMovementHistory ?? []) {
    if (!RECRUITMENT_TYPES.has(movement.type) || movement.toClubId !== club.id) continue;
    const sourceCountry = movement.fromClubId
      ? canonicalCountry(state.leagues[state.clubs[movement.fromClubId]?.leagueId]?.country)
      : undefined;
    if (!sourceCountry) continue;
    counts.set(sourceCountry, (counts.get(sourceCountry) ?? 0) + 1);
  }
  return counts;
}

function favoredTerritories(
  state: GameState,
  club: Club,
  doctrine: ClubRecruitmentDoctrine,
  memory: ClubRecruitmentMemory,
): RecruitmentLanePreference[] {
  const clubCountryId = clubCountry(state, club);
  const counts = sourceCountryCounts(state, club);
  if (clubCountryId) {
    counts.set(
      clubCountryId,
      (counts.get(clubCountryId) ?? 0)
        + (doctrine.geographicReach === "local" ? 4 : doctrine.geographicReach === "regional" ? 3 : 1),
    );
  }
  const crossBorderBias = memory.crossBorderSuccessRate !== undefined
    ? (memory.crossBorderSuccessRate - 50) / 12
    : doctrine.geographicReach === "global"
      ? 3
      : doctrine.geographicReach === "international"
        ? 2
        : 0;
  return [...counts.entries()]
    .map(([countryId, count]) => ({
      countryId,
      score: clamp(count * 18 + (countryId === clubCountryId ? 8 : crossBorderBias * 5), 0, 100),
      reason: countryId === clubCountryId
        ? `The club's home market remains a reliable ${laneLabel(countryId, clubCountryId)}.`
        : `Recent recruitment volume and doctrine keep the ${laneLabel(countryId, clubCountryId)} active.`,
    }))
    .sort((left, right) => right.score - left.score || left.countryId.localeCompare(right.countryId))
    .slice(0, 4);
}

function evidenceMix(doctrine: ClubRecruitmentDoctrine, territory: TerritoryIdentity | null): ClubRecruitmentEvidenceMix {
  let live = doctrine.evidencePreference === "live" ? 46 : doctrine.evidencePreference === "balanced" ? 34 : 24;
  let data = doctrine.evidencePreference === "data" ? 44 : 26;
  let network = doctrine.evidencePreference === "network" ? 42 : 24;
  if (territory?.evidenceProfile.contextTags.includes("development-pathway")) live += 6;
  if (territory?.stakeholderClimate.agent.priceLeverage ?? 0 > 6) network += 6;
  if ((territory?.evidenceProfile.dataConfidenceBonus ?? 0) > (territory?.evidenceProfile.liveConfidenceBonus ?? 0)) {
    data += 5;
  }
  const total = live + data + network;
  return {
    live: Math.round(live / total * 100),
    data: Math.round(data / total * 100),
    network: Math.max(0, 100 - Math.round(live / total * 100) - Math.round(data / total * 100)),
  };
}

function trustedLanes(
  club: Club,
  doctrine: ClubRecruitmentDoctrine,
  memory: ClubRecruitmentMemory,
  territory: TerritoryIdentity | null,
): string[] {
  const lanes = new Set<string>();
  if (club.scoutingPhilosophy === "academyFirst") lanes.add("young domestic development bets");
  if (club.scoutingPhilosophy === "winNow") lanes.add("role-ready additions");
  if (club.scoutingPhilosophy === "marketSmart") lanes.add("value-conscious turnover");
  if (club.scoutingPhilosophy === "globalRecruiter") lanes.add("cross-border relationship sourcing");
  if ((memory.youngSuccessRate ?? 0) >= 55) lanes.add("youth pathway conviction");
  if ((memory.crossBorderSuccessRate ?? 0) >= 55) lanes.add("international adaptation bets");
  if (territory?.archetype === "tradingCrossroads") lanes.add("resale-driven market timing");
  if (doctrine.pathwayPatience >= 70) lanes.add("longer development runway");
  return [...lanes];
}

function fragileLanes(
  doctrine: ClubRecruitmentDoctrine,
  memory: ClubRecruitmentMemory,
  territory: TerritoryIdentity | null,
): string[] {
  const lanes: string[] = [];
  if ((memory.crossBorderSuccessRate ?? 50) < 45 && doctrine.geographicReach !== "local") {
    lanes.push("cross-border integration");
  }
  if ((memory.youngSuccessRate ?? 50) < 45 && doctrine.pathwayPatience >= 55) {
    lanes.push("young-player patience");
  }
  if (territory?.stakeholderClimate.organizer.accessFriction ?? 0 > 6) {
    lanes.push("protected local access");
  }
  if (territory?.stakeholderClimate.rival.rivalHeat ?? 0 > 8) {
    lanes.push("first-mover secrecy");
  }
  if (doctrine.minimumEvidenceQuality >= 72) {
    lanes.push("thin-evidence recommendations");
  }
  return lanes;
}

function roleComfort(memory: ClubRecruitmentMemory): Partial<Record<Position, number>> {
  return Object.fromEntries(
    Object.entries(memory.positionSuccessRate)
      .map(([position, score]) => [position, clamp(score ?? 0, 0, 100)]),
  ) as Partial<Record<Position, number>>;
}

function managerForClub(
  state: GameState,
  clubId: string,
): ManagerProfile | undefined {
  return state.managerProfiles?.[clubId];
}

export function deriveClubRecruitmentEcosystem(
  state: GameState,
  clubId: string,
): ClubRecruitmentEcosystem | null {
  const club = state.clubs[clubId];
  if (!club) return null;
  const countryId = clubCountry(state, club);
  const doctrine = deriveClubRecruitmentDoctrine({
    club,
    seed: state.seed,
    season: state.currentSeason,
    manager: managerForClub(state, club.id),
  });
  const memory = deriveClubRecruitmentMemory(state, club.id);
  const territory = countryId ? deriveTerritoryIdentity(state, countryId) : null;
  const stakeholderMatrix = deriveWorldConditionStakeholderMatrix(state, {
    countryId,
    clubId: club.id,
  });
  const modifiers = getWorldConditionModifiers(state, countryId);
  const pathwayTolerance = clamp(
    doctrine.pathwayPatience
      + club.youthAcademyRating * 1.8
      + (modifiers.developmentMultiplier - 1) * 30
      + stakeholderMatrix.climates.coach.patience * 0.6,
    0,
    100,
  );
  const crossBorderComfort = clamp(
    doctrine.adaptationTolerance
      + (memory.crossBorderSuccessRate !== undefined ? memory.crossBorderSuccessRate - 50 : 0) * 0.45
      - stakeholderMatrix.climates.family.travelTolerance * 0.35
      + (modifiers.marketplaceValueMultiplier - 1) * 20,
    0,
    100,
  );
  const evidenceFloor = clamp(
    doctrine.minimumEvidenceQuality
      + stakeholderMatrix.climates.manager.evidenceScrutiny * 0.45
      + stakeholderMatrix.climates.clubDirector.evidenceScrutiny * 0.35,
    0,
    100,
  );
  const marketUrgency = clamp(
    (territory?.regionIdentity.competitionIntensity ?? 0) * 0.28
      + (modifiers.opportunityMultiplier - 1) * 35
      + stakeholderMatrix.climates.rival.rivalHeat * 0.55
      + Math.max(0, 55 - club.budget / 100000),
    0,
    100,
  );
  const lanes = favoredTerritories(state, club, doctrine, memory);
  return {
    clubId: club.id,
    ...(countryId ? { countryId } : {}),
    doctrine,
    memory,
    territoryIdentity: territory,
    leadershipCenter: leadershipCenter(doctrine),
    pathwayTolerance,
    crossBorderComfort,
    evidenceFloor,
    marketUrgency,
    evidenceMix: evidenceMix(doctrine, territory),
    favoredTerritories: lanes,
    trustedLanes: trustedLanes(club, doctrine, memory, territory),
    fragileLanes: fragileLanes(doctrine, memory, territory),
    roleComfort: roleComfort(memory),
    reasons: [
      ...doctrine.reasons,
      ...memory.reasons,
      `${club.name} currently behaves as a ${leadershipCenter(doctrine)} operation with an evidence floor of ${evidenceFloor}/100.`,
      `Cross-border comfort sits at ${crossBorderComfort}/100 and pathway tolerance at ${pathwayTolerance}/100.`,
    ],
  };
}
