/**
 * Persisted observation-situation contract.
 *
 * A context such as `schoolMatch` is only the starting point. The situation
 * records the level, stakes, tactical frame, conditions, and earned cultural
 * interpretation that made this particular watch useful or misleading.
 */

import {
  ATTRIBUTE_DOMAINS,
  type ActivityType,
  type AttributeDomain,
  type CulturalInsight,
  type DifficultyLevel,
  type ObservationContext,
  type PlayerAttribute,
  type TravelPosture,
} from "@/engine/core/types";
import { getDifficultyChallengeProfile } from "@/engine/core/difficulty";
import {
  resolveFootballCultureContext,
  type CombinedFootballCultureEffects,
} from "@/engine/world/footballCulture";
import type { CountryCalendarEffects } from "@/engine/world/footballCultureCalendar";
import { getTravelPostureEffects } from "@/engine/world/travel";
import {
  getDefaultObservationSituationDefinition,
  getObservationSituationDefinitionById,
  selectObservationSituationDefinition,
  type ObservationCompetitionLevel,
  type ObservationStakes,
  type ObservationTacticalFrame,
} from "./situationCatalog";

interface SituationAtmosphereEvent {
  id: string;
  effect: "amplify" | "dampen" | "distraction" | "reveal";
  affectedAttributes?: PlayerAttribute[];
  noiseDelta: number;
}

interface SituationVenueAtmosphere {
  chaosLevel: number;
  amplifiedAttributes: PlayerAttribute[];
  dampenedAttributes: PlayerAttribute[];
  weather?: string;
  crowdIntensity: number;
}

export const OBSERVATION_SITUATION_VERSION = 1 as const;
export type {
  ObservationCompetitionLevel,
  ObservationStakes,
  ObservationTacticalFrame,
} from "./situationCatalog";

export interface ObservationSituationSnapshot {
  version: typeof OBSERVATION_SITUATION_VERSION;
  id: string;
  activityType: ActivityType;
  observationContext?: ObservationContext;
  venueType: string;
  countryId?: string;
  travelPosture?: TravelPosture;
  competitionLevel: ObservationCompetitionLevel;
  stakes: ObservationStakes;
  tacticalFrame: ObservationTacticalFrame;
  weather?: string;
  chaosLevel: number;
  crowdIntensity: number;
  atmosphereEventIds: string[];
  /** Relative evidence signal. One is neutral; values are bounded [0.55, 1.45]. */
  signalByDomain: Record<AttributeDomain, number>;
  /** Attribute-specific overrides from visible conditions such as rain or a formation change. */
  signalByAttribute: Partial<Record<PlayerAttribute, number>>;
  /** Multiplies reading variance. Lower is clearer. Bounded [0.7, 1.6]. */
  uncertaintyMultiplier: number;
  /** Chance that a good-looking sample is unrepresentative. Player-facing, never hidden truth. */
  misleadingSignalRisk: number;
  /** Stable key used for diminishing returns; incidental event ids do not make every watch novel. */
  repetitionKey: string;
  culturalInsightIds: string[];
  /** Persisted country-season windows that shaped this evidence sample. */
  culturalCalendarWindowIds?: string[];
  contextTags: string[];
  biasWarnings: string[];
  reasons: string[];
}

export interface ObservationSituationInput {
  activityType: ActivityType;
  seed: string;
  venueType?: string;
  countryId?: string;
  travelPosture?: TravelPosture;
  culturalInsights?: readonly CulturalInsight[];
  /** Resolved from the save's persisted country-season calendar. */
  calendarEffects?: CountryCalendarEffects;
  atmosphere?: SituationVenueAtmosphere;
  atmosphereEvents?: readonly SituationAtmosphereEvent[];
}

interface SituationBaseline {
  id?: string;
  observationContext?: ObservationContext;
  levels: readonly ObservationCompetitionLevel[];
  stakes: readonly ObservationStakes[];
  frames: readonly ObservationTacticalFrame[];
  signal: Partial<Record<AttributeDomain, number>>;
  uncertainty: number;
  misleadingRisk: number;
  tags: readonly string[];
  reasons: readonly string[];
  defaultBaseline: boolean;
  variantKey?: string;
}

