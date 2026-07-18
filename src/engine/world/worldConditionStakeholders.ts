import type { GameState, ScoutingPhilosophy } from "@/engine/core/types";
import { getWorldConditionDefinition, getWorldConditionModifiers } from "./worldConditions";
import { deriveClubRecruitmentDoctrine } from "./recruitmentIdentity";
import { normalizeCountryKey } from "@/lib/country";

export const WORLD_STAKEHOLDER_ROLES = [
  "family",
  "agent",
  "journalist",
  "organizer",
  "clubDirector",
  "manager",
  "coach",
  "localScout",
  "rival",
] as const;

export type WorldStakeholderRole = (typeof WORLD_STAKEHOLDER_ROLES)[number];

export interface WorldConditionStakeholderClimate {
  role: WorldStakeholderRole;
  countryId?: string;
  clubId?: string;
  accessFriction: number;
  evidenceScrutiny: number;
  patience: number;
  secrecyPressure: number;
  priceLeverage: number;
  rivalHeat: number;
  travelTolerance: number;
  activeConditionIds: string[];
  reasons: string[];
}

export interface WorldConditionStakeholderMatrix {
  countryId?: string;
  clubId?: string;
  climates: Record<WorldStakeholderRole, WorldConditionStakeholderClimate>;
}

type ClimateAccumulator = Omit<
  WorldConditionStakeholderClimate,
  "reasons" | "activeConditionIds"
> & {
  reasons: Set<string>;
  activeConditionIds: Set<string>;
};

function canonicalCountry(value?: string): string | undefined {
  const normalized = normalizeCountryKey(value);
  if (normalized) return normalized;
  const compact = value?.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
  return compact || undefined;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, Math.round(value)));
}

function createAccumulator(
  role: WorldStakeholderRole,
  countryId?: string,
  clubId?: string,
): ClimateAccumulator {
  return {
    role,
    ...(countryId ? { countryId } : {}),
    ...(clubId ? { clubId } : {}),
    accessFriction: 0,
    evidenceScrutiny: 0,
    patience: 0,
    secrecyPressure: 0,
    priceLeverage: 0,
    rivalHeat: 0,
    travelTolerance: 0,
    activeConditionIds: new Set<string>(),
    reasons: new Set<string>(),
  };
}

function clubCountry(state: GameState, clubId?: string): string | undefined {
  if (!clubId) return undefined;
  const club = state.clubs[clubId];
  const league = club ? state.leagues[club.leagueId] : undefined;
  return canonicalCountry(league?.country);
}

function doctrineStyleLabel(philosophy: ScoutingPhilosophy): string {
  return philosophy.replace(/([A-Z])/g, " $1").toLowerCase();
}

function applyTagEffects(
  accumulator: ClimateAccumulator,
  tag: string,
): void {
  switch (tag) {
    case "relationships":
      if (accumulator.role === "agent") accumulator.priceLeverage += 8;
      if (accumulator.role === "family") accumulator.secrecyPressure += 6;
      if (accumulator.role === "organizer") accumulator.accessFriction += 8;
      if (accumulator.role === "rival") accumulator.rivalHeat += 6;
      accumulator.reasons.add("Relationship-led conditions make introductions and confidentiality more valuable.");
      break;
    case "competition":
      if (accumulator.role === "rival") accumulator.rivalHeat += 10;
      if (accumulator.role === "journalist") accumulator.secrecyPressure += 5;
      if (accumulator.role === "agent") accumulator.priceLeverage += 5;
      accumulator.reasons.add("Competitive pressure raises the cost of time and discretion.");
      break;
    case "travel":
      if (accumulator.role === "organizer") accumulator.accessFriction += 5;
      if (accumulator.role === "family") accumulator.travelTolerance -= 7;
      accumulator.reasons.add("Travel disruption changes who can facilitate a practical scouting trip.");
      break;
    case "finance":
      if (accumulator.role === "clubDirector") accumulator.evidenceScrutiny += 7;
      if (accumulator.role === "agent") accumulator.priceLeverage += 6;
      accumulator.reasons.add("Financial conditions make buyers and sellers more price sensitive.");
      break;
    case "development":
      if (accumulator.role === "coach") accumulator.patience += 7;
      if (accumulator.role === "manager") accumulator.patience += 4;
      if (accumulator.role === "family") accumulator.travelTolerance += 4;
      accumulator.reasons.add("Development-led conditions reward patient pathways over immediate certainty.");
      break;
    case "contraction":
      if (accumulator.role === "clubDirector") accumulator.evidenceScrutiny += 9;
      if (accumulator.role === "manager") accumulator.patience -= 5;
      if (accumulator.role === "family") accumulator.secrecyPressure += 4;
      accumulator.reasons.add("Contraction makes stakeholders more defensive and risk aware.");
      break;
    case "expansion":
      if (accumulator.role === "organizer") accumulator.accessFriction -= 5;
      if (accumulator.role === "agent") accumulator.priceLeverage += 4;
      if (accumulator.role === "localScout") accumulator.accessFriction -= 3;
      accumulator.reasons.add("Expansion opens more doors, but it also makes desirable players more marketable.");
      break;
    case "data":
      if (accumulator.role === "manager" || accumulator.role === "clubDirector") {
        accumulator.evidenceScrutiny += 5;
      }
      accumulator.reasons.add("Data uncertainty forces stakeholders to interrogate evidence provenance more closely.");
      break;
    case "recruitment":
      if (accumulator.role === "clubDirector") accumulator.priceLeverage += 4;
      if (accumulator.role === "manager") accumulator.evidenceScrutiny += 3;
      accumulator.reasons.add("Recruitment conditions shift urgency and decision thresholds.");
      break;
    case "media":
      if (accumulator.role === "journalist") accumulator.secrecyPressure += 8;
      if (accumulator.role === "agent") accumulator.priceLeverage += 4;
      accumulator.reasons.add("Media-heavy conditions increase leak risk and narrative pressure.");
      break;
    case "regulation":
      if (accumulator.role === "clubDirector") accumulator.evidenceScrutiny += 6;
      if (accumulator.role === "family") accumulator.travelTolerance += 3;
      accumulator.reasons.add("Regulatory conditions change how safely a pathway can be formalized.");
      break;
    case "access":
      if (accumulator.role === "organizer" || accumulator.role === "localScout") {
        accumulator.accessFriction += 7;
      }
      accumulator.reasons.add("Access-led conditions raise the value of trusted local gatekeepers.");
      break;
    case "welfare":
      if (accumulator.role === "family") accumulator.travelTolerance += 7;
      if (accumulator.role === "coach") accumulator.patience += 4;
      accumulator.reasons.add("Welfare conditions make support structures and safeguarding more central.");
      break;
    default:
      break;
  }
}

