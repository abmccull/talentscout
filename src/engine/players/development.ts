/**
 * Semantic player development.
 *
 * Attribute direction is expressed in football terms: growth always improves
 * the player and decline always makes the player worse. Most attributes are
 * better when higher, while injury proneness is better when lower.
 */

import type { RNG } from "@/engine/rng";
import type {
  AttributeDeltas,
  DevelopmentProfile,
  Player,
  PlayerAttribute,
} from "@/engine/core/types";
import {
  ALL_ATTRIBUTES,
  ATTRIBUTE_DOMAINS,
  PHYSICAL_ATTRIBUTES,
} from "@/engine/core/types";
import { ROLE_DEFINITIONS } from "@/engine/players/roles";

export type DevelopmentDirection = "growth" | "decline";

export interface PlayerDevelopmentMechanics {
  growthQualityMultiplier?: number;
  growthChanceMultiplier?: number;
  declineRiskMultiplier?: number;
  breakthroughMultiplier?: number;
}

export interface SemanticDevelopmentResult {
  playerId: string;
  changes: AttributeDeltas;
  abilityChange: number;
}

export interface SemanticBreakthroughResult extends SemanticDevelopmentResult {
  improvedAttributes: PlayerAttribute[];
}

const BREAKTHROUGH_CHANCE = 0.015;
const INVERSE_ATTRIBUTES = new Set<PlayerAttribute>(["injuryProneness"]);
const PHYSICAL_ATTRIBUTE_SET = new Set<PlayerAttribute>(PHYSICAL_ATTRIBUTES);

