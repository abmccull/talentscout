import type {
  Club,
  GameState,
  ScoutingPhilosophy,
} from "@/engine/core/types";
import { normalizeCountryKey } from "@/lib/country";
import {
  combineFootballCultureEffects,
  type CombinedFootballCultureEffects,
} from "./footballCulture";
import {
  getCountryAvailability,
  type WorldCountryAvailability,
  type WorldCountryContentTier,
} from "./countryAvailability";
import {
  deriveRegionalPresence,
  type RegionalPresenceSnapshot,
} from "./regionalPresence";
import {
  deriveRegionRecruitmentIdentity,
  type RecruitmentFocus,
  type RegionRecruitmentIdentity,
} from "./recruitmentIdentity";
import {
  deriveWorldConditionStakeholderMatrix,
  type WorldConditionStakeholderMatrix,
} from "./worldConditionStakeholders";
import {
  getActiveWorldConditionNames,
  getWorldConditionDefinition,
  getWorldConditionModifiers,
} from "./worldConditions";

export type TerritoryIdentityArchetype =
  | "academyHotbed"
  | "tradingCrossroads"
  | "volatileShowcase"
  | "protectedNetwork"
  | "developmentMarket"
  | "distressedValuePocket"
  | "remoteFrontier";

export type TerritoryAccessPattern =
  | "openCircuit"
  | "relationshipLed"
  | "officeLed"
  | "travelHeavy"
  | "protected";

export type TerritoryOpportunityWindow = "quiet" | "steady" | "active" | "urgent";

export interface TerritoryIdentityEvidenceProfile {
  signalByDomain: CombinedFootballCultureEffects["signalByDomain"];
  uncertaintyMultiplier: number;
  contextTags: string[];
  cautionFlags: string[];
  liveConfidenceBonus: number;
  dataConfidenceBonus: number;
}

export interface TerritoryIdentityClubDemandMix {
  clubCount: number;
  dominantPhilosophy?: ScoutingPhilosophy;
  dominantFocus?: RecruitmentFocus;
  philosophyShare: Partial<Record<ScoutingPhilosophy, number>>;
}

export interface TerritoryIdentity {
  countryId: string;
  contentTier: WorldCountryContentTier;
  archetype: TerritoryIdentityArchetype;
  accessPattern: TerritoryAccessPattern;
  opportunityWindow: TerritoryOpportunityWindow;
  availability: WorldCountryAvailability;
  presence: Pick<
    RegionalPresenceSnapshot,
    | "accessScore"
    | "accessTier"
    | "dimensions"
    | "effects"
    | "isHomeBase"
    | "isActiveLocation"
    | "satelliteOfficeId"
    | "assignedEmployeeIds"
    | "contactIds"
    | "worldConditionNames"
    | "summary"
  >;
  regionIdentity: RegionRecruitmentIdentity;
  clubDemandMix: TerritoryIdentityClubDemandMix;
  evidenceProfile: TerritoryIdentityEvidenceProfile;
  stakeholderClimate: Pick<
    WorldConditionStakeholderMatrix["climates"],
    "family" | "agent" | "organizer" | "journalist" | "rival"
  >;
  reasons: string[];
}

function canonicalCountry(value?: string): string | undefined {
  const normalized = normalizeCountryKey(value);
  if (normalized) return normalized;
  const compact = value?.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  return compact || undefined;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Math.round(value)));
}

function clubsInCountry(state: GameState, countryId: string): Club[] {
  return Object.values(state.clubs)
    .filter((club) => canonicalCountry(state.leagues[club.leagueId]?.country) === countryId)
    .sort((left, right) => left.id.localeCompare(right.id));
}

function dominantFocus(
  regionIdentity: RegionRecruitmentIdentity,
): RecruitmentFocus {
  return regionIdentity.seasonalFocus;
}

