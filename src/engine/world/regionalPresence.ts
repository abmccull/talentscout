/**
 * Regional presence is the authoritative, derived bridge between geography
 * and scouting outcomes.
 *
 * It deliberately derives from existing persisted facts (home base, active
 * travel, knowledge, contacts, offices, and staff) rather than introducing a
 * second mutable coverage meter that could drift out of sync on old saves.
 */

import type {
  GameState,
  Observation,
  Player,
  TravelPosture,
} from "@/engine/core/types";
import { gameWeeksBetween } from "@/engine/core/gameDate";
import {
  deriveRivalMarketPressure,
  type RivalInformationExposureBand,
  type RivalMarketPressureBand,
} from "@/engine/rivals/organizations";
import { normalizeCountryKey } from "@/lib/country";
import { getTravelEligibleCountryKeys } from "./countryAvailability";
import {
  getScoutHomeCountry,
  getTravelCost,
  getTravelDuration,
  getTravelPostureEffects,
  getTravelSlots,
  isScoutAbroad,
} from "./travel";
import {
  getWorldConditionDefinition,
  getWorldConditionModifiers,
} from "./worldConditions";
import { isFixtureInSeason } from "./fixtures";
import { isAccessAgreementActive } from "@/engine/consequences/accessAgreements";
import {
  getAgencyPolicyWeeklyModifiers,
  normalizeAgencyStrategyState,
} from "@/engine/finance/agencyStrategy";

export type RegionalAccessTier =
  | "remote"
  | "informed"
  | "networked"
  | "field"
  | "established";

export interface RegionalPresenceSource {
  kind:
    | "homeBase"
    | "activeTravel"
    | "satelliteOffice"
    | "assignedStaff"
    | "localContacts"
    | "regionalKnowledge"
    | "delegatedCoverage"
    | "accessAgreement"
    | "operatingPolicy";
  label: string;
  score: number;
  /** Which operational capabilities this source actually strengthens. */
  dimensions?: Partial<RegionalPresenceDimensions>;
}

export interface RegionalPresenceDimensions {
  /** Reach into venues, player pools, and local introductions. */
  access: number;
  /** Ability to interpret evidence in its local football context. */
  intelligence: number;
  /** Durable trust, favours, exclusives, and stakeholder reach. */
  relationships: number;
  /** Cost, fatigue, planning time, and delegated operating capacity. */
  logistics: number;
}

export interface RegionalPresenceEffects {
  /** More reachable prospects and venues, never hidden player truth. */
  discoveryMultiplier: number;
  /** Additive confidence earned from local context and access. */
  observationConfidenceBonus: number;
  /** Additive confidence attached to locally sourced statistical evidence. */
  dataConfidenceBonus: number;
  /** Weight used by assignment and lead generation. */
  opportunityMultiplier: number;
  /** Multipliers are applied before equipment discounts. */
  travelCostMultiplier: number;
  travelFatigueMultiplier: number;
  /** Staffed offices can remove one planning slot from long-haul trips. */
  travelSlotReduction: number;
  /** Passive weekly knowledge earned by maintained local infrastructure. */
  passiveKnowledgeGain: number;
}

export type RegionalCalendarIntensity = "quiet" | "active" | "crowded";
export type RegionalRulesClimate = "stable" | "fluid" | "restricted" | "uncertain";
export type RegionalIntelFreshness = "live" | "aging" | "stale" | "unknown";
export type RegionalLanguageBridge = "home" | "embedded" | "supported" | "limited";

export interface RegionalTerritorialContext {
  calendar: {
    intensity: RegionalCalendarIntensity;
    visibleFixtureWindows: number;
    visibleTournamentWindows: number;
    activeSeasonEventNames: string[];
    opportunityMultiplier: number;
  };
  rules: {
    climate: RegionalRulesClimate;
    signals: string[];
    opportunityMultiplier: number;
  };
  languageAndCulture: {
    bridge: RegionalLanguageBridge;
    culturalInsightCount: number;
    trustedContactCount: number;
    confidenceMultiplier: number;
  };
  contacts: {
    count: number;
    depthScore: number;
  };
  intel: {
    freshness: RegionalIntelFreshness;
    ageWeeks?: number;
    reliabilityMultiplier: number;
  };
  regionalReputation: {
    score: number;
    reportsSubmitted: number;
    successfulFinds: number;
  };
  rivalMarket: {
    watcherCount: number;
    pressureScore: number;
    pressureBand: RivalMarketPressureBand;
    informationExposure: RivalInformationExposureBand;
    opportunityMultiplier: number;
  };
}

export interface RegionalPresenceSnapshot {
  countryId: string;
  generatedWorldEligible: boolean;
  accessScore: number;
  accessTier: RegionalAccessTier;
  dimensions: RegionalPresenceDimensions;
  isHomeBase: boolean;
  isActiveLocation: boolean;
  satelliteOfficeId?: string;
  assignedEmployeeIds: string[];
  contactIds: string[];
  /** Global and local seasonal context currently changing these effects. */
  worldConditionNames: string[];
  territorialContext: RegionalTerritorialContext;
  sources: RegionalPresenceSource[];
  effects: RegionalPresenceEffects;
  summary: string;
}

export type TerritorialStrategyPosture =
  | "specialist"
  | "selective"
  | "network"
  | "overextended";