const HIDDEN_DEVELOPMENT_WEIGHTS: Partial<Record<PlayerAttribute, number>> = {
  injuryProneness: 0.08,
  consistency: 0.12,
  bigGameTemperament: 0.08,
  professionalism: 0.1,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Return the numeric delta that matches a semantic improvement or decline. */
export function getSemanticDevelopmentDelta(
  attribute: PlayerAttribute,
  direction: DevelopmentDirection,
  magnitude = 1,
): number {
  const signedMagnitude = direction === "growth" ? magnitude : -magnitude;
  return INVERSE_ATTRIBUTES.has(attribute) ? -signedMagnitude : signedMagnitude;
}

/** True when a numeric attribute change improves the player's football outcome. */
export function isAttributeChangeImprovement(
  attribute: PlayerAttribute,
  delta: number,
): boolean {
  if (delta === 0) return false;
  return INVERSE_ATTRIBUTES.has(attribute) ? delta < 0 : delta > 0;
}

export function hasSemanticImprovement(changes: AttributeDeltas): boolean {
  return (Object.entries(changes) as Array<[PlayerAttribute, number | undefined]>)
    .some(([attribute, delta]) =>
      delta !== undefined && isAttributeChangeImprovement(attribute, delta));
}

/**
 * Model how consistently a player converts their environment into growth.
 * Numeric professionalism is the anchor; compatible personality traits add a
 * bounded modifier so no personality can overwhelm age or environment.
 */
export function getDevelopmentMindsetMultiplier(player: Player): number {
  const professionalism = clamp(player.attributes.professionalism ?? 10, 1, 20);
  let multiplier = 0.85 + ((professionalism - 1) / 19) * 0.3;
  const traits = new Set(player.personalityTraits ?? []);

  if (traits.has("modelCitizen")) multiplier += 0.1;
  if (traits.has("professional")) multiplier += 0.08;
  if (traits.has("determined")) multiplier += 0.06;
  if (traits.has("ambitious") && player.age <= 24) multiplier += 0.04;
  if (traits.has("lateDeveloper") && player.age <= 27) multiplier += 0.04;
  if (traits.has("inconsistent")) multiplier -= 0.08;
  if (traits.has("temperamental")) multiplier -= 0.05;
  if (traits.has("controversialCharacter")) multiplier -= 0.03;

  return clamp(multiplier, 0.75, 1.3);
}

/**
 * Produce role- and position-weighted development candidates. Every on-pitch
 * attribute remains trainable, but attributes used by the player's position
 * and natural role are substantially more likely to move.
 */
export function getDevelopmentAttributeWeights(
  player: Player,
  direction: DevelopmentDirection,
): Array<{ item: PlayerAttribute; weight: number }> {
  const weights = new Map<PlayerAttribute, number>();

  for (const attribute of ALL_ATTRIBUTES) {
    const hiddenWeight = HIDDEN_DEVELOPMENT_WEIGHTS[attribute];
    weights.set(attribute, hiddenWeight ?? 0.15);
  }

  const compatibleRoles = ROLE_DEFINITIONS.filter((definition) =>
    definition.positions.includes(player.position));
  for (const definition of compatibleRoles) {
    for (const { attr, weight } of definition.keyAttributes) {
      weights.set(attr, (weights.get(attr) ?? 0) + weight * 0.25);
    }
    for (const { attr, weight } of definition.secondaryAttributes) {
      weights.set(attr, (weights.get(attr) ?? 0) + weight * 0.12);
    }
  }

  const naturalRole = player.naturalRole
    ? ROLE_DEFINITIONS.find((definition) => definition.role === player.naturalRole)
    : undefined;
  if (naturalRole?.positions.includes(player.position)) {
    for (const { attr, weight } of naturalRole.keyAttributes) {
      weights.set(attr, (weights.get(attr) ?? 0) + weight);
    }
    for (const { attr, weight } of naturalRole.secondaryAttributes) {
      weights.set(attr, (weights.get(attr) ?? 0) + weight * 0.5);
    }
  }

  if (direction === "decline" && player.age >= 30) {
    const physicalDeclineWeight = player.age >= 33 ? 1.6 : 1.35;
    for (const attribute of PHYSICAL_ATTRIBUTE_SET) {
      weights.set(attribute, (weights.get(attribute) ?? 0) * physicalDeclineWeight);
    }
    weights.set(
      "injuryProneness",
      (weights.get("injuryProneness") ?? 0) * physicalDeclineWeight,
    );
  }

  return ALL_ATTRIBUTES.map((item) => ({
    item,
    weight: Math.max(0.01, weights.get(item) ?? 0.01),
  }));
}

function canApplyDevelopmentChange(
  player: Player,
  attribute: PlayerAttribute,
  direction: DevelopmentDirection,
  magnitude = 1,
): boolean {
  if (
    direction === "growth"
    && ATTRIBUTE_DOMAINS[attribute] !== "hidden"
    && player.currentAbility >= player.potentialAbility
  ) {
    return false;
  }

  const nextValue = player.attributes[attribute]
    + getSemanticDevelopmentDelta(attribute, direction, magnitude);
  return nextValue >= 1 && nextValue <= 20;
}

function selectDevelopmentAttributes(
  player: Player,
  direction: DevelopmentDirection,
  count: number,
  rng: RNG,
  includeHidden: boolean,
): PlayerAttribute[] {
  const available = getDevelopmentAttributeWeights(player, direction)
    .filter(({ item }) => includeHidden || ATTRIBUTE_DOMAINS[item] !== "hidden")
    .filter(({ item }) => canApplyDevelopmentChange(player, item, direction));
  const selected: PlayerAttribute[] = [];

  while (available.length > 0 && selected.length < count) {
    const attribute = rng.pickWeighted(available);
    selected.push(attribute);
    available.splice(available.findIndex(({ item }) => item === attribute), 1);
  }

  return selected;
}

/**
 * Apply a CA delta without allowing growth above PA. Legacy players already
 * above PA are not snapped downward; they can only hold or decline normally.
 */
export function applyDevelopmentAbilityChange(
  currentAbility: number,
  potentialAbility: number,
  requestedChange: number,
): number {
  const boundedCurrent = clamp(currentAbility, 1, 200);
  const boundedNext = clamp(currentAbility + requestedChange, 1, 200);
  if (requestedChange <= 0) return boundedNext;

  const growthCeiling = Math.max(
    boundedCurrent,
    clamp(potentialAbility, 1, 200),
  );
  return Math.min(boundedNext, growthCeiling);
}

/** Get the growth/decline multiplier for age and development profile. */
function developmentMultiplier(
  age: number,
  profile: DevelopmentProfile,
  rng: RNG,
): number {
  const peakAge: Record<DevelopmentProfile, number> = {
    earlyBloomer: 22,
    lateBloomer: 29,
    steadyGrower: 26,
    volatile: 25,
  };
  const peak = peakAge[profile];
  const yearsFromPeak = age - peak;
  let base = yearsFromPeak < 0
    ? Math.min(1, 0.4 + Math.abs(yearsFromPeak) * 0.08)
    : -yearsFromPeak * 0.02;

  if (profile === "volatile") base += rng.gaussian(0, 0.4);
  if (profile === "earlyBloomer") base *= 1.3;
  if (profile === "lateBloomer") base *= age < peak ? 0.5 : 0.8;
  return base;
}

export function computeSemanticPlayerDevelopment(
  player: Player,
  rng: RNG,
  developmentRateModifier = 1,
  environment?: PlayerDevelopmentMechanics,
): SemanticDevelopmentResult {
  const baseMultiplier = developmentMultiplier(
    player.age,
    player.developmentProfile,
    rng,
  );
  const direction: DevelopmentDirection = baseMultiplier > 0 ? "growth" : "decline";
  const mindset = getDevelopmentMindsetMultiplier(player);
  const mindsetModifier = direction === "growth"
    ? mindset
    : clamp(2 - mindset, 0.7, 1.3);
  const multiplier = direction === "growth"
    ? baseMultiplier
      * developmentRateModifier
      * (environment?.growthQualityMultiplier ?? 1)
      * mindsetModifier
    : baseMultiplier
      * (environment?.declineRiskMultiplier ?? 1)
      * mindsetModifier;

  const formBonus = player.form * 0.017;
  let developmentChance = clamp(0.15 + formBonus, 0.05, 0.25);
  const momentum = player.formMomentum ?? 0;
  const trend = player.formTrend ?? "stable";
  if (trend === "rising" && momentum > 0) {
    developmentChance += Math.min(0.15, momentum * 0.03);
  } else if (trend === "falling" && momentum > 0) {
    developmentChance -= momentum * 0.02;
  }
  developmentChance *= direction === "growth"
    ? (environment?.growthChanceMultiplier ?? 1)
    : (environment?.declineRiskMultiplier ?? 1);
  developmentChance = clamp(developmentChance, 0.01, 0.4);
  if (!rng.chance(developmentChance)) {
    return { playerId: player.id, changes: {}, abilityChange: 0 };
  }

  const changes: AttributeDeltas = {};
  const selected = selectDevelopmentAttributes(
    player,
    direction,
    rng.nextInt(1, 3),
    rng,
    true,
  );

  for (const attribute of selected) {
    const probability = direction === "growth"
      ? Math.min(0.4, Math.abs(multiplier) * 0.4)
      : Math.min(0.25, Math.abs(multiplier) * 0.5);
    if (rng.chance(probability)) {
      changes[attribute] = getSemanticDevelopmentDelta(attribute, direction);
    }
  }

  const changedOnPitchAttribute = (Object.keys(changes) as PlayerAttribute[])
    .some((attribute) => ATTRIBUTE_DOMAINS[attribute] !== "hidden");
  const requestedAbilityChange = changedOnPitchAttribute
    ? direction === "growth" ? 1 : -1
    : 0;
  const nextAbility = applyDevelopmentAbilityChange(
    player.currentAbility,
    player.potentialAbility,
    requestedAbilityChange,
  );

  return {
    playerId: player.id,
    changes,
    abilityChange: nextAbility - player.currentAbility,
  };
}

export function computeSemanticBreakthrough(
  player: Player,
  rng: RNG,
  environmentMultiplier = 1,
): SemanticBreakthroughResult | null {
  if (player.age < 17 || player.age > 25) return null;
  if (player.form < 1) return null;
  if (player.currentAbility >= player.potentialAbility) return null;
  if (!rng.chance(clamp(BREAKTHROUGH_CHANCE * environmentMultiplier, 0, 0.04))) {
    return null;
  }

  const selected = selectDevelopmentAttributes(
    player,
    "growth",
    rng.nextInt(2, 3),
    rng,
    false,
  );
  if (selected.length === 0) return null;

  const changes: AttributeDeltas = {};
  for (const attribute of selected) {
    changes[attribute] = getSemanticDevelopmentDelta(
      attribute,
      "growth",
      rng.nextInt(2, 3),
    );
  }

  const nextAbility = applyDevelopmentAbilityChange(
    player.currentAbility,
    player.potentialAbility,
    rng.nextInt(3, 5),
  );

  return {
    playerId: player.id,
    changes,
    abilityChange: nextAbility - player.currentAbility,
    improvedAttributes: selected,
  };
}