function applyDefinitionEffects(
  accumulator: ClimateAccumulator,
  definitionId: string,
): void {
  switch (definitionId) {
    case "showcase-circuit":
      if (accumulator.role === "organizer") accumulator.accessFriction -= 8;
      if (accumulator.role === "rival") accumulator.rivalHeat += 8;
      if (accumulator.role === "journalist") accumulator.secrecyPressure += 4;
      accumulator.reasons.add("Showcase circuits centralize talent and attention in the same venues.");
      break;
    case "agent-exclusivity-wave":
      if (accumulator.role === "agent") accumulator.priceLeverage += 10;
      if (accumulator.role === "family") accumulator.secrecyPressure += 7;
      if (accumulator.role === "organizer") accumulator.accessFriction += 6;
      accumulator.reasons.add("Exclusivity concentrates access in a smaller set of gatekeepers.");
      break;
    case "transport-disruption":
      if (accumulator.role === "family") accumulator.travelTolerance -= 8;
      if (accumulator.role === "organizer") accumulator.accessFriction += 7;
      accumulator.reasons.add("Transport disruption makes local help and practical reliability more decisive.");
      break;
    case "local-football-recession":
      if (accumulator.role === "clubDirector") accumulator.evidenceScrutiny += 8;
      if (accumulator.role === "localScout") accumulator.accessFriction -= 4;
      accumulator.reasons.add("A recession sharpens budget skepticism while making local operators more influential.");
      break;
    case "registration-easing":
      if (accumulator.role === "family") accumulator.travelTolerance += 8;
      if (accumulator.role === "agent") accumulator.priceLeverage += 5;
      accumulator.reasons.add("Easier registration lowers institutional resistance to ambitious pathways.");
      break;
    default:
      break;
  }
}

function applyModifierEffects(
  accumulator: ClimateAccumulator,
  state: GameState,
  countryId?: string,
): void {
  const modifiers = getWorldConditionModifiers(state, countryId);
  accumulator.evidenceScrutiny += Math.round(
    (1 - modifiers.observationConfidenceMultiplier) * 24
      + Math.max(0, -modifiers.recruitmentScoreAdjustment * 0.6),
  );
  accumulator.patience += Math.round(
    (modifiers.developmentMultiplier - 1) * 30
      + (modifiers.breakthroughMultiplier - 1) * 16,
  );
  accumulator.accessFriction += Math.round(
    (modifiers.travelCostMultiplier - 1) * 18
      + modifiers.travelDurationDelta * 4,
  );
  accumulator.priceLeverage += Math.round(
    (modifiers.marketplaceValueMultiplier - 1) * 30,
  );
  accumulator.rivalHeat += Math.round(
    (modifiers.rivalPressureMultiplier - 1) * 35,
  );
  accumulator.travelTolerance -= Math.round(
    (modifiers.travelFatigueMultiplier - 1) * 22,
  );
}