function demandMix(clubs: readonly Club[], regionIdentity: RegionRecruitmentIdentity): TerritoryIdentityClubDemandMix {
  if (clubs.length === 0) {
    return {
      clubCount: 0,
      dominantFocus: dominantFocus(regionIdentity),
      philosophyShare: {},
    };
  }
  const order: ScoutingPhilosophy[] = ["academyFirst", "winNow", "marketSmart", "globalRecruiter"];
  const philosophyShare = Object.fromEntries(order.map((philosophy) => [
    philosophy,
    Math.round(
      clubs.filter((club) => club.scoutingPhilosophy === philosophy).length / clubs.length * 100,
    ) / 100,
  ])) as Partial<Record<ScoutingPhilosophy, number>>;
  const dominantPhilosophy = [...order].sort((left, right) =>
    (philosophyShare[right] ?? 0) - (philosophyShare[left] ?? 0)
    || left.localeCompare(right)
  )[0];
  return {
    clubCount: clubs.length,
    dominantPhilosophy,
    dominantFocus: dominantFocus(regionIdentity),
    philosophyShare,
  };
}

function territoryArchetype(input: {
  contentTier: WorldCountryContentTier;
  regionIdentity: RegionRecruitmentIdentity;
  conditionIds: readonly string[];
  accessScore: number;
}): TerritoryIdentityArchetype {
  const ids = new Set(input.conditionIds);
  if (ids.has("local-football-recession")) return "distressedValuePocket";
  if (ids.has("showcase-circuit")) return "volatileShowcase";
  if (ids.has("agent-exclusivity-wave")) return "protectedNetwork";
  if (input.contentTier === "talentPool" && input.accessScore < 35) return "remoteFrontier";
  if (input.regionIdentity.archetype === "tradingMarket") return "tradingCrossroads";
  if (input.regionIdentity.archetype === "developmentCorridor") return "academyHotbed";
  return "developmentMarket";
}

function accessPattern(input: {
  presence: RegionalPresenceSnapshot;
  conditionIds: readonly string[];
}): TerritoryAccessPattern {
  const ids = new Set(input.conditionIds);
  if (ids.has("agent-exclusivity-wave")) return "protected";
  if (input.presence.satelliteOfficeId && input.presence.assignedEmployeeIds.length > 0) {
    return "officeLed";
  }
  if (input.presence.dimensions.relationships >= input.presence.dimensions.intelligence + 10) {
    return "relationshipLed";
  }
  if (input.presence.effects.travelCostMultiplier > 1.08 || input.presence.effects.travelFatigueMultiplier > 1.08) {
    return "travelHeavy";
  }
  return "openCircuit";
}

function opportunityWindow(opportunityMultiplier: number): TerritoryOpportunityWindow {
  if (opportunityMultiplier >= 1.3) return "urgent";
  if (opportunityMultiplier >= 1.08) return "active";
  if (opportunityMultiplier <= 0.9) return "quiet";
  return "steady";
}

function conditionIdsFor(state: GameState, countryId: string): string[] {
  return (state.worldConditionState?.active ?? [])
    .filter((condition) =>
      condition.scope === "global"
      || canonicalCountry(condition.countryId) === countryId
    )
    .map((condition) => condition.definitionId)
    .sort();
}

function evidenceProfile(
  state: GameState,
  countryId: string,
  presence: RegionalPresenceSnapshot,
): TerritoryIdentityEvidenceProfile {
  const knowledge = state.regionalKnowledge?.[countryId]
    ?? Object.values(state.regionalKnowledge ?? {}).find(
      (entry) => canonicalCountry(entry.countryId) === countryId,
    );
  const culture = combineFootballCultureEffects(countryId, knowledge?.culturalInsights);
  return {
    signalByDomain: culture.signalByDomain,
    uncertaintyMultiplier: culture.uncertaintyMultiplier,
    contextTags: culture.contextTags,
    cautionFlags: culture.biasWarnings,
    liveConfidenceBonus: Math.round(presence.effects.observationConfidenceBonus * 1000) / 1000,
    dataConfidenceBonus: Math.round(presence.effects.dataConfidenceBonus * 1000) / 1000,
  };
}

