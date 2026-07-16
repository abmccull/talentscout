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
  type ObservationContext,
  type PlayerAttribute,
  type TravelPosture,
} from "@/engine/core/types";
import {
  combineFootballCultureEffects,
  type CombinedFootballCultureEffects,
} from "@/engine/world/footballCulture";
import { getTravelPostureEffects } from "@/engine/world/travel";

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

export type ObservationCompetitionLevel =
  | "community"
  | "school"
  | "academy"
  | "reserve"
  | "professional"
  | "elite";

export type ObservationStakes =
  | "routine"
  | "selection"
  | "competitive"
  | "knockout"
  | "careerDefining";

export type ObservationTacticalFrame =
  | "unstructured"
  | "direct"
  | "transitionHeavy"
  | "possession"
  | "pressing"
  | "structured";

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
  atmosphere?: SituationVenueAtmosphere;
  atmosphereEvents?: readonly SituationAtmosphereEvent[];
}

interface SituationBaseline {
  context?: ObservationContext;
  levels: readonly ObservationCompetitionLevel[];
  stakes: readonly ObservationStakes[];
  frames: readonly ObservationTacticalFrame[];
  signal: Partial<Record<AttributeDomain, number>>;
  uncertainty: number;
  misleadingRisk: number;
  tags: readonly string[];
}

const DEFAULT_BASELINE: SituationBaseline = {
  levels: ["professional"],
  stakes: ["routine", "competitive"],
  frames: ["structured", "transitionHeavy", "possession", "pressing"],
  signal: {},
  uncertainty: 1,
  misleadingRisk: 0.12,
  tags: ["general-observation"],
};