export interface TerritorialStrategySnapshot {
  posture: TerritorialStrategyPosture;
  primaryCountryId?: string;
  eligibleCountryCount: number;
  coveredCountryCount: number;
  deepCountryCount: number;
  activeCalendarCountryCount: number;
  staleCountryIds: string[];
  contestedCountryIds: string[];
  operatingCapacity: number;
  committedCountryCount: number;
  capacityStrain: number;
  depthScore: number;
  breadthScore: number;
  strengths: string[];
  tradeoffs: string[];
  markets: Array<{
    countryId: string;
    accessScore: number;
    accessTier: RegionalAccessTier;
    calendarIntensity: RegionalCalendarIntensity;
    intelFreshness: RegionalIntelFreshness;
    rivalPressure: RivalMarketPressureBand;
  }>;
}

export interface RegionalTravelQuote {
  fromCountry: string;
  toCountry: string;
  posture?: TravelPosture;
  baseCost: number;
  cost: number;
  baseSlots: number;
  slots: number;
  baseDuration: number;
  duration: number;
  fatigueMultiplier: number;
  presence: RegionalPresenceSnapshot;
}

export interface RegionalObservationContext {
  countryId: string;
  accessTier: RegionalAccessTier;
  accessScore: number;
  confidenceBonus: number;
  explanation: string;
}

const generatedCountryCache = new WeakMap<GameState, ReadonlySet<string>>();

