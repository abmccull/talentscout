// Destination: tests/engine/observation/observationSituationArchiveFixtures.ts.
// Independent fixtures: no production compactor is called to construct wire expectations.
import type { Observation } from "@/engine/core/types";
import type { ObservationSituationSnapshot } from "@/engine/observation/situations";
export const TAG = "observationSituationV1";
export const REQUIRED_MASK = 15_727_511;
export const ALL_MASK = 16_777_215;
export function snapshot(): ObservationSituationSnapshot {
  return {
    version: 1, id: "situation|💡:é", activityType: "schoolMatch", venueType: "school",
    competitionLevel: "school", stakes: "selection", tacticalFrame: "unstructured",
    chaosLevel: 0.55, crowdIntensity: 0.2, atmosphereEventIds: ["event:2", "event:1", "event:2"],
    signalByDomain: { technical: 1.2, physical: 1, mental: 0.95, tactical: 1, hidden: 1 },
    signalByAttribute: { passing: 0.55, firstTouch: 1.25 }, uncertaintyMultiplier: 1.25,
    misleadingSignalRisk: 0.17, repetitionKey: "school|selection:unstructured:é",
    culturalInsightIds: ["culture:2", "culture:2", "culture:1"],
    contextTags: ["school", "selection", "school"], biasWarnings: ["warning:é", "warning:é"],
    reasons: ["Complete authored reason | 💡", "Complete authored reason | 💡", "Another reason"],
  } as ObservationSituationSnapshot;
}
export function wire(): { observationSituationV1: unknown[] } {
  return { observationSituationV1: [1, 15_727_511, 0,
    1, "situation|💡:é", "schoolMatch", "school", "school", "selection", "unstructured",
    0.55, 0.2, ["event:2", "event:1", "event:2"],
    { technical: 1.2, physical: 1, mental: 0.95, tactical: 1, hidden: 1 },
    { passing: 0.55, firstTouch: 1.25 }, 1.25, 0.17, "school|selection:unstructured:é",
    ["culture:2", "culture:2", "culture:1"], ["school", "selection", "school"],
    ["warning:é", "warning:é"],
    ["Complete authored reason | 💡", "Complete authored reason | 💡", "Another reason"]] };
}
export const OPTIONAL_CASES = [
  { field: "observationContext", bit: 8, offset: 6, value: "schoolMatch" },
  { field: "countryId", bit: 32, offset: 7, value: "england" },
  { field: "travelPosture", bit: 64, offset: 7, value: "embedded" },
  { field: "weather", bit: 1_024, offset: 10, value: "rain|é" },
  { field: "culturalCalendarWindowIds", bit: 1_048_576, offset: 19,
    value: ["window:2", "window:1", "window:2"] },
] as const;
export function optionalWire(item: typeof OPTIONAL_CASES[number], value: unknown) {
  const out = wire(); out.observationSituationV1[1] = REQUIRED_MASK + item.bit;
  if (value === undefined) out.observationSituationV1[2] = item.bit;
  else out.observationSituationV1.splice(item.offset, 0, value);
  return out;
}
export function observation(id: string, source: string, situation: unknown = snapshot()): Observation {
  return { id, playerId: "archive-player", scoutId: "archive-scout", sourceSessionId: source,
    season: 1, week: 1, context: "schoolMatch", attributeReadings: [{ attribute: "firstTouch",
      perceivedValue: 12, confidence: 0.5, observationCount: 1 }], notes: [], flaggedMoments: [],
    situation: situation as ObservationSituationSnapshot };
}
export const jsonBound = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
export const jsonBytes = (value: unknown): number => new TextEncoder().encode(JSON.stringify(value)).byteLength;