const BASELINES: Partial<Record<ActivityType, SituationBaseline>> = {
  schoolMatch: {
    context: "schoolMatch",
    levels: ["school"],
    stakes: ["routine", "competitive"],
    frames: ["unstructured", "direct"],
    signal: { technical: 0.98, physical: 1.04, mental: 1.02, tactical: 0.78 },
    uncertainty: 1.12,
    misleadingRisk: 0.2,
    tags: ["school-pathway", "limited-structure"],
  },
  grassrootsTournament: {
    context: "grassrootsTournament",
    levels: ["community"],
    stakes: ["competitive", "knockout"],
    frames: ["direct", "transitionHeavy", "unstructured"],
    signal: { physical: 1.12, mental: 1.08, tactical: 0.82 },
    uncertainty: 1.18,
    misleadingRisk: 0.22,
    tags: ["multi-match", "uneven-opposition"],
  },
  streetFootball: {
    context: "streetFootball",
    levels: ["community"],
    stakes: ["routine", "competitive"],
    frames: ["unstructured"],
    signal: { technical: 1.18, physical: 1.08, tactical: 0.68 },
    uncertainty: 1.28,
    misleadingRisk: 0.28,
    tags: ["informal", "small-space"],
  },
  academyTrialDay: {
    context: "academyTrialDay",
    levels: ["academy"],
    stakes: ["selection", "careerDefining"],
    frames: ["structured", "pressing", "possession"],
    signal: { mental: 1.12, tactical: 1.12, hidden: 1.04 },
    uncertainty: 0.92,
    misleadingRisk: 0.2,
    tags: ["trial", "coached-drills"],
  },
  youthFestival: {
    context: "youthFestival",
    levels: ["academy", "elite"],
    stakes: ["competitive", "knockout"],
    frames: ["transitionHeavy", "pressing", "structured"],
    signal: { mental: 1.15, hidden: 1.08, tactical: 0.96 },
    uncertainty: 1.06,
    misleadingRisk: 0.18,
    tags: ["showcase-pressure", "multi-club"],
  },
  academyVisit: {
    context: "academyVisit",
    levels: ["academy"],
    stakes: ["routine", "selection"],
    frames: ["structured", "possession", "pressing"],
    signal: { technical: 1.1, tactical: 1.08, mental: 1.03 },
    uncertainty: 0.9,
    misleadingRisk: 0.11,
    tags: ["coached-environment", "development-pathway"],
  },
  youthTournament: {
    context: "youthTournament",
    levels: ["academy", "elite"],
    stakes: ["competitive", "knockout"],
    frames: ["transitionHeavy", "pressing", "structured"],
    signal: { physical: 1.08, mental: 1.08, tactical: 0.94 },
    uncertainty: 1.05,
    misleadingRisk: 0.16,
    tags: ["age-group-competition", "multi-match"],
  },
  attendMatch: {
    context: "liveMatch",
    levels: ["professional", "elite"],
    stakes: ["routine", "competitive", "knockout"],
    frames: ["direct", "transitionHeavy", "possession", "pressing", "structured"],
    signal: { mental: 1.06, tactical: 1.08 },
    uncertainty: 1,
    misleadingRisk: 0.12,
    tags: ["senior-live"],
  },
  reserveMatch: {
    context: "reserveMatch",
    levels: ["reserve"],
    stakes: ["routine", "selection"],
    frames: ["structured", "transitionHeavy", "pressing"],
    signal: { technical: 1.04, physical: 1.06, mental: 0.94 },
    uncertainty: 0.94,
    misleadingRisk: 0.15,
    tags: ["reserve-level", "selection-pressure"],
  },
  trainingVisit: {
    context: "trainingGround",
    levels: ["professional"],
    stakes: ["routine", "selection"],
    frames: ["structured", "possession", "pressing"],
    signal: { technical: 1.14, tactical: 1.12, physical: 1.03, mental: 0.9 },
    uncertainty: 0.84,
    misleadingRisk: 0.13,
    tags: ["training-ground", "repeatable-drills"],
  },
  trialMatch: {
    context: "trialMatch",
    levels: ["professional"],
    stakes: ["careerDefining"],
    frames: ["structured", "transitionHeavy", "pressing"],
    signal: { mental: 1.16, hidden: 1.08, tactical: 1.04 },
    uncertainty: 0.92,
    misleadingRisk: 0.24,
    tags: ["trial", "career-pressure"],
  },
  scoutingMission: {
    context: "liveMatch",
    levels: ["professional", "elite"],
    stakes: ["competitive", "knockout"],
    frames: ["direct", "transitionHeavy", "possession", "pressing", "structured"],
    signal: { tactical: 1.08, mental: 1.05 },
    uncertainty: 1.04,
    misleadingRisk: 0.14,
    tags: ["assigned-watch", "senior-live"],
  },
  followUpSession: {
    context: "followUpSession",
    levels: ["academy"],
    stakes: ["selection"],
    frames: ["structured"],
    signal: { technical: 1.08, physical: 1.08, mental: 1.08, tactical: 1.08 },
    uncertainty: 0.88,
    misleadingRisk: 0.08,
    tags: ["targeted-follow-up"],
  },
  parentCoachMeeting: {
    context: "parentCoachMeeting",
    levels: ["community", "academy"],
    stakes: ["selection"],
    frames: ["structured"],
    signal: { mental: 1.1, hidden: 1.18 },
    uncertainty: 1.12,
    misleadingRisk: 0.2,
    tags: ["relationship-evidence", "second-hand"],
  },
  watchVideo: {
    context: "videoAnalysis",
    levels: ["professional"],
    stakes: ["routine", "competitive"],
    frames: ["direct", "transitionHeavy", "possession", "pressing", "structured"],
    signal: { technical: 1.03, tactical: 1.08, physical: 0.82, hidden: 0.62 },
    uncertainty: 1.12,
    misleadingRisk: 0.17,
    tags: ["video", "curated-sample"],
  },
  databaseQuery: {
    context: "databaseQuery",
    levels: ["professional"],
    stakes: ["routine"],
    frames: ["structured"],
    signal: { technical: 0.94, tactical: 1.02, physical: 0.8, mental: 0.68, hidden: 0.55 },
    uncertainty: 1.24,
    misleadingRisk: 0.23,
    tags: ["data", "competition-normalisation"],
  },
  deepVideoAnalysis: {
    context: "deepVideoAnalysis",
    levels: ["professional"],
    stakes: ["routine", "competitive"],
    frames: ["direct", "transitionHeavy", "possession", "pressing", "structured"],
    signal: { technical: 1.08, mental: 1.02, tactical: 1.14, physical: 0.86 },
    uncertainty: 0.98,
    misleadingRisk: 0.12,
    tags: ["video", "data-overlay"],
  },
  oppositionAnalysis: {
    context: "oppositionAnalysis",
    levels: ["professional", "elite"],
    stakes: ["competitive", "knockout"],
    frames: ["direct", "transitionHeavy", "possession", "pressing", "structured"],
    signal: { mental: 1.02, tactical: 1.16, technical: 0.92 },
    uncertainty: 1.02,
    misleadingRisk: 0.14,
    tags: ["opposition", "tactical-sample"],
  },
  agentShowcase: {
    context: "agentShowcase",
    levels: ["professional"],
    stakes: ["selection", "careerDefining"],
    frames: ["transitionHeavy", "possession"],
    signal: { technical: 1.08, physical: 1.06, mental: 1.04, tactical: 0.8 },
    uncertainty: 1.14,
    misleadingRisk: 0.3,
    tags: ["agent-curated", "showcase-pressure"],
  },
  statsBriefing: {
    context: "statsBriefing",
    levels: ["professional"],
    stakes: ["routine"],
    frames: ["structured"],
    signal: { technical: 0.88, tactical: 0.94, physical: 0.72, mental: 0.62, hidden: 0.55 },
    uncertainty: 1.28,
    misleadingRisk: 0.24,
    tags: ["data", "summary-only"],
  },
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

/** Pure, stable construction that does not consume the simulation RNG stream. */
export function createObservationSituation(
  input: ObservationSituationInput,
): ObservationSituationSnapshot {
  const baseline = BASELINES[input.activityType] ?? DEFAULT_BASELINE;
  const venueType = input.venueType ?? input.activityType;
  const competitionLevel = pickStable(`${input.seed}:level`, baseline.levels);
  const stakes = pickStable(`${input.seed}:stakes`, baseline.stakes);
  const tacticalFrame = pickStable(`${input.seed}:frame`, baseline.frames);
  const culture = combineFootballCultureEffects(input.countryId, input.culturalInsights);
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
      * travelPostureEffects.observationUncertaintyMultiplier,
    0.7,
    1.6,
  ));
  const misleadingSignalRisk = round(clamp(
    baseline.misleadingRisk
      + chaos * 0.12
      + Math.max(0, eventNoise) * 0.08
      + Math.max(0, travelPostureEffects.observationUncertaintyMultiplier - 1) * 0.15,
    0.03,
    0.45,
  ));
  const normalizedEventIds = [...new Set(events.map((event) => normalizeEventId(event.id)))];
  const contextTags = [...new Set([
    ...baseline.tags,
    ...culture.contextTags,
    ...(input.travelPosture ? [`travel-posture:${input.travelPosture}`] : []),
    `level:${competitionLevel}`,
    `stakes:${stakes}`,
    `frame:${tacticalFrame}`,
  ])];
  const repetitionKey = [
    baseline.context ?? input.activityType,
    venueType,
    competitionLevel,
    stakes,
    tacticalFrame,
    weatherClass(weather),
  ].join(":");
  const reasons = [
    `${competitionLevel} competition under ${stakes.replace(/([A-Z])/g, " $1").toLowerCase()} stakes.`,
    `${tacticalFrame.replace(/([A-Z])/g, " $1").toLowerCase()} football shapes which actions repeat often enough to trust.`,
  ];
  if (atmosphere) {
    reasons.push(
      `${weatherClass(weather)} conditions and ${Math.round(chaos * 100)}% venue chaos produce an uncertainty multiplier of ${uncertaintyMultiplier.toFixed(2)}.`,
    );
  }
  if (culture.insightIds.length > 0) {
    reasons.push(`${culture.insightIds.length} earned football-culture insight${culture.insightIds.length === 1 ? "" : "s"} improve interpretation without changing player truth.`);
  }
  if (input.travelPosture) {
    reasons.push(`The ${input.travelPosture.replace(/([A-Z])/g, " $1").toLowerCase()} trip posture changed evidence depth and opportunity coverage.`);
  }

  return {
    version: OBSERVATION_SITUATION_VERSION,
    id: `situation:${hashSeed(`${input.seed}:${repetitionKey}`).toString(16)}`,
    activityType: input.activityType,
    observationContext: baseline.context,
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
    contextTags,
    biasWarnings: culture.biasWarnings,
    reasons,
  };
}