function generatedCountriesFor(state: GameState): ReadonlySet<string> {
  const cached = generatedCountryCache.get(state);
  if (cached) return cached;
  const generated = new Set(getTravelEligibleCountryKeys(state));
  generatedCountryCache.set(state, generated);
  return generated;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function canonicalCountry(value?: string): string | undefined {
  const fallback = value?.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  return (normalizeCountryKey(value) ?? fallback) || undefined;
}

function accessTier(score: number): RegionalAccessTier {
  if (score >= 80) return "established";
  if (score >= 60) return "field";
  if (score >= 40) return "networked";
  if (score >= 20) return "informed";
  return "remote";
}

function dimensionsFromSources(
  sources: readonly RegionalPresenceSource[],
): RegionalPresenceDimensions {
  const totals = sources.reduce<RegionalPresenceDimensions>(
    (result, source) => ({
      access: result.access + (source.dimensions?.access ?? 0),
      intelligence: result.intelligence + (source.dimensions?.intelligence ?? 0),
      relationships: result.relationships + (source.dimensions?.relationships ?? 0),
      logistics: result.logistics + (source.dimensions?.logistics ?? 0),
    }),
    { access: 0, intelligence: 0, relationships: 0, logistics: 0 },
  );
  return {
    access: Math.round(clamp(totals.access, 0, 100)),
    intelligence: Math.round(clamp(totals.intelligence, 0, 100)),
    relationships: Math.round(clamp(totals.relationships, 0, 100)),
    logistics: Math.round(clamp(totals.logistics, 0, 100)),
  };
}

function titleCase(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function contactCountryMatches(
  contact: GameState["contacts"][string],
  countryId: string,
): boolean {
  return canonicalCountry(contact.country) === countryId
    || canonicalCountry(contact.region) === countryId;
}

function assignmentCountryMatches(value: string | undefined, countryId: string): boolean {
  return canonicalCountry(value) === countryId;
}

function contactDepthScore(
  contacts: readonly GameState["contacts"][string][],
): number {
  if (contacts.length === 0) return 0;
  const depth = contacts.reduce((sum, contact) => {
    const trust = contact.trustLevel ?? contact.relationship;
    return sum
      + contact.relationship * 0.4
      + trust * 0.35
      + contact.reliability * 0.25;
  }, 0) / contacts.length;
  return Math.round(clamp(depth + Math.min(12, (contacts.length - 1) * 3), 0, 100));
}

function latestRegionalIntelAge(input: {
  state: GameState;
  contacts: readonly GameState["contacts"][string][];
  knowledge?: GameState["regionalKnowledge"][string];
  maintainedCoverage: boolean;
}): { freshness: RegionalIntelFreshness; ageWeeks?: number; multiplier: number } {
  if (input.maintainedCoverage) {
    return { freshness: "live", ageWeeks: 0, multiplier: 1.03 };
  }
  const current = {
    season: input.state.currentSeason,
    week: input.state.currentWeek,
  };
  const dates = [
    ...input.contacts.flatMap((contact) => contact.lastInteractionAt
      ? [contact.lastInteractionAt]
      : []),
    ...(input.knowledge?.knowledgeLedger ?? []).map((entry) => ({
      season: entry.season,
      week: entry.week,
    })),
  ];
  const ages = dates
    .map((date) => gameWeeksBetween(input.state.fixtures, date, current))
    .filter((age) => age >= 0);
  if (ages.length === 0) {
    // Legacy knowledge/contact records did not persist dates. Treat them as
    // unknown rather than rewriting an old save into an arbitrary penalty.
    return { freshness: "unknown", multiplier: 1 };
  }
  const ageWeeks = Math.min(...ages);
  if (ageWeeks <= 3) return { freshness: "live", ageWeeks, multiplier: 1.03 };
  if (ageWeeks <= 11) return { freshness: "aging", ageWeeks, multiplier: 0.96 };
  return { freshness: "stale", ageWeeks, multiplier: 0.82 };
}

function calendarContext(
  state: GameState,
  countryId: string,
): RegionalTerritorialContext["calendar"] {
  const leagueIds = new Set(Object.values(state.leagues ?? {})
    .filter((league) => canonicalCountry(league.country) === countryId)
    .map((league) => league.id));
  const visibleFixtureWindows = Object.values(state.fixtures ?? {}).filter((fixture) =>
    leagueIds.has(fixture.leagueId)
    && Number.isFinite(fixture.week)
    && isFixtureInSeason(fixture, state.currentSeason)
    && Math.abs(fixture.week - state.currentWeek) <= 2
  ).length;
  const visibleTournamentWindows = Object.values(state.youthTournaments ?? {}).filter((event) =>
    event.discovered
    && canonicalCountry(event.countryKey ?? event.country) === countryId
    && event.season === state.currentSeason
    && event.endWeek >= state.currentWeek - 1
    && event.startWeek <= state.currentWeek + 4
  ).length;
  const activeSeasonEvents = (state.seasonEvents ?? []).filter((event) =>
    event.startWeek <= state.currentWeek && event.endWeek >= state.currentWeek
  );
  const activeSeasonEventNames = activeSeasonEvents.map((event) => event.name);
  const congestion = activeSeasonEvents.some((event) =>
    event.type === "fixtureCongestion"
    || event.type === "domesticCupRounds"
    || event.type === "youthCup"
  );
  const score = visibleFixtureWindows
    + visibleTournamentWindows * 3
    + (congestion ? 4 : 0);
  const intensity: RegionalCalendarIntensity = score >= 8
    ? "crowded"
    : score >= 2
      ? "active"
      : "quiet";
  return {
    intensity,
    visibleFixtureWindows,
    visibleTournamentWindows,
    activeSeasonEventNames,
    opportunityMultiplier: intensity === "crowded" ? 1.08 : intensity === "active" ? 1 : 0.92,
  };
}

function rulesContext(
  state: GameState,
  countryId: string,
): RegionalTerritorialContext["rules"] {
  const activeConditions = (state.worldConditionState?.active ?? []).filter((condition) =>
    condition.scope === "global" || condition.countryId === countryId
  );
  const conditionIds = new Set(activeConditions.map((condition) => condition.definitionId));
  const fluid = conditionIds.has("open-transfer-market")
    || conditionIds.has("registration-easing");
  const restricted = conditionIds.has("agent-exclusivity-wave")
    || conditionIds.has("data-rights-dispute");
  const transferWindowOpen = state.transferWindow?.isOpen === true;
  const deadlinePressure = (state.seasonEvents ?? []).some((event) =>
    event.startWeek <= state.currentWeek
    && event.endWeek >= state.currentWeek
    && (event.type === "transferDeadlineDrama" || event.type === "januaryWindowFrenzy")
  );
  const climate: RegionalRulesClimate = (fluid && restricted) || deadlinePressure
    ? "uncertain"
    : restricted
      ? "restricted"
      : fluid
        ? "fluid"
        : "stable";
  const signals = [
    ...activeConditions.flatMap((condition) => {
      const definition = getWorldConditionDefinition(condition.definitionId);
      return definition ? [definition.name] : [];
    }),
    ...(transferWindowOpen ? ["Transfer window open"] : []),
    ...(deadlinePressure ? ["Deadline pressure"] : []),
  ];
  return {
    climate,
    signals: [...new Set(signals)],
    opportunityMultiplier: climate === "fluid"
      ? 1.05
      : climate === "restricted"
        ? 0.92
        : climate === "uncertain"
          ? 0.97
          : 1,
  };
}

function rivalMarketContext(
  state: GameState,
  countryId: string,
): RegionalTerritorialContext["rivalMarket"] {
  const trackedPlayerIds = [...new Set(Object.values(state.rivalScouts ?? {}).flatMap((rival) => [
    ...(rival.currentTarget ? [rival.currentTarget] : []),
    ...rival.targetPlayerIds,
  ]))];
  const snapshots = trackedPlayerIds
    .filter((playerId) => getPlayerScoutingCountry(state, playerId) === countryId)
    .map((playerId) => deriveRivalMarketPressure(state, playerId));
  const watcherCount = snapshots.reduce((sum, snapshot) => sum + snapshot.watchers.length, 0);
  const pressureScore = snapshots.length > 0
    ? Math.round(Math.max(...snapshots.map((snapshot) => snapshot.score)))
    : 0;
  const pressureBand: RivalMarketPressureBand = pressureScore >= 70
    ? "closing"
    : pressureScore >= 45
      ? "contested"
      : pressureScore >= 20
        ? "watched"
        : "uncontested";
  const exposureRank: Record<RivalInformationExposureBand, number> = {
    contained: 0,
    circulating: 1,
    leaking: 2,
  };
  const informationExposure = snapshots.reduce<RivalInformationExposureBand>(
    (strongest, snapshot) => exposureRank[snapshot.informationExposure] > exposureRank[strongest]
      ? snapshot.informationExposure
      : strongest,
    "contained",
  );
  return {
    watcherCount,
    pressureScore,
    pressureBand,
    informationExposure,
    opportunityMultiplier: clamp(1 - pressureScore * 0.0015, 0.85, 1),
  };
}

/** Resolve the football environment in which a player is currently observed. */
export function getPlayerScoutingCountry(
  state: Pick<GameState, "players" | "unsignedYouth" | "clubs" | "leagues">,
  playerOrId: Player | string,
): string | undefined {
  const playerId = typeof playerOrId === "string" ? playerOrId : playerOrId.id;
  // Most observations concern contracted players. Resolve that constant-time
  // path before scanning the unsigned-youth pool, which can grow substantially
  // over long careers.
  const player = typeof playerOrId === "string"
    ? state.players[playerOrId]
    : playerOrId;
  if (player) {
    const club = state.clubs[player.clubId];
    const league = club ? state.leagues[club.leagueId] : undefined;
    const country = canonicalCountry(league?.country);
    if (country) return country;
  }

  const youth = Object.values(state.unsignedYouth ?? {}).find(
    (candidate) => candidate.player.id === playerId || candidate.id === playerId,
  );
  if (youth) return canonicalCountry(youth.country);
  return undefined;
}

/**
 * Derive one country's current operational presence from canonical save data.
 * The result is deterministic and can be recomputed safely after migration.
 */
export function deriveRegionalPresence(
  state: GameState,
  country: string,
): RegionalPresenceSnapshot {
  const countryId = canonicalCountry(country) ?? country.toLowerCase();
  const generatedWorldEligible = generatedCountriesFor(state).has(countryId);
  const homeCountry = canonicalCountry(getScoutHomeCountry(state.scout));
  const activeCountry = isScoutAbroad(state.scout, state.currentWeek)
    ? canonicalCountry(state.scout.travelBooking?.destinationCountry)
    : homeCountry;
  const isHomeBase = homeCountry === countryId;
  const isActiveLocation = activeCountry === countryId;

  const offices = state.finances?.satelliteOffices ?? [];
  const office = offices.find((candidate) => canonicalCountry(candidate.region) === countryId);
  const employees = state.finances?.employees ?? [];
  const assignedEmployeeIds = office
    ? [...new Set(office.employeeIds)].filter((id) => employees.some((employee) => employee.id === id))
    : [];
  const assignedEmployees = assignedEmployeeIds
    .map((id) => employees.find((employee) => employee.id === id))
    .filter((employee): employee is NonNullable<typeof employee> => !!employee);

  const delegatedEmployees = employees.filter((employee) =>
    !assignedEmployeeIds.includes(employee.id)
    && assignmentCountryMatches(employee.currentAssignment?.targetRegion, countryId),
  );
  const delegatedAssistants = (state.assistantScouts ?? []).filter((assistant) =>
    assignmentCountryMatches(assistant.assignedRegion, countryId),
  );
  const delegatedNpcScouts = Object.values(state.npcScouts ?? {}).filter((npc) => {
    const territory = npc.territoryId ? state.territories[npc.territoryId] : undefined;
    return canonicalCountry(territory?.countryKey ?? territory?.country) === countryId;
  });

  const contacts = Object.values(state.contacts ?? {}).filter((contact) =>
    !contact.dormant && contactCountryMatches(contact, countryId),
  );
  const knowledge = state.regionalKnowledge?.[countryId]
    ?? Object.values(state.regionalKnowledge ?? {}).find(
      (entry) => canonicalCountry(entry.countryId) === countryId,
    );
  const knowledgeLevel = clamp(knowledge?.knowledgeLevel ?? 0, 0, 100);
  const localContactCount = (knowledge?.localContacts ?? []).length;
  const culturalInsightCount = (knowledge?.culturalInsights ?? []).length;
  const agencyStrategy = normalizeAgencyStrategyState(state.finances?.agencyStrategyState);
  const agencyPolicy = getAgencyPolicyWeeklyModifiers(agencyStrategy?.policy);
  const agencyPolicyCountry = canonicalCountry(agencyStrategy?.focusRegionId) ?? homeCountry;
  const agencyPolicyActiveHere = Boolean(
    agencyStrategy
    && agencyPolicy.regionalPresenceBonus > 0
    && agencyPolicyCountry === countryId,
  );
  const accessAgreements = Object.values(state.accessAgreements ?? {}).filter((agreement) =>
    isAccessAgreementActive(agreement, {
      season: state.currentSeason,
      week: state.currentWeek,
    })
    && (
      canonicalCountry(agreement.countryId) === countryId
      || canonicalCountry(agreement.regionId) === countryId
      || (agreement.subject?.kind === "territory"
         && canonicalCountry(agreement.subject.id) === countryId)
    ),
  );

  const sources: RegionalPresenceSource[] = [];
  if (isHomeBase) {
    sources.push({
      kind: "homeBase",
      label: "Permanent home base",
      score: 35,
      dimensions: { access: 42, logistics: 45 },
    });
  }
  if (isActiveLocation) {
    sources.push({
      kind: "activeTravel",
      label: isHomeBase ? "Active local presence" : "Currently working in country",
      score: isHomeBase ? 12 : 28,
      dimensions: { access: 28, intelligence: 14, relationships: 8, logistics: 10 },
    });
  }
  if (office) {
    sources.push({
      kind: "satelliteOffice",
      label: "Satellite office",
      score: 22,
      dimensions: {
        access: 18,
        intelligence: 5 + office.qualityBonus * 25,
        relationships: 8,
        logistics: 35,
      },
    });
  }
  if (assignedEmployees.length > 0) {
    const staffScore = clamp(
      assignedEmployees.reduce((sum, employee) => sum + 2 + employee.quality / 5, 0),
      0,
      16,
    );
    sources.push({
      kind: "assignedStaff",
      label: `${assignedEmployees.length} office staff on the ground`,
      score: staffScore,
      dimensions: {
        access: assignedEmployees.filter((employee) =>
          employee.role === "scout" || employee.role === "mentee"
        ).length * 10,
        intelligence: assignedEmployees.reduce((sum, employee) =>
          sum + (employee.role === "analyst" ? 12 : employee.role === "scout" ? 5 : 0), 0),
        relationships: assignedEmployees.filter(
          (employee) => employee.role === "relationshipManager",
        ).length * 15,
        logistics: assignedEmployees.reduce((sum, employee) =>
          sum + 4 + (employee.role === "administrator" ? 18 : 0), 0),
      },
    });
  }
  const delegatedCount = delegatedEmployees.length + delegatedAssistants.length + delegatedNpcScouts.length;
  if (delegatedCount > 0) {
    sources.push({
      kind: "delegatedCoverage",
      label: `${delegatedCount} delegated scout${delegatedCount === 1 ? "" : "s"} covering the country`,
      score: clamp(delegatedCount * 4, 0, 12),
      dimensions: { access: delegatedCount * 5 },
    });
  }
  if (contacts.length > 0 || localContactCount > 0) {
    const relationshipWeight = contacts.reduce((sum, contact) =>
      sum + clamp((contact.relationship + (contact.trustLevel ?? contact.relationship)) / 200, 0.1, 1), 0);
    const localContactWeight = localContactCount * 0.4;
    const contactScore = clamp((relationshipWeight + localContactWeight) * 4, 0, 15);
    sources.push({
      kind: "localContacts",
      label: `${contacts.length + localContactCount} local relationship${contacts.length + localContactCount === 1 ? "" : "s"}`,
      score: contactScore,
      dimensions: {
        access: relationshipWeight * 7 + localContactCount * 2,
        relationships: relationshipWeight * 20 + localContactCount * 4,
      },
    });
  }
  if (accessAgreements.length > 0) {
    const agreementWeight = Math.min(4, accessAgreements.length);
    sources.push({
      kind: "accessAgreement",
      label: `${accessAgreements.length} active protected access ${accessAgreements.length === 1 ? "channel" : "channels"}`,
      score: agreementWeight * 8,
      dimensions: {
        access: agreementWeight * 10,
        relationships: agreementWeight * 6,
      },
    });
  }
  if (agencyStrategy && agencyPolicyActiveHere) {
    sources.push({
      kind: "operatingPolicy",
      label: agencyStrategy.policy === "regionalDepth"
        ? "Agency committed to regional depth"
        : "Agency market-expansion campaign",
      score: agencyPolicy.regionalPresenceBonus,
      dimensions: {
        access: agencyPolicy.regionalPresenceBonus,
        intelligence: Math.round(agencyPolicy.regionalPresenceBonus * 0.8),
        relationships: Math.round(agencyPolicy.regionalPresenceBonus * 0.6),
        logistics: Math.round(agencyPolicy.regionalPresenceBonus * 0.4),
      },
    });
  }
  if (knowledgeLevel > 0) {
    sources.push({
      kind: "regionalKnowledge",
      label: `${Math.round(knowledgeLevel)}/100 regional knowledge`,
      score: knowledgeLevel * 0.2,
      dimensions: { intelligence: knowledgeLevel * 0.62, logistics: knowledgeLevel * 0.1 },
    });
  }

  const analystCount = assignedEmployees.filter((employee) => employee.role === "analyst").length;
  const countryReputation = state.scout.countryReputations?.[countryId]
    ?? Object.values(state.scout.countryReputations ?? {}).find((entry) =>
      canonicalCountry(entry.country) === countryId
    );
  const regionalReputationScore = Math.round(clamp(
    (countryReputation?.familiarity ?? 0) * 0.55
      + Math.min(20, (countryReputation?.reportsSubmitted ?? 0) * 1.2)
      + Math.min(18, (countryReputation?.successfulFinds ?? 0) * 4.5)
      + Math.min(7, (countryReputation?.contactCount ?? 0) * 1.75),
    0,
    100,
  ));
  const trustedContactCount = contacts.filter((contact) =>
    Math.max(contact.relationship, contact.trustLevel ?? 0) >= 60
  ).length;
  const intel = latestRegionalIntelAge({
    state,
    contacts,
    knowledge,
    maintainedCoverage: isActiveLocation
      || assignedEmployees.length > 0
      || delegatedCount > 0,
  });
  const languageBridge: RegionalLanguageBridge = isHomeBase
    ? "home"
    : culturalInsightCount >= 2 && trustedContactCount >= 2
      ? "embedded"
      : culturalInsightCount > 0 || trustedContactCount > 0
        ? "supported"
        : "limited";
  const languageConfidenceMultiplier = languageBridge === "home"
    ? 1.04
    : languageBridge === "embedded"
      ? 1.03
      : languageBridge === "supported"
        ? 0.98
        : 0.9;
  const calendar = calendarContext(state, countryId);
  const rules = rulesContext(state, countryId);
  const rivalMarket = rivalMarketContext(state, countryId);
  const territorialContext: RegionalTerritorialContext = {
    calendar,
    rules,
    languageAndCulture: {
      bridge: languageBridge,
      culturalInsightCount,
      trustedContactCount,
      confidenceMultiplier: languageConfidenceMultiplier,
    },
    contacts: {
      count: contacts.length + localContactCount,
      depthScore: contactDepthScore(contacts),
    },
    intel: {
      freshness: intel.freshness,
      ageWeeks: intel.ageWeeks,
      reliabilityMultiplier: intel.multiplier,
    },
    regionalReputation: {
      score: regionalReputationScore,
      reportsSubmitted: countryReputation?.reportsSubmitted ?? 0,
      successfulFinds: countryReputation?.successfulFinds ?? 0,
    },
    rivalMarket,
  };

  // Sources are the single calculation authority for operational presence.
  // Territorial reputation is a contextual modifier layered onto those
  // explainable sources instead of retaining the older parallel hand-built
  // formula, which would otherwise double-count offices, staff, and contacts.
  const sourceDimensions = dimensionsFromSources(sources);
  const dimensions: RegionalPresenceDimensions = generatedWorldEligible
    ? {
        ...sourceDimensions,
        intelligence: Math.round(clamp(
          sourceDimensions.intelligence + regionalReputationScore * 0.05,
          0,
          100,
        )),
        relationships: Math.round(clamp(
          sourceDimensions.relationships + regionalReputationScore * 0.12,
          0,
          100,
        )),
      }
    : { access: 0, intelligence: 0, relationships: 0, logistics: 0 };
  const accessScore = generatedWorldEligible
    ? Math.round(
        dimensions.access * 0.35
        + dimensions.intelligence * 0.3
        + dimensions.relationships * 0.2
        + dimensions.logistics * 0.15,
      )
    : 0;
  const tier = accessTier(accessScore);
  const activeBonus = isActiveLocation ? 0.025 : 0;
  const observationConfidenceBonus = generatedWorldEligible
    ? clamp(dimensions.intelligence * 0.0013 + activeBonus, 0, 0.15)
    : 0;
  const dataConfidenceBonus = generatedWorldEligible
    ? clamp(dimensions.intelligence * 0.0009 + analystCount * 0.012, 0, 0.1)
    : 0;
  const travelCostMultiplier = generatedWorldEligible
    ? clamp(1 - dimensions.logistics * 0.0045, 0.55, 1)
    : 1;
  const travelFatigueMultiplier = generatedWorldEligible
    ? clamp(1 - dimensions.logistics * 0.004, 0.55, 1)
    : 1;
  const passiveKnowledgeGain = generatedWorldEligible
    ? clamp(
      (office ? 0.5 : 0)
        + assignedEmployees.length * 0.25
        + delegatedCount * 0.15
        + (agencyPolicyActiveHere ? agencyPolicy.regionalPresenceBonus * 0.03 : 0),
      0,
      2,
    )
    : 0;
  const conditionModifiers = getWorldConditionModifiers(state, countryId);
  const activeTravelPosture = state.scout.travelBooking
    && canonicalCountry(state.scout.travelBooking.destinationCountry) === countryId
    && isScoutAbroad(state.scout, state.currentWeek)
    ? getTravelPostureEffects(state.scout.travelBooking.posture)
    : getTravelPostureEffects(undefined);
  const worldConditionNames = (state.worldConditionState?.active ?? [])
    .filter((condition) =>
      condition.scope === "global" || condition.countryId === countryId
    )
    .flatMap((condition) => {
      const definition = getWorldConditionDefinition(condition.definitionId);
      return definition ? [definition.name] : [];
    });

  const effects: RegionalPresenceEffects = {
    discoveryMultiplier: generatedWorldEligible
      ? clamp(
        (0.82 + (dimensions.access / 100) * 0.65)
          * conditionModifiers.discoveryMultiplier
          * activeTravelPosture.discoveryMultiplier,
        0.55,
        1.7,
      )
      : 0,
    observationConfidenceBonus: clamp(
      observationConfidenceBonus
        * conditionModifiers.observationConfidenceMultiplier
        * territorialContext.intel.reliabilityMultiplier
        * territorialContext.languageAndCulture.confidenceMultiplier,
      0,
      0.18,
    ),
    dataConfidenceBonus: clamp(
      dataConfidenceBonus
        * conditionModifiers.observationConfidenceMultiplier
        * territorialContext.intel.reliabilityMultiplier
        * territorialContext.languageAndCulture.confidenceMultiplier,
      0,
      0.13,
    ),
    opportunityMultiplier: generatedWorldEligible
      ? clamp(
        (
          0.82
          + ((dimensions.access * 0.45 + dimensions.relationships * 0.55) / 100) * 0.7
        )
          * conditionModifiers.opportunityMultiplier
          * activeTravelPosture.opportunityMultiplier
          * territorialContext.calendar.opportunityMultiplier
          * territorialContext.rules.opportunityMultiplier
          * territorialContext.rivalMarket.opportunityMultiplier
          * clamp(0.96 + regionalReputationScore * 0.001, 0.96, 1.06),
        0.5,
        1.8,
      )
      : 0,
    travelCostMultiplier: clamp(
      travelCostMultiplier * conditionModifiers.travelCostMultiplier,
      0.45,
      1.75,
    ),
    travelFatigueMultiplier: clamp(
      travelFatigueMultiplier
        * conditionModifiers.travelFatigueMultiplier
        * activeTravelPosture.fatigueMultiplier,
      0.45,
      2,
    ),
    travelSlotReduction: office && assignedEmployees.length > 0 ? 1 : 0,
    passiveKnowledgeGain,
  };

  const strongest = [...sources].sort((left, right) => right.score - left.score).slice(0, 2);
  const summary = !generatedWorldEligible
    ? "No generated scouting surface exists in this career."
    : strongest.length === 0
      ? "Remote coverage only; access and evidence remain limited."
      : `${titleCase(tier)} presence from ${strongest.map((source) => source.label.toLowerCase()).join(" and ")}.${worldConditionNames.length > 0 ? ` Seasonal context: ${worldConditionNames.join(" and ")}.` : ""}${territorialContext.intel.freshness === "stale" ? " Local intelligence needs refreshing." : ""}${territorialContext.rivalMarket.pressureBand === "contested" || territorialContext.rivalMarket.pressureBand === "closing" ? ` Rival pressure is ${territorialContext.rivalMarket.pressureBand}.` : ""}`;

  const snapshot: RegionalPresenceSnapshot = {
    countryId,
    generatedWorldEligible,
    accessScore,
    accessTier: tier,
    dimensions,
    isHomeBase,
    isActiveLocation,
    satelliteOfficeId: office?.id,
    assignedEmployeeIds,
    contactIds: contacts.map((contact) => contact.id),
    worldConditionNames,
    territorialContext,
    sources,
    effects,
    summary,
  };
  return snapshot;
}

export function deriveRegionalPresenceIndex(
  state: GameState,
): Record<string, RegionalPresenceSnapshot> {
  return Object.fromEntries(
    state.countries.map((country) => {
      const snapshot = deriveRegionalPresence(state, country);
      return [snapshot.countryId, snapshot];
    }),
  );
}

/**
 * Summarize the real depth-versus-breadth position created by offices, staff,
 * contacts, knowledge, calendars, and rival pressure. This is derived rather
 * than saved, so old careers gain strategy context without a migration meter.
 */
export function deriveTerritorialStrategy(
  state: GameState,
): TerritorialStrategySnapshot {
  const markets = Object.values(deriveRegionalPresenceIndex(state))
    .filter((presence) => presence.generatedWorldEligible)
    .sort((left, right) => right.accessScore - left.accessScore
      || left.countryId.localeCompare(right.countryId));
  const covered = markets.filter((presence) => presence.accessTier !== "remote");
  const deep = markets.filter((presence) =>
    presence.accessTier === "field" || presence.accessTier === "established"
  );
  const committed = markets.filter((presence) => presence.sources.some((source) =>
    source.kind !== "regionalKnowledge"
  ));
  const fieldEmployees = (state.finances?.employees ?? []).filter((employee) =>
    employee.role === "scout"
    || employee.role === "mentee"
    || employee.role === "relationshipManager"
  ).length;
  const operatingCapacity = Math.max(
    1,
    1
      + fieldEmployees
      + (state.assistantScouts?.length ?? 0)
      + Object.keys(state.npcScouts ?? {}).length,
  );
  const capacityStrain = Math.round((committed.length / operatingCapacity) * 100) / 100;
  const staleCountryIds = markets
    .filter((presence) => presence.territorialContext.intel.freshness === "stale")
    .map((presence) => presence.countryId);
  const contestedCountryIds = markets
    .filter((presence) =>
      presence.territorialContext.rivalMarket.pressureBand === "contested"
      || presence.territorialContext.rivalMarket.pressureBand === "closing"
    )
    .map((presence) => presence.countryId);
  const activeCalendarCountryCount = markets.filter((presence) =>
    presence.territorialContext.calendar.intensity !== "quiet"
  ).length;
  const depthScore = markets[0]?.accessScore ?? 0;
  const breadthScore = markets.length > 0
    ? Math.round((covered.length / markets.length) * 100)
    : 0;
  const runnerUpGap = depthScore - (markets[1]?.accessScore ?? 0);
  const staleLoad = covered.length > 0 ? staleCountryIds.length / covered.length : 0;
  const concentratedNetwork = covered.length === 1
    && depthScore >= 40
    && runnerUpGap >= 15;
  const posture: TerritorialStrategyPosture = capacityStrain > 1.2
      || (covered.length >= 2 && staleLoad >= 0.5)
    ? "overextended"
    : concentratedNetwork
        || (deep.length === 1 && (covered.length <= 1 || runnerUpGap >= 15))
      ? "specialist"
      : markets.length >= 2
          && covered.length >= Math.min(3, markets.length)
          && capacityStrain <= 1
        ? "network"
        : "selective";
  const strengths = posture === "specialist"
    ? [
        `A ${depthScore}/100 peak presence creates the strongest local evidence and access edge.`,
        "Concentrated relationships are easier to keep current and defend from rivals.",
      ]
    : posture === "network"
      ? [
          `${covered.length} markets can produce credible leads without a fresh trip.`,
          "Calendar shocks in one territory can be absorbed by work elsewhere.",
        ]
      : posture === "overextended"
        ? ["The network reaches several markets, but capacity is spread beyond its current support base."]
        : ["Coverage is deliberately selective, preserving room to deepen the best live opportunities."];
  const tradeoffs = posture === "specialist"
    ? [
        `${Math.max(0, markets.length - covered.length)} eligible market${markets.length - covered.length === 1 ? " remains" : "s remain"} dependent on remote access.`,
        "A quiet calendar or closed pathway in the primary territory can leave the pipeline exposed.",
      ]
    : posture === "network"
      ? [
          `Peak depth is ${depthScore}/100; broad reach does not equal insider-level certainty everywhere.`,
          "Every additional territory creates contact-maintenance and stale-intelligence risk.",
        ]
      : posture === "overextended"
        ? [
            `${committed.length} committed markets are being supported by ${operatingCapacity} units of field capacity.`,
            `${staleCountryIds.length} market${staleCountryIds.length === 1 ? " has" : "s have"} intelligence old enough to weaken decisions.`,
          ]
        : [
            "Selective coverage preserves capacity but leaves some calendar windows and relationships unused.",
            "The next office, delegate, or contact decision will determine whether the network specializes or broadens.",
          ];

  return {
    posture,
    primaryCountryId: markets[0]?.countryId,
    eligibleCountryCount: markets.length,
    coveredCountryCount: covered.length,
    deepCountryCount: deep.length,
    activeCalendarCountryCount,
    staleCountryIds,
    contestedCountryIds,
    operatingCapacity,
    committedCountryCount: committed.length,
    capacityStrain,
    depthScore,
    breadthScore,
    strengths,
    tradeoffs,
    markets: markets.map((presence) => ({
      countryId: presence.countryId,
      accessScore: presence.accessScore,
      accessTier: presence.accessTier,
      calendarIntensity: presence.territorialContext.calendar.intensity,
      intelFreshness: presence.territorialContext.intel.freshness,
      rivalPressure: presence.territorialContext.rivalMarket.pressureBand,
    })),
  };
}

/** Quote logistics after regional presence, before equipment discounts. */
export function getRegionalTravelQuote(
  state: GameState,
  destinationCountry: string,
  posture?: TravelPosture,
): RegionalTravelQuote {
  const fromCountry = getScoutHomeCountry(state.scout);
  const toCountry = canonicalCountry(destinationCountry) ?? destinationCountry;
  const presence = deriveRegionalPresence(state, toCountry);
  const baseCost = getTravelCost(fromCountry, toCountry);
  const baseSlots = getTravelSlots(fromCountry, toCountry);
  const baseDuration = getTravelDuration(fromCountry, toCountry);
  const staffedOffice = presence.satelliteOfficeId && presence.assignedEmployeeIds.length > 0;
  const conditionModifiers = getWorldConditionModifiers(state, toCountry);
  const durationDelta = conditionModifiers.travelDurationDelta;
  const postureEffects = getTravelPostureEffects(posture);
  const activeBookingPosture = state.scout.travelBooking
    && canonicalCountry(state.scout.travelBooking.destinationCountry) === toCountry
    && isScoutAbroad(state.scout, state.currentWeek)
      ? getTravelPostureEffects(state.scout.travelBooking.posture)
      : getTravelPostureEffects(undefined);
  // Presence exposes the effects of the trip currently being worked. A new
  // quote must first remove that active posture or the chosen posture would be
  // applied twice when booking/processing travel from an active location.
  const basePresenceFatigueMultiplier = presence.effects.travelFatigueMultiplier
    / activeBookingPosture.fatigueMultiplier;

  return {
    fromCountry,
    toCountry,
    posture,
    baseCost,
    cost: Math.round(
      baseCost
        * presence.effects.travelCostMultiplier
        * postureEffects.costMultiplier,
    ),
    baseSlots,
    slots: Math.max(
      baseSlots === 0 ? 0 : 1,
      baseSlots - presence.effects.travelSlotReduction + durationDelta,
    ),
    baseDuration,
    duration: Math.max(
      baseDuration === 0 ? 0 : 1,
      baseDuration - (staffedOffice ? 1 : 0) + durationDelta,
    ),
    fatigueMultiplier: clamp(
      basePresenceFatigueMultiplier * postureEffects.fatigueMultiplier,
      0.45,
      2,
    ),
    presence,
  };
}

/**
 * Add explainable local-context confidence to newly generated evidence.
 * Idempotency is persisted on the observation so manual and batch advancement
 * cannot apply the same regional effect twice.
 */
export function applyRegionalPresenceToObservation(
  state: GameState,
  observation: Observation,
): Observation {
  if (observation.regionalContext) return observation;
  const countryId = getPlayerScoutingCountry(state, observation.playerId);
  if (!countryId) return observation;
  const presence = deriveRegionalPresence(state, countryId);
  const bonus = observation.context === "databaseQuery"
    || observation.context === "statsBriefing"
    || observation.context === "deepVideoAnalysis"
    || observation.context === "videoAnalysis"
      ? Math.max(
        presence.effects.observationConfidenceBonus,
        presence.effects.dataConfidenceBonus,
      )
      : presence.effects.observationConfidenceBonus;
  const roundedBonus = Math.round(bonus * 1000) / 1000;
  const regionalContext: RegionalObservationContext = {
    countryId,
    accessTier: presence.accessTier,
    accessScore: presence.accessScore,
    confidenceBonus: roundedBonus,
    explanation: presence.summary,
  };
  if (roundedBonus <= 0) {
    return { ...observation, regionalContext };
  }

  const rangeReduction = roundedBonus >= 0.1 ? 2 : roundedBonus >= 0.045 ? 1 : 0;
  const player = state.players[observation.playerId]
    ?? Object.values(state.unsignedYouth).find(
      (candidate) => candidate.player.id === observation.playerId,
    )?.player;
  const attributeReadings = observation.attributeReadings.map((reading) => {
    const trueValue = player?.attributes?.[reading.attribute];
    const correction = typeof trueValue === "number" && rangeReduction > 0
      ? Math.sign(trueValue - reading.perceivedValue)
        * Math.min(rangeReduction, Math.abs(trueValue - reading.perceivedValue))
      : 0;
    const perceivedValue = clamp(reading.perceivedValue + correction, 1, 20);
    return {
      ...reading,
      perceivedValue,
      confidence: Math.min(1, reading.confidence + roundedBonus),
      rangeLow: reading.rangeLow === undefined
        ? undefined
        : Math.min(perceivedValue, reading.rangeLow + rangeReduction),
      rangeHigh: reading.rangeHigh === undefined
        ? undefined
        : Math.max(perceivedValue, reading.rangeHigh - rangeReduction),
    };
  });

  return {
    ...observation,
    attributeReadings,
    regionalContext,
    notes: [
      ...observation.notes,
      `Regional context (${presence.accessTier}, ${presence.accessScore}/100): local access added ${Math.round(roundedBonus * 100)}% evidence confidence.`,
    ],
  };
}
