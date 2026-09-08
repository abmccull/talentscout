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
  Position,
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

/**
 * Realize the proposed attribute and CA changes together. Preserve the existing
 * routine/breakthrough exchange rates, scaling the attribute budget only when
 * an attribute boundary or remaining CA capacity limits the proposed change.
 */
export function realizePlayerDevelopment(
  player: Player,
  proposedChanges: AttributeDeltas,
  requestedAbilityChange: number,
): SemanticDevelopmentResult {
  const changes: AttributeDeltas = {};
  const onPitch: Array<{ attribute: PlayerAttribute; delta: number; order: number }> = [];
  let requestedMagnitude = 0;
  let realizedMagnitude = 0;
  for (const [attribute, proposed] of Object.entries(proposedChanges) as Array<
    [PlayerAttribute, number | undefined]
  >) {
    if (proposed === undefined || !Number.isFinite(proposed)) continue;
    const delta = clamp(player.attributes[attribute] + proposed, 1, 20)
      - player.attributes[attribute];
    if (ATTRIBUTE_DOMAINS[attribute] === "hidden") {
      if (delta !== 0) changes[attribute] = delta;
    } else {
      requestedMagnitude += Math.abs(proposed);
      realizedMagnitude += Math.abs(delta);
      if (delta !== 0) onPitch.push({ attribute, delta, order: onPitch.length });
    }
  }

  if (onPitch.length === 0 || requestedAbilityChange === 0) {
    return { playerId: player.id, changes, abilityChange: 0 };
  }

  const scaledAbility = Math.sign(requestedAbilityChange) * Math.max(1, Math.round(
    Math.abs(requestedAbilityChange) * realizedMagnitude / requestedMagnitude,
  ));
  const abilityChange = applyDevelopmentAbilityChange(
    player.currentAbility, player.potentialAbility, scaledAbility,
  ) - player.currentAbility;
  if (abilityChange === 0) return { playerId: player.id, changes, abilityChange: 0 };

  const budget = Math.min(realizedMagnitude, Math.max(1, Math.floor(
    realizedMagnitude * Math.abs(abilityChange / scaledAbility),
  )));
  // Largest remainders preserve whole attribute points without systematically
  // favoring the first chosen attribute when a near-ceiling breakthrough shrinks.
  const allocated = onPitch.map((entry) => {
    const exact = Math.abs(entry.delta) * budget / realizedMagnitude;
    return { ...entry, points: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });
  let remaining = budget - allocated.reduce((sum, entry) => sum + entry.points, 0);
  const ranked = [...allocated].sort((a, b) => b.remainder - a.remainder || a.order - b.order);
  for (const entry of ranked) {
    if (remaining <= 0) break;
    if (entry.points < Math.abs(entry.delta)) {
      entry.points += 1;
      remaining -= 1;
    }
  }
  for (const entry of allocated) {
    if (entry.points > 0) changes[entry.attribute] = Math.sign(entry.delta) * entry.points;
  }
  return { playerId: player.id, changes, abilityChange };
}

export function applySemanticPlayerDevelopment(
  player: Player,
  proposed: Pick<SemanticDevelopmentResult, "changes" | "abilityChange">,
): { player: Player; result: SemanticDevelopmentResult } {
  const result = realizePlayerDevelopment(player, proposed.changes, proposed.abilityChange);
  if (Object.keys(result.changes).length === 0 && result.abilityChange === 0) {
    return { player, result };
  }
  const attributes = { ...player.attributes };
  for (const [attribute, delta] of Object.entries(result.changes) as Array<[PlayerAttribute, number]>) {
    attributes[attribute] += delta;
  }
  return {
    player: { ...player, attributes, currentAbility: player.currentAbility + result.abilityChange },
    result,
  };
}

type AgeCurve = ReadonlyArray<readonly [age: number, multiplier: number]>;
const DEVELOPMENT_CURVES: Record<DevelopmentProfile, AgeCurve> = {
  earlyBloomer: [[14, 1.3], [18, 1.2], [21, 0.75], [24, 0.15], [27, 0], [30, -0.08], [35, -0.25], [40, -0.45]],
  lateBloomer: [[14, 0.25], [18, 0.35], [21, 0.75], [24, 1], [27, 0.55], [29, 0.15], [31, 0], [35, -0.12], [40, -0.32]],
  steadyGrower: [[14, 0.85], [18, 0.9], [21, 0.75], [24, 0.5], [27, 0.15], [29, 0], [35, -0.18], [40, -0.38]],
  volatile: [[14, 0.8], [18, 0.9], [21, 0.7], [25, 0.2], [28, 0], [35, -0.21], [40, -0.4]],
};

/** Maturation, peak and decline are distinct; a later peak is not slower growth forever. */
export function getAgeDevelopmentMultiplier(
  age: number,
  profile: DevelopmentProfile,
  position: Position,
): number {
  const careerAge = position === "GK"
    ? age - Math.min(3, Math.max(0, age - 20) * 0.375)
    : age;
  const curve = DEVELOPMENT_CURVES[profile];
  if (careerAge <= curve[0][0]) return curve[0][1];
  for (let index = 1; index < curve.length; index += 1) {
    const [endAge, end] = curve[index];
    const [startAge, start] = curve[index - 1];
    if (careerAge <= endAge) {
      return start + (end - start) * (careerAge - startAge) / (endAge - startAge);
    }
  }
  const [lastAge, last] = curve[curve.length - 1];
  return Math.max(-0.6, last - (careerAge - lastAge) * 0.04);
}

export function computeSemanticPlayerDevelopment(
  player: Player,
  rng: RNG,
  developmentRateModifier = 1,
  environment?: PlayerDevelopmentMechanics,
): SemanticDevelopmentResult {
  let baseMultiplier = getAgeDevelopmentMultiplier(
    player.age,
    player.developmentProfile,
    player.position,
  );
  if (player.developmentProfile === "volatile") {
    const variation = rng.gaussian(0, 0.4);
    baseMultiplier = baseMultiplier < 0
      ? Math.min(0, baseMultiplier + variation)
      : baseMultiplier + variation;
  }
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
  return realizePlayerDevelopment(player, changes, requestedAbilityChange);
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

  const realized = realizePlayerDevelopment(player, changes, rng.nextInt(3, 5));
  if (realized.abilityChange === 0) return null;

  return {
    ...realized,
    improvedAttributes: Object.keys(realized.changes) as PlayerAttribute[],
  };
}