function applyClubDoctrineEffects(
  accumulator: ClimateAccumulator,
  state: GameState,
  clubId?: string,
): void {
  if (!clubId) return;
  const club = state.clubs[clubId];
  if (!club) return;
  const doctrine = deriveClubRecruitmentDoctrine({
    club,
    seed: state.seed,
    season: state.currentSeason,
    manager: state.managerProfiles?.[club.id],
  });
  if (accumulator.role === "manager") {
    accumulator.evidenceScrutiny += Math.round(
      doctrine.minimumEvidenceQuality * 0.18 + doctrine.managerInfluence * 0.12,
    );
    accumulator.patience += Math.round((doctrine.pathwayPatience - 50) * 0.32);
  }
  if (accumulator.role === "clubDirector") {
    accumulator.evidenceScrutiny += Math.round(
      doctrine.minimumEvidenceQuality * 0.14 + doctrine.directorInfluence * 0.16,
    );
    accumulator.priceLeverage += Math.round((doctrine.sellingPressure - 50) * 0.2);
  }
  if (accumulator.role === "coach") {
    accumulator.patience += Math.round((doctrine.pathwayPatience - 50) * 0.24);
  }
  if (accumulator.role === "agent" && doctrine.geographicReach !== "local") {
    accumulator.priceLeverage += 3;
  }
  accumulator.reasons.add(
    `${club.name}'s ${doctrineStyleLabel(club.scoutingPhilosophy)} doctrine shapes how decision-makers weigh risk and readiness.`,
  );
}

function finalizeAccumulator(
  accumulator: ClimateAccumulator,
): WorldConditionStakeholderClimate {
  return {
    role: accumulator.role,
    ...(accumulator.countryId ? { countryId: accumulator.countryId } : {}),
    ...(accumulator.clubId ? { clubId: accumulator.clubId } : {}),
    accessFriction: clamp(accumulator.accessFriction, -25, 25),
    evidenceScrutiny: clamp(accumulator.evidenceScrutiny, -25, 25),
    patience: clamp(accumulator.patience, -25, 25),
    secrecyPressure: clamp(accumulator.secrecyPressure, -25, 25),
    priceLeverage: clamp(accumulator.priceLeverage, -25, 25),
    rivalHeat: clamp(accumulator.rivalHeat, -25, 25),
    travelTolerance: clamp(accumulator.travelTolerance, -25, 25),
    activeConditionIds: [...accumulator.activeConditionIds].sort(),
    reasons: [...accumulator.reasons],
  };
}

function collectRelevantDefinitions(
  state: GameState,
  countryId?: string,
): Array<{ definitionId: string; tags: readonly string[] }> {
  return (state.worldConditionState?.active ?? [])
    .filter((condition) =>
      condition.scope === "global"
      || (countryId !== undefined && canonicalCountry(condition.countryId) === countryId)
    )
    .flatMap((condition) => {
      const definition = getWorldConditionDefinition(condition.definitionId);
      return definition
        ? [{
            definitionId: definition.id,
            tags: definition.tags,
          }]
        : [];
    });
}

export function deriveWorldConditionStakeholderClimate(
  state: GameState,
  input: {
    role: WorldStakeholderRole;
    countryId?: string;
    clubId?: string;
  },
): WorldConditionStakeholderClimate {
  const countryId = canonicalCountry(input.countryId) ?? clubCountry(state, input.clubId);
  const accumulator = createAccumulator(input.role, countryId, input.clubId);
  const definitions = collectRelevantDefinitions(state, countryId);
  for (const definition of definitions) {
    accumulator.activeConditionIds.add(definition.definitionId);
    definition.tags.forEach((tag) => applyTagEffects(accumulator, tag));
    applyDefinitionEffects(accumulator, definition.definitionId);
  }
  applyModifierEffects(accumulator, state, countryId);
  applyClubDoctrineEffects(accumulator, state, input.clubId);
  return finalizeAccumulator(accumulator);
}

export function deriveWorldConditionStakeholderMatrix(
  state: GameState,
  input: {
    countryId?: string;
    clubId?: string;
  },
): WorldConditionStakeholderMatrix {
  return {
    ...(input.countryId ? { countryId: canonicalCountry(input.countryId) } : {}),
    ...(input.clubId ? { clubId: input.clubId } : {}),
    climates: Object.fromEntries(
      WORLD_STAKEHOLDER_ROLES.map((role) => [
        role,
        deriveWorldConditionStakeholderClimate(state, {
          role,
          countryId: input.countryId,
          clubId: input.clubId,
        }),
      ]),
    ) as Record<WorldStakeholderRole, WorldConditionStakeholderClimate>,
  };
}