/** Rebuild the persisted snapshot after atmosphere and phase events are known. */
export function applyAtmosphereToObservationSituation(
  situation: ObservationSituationSnapshot,
  atmosphere: SituationVenueAtmosphere,
  events: readonly SituationAtmosphereEvent[],
  culturalInsights?: readonly CulturalInsight[],
): ObservationSituationSnapshot {
  const rebuilt = createObservationSituation({
    activityType: situation.activityType,
    seed: situation.id,
    venueType: situation.venueType,
    countryId: situation.countryId,
    travelPosture: situation.travelPosture,
    culturalInsights,
    atmosphere,
    atmosphereEvents: events,
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
    competitionLevel: situation.competitionLevel,
    stakes: situation.stakes,
    tacticalFrame: situation.tacticalFrame,
    repetitionKey: [
      rebuilt.observationContext ?? rebuilt.activityType,
      rebuilt.venueType,
      situation.competitionLevel,
      situation.stakes,
      situation.tacticalFrame,
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

/** Convert visible situation facts into evidence modifiers for one attribute. */
export function getObservationSituationAttributeModifier(
  situation: ObservationSituationSnapshot | undefined,
  attribute: PlayerAttribute,
): ObservationSituationAttributeModifier {
  if (!situation) {
    return { signalMultiplier: 1, noiseMultiplier: 1, confidenceDelta: 0 };
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
  return { signalMultiplier, noiseMultiplier, confidenceDelta };
}