function territoryReasons(input: {
  presence: RegionalPresenceSnapshot;
  regionIdentity: RegionRecruitmentIdentity;
  availability: WorldCountryAvailability;
  conditionNames: string[];
  archetype: TerritoryIdentityArchetype;
  accessPattern: TerritoryAccessPattern;
}): string[] {
  const reasons = [
    input.presence.summary,
    ...input.regionIdentity.reasons,
    `${input.availability.clubCount} clubs, ${input.availability.playerCount} registered players, and ${input.availability.unsignedYouthCount} unsigned prospects create the usable scouting surface.`,
    `${input.archetype.replace(/([A-Z])/g, " $1").toLowerCase()} territory with an ${input.accessPattern.replace(/([A-Z])/g, " $1").toLowerCase()} access pattern.`,
  ];
  if (input.conditionNames.length > 0) {
    reasons.push(`Active world conditions: ${input.conditionNames.join(", ")}.`);
  }
  return reasons;
}

export function deriveTerritoryIdentity(
  state: GameState,
  country: string,
): TerritoryIdentity | null {
  const countryId = canonicalCountry(country);
  if (!countryId) return null;
  const availability = getCountryAvailability(state, countryId);
  if (!availability?.travelEligible) return null;

  const clubs = clubsInCountry(state, countryId);
  const regionIdentity = deriveRegionRecruitmentIdentity({
    regionId: countryId,
    clubs,
    players: state.players,
    seed: state.seed,
    season: state.currentSeason,
  });
  const presence = deriveRegionalPresence(state, countryId);
  const conditionNames = getActiveWorldConditionNames(state, countryId);
  const conditionIds = conditionIdsFor(state, countryId).filter((id) => getWorldConditionDefinition(id));
  const archetype = territoryArchetype({
    contentTier: availability.contentTier,
    regionIdentity,
    conditionIds,
    accessScore: presence.accessScore,
  });
  const pattern = accessPattern({ presence, conditionIds });
  const stakeholderMatrix = deriveWorldConditionStakeholderMatrix(state, { countryId });
  return {
    countryId,
    contentTier: availability.contentTier,
    archetype,
    accessPattern: pattern,
    opportunityWindow: opportunityWindow(
      getWorldConditionModifiers(state, countryId).opportunityMultiplier
        * presence.effects.opportunityMultiplier,
    ),
    availability,
    presence: {
      accessScore: presence.accessScore,
      accessTier: presence.accessTier,
      dimensions: presence.dimensions,
      effects: presence.effects,
      isHomeBase: presence.isHomeBase,
      isActiveLocation: presence.isActiveLocation,
      satelliteOfficeId: presence.satelliteOfficeId,
      assignedEmployeeIds: presence.assignedEmployeeIds,
      contactIds: presence.contactIds,
      worldConditionNames: presence.worldConditionNames,
      summary: presence.summary,
    },
    regionIdentity,
    clubDemandMix: demandMix(clubs, regionIdentity),
    evidenceProfile: evidenceProfile(state, countryId, presence),
    stakeholderClimate: {
      family: stakeholderMatrix.climates.family,
      agent: stakeholderMatrix.climates.agent,
      organizer: stakeholderMatrix.climates.organizer,
      journalist: stakeholderMatrix.climates.journalist,
      rival: stakeholderMatrix.climates.rival,
    },
    reasons: territoryReasons({
      presence,
      regionIdentity,
      availability,
      conditionNames,
      archetype,
      accessPattern: pattern,
    }),
  };
}

export function deriveTerritoryIdentityIndex(
  state: GameState,
): Record<string, TerritoryIdentity> {
  return Object.fromEntries(
    (state.countries ?? [])
      .map((country) => deriveTerritoryIdentity(state, country))
      .filter((identity): identity is TerritoryIdentity => identity !== null)
      .map((identity) => [identity.countryId, identity]),
  );
}