const DEFAULT_BASELINE: SituationBaseline = {
  levels: ["professional"],
  stakes: ["routine", "competitive"],
  frames: ["structured", "transitionHeavy", "possession", "pressing"],
  signal: {},
  uncertainty: 1,
  misleadingRisk: 0.12,
  tags: ["general-observation"],
  reasons: [
    "General observation applies when no authored situation pack entry exists for the activity.",
  ],
  defaultBaseline: true,
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function hashSeed(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function pickStable<T>(seed: string, values: readonly T[]): T {
  return values[hashSeed(seed) % values.length];
}

function variantTag(baseline: SituationBaseline): string | undefined {
  return baseline.defaultBaseline || !baseline.id ? undefined : `variant:${baseline.id}`;
}

function resolveSituationBaseline(
  activityType: ActivityType,
  seed: string,
): SituationBaseline {
  return selectObservationSituationDefinition(activityType, seed)
    ?? getDefaultObservationSituationDefinition(activityType)
    ?? DEFAULT_BASELINE;
}

function resolveSituationBaselineFromSnapshot(
  situation: ObservationSituationSnapshot,
): SituationBaseline {
  const persistedVariantId = situation.contextTags.find((tag) => tag.startsWith("variant:"))
    ?.slice("variant:".length);
  if (persistedVariantId) {
    const persistedVariant = getObservationSituationDefinitionById(persistedVariantId);
    if (persistedVariant?.activityType === situation.activityType) {
      return persistedVariant;
    }
  }
  return getDefaultObservationSituationDefinition(situation.activityType)
    ?? DEFAULT_BASELINE;
}

function normalizeEventId(id: string): string {
  return id.replace(/_\d+$/, "");
}

function emptySignal(): Record<AttributeDomain, number> {
  return { technical: 1, physical: 1, mental: 1, tactical: 1, hidden: 1 };
}

function weatherClass(weather?: string): string {
  if (weather === "heavy_rain" || weather === "snow" || weather === "windy") return "adverse";
  if (weather === "light_rain" || weather === "cold" || weather === "hot") return "testing";
  return "standard";
}

function attributeDomain(attribute: PlayerAttribute): AttributeDomain {
  return ATTRIBUTE_DOMAINS[attribute];
}

function applyCulture(
  signal: Record<AttributeDomain, number>,
  culture: CombinedFootballCultureEffects,
): void {
  for (const domain of Object.keys(signal) as AttributeDomain[]) {
    signal[domain] += culture.signalByDomain[domain];
  }
}

function buildObservationSituation(
  input: ObservationSituationInput,
  baseline: SituationBaseline,
  lockedIdentity?: {
    competitionLevel: ObservationCompetitionLevel;
    stakes: ObservationStakes;
    tacticalFrame: ObservationTacticalFrame;
  },
): ObservationSituationSnapshot {
  const venueType = input.venueType ?? input.activityType;
  const competitionLevel = lockedIdentity?.competitionLevel
    ?? pickStable(`${input.seed}:level`, baseline.levels);
  const stakes = lockedIdentity?.stakes
    ?? pickStable(`${input.seed}:stakes`, baseline.stakes);
  const tacticalFrame = lockedIdentity?.tacticalFrame
    ?? pickStable(`${input.seed}:frame`, baseline.frames);
  const culture = resolveFootballCultureContext(
    input.countryId,
    input.culturalInsights,
    { calendarEffects: input.calendarEffects },
  );
  const travelPostureEffects = getTravelPostureEffects(input.travelPosture);
  const atmosphere = input.atmosphere;
  const events = input.atmosphereEvents ?? [];
  const signalByDomain = emptySignal();

  for (const domain of Object.keys(signalByDomain) as AttributeDomain[]) {
    signalByDomain[domain] = baseline.signal[domain] ?? 1;
  }
  applyCulture(signalByDomain, culture);
  for (const domain of Object.keys(signalByDomain) as AttributeDomain[]) {
    signalByDomain[domain] *= travelPostureEffects.observationSignalMultiplier;
  }
  const contextSignalBias = baseline.observationContext
    ? travelPostureEffects.observationContextSignalBias[baseline.observationContext] ?? 1
    : 1;
  for (const domain of Object.keys(signalByDomain) as AttributeDomain[]) {
    signalByDomain[domain] *= contextSignalBias;
  }

  const signalByAttribute: Partial<Record<PlayerAttribute, number>> = {};
  for (const attribute of atmosphere?.amplifiedAttributes ?? []) {
    signalByAttribute[attribute] = 1.18;
  }
  for (const attribute of atmosphere?.dampenedAttributes ?? []) {
    signalByAttribute[attribute] = 0.78;
  }

  let eventNoise = 0;
  for (const event of events) {
    eventNoise += event.noiseDelta;
    const modifier = event.effect === "dampen" || event.effect === "distraction"
      ? 0.9
      : event.effect === "reveal"
        ? 1.14
        : 1.1;
    for (const attribute of event.affectedAttributes ?? []) {
      const existing = signalByAttribute[attribute] ?? 1;
      signalByAttribute[attribute] = round(clamp(existing * modifier, 0.65, 1.35));
    }
  }

  for (const [attribute, modifier] of Object.entries(signalByAttribute) as Array<
    [PlayerAttribute, number]
  >) {
    const domain = attributeDomain(attribute);
    signalByDomain[domain] += (modifier - 1) * 0.25;
  }

  for (const domain of Object.keys(signalByDomain) as AttributeDomain[]) {
    signalByDomain[domain] = round(clamp(signalByDomain[domain], 0.55, 1.45));
  }

  const chaos = atmosphere?.chaosLevel ?? 0;
  const weather = atmosphere?.weather;
  const weatherNoise = weatherClass(weather) === "adverse"
    ? 0.16
    : weatherClass(weather) === "testing"
      ? 0.07
      : 0;
  const uncertaintyMultiplier = round(clamp(
    (
      baseline.uncertainty
      + chaos * 0.22
      + weatherNoise
      + eventNoise * 0.35
    )
      * culture.uncertaintyMultiplier
      * (baseline.observationContext
        ? travelPostureEffects.observationContextUncertaintyBias[baseline.observationContext] ?? 1
        : 1)
      * travelPostureEffects.observationUncertaintyMultiplier,
    0.7,
    1.6,
  ));
  const misleadingSignalRisk = round(clamp(
    baseline.misleadingRisk
      + chaos * 0.12
      + Math.max(0, eventNoise) * 0.08
      + culture.misleadingSignalRiskDelta
      + Math.max(0, travelPostureEffects.observationUncertaintyMultiplier - 1) * 0.15,
    0.03,
    0.45,
  ));
  const normalizedEventIds = [...new Set(events.map((event) => normalizeEventId(event.id)))];
  const contextTags = [...new Set([
    ...baseline.tags,
    ...culture.contextTags,
    ...(variantTag(baseline) ? [variantTag(baseline)!] : []),
    ...(input.travelPosture ? [`travel-posture:${input.travelPosture}`] : []),
    `level:${competitionLevel}`,
    `stakes:${stakes}`,
    `frame:${tacticalFrame}`,
  ])];
  const repetitionKeyParts = [
    baseline.observationContext ?? input.activityType,
    venueType,
    competitionLevel,
    stakes,
    tacticalFrame,
  ].join(":");
  const repetitionKey = [
    repetitionKeyParts,
    ...(baseline.variantKey ? [baseline.variantKey] : []),
    weatherClass(weather),
  ].join(":");
  const reasons = [
    `${competitionLevel} competition under ${stakes.replace(/([A-Z])/g, " $1").toLowerCase()} stakes.`,
    `${tacticalFrame.replace(/([A-Z])/g, " $1").toLowerCase()} football shapes which actions repeat often enough to trust.`,
    ...baseline.reasons,
  ];
  if (atmosphere) {
    reasons.push(
      `${weatherClass(weather)} conditions and ${Math.round(chaos * 100)}% venue chaos produce an uncertainty multiplier of ${uncertaintyMultiplier.toFixed(2)}.`,
    );
  }
  if (culture.insightIds.length > 0) {
    reasons.push(`${culture.insightIds.length} earned football-culture insight${culture.insightIds.length === 1 ? "" : "s"} improve interpretation without changing player truth.`);
  }
  reasons.push(...culture.reasons);
  if (input.travelPosture) {
    const contextLabel = baseline.observationContext
      ? baseline.observationContext.replace(/([A-Z])/g, " $1").toLowerCase()
      : input.activityType.replace(/([A-Z])/g, " $1").toLowerCase();
    reasons.push(`The ${input.travelPosture.replace(/([A-Z])/g, " $1").toLowerCase()} trip posture changed how useful ${contextLabel} evidence is in this setting.`);
  }

  return {
    version: OBSERVATION_SITUATION_VERSION,
    id: `situation:${hashSeed(`${input.seed}:${repetitionKey}`).toString(16)}`,
    activityType: input.activityType,
    observationContext: baseline.observationContext,
    venueType,
    countryId: input.countryId,
    travelPosture: input.travelPosture,
    competitionLevel,
    stakes,
    tacticalFrame,
    weather,
    chaosLevel: round(chaos),
    crowdIntensity: round(atmosphere?.crowdIntensity ?? 0),
    atmosphereEventIds: normalizedEventIds,
    signalByDomain,
    signalByAttribute,
    uncertaintyMultiplier,
    misleadingSignalRisk,
    repetitionKey,
    culturalInsightIds: culture.insightIds,
    culturalCalendarWindowIds: culture.activeWindowIds,
    contextTags,
    biasWarnings: culture.biasWarnings,
    reasons,
  };
}

/** Pure, stable construction that does not consume the simulation RNG stream. */
export function createObservationSituation(
  input: ObservationSituationInput,
): ObservationSituationSnapshot {
  return buildObservationSituation(
    input,
    resolveSituationBaseline(input.activityType, input.seed),
  );
}

/** Rebuild the persisted snapshot after atmosphere and phase events are known. */
export function applyAtmosphereToObservationSituation(
  situation: ObservationSituationSnapshot,
  atmosphere: SituationVenueAtmosphere,
  events: readonly SituationAtmosphereEvent[],
  culturalInsights?: readonly CulturalInsight[],
  calendarEffects?: CountryCalendarEffects,
): ObservationSituationSnapshot {
  const persistedBaseline = resolveSituationBaselineFromSnapshot(situation);
  const rebuilt = buildObservationSituation({
    activityType: situation.activityType,
    seed: situation.id,
    venueType: situation.venueType,
    countryId: situation.countryId,
    travelPosture: situation.travelPosture,
    culturalInsights,
    calendarEffects,
    atmosphere,
    atmosphereEvents: events,
  }, persistedBaseline, {
    competitionLevel: situation.competitionLevel,
    stakes: situation.stakes,
    tacticalFrame: situation.tacticalFrame,
  });
  const contextTags = rebuilt.contextTags.filter((tag) =>
    !tag.startsWith("level:")
    && !tag.startsWith("stakes:")
    && !tag.startsWith("frame:"),
  );
  contextTags.push(
    `level:${situation.competitionLevel}`,
    `stakes:${situation.stakes}`,
    `frame:${situation.tacticalFrame}`,
  );
  return {
    ...rebuilt,
    id: situation.id,
    repetitionKey: [
      rebuilt.observationContext ?? rebuilt.activityType,
      rebuilt.venueType,
      rebuilt.competitionLevel,
      rebuilt.stakes,
      rebuilt.tacticalFrame,
      ...(persistedBaseline.variantKey ? [persistedBaseline.variantKey] : []),
      weatherClass(rebuilt.weather),
    ].join(":"),
    contextTags: [...new Set(contextTags)],
  };
}

export interface ObservationSituationAttributeModifier {
  signalMultiplier: number;
  noiseMultiplier: number;
  confidenceDelta: number;
}

/**
 * Apply the selected information challenge without touching the observed
 * player or the persisted situation. The result stays inside the established
 * evidence bounds, so difficulty changes perception quality rather than truth.
 */
export function applyInformationDifficultyToObservationModifier(
  modifier: Readonly<ObservationSituationAttributeModifier>,
  difficulty: DifficultyLevel,
): ObservationSituationAttributeModifier {
  const profile = getDifficultyChallengeProfile(difficulty);
  const baseSignalMultiplier = Number.isFinite(modifier.signalMultiplier)
    ? clamp(modifier.signalMultiplier, 0.5, 1.55)
    : 1;
  const baseNoiseMultiplier = Number.isFinite(modifier.noiseMultiplier)
    ? clamp(modifier.noiseMultiplier, 0.65, 1.75)
    : 1;
  const baseConfidenceDelta = Number.isFinite(modifier.confidenceDelta)
    ? clamp(modifier.confidenceDelta, -0.08, 0.08)
    : 0;
  const signalMultiplier = round(clamp(
    baseSignalMultiplier * profile.sourceReliabilityMultiplier,
    0.5,
    1.55,
  ));
  const noiseMultiplier = round(clamp(
    baseNoiseMultiplier
      * profile.evidenceNoiseMultiplier
      / Math.sqrt(profile.sourceReliabilityMultiplier),
    0.65,
    1.75,
  ));
  const confidenceDelta = round(clamp(
    baseConfidenceDelta
      + (profile.sourceReliabilityMultiplier - 1) * 0.08
      - (profile.evidenceNoiseMultiplier - 1) * 0.06,
    -0.08,
    0.08,
  ));

  return { signalMultiplier, noiseMultiplier, confidenceDelta };
}

/** Convert visible situation facts into evidence modifiers for one attribute. */
export function getObservationSituationAttributeModifier(
  situation: ObservationSituationSnapshot | undefined,
  attribute: PlayerAttribute,
  difficulty: DifficultyLevel = "normal",
): ObservationSituationAttributeModifier {
  if (!situation) {
    return applyInformationDifficultyToObservationModifier(
      { signalMultiplier: 1, noiseMultiplier: 1, confidenceDelta: 0 },
      difficulty,
    );
  }
  const domain = attributeDomain(attribute);
  const domainSignal = situation.signalByDomain[domain] ?? 1;
  const attributeSignal = situation.signalByAttribute[attribute] ?? 1;
  const signalMultiplier = round(clamp(domainSignal * attributeSignal, 0.5, 1.55));
  const noiseMultiplier = round(clamp(
    situation.uncertaintyMultiplier / Math.sqrt(signalMultiplier),
    0.65,
    1.75,
  ));
  const confidenceDelta = round(clamp(
    (signalMultiplier - 1) * 0.1 - (situation.uncertaintyMultiplier - 1) * 0.08,
    -0.08,
    0.08,
  ));
  return applyInformationDifficultyToObservationModifier(
    { signalMultiplier, noiseMultiplier, confidenceDelta },
    difficulty,
  );
}
