/** Forecasts use observed tools and growth, never a latent ability ceiling. */
import {
  ATTRIBUTE_DOMAINS, HIDDEN_ATTRIBUTES,
  type AbilityReading, type AttributeReading, type Observation,
  type ObservationContext, type Player, type PlayerAttribute, type Scout,
} from "@/engine/core/types";
import { LEGACY_SEASON_LENGTH_WEEKS } from "@/engine/core/gameDate";

const hidden = new Set<string>(HIDDEN_ATTRIBUTES);
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const stars = (ability: number) => Math.round((0.5 + ((clamp(ability, 1, 200) - 1) / 199) * 4.5) * 2) / 2;

export function projectAbilityFromEvidence(
  player: Pick<Player, "id" | "age" | "position">,
  scout: Pick<Scout, "skills">,
  observations: readonly Observation[],
  context: ObservationContext,
  currentReadings: readonly AttributeReading[],
): AbilityReading {
  const history = [...new Map(observations.filter((observation) => observation.playerId === player.id
    && observation.attributeReadings.length > 0).map((observation) => [
    observation.sourceSessionId ?? observation.id, observation,
  ])).values()].sort((left, right) => left.season - right.season || left.week - right.week);
  const byAttribute = new Map<PlayerAttribute, AttributeReading[]>();
  for (const readings of [...history.slice(-6).map((observation) => observation.attributeReadings), currentReadings]) {
    for (const reading of readings) {
      if (hidden.has(reading.attribute) || !Number.isFinite(reading.perceivedValue)) continue;
      byAttribute.set(reading.attribute, [...(byAttribute.get(reading.attribute) ?? []), reading].slice(-4));
    }
  }
  if (byAttribute.size === 0) {
    return { perceivedCA: 0.5, caConfidence: 0, perceivedPALow: 0.5, perceivedPAHigh: 5, paConfidence: 0 };
  }
  const estimates = [...byAttribute.entries()].map(([attribute, readings]) => {
    const totalWeight = readings.reduce((sum, reading, index) => sum + (index + 1) * Math.max(0.15, reading.confidence), 0);
    return {
      attribute,
      value: readings.reduce((sum, reading, index) => sum + reading.perceivedValue * (index + 1) * Math.max(0.15, reading.confidence), 0) / totalWeight,
      confidence: readings.reduce((sum, reading) => sum + reading.confidence, 0) / readings.length,
    };
  });
  const coverage = Math.min(1, estimates.length / 12);
  const domainCoverage = Math.min(1, new Set(estimates.map((reading) => ATTRIBUTE_DOMAINS[reading.attribute])).size / 4);
  const evidenceConfidence = estimates.reduce((sum, reading) => sum + reading.confidence, 0) / estimates.length;
  const observedMean = estimates.reduce((sum, reading) => sum + reading.value, 0) / estimates.length;
  // Sparse sightings describe a tool, not instantly the whole player.
  const agePrior = player.age <= 16 ? 6.5 : player.age <= 18 ? 8 : player.age <= 21 ? 9.5 : 10.5;
  const evidenceWeight = clamp(coverage * (0.5 + evidenceConfidence * 0.5), 0.12, 0.95);
  const estimatedAttribute = agePrior * (1 - evidenceWeight) + observedMean * evidenceWeight;
  const estimatedAbility = clamp(1 + (estimatedAttribute - 1) / 19 * 199, 1, 200);
  const contexts = new Set([...history.map((observation) => observation.situation?.repetitionKey ?? observation.context), context]);
  const contextFactor = Math.min(1, contexts.size / 3);
  const judgment = clamp(scout.skills.playerJudgment ?? 1, 1, 20) / 20;
  const caConfidence = clamp(evidenceConfidence * (0.45 + coverage * 0.25 + domainCoverage * 0.15 + contextFactor * 0.15)
    * (0.8 + judgment * 0.2), 0.1, 0.85);

  // Compare the same attributes over time; a changed sampling pool is not growth.
  const first = history[0];
  const last = history.at(-1);
  const elapsedSeasons = first && last
    ? Math.max(0, last.season - first.season + (last.week - first.week) / LEGACY_SEASON_LENGTH_WEEKS) : 0;
  let observedGrowth = 0;
  if (first && last && elapsedSeasons >= 0.5) {
    const baseline = new Map(first.attributeReadings.map((reading) => [reading.attribute, reading.perceivedValue]));
    const matched = last.attributeReadings.filter((reading) => !hidden.has(reading.attribute) && baseline.has(reading.attribute));
    if (matched.length >= 3) {
      observedGrowth = clamp(matched.reduce((sum, reading) => sum + reading.perceivedValue - baseline.get(reading.attribute)!, 0)
        / matched.length / elapsedSeasons * 4, -12, 16);
    }
  }
  const youth = player.age <= 21;
  const remainingOpportunity = player.age <= 16 ? 38 : player.age <= 18 ? 30 : player.age <= 21 ? 20 : player.age <= 24 ? 9 : 0;
  const likelyAbility = clamp(estimatedAbility + remainingOpportunity + observedGrowth, 1, 200);
  const longitudinal = Math.min(1, elapsedSeasons / 2);
  const projectionSkill = clamp(scout.skills.potentialAssessment ?? 1, 1, 20) / 20;
  // Repeating a venue cannot make a teenager's eventual career certain.
  const paConfidence = clamp(caConfidence * (0.35 + contextFactor * 0.2 + longitudinal * 0.2)
    * (0.8 + projectionSkill * 0.2), 0.08, youth ? 0.65 : 0.8);
  const uncertainty = (youth ? 38 : 20) + (1 - coverage) * 18
    + (1 - contextFactor) * 10 + (youth ? (1 - longitudinal) * 14 : 0);
  const floor = stars(Math.max(1, Math.min(estimatedAbility, likelyAbility - uncertainty)));
  const ceiling = stars(likelyAbility + uncertainty * 0.65);
  return {
    perceivedCA: stars(estimatedAbility),
    caConfidence: Math.round(caConfidence * 100) / 100,
    perceivedPALow: Math.min(floor, 4.5),
    perceivedPAHigh: Math.max(Math.min(floor + 0.5, 5), ceiling),
    paConfidence: Math.round(paConfidence * 100) / 100,
  };
}
