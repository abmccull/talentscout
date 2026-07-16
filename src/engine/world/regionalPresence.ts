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
    | "delegatedCoverage";
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
  sources: RegionalPresenceSource[];
  effects: RegionalPresenceEffects;
  summary: string;
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
      dimensions: { access: 18, intelligence: 5, relationships: 8, logistics: 35 },
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
  if (contacts.length > 0 || (knowledge?.localContacts.length ?? 0) > 0) {
    const relationshipWeight = contacts.reduce((sum, contact) =>
      sum + clamp((contact.relationship + (contact.trustLevel ?? contact.relationship)) / 200, 0.1, 1), 0);
    const localContactWeight = (knowledge?.localContacts.length ?? 0) * 0.4;
    const contactScore = clamp((relationshipWeight + localContactWeight) * 4, 0, 15);
    sources.push({
      kind: "localContacts",
      label: `${contacts.length + (knowledge?.localContacts.length ?? 0)} local relationship${contacts.length + (knowledge?.localContacts.length ?? 0) === 1 ? "" : "s"}`,
      score: contactScore,
      dimensions: {
        access: relationshipWeight * 7 + (knowledge?.localContacts.length ?? 0) * 2,
        relationships: relationshipWeight * 20 + (knowledge?.localContacts.length ?? 0) * 4,
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
  const scoutCount = assignedEmployees.filter((employee) =>
    employee.role === "scout" || employee.role === "mentee"
  ).length;
  const administratorCount = assignedEmployees.filter(
    (employee) => employee.role === "administrator",
  ).length;
  const relationshipManagerCount = assignedEmployees.filter(
    (employee) => employee.role === "relationshipManager",
  ).length;
  const relationshipStrength = contacts.reduce((sum, contact) =>
    sum + clamp((contact.relationship + (contact.trustLevel ?? contact.relationship)) / 200, 0.1, 1), 0);
  const localContactCount = knowledge?.localContacts.length ?? 0;
  const officeQuality = office?.qualityBonus ?? 0;

  const dimensions: RegionalPresenceDimensions = generatedWorldEligible
    ? {
        access: Math.round(clamp(
          (isHomeBase ? 42 : 0)
            + (isActiveLocation ? 28 : 0)
            + (office ? 18 : 0)
            + scoutCount * 10
            + delegatedCount * 5
            + relationshipStrength * 7
            + localContactCount * 2,
          0,
          100,
        )),
        intelligence: Math.round(clamp(
          knowledgeLevel * 0.62
            + (isActiveLocation ? 14 : 0)
            + (office ? 5 : 0)
            + scoutCount * 5
            + analystCount * 12
            + officeQuality * 25,
          0,
          100,
        )),
        relationships: Math.round(clamp(
          relationshipStrength * 20
            + localContactCount * 4
            + relationshipManagerCount * 15
            + (office ? 8 : 0)
            + (isActiveLocation ? 8 : 0),
          0,
          100,
        )),
        logistics: Math.round(clamp(
          (isHomeBase ? 45 : 0)
            + (isActiveLocation ? 10 : 0)
            + (office ? 35 : 0)
            + administratorCount * 18
            + assignedEmployees.length * 4
            + knowledgeLevel * 0.1,
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
        + delegatedCount * 0.15,
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
        * conditionModifiers.observationConfidenceMultiplier,
      0,
      0.18,
    ),
    dataConfidenceBonus: clamp(
      dataConfidenceBonus
        * conditionModifiers.observationConfidenceMultiplier,
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
          * activeTravelPosture.opportunityMultiplier,
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
      : `${titleCase(tier)} presence from ${strongest.map((source) => source.label.toLowerCase()).join(" and ")}.${worldConditionNames.length > 0 ? ` Seasonal context: ${worldConditionNames.join(" and ")}.` : ""}`;

  return {
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
    sources,
    effects,
    summary,
  };
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
