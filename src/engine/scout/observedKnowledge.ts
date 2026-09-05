import {
  HIDDEN_ATTRIBUTES,
  type AttributeReading, type Observation, type PlayerAttribute, type ScoutCueReading,
} from "@/engine/core/types";
import type { PlayerMoment } from "@/engine/observation/types";
import type { RNG } from "@/engine/rng";

/** A noticed cue tied to the event that produced it, not a new view of player truth. */
export interface ObservedCueEvidence {
  cue: ScoutCueReading;
  moment: PlayerMoment;
}

const hidden = new Set<string>(HIDDEN_ATTRIBUTES);

export function buildObservedAttributeReadings(
  rng: RNG,
  playerId: string,
  evidence: readonly ObservedCueEvidence[],
  previous: readonly Observation[],
): AttributeReading[] {
  const buckets = new Map<PlayerAttribute, Array<{ value: number; confidence: number }>>();
  const seenMoments = new Set<string>();
  for (const { cue, moment } of evidence) {
    if (cue.playerId !== playerId || moment.playerId !== playerId
      || cue.momentId !== moment.id || seenMoments.has(moment.id)
      || cue.clarity === "missed" || cue.clarity === "glimpse"
      || !Number.isFinite(moment.quality)) continue;
    seenMoments.add(moment.id);
    for (const attribute of new Set(cue.attributesHinted)) {
      if (hidden.has(attribute) || !moment.attributesHinted.includes(attribute)) continue;
      // The football action gives a noisy clue about its contributing tools.
      // Nothing here can inspect or recenter on the player's real attributes.
      const eventValue = 1 + (Math.max(1, Math.min(10, moment.quality)) - 1) / 9 * 19;
      const confidence = Math.max(0.1, Math.min(0.75, cue.confidence));
      const value = Math.max(1, Math.min(20, rng.gaussian(eventValue, 0.6 + (1 - confidence) * 1.5)));
      buckets.set(attribute, [...(buckets.get(attribute) ?? []), { value, confidence }]);
    }
  }
  const history = [...new Map(previous.filter((observation) => observation.playerId === playerId)
    .map((observation) => [observation.sourceSessionId ?? observation.id, observation])).values()];
  return [...buckets.entries()].map(([attribute, readings]) => {
    const perceivedValue = Math.round(readings.reduce((sum, reading) => sum + reading.value, 0) / readings.length);
    const relevantHistory = history.filter((observation) => observation.attributeReadings.some((reading) => reading.attribute === attribute));
    const previousValues = relevantHistory.slice(-6).map((observation) =>
      observation.attributeReadings.find((reading) => reading.attribute === attribute)!.perceivedValue);
    const disagreement = previousValues.length > 0
      ? previousValues.filter((value) => Math.abs(value - perceivedValue) > 4).length / previousValues.length : 0;
    const observationCount = relevantHistory.length + 1;
    const contexts = new Set([
      ...relevantHistory.map((observation) => observation.situation?.repetitionKey ?? observation.context),
      ...evidence.map(({ cue }) => cue.contextKey).filter(Boolean),
    ]);
    const cueConfidence = readings.reduce((sum, reading) => sum + reading.confidence, 0) / readings.length;
    const corroboration = (1 - 1 / Math.sqrt(observationCount)) * 0.15 * (1 - disagreement);
    const confidence = Math.max(0.1, Math.min(contexts.size >= 3 ? 0.8 : 0.65,
      cueConfidence * 0.7 + corroboration + Math.min(0.15, Math.max(1, contexts.size) * 0.05) - disagreement * 0.15));
    // Many moments in one performance are correlated, not independent proof.
    const halfRange = Math.max(2, Math.ceil(6 - confidence * 5 + disagreement * 2));
    return {
      attribute, perceivedValue, confidence, observationCount,
      rangeLow: Math.max(1, perceivedValue - halfRange),
      rangeHigh: Math.min(20, perceivedValue + halfRange),
    };
  });
}
