import type {
  Contact,
  ContactType,
  HiddenAttribute,
  NPCScout,
  NPCScoutReport,
  PlayerAttribute,
  ScoutEvidenceCategory,
  ScoutEvidenceClaim,
  ScoutEvidenceDirection,
  ScoutEvidenceRange,
  ScoutReferenceLens,
  ScoutRiskTolerance,
  ScoutSourcePerspective,
  SourceReliabilityBand,
  Specialization,
} from "@/engine/core/types";
import { createRNG } from "@/engine/rng";
import { LEGACY_SEASON_LENGTH_WEEKS } from "@/engine/core/gameDate";

export const MAX_EVIDENCE_CLAIMS_PER_SOURCE = 4;
export const MAX_COMPARABLE_EVIDENCE_SOURCES = 16;

const LENS_LABELS: Record<ScoutReferenceLens, string> = {
  developmentCeiling: "development-ceiling",
  immediateImpact: "immediate-impact",
  dataProjection: "data-projection",
  regionalFit: "regional-fit",
  characterContext: "character-context",
  marketOpportunity: "market-opportunity",
};

const RISK_LABELS: Record<ScoutRiskTolerance, string> = {
  cautious: "cautious",
  balanced: "balanced",
  bold: "aggressive",
};

const NPC_LENS: Record<Specialization, ScoutReferenceLens> = {
  youth: "developmentCeiling",
  firstTeam: "immediateImpact",
  regional: "regionalFit",
  data: "dataProjection",
};

const CONTACT_LENS: Record<ContactType, ScoutReferenceLens> = {
  agent: "marketOpportunity",
  clubStaff: "immediateImpact",
  journalist: "marketOpportunity",
  scout: "dataProjection",
  academyCoach: "developmentCeiling",
  sportingDirector: "immediateImpact",
  grassrootsOrganizer: "regionalFit",
  schoolCoach: "characterContext",
  youthAgent: "marketOpportunity",
  academyDirector: "developmentCeiling",
  localScout: "regionalFit",
};

const LENS_BIAS_CATEGORIES: Record<ScoutReferenceLens, readonly ScoutEvidenceCategory[]> = {
  developmentCeiling: ["potential", "professionalism", "decisionMaking"],
  immediateImpact: ["readiness", "roleFit", "consistency"],
  dataProjection: ["potential", "consistency", "pace"],
  regionalFit: ["adaptability", "roleFit", "teamwork"],
  characterContext: ["characterRisk", "professionalism", "bigGameTemperament"],
  marketOpportunity: ["readiness", "potential", "adaptability"],
};

const LENS_ATTRIBUTE_SHIFT: Partial<Record<ScoutReferenceLens, Partial<Record<string, number>>>> = {
  developmentCeiling: { potential: 0.8, professionalism: 0.45, decisionMaking: 0.35 },
  immediateImpact: { readiness: 0.7, consistency: 0.45, stamina: 0.3 },
  dataProjection: { potential: 0.45, consistency: 0.55, pace: 0.35 },
  regionalFit: { adaptability: 0.75, teamwork: 0.4, roleFit: 0.35 },
  characterContext: { characterRisk: 0.65, professionalism: 0.6, bigGameTemperament: 0.4 },
  marketOpportunity: { readiness: 0.5, potential: 0.35, adaptability: 0.25 },
};

const NEGATIVE_WHEN_HIGH = new Set<ScoutEvidenceCategory>([
  "injuryProneness",
  "characterRisk",
]);

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function humanize(value: string): string {
  const spaced = value.replace(/([A-Z])/g, " $1").replace(/[_-]/g, " ").trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function npcReliabilityBand(quality: number): SourceReliabilityBand {
  if (quality >= 5) return "trusted";
  if (quality >= 4) return "established";
  if (quality >= 2) return "developing";
  return "unproven";
}

function contactReliabilityBand(contact: Pick<Contact, "reliability" | "interactionHistory">): SourceReliabilityBand {
  const observedInteractions = contact.interactionHistory?.length ?? 0;
  if (observedInteractions < 3) return "unproven";
  if (contact.reliability >= 82) return "trusted";
  if (contact.reliability >= 62) return "established";
  return "developing";
}

function derivePerspective(input: {
  actorId: string;
  actorKind: "npcScout" | "contact";
  lens: ScoutReferenceLens;
  reliabilityBand: SourceReliabilityBand;
}): ScoutSourcePerspective {
  const rng = createRNG(`source-perspective-v1:${input.actorKind}:${input.actorId}`);
  const riskTolerance = rng.pick<ScoutRiskTolerance>(["cautious", "balanced", "bold"]);
  const candidates = rng.shuffle(LENS_BIAS_CATEGORIES[input.lens]);
  const biases = candidates.slice(0, 2).map((category) => {
    const sign = rng.chance(0.5) ? 1 : -1;
    return {
      category,
      adjustment: round2(sign * rng.nextFloat(0.04, 0.121)),
    };
  });
  return {
    actorId: input.actorId,
    actorKind: input.actorKind,
    lens: input.lens,
    riskTolerance,
    reliabilityBand: input.reliabilityBand,
    biases,
  };
}

export function deriveNPCScoutPerspective(
  scout: Pick<NPCScout, "id" | "quality" | "specialization" | "evidencePerspective">,
): ScoutSourcePerspective {
  return scout.evidencePerspective ?? derivePerspective({
    actorId: scout.id,
    actorKind: "npcScout",
    lens: NPC_LENS[scout.specialization],
    reliabilityBand: npcReliabilityBand(scout.quality),
  });
}

export function deriveContactPerspective(
  contact: Pick<Contact, "id" | "type" | "reliability" | "interactionHistory" | "evidencePerspective">,
): ScoutSourcePerspective {
  const reliabilityBand = contactReliabilityBand(contact);
  if (contact.evidencePerspective) {
    return { ...contact.evidencePerspective, reliabilityBand };
  }
  return derivePerspective({
    actorId: contact.id,
    actorKind: "contact",
    lens: CONTACT_LENS[contact.type],
    reliabilityBand,
  });
}

export function neutralPlayerPerspective(actorId: string): ScoutSourcePerspective {
  return {
    actorId,
    actorKind: "playerScout",
    lens: "immediateImpact",
    riskTolerance: "balanced",
    reliabilityBand: "established",
    biases: [],
  };
}

function categoryAliases(category: ScoutEvidenceCategory): ScoutEvidenceCategory[] {
  if (["passing", "firstTouch", "dribbling", "crossing", "shooting", "heading", "tackling", "finishing"].includes(category)) {
    return [category, "potential"];
  }
  if (["pace", "strength", "stamina", "agility", "jumping", "balance"].includes(category)) {
    return [category, "readiness", "potential"];
  }
  if (["offTheBall", "pressing", "defensiveAwareness", "vision", "marking", "teamwork"].includes(category)) {
    return [category, "roleFit"];
  }
  if (["composure", "positioning", "workRate", "decisionMaking", "leadership", "anticipation"].includes(category)) {
    return [category, "characterRisk", "roleFit"];
  }
  if (category === "injuryProneness") return [category, "durability"];
  if (["consistency", "bigGameTemperament", "professionalism"].includes(category)) return [category, "characterRisk"];
  return [category];
}

export function perspectiveAdjustment(
  perspective: ScoutSourcePerspective,
  category: ScoutEvidenceCategory,
): number {
  const aliases = new Set(categoryAliases(category));
  const stableBias = perspective.biases
    .filter((bias) => aliases.has(bias.category))
    .reduce((sum, bias) => sum + bias.adjustment, 0);
  const lensShift = categoryAliases(category).reduce(
    (maximum, alias) => Math.max(maximum, LENS_ATTRIBUTE_SHIFT[perspective.lens]?.[alias] ?? 0),
    0,
  ) / 20;
  return clamp(stableBias + lensShift, -0.12, 0.12);
}

function directionFromCentre(category: ScoutEvidenceCategory, centre: number): ScoutEvidenceDirection {
  const positive = centre >= 13 ? "positive" : centre <= 8 ? "negative" : "mixed";
  if (!NEGATIVE_WHEN_HIGH.has(category)) return positive;
  return positive === "positive" ? "negative" : positive === "negative" ? "positive" : "mixed";
}

function describePerspective(perspective: ScoutSourcePerspective, recency: string): string {
  const bias = perspective.biases.length > 0
    ? ` Stable emphasis: ${perspective.biases.map((item) => humanize(String(item.category))).join(" and ")}.`
    : "";
  return `${humanize(LENS_LABELS[perspective.lens])} lens, ${RISK_LABELS[perspective.riskTolerance]} threshold, ${perspective.reliabilityBand} reliability, ${recency}.${bias} Different context or reference standards can conflict with live observation.`;
}

export function buildNPCAttributeEvidenceClaims(input: {
  reportId: string;
  playerId: string;
  sourceName: string;
  perspective: ScoutSourcePerspective;
  readings: ReadonlyArray<{ attribute: PlayerAttribute; perceivedValue: number; confidence: number }>;
  week: number;
  season: number;
}): ScoutEvidenceClaim[] {
  return input.readings.slice(0, MAX_EVIDENCE_CLAIMS_PER_SOURCE).map((reading) => {
    const adjustment = perspectiveAdjustment(input.perspective, reading.attribute);
    const centre = clamp(reading.perceivedValue + adjustment * 20, 1, 20);
    const halfWidth = Math.max(1, Math.round((1 - reading.confidence) * 5));
    const range: ScoutEvidenceRange = {
      scale: "attribute20",
      low: clamp(Math.floor(centre - halfWidth), 1, 20),
      high: clamp(Math.ceil(centre + halfWidth), 1, 20),
    };
    return {
      id: `${input.reportId}-claim-${reading.attribute}`,
      playerId: input.playerId,
      sourceId: input.reportId,
      sourceName: input.sourceName,
      sourceKind: "npcScout",
      category: reading.attribute,
      direction: directionFromCentre(reading.attribute, centre),
      range,
      confidence: round2(clamp(reading.confidence, 0.1, 0.95)),
      statement: `${input.sourceName} places ${humanize(reading.attribute).toLowerCase()} in the ${range.low}–${range.high} band.`,
      explanation: describePerspective(input.perspective, "recorded this week"),
      recordedWeek: input.week,
      recordedSeason: input.season,
      perspective: input.perspective,
      calibration: {
        status: "uncalibrated",
        note: "No observable career outcome has calibrated this reading yet.",
      },
    };
  });
}

export function adjustRecommendationForPerspective(
  signal: number,
  perspective: ScoutSourcePerspective,
): number {
  const riskShift = perspective.riskTolerance === "bold" ? 6
    : perspective.riskTolerance === "cautious" ? -6
    : 0;
  const biasShift = perspectiveAdjustment(perspective, "readiness") * 50;
  return clamp(signal + riskShift + biasShift, 0, 100);
}

export function buildNPCRecommendationEvidenceClaim(input: {
  reportId: string;
  playerId: string;
  sourceName: string;
  perspective: ScoutSourcePerspective;
  recommendation: NPCScoutReport["recommendation"];
  quality: number;
  week: number;
  season: number;
}): ScoutEvidenceClaim {
  const direction: ScoutEvidenceDirection = input.recommendation === "pursue" ? "positive"
    : input.recommendation === "monitor" ? "negative"
    : "mixed";
  const range: ScoutEvidenceRange = {
    scale: "qualitative",
    label: input.recommendation === "pursue" ? "strong"
      : input.recommendation === "shortlist" ? "positive"
      : "uncertain",
  };
  return {
    id: `${input.reportId}-claim-readiness`,
    playerId: input.playerId,
    sourceId: input.reportId,
    sourceName: input.sourceName,
    sourceKind: "npcScout",
    category: "readiness",
    direction,
    range,
    confidence: round2(clamp(input.quality / 100, 0.2, 0.95)),
    statement: `${input.sourceName} recommends ${input.recommendation === "pursue" ? "acting now" : input.recommendation === "shortlist" ? "keeping the player close" : "gathering more evidence"}.`,
    explanation: describePerspective(input.perspective, "recorded this week"),
    recordedWeek: input.week,
    recordedSeason: input.season,
    perspective: input.perspective,
    calibration: {
      status: "uncalibrated",
      note: "Reviewing a report is not an outcome; this recommendation remains uncalibrated.",
    },
  };
}

function hiddenDirection(attribute: HiddenAttribute, isHigh: boolean): ScoutEvidenceDirection {
  if (attribute === "injuryProneness") return isHigh ? "negative" : "positive";
  return isHigh ? "positive" : "negative";
}

function hiddenCategory(attribute: HiddenAttribute): ScoutEvidenceCategory {
  return attribute;
}

export function buildContactEvidenceClaim(input: {
  contact: Pick<Contact, "id" | "name" | "type" | "relationship" | "reliability" | "interactionHistory" | "evidencePerspective">;
  playerId: string;
  attribute: HiddenAttribute;
  hint: string;
  isHigh: boolean;
  reliability: number;
  week?: number;
  season?: number;
}): ScoutEvidenceClaim {
  const perspective = deriveContactPerspective(input.contact);
  const category = hiddenCategory(input.attribute);
  const direction = hiddenDirection(input.attribute, input.isHigh);
  const relationshipFactor = clamp(input.contact.relationship / 100, 0, 1);
  const directionSign = direction === "positive" ? 1 : direction === "negative" ? -1 : 0;
  const biasConfidenceShift = perspectiveAdjustment(perspective, category) * directionSign * 0.5;
  const confidence = clamp(
    input.reliability * 0.8 + relationshipFactor * 0.12 + biasConfidenceShift,
    0.15,
    0.92,
  );
  const label = direction === "positive" ? "positive" : "concern";
  return {
    id: `contact-claim-${input.contact.id}-${input.playerId}-${input.attribute}-${input.season ?? "legacy"}-${input.week ?? "unknown"}`,
    playerId: input.playerId,
    sourceId: input.contact.id,
    sourceName: input.contact.name,
    sourceKind: "contact",
    category,
    direction,
    range: { scale: "qualitative", label },
    confidence: round2(confidence),
    statement: input.hint,
    explanation: describePerspective(
      perspective,
      input.week === undefined ? "recency unknown" : "recorded this week",
    ),
    recordedWeek: input.week,
    recordedSeason: input.season,
    perspective,
    calibration: {
      status: "uncalibrated",
      note: "This second-hand claim has not yet been checked against an observable outcome.",
    },
  };
}

export function getEffectiveClaimConfidence(
  claim: Pick<ScoutEvidenceClaim, "confidence" | "recordedWeek" | "recordedSeason">,
  now?: { week: number; season: number },
  seasonLength = LEGACY_SEASON_LENGTH_WEEKS,
): number {
  if (!now || claim.recordedWeek === undefined || claim.recordedSeason === undefined) {
    return round2(clamp(claim.confidence * 0.85, 0.1, 0.95));
  }
  const age = Math.max(
    0,
    (now.season - claim.recordedSeason) * seasonLength + now.week - claim.recordedWeek,
  );
  const recencyFactor = clamp(1 - age * 0.0125, 0.55, 1);
  return round2(clamp(claim.confidence * recencyFactor, 0.1, 0.95));
}

export function formatEvidenceRange(range: ScoutEvidenceRange): string {
  return range.scale === "attribute20" ? `${range.low}–${range.high}` : humanize(range.label);
}

export function capComparableClaims(claims: readonly ScoutEvidenceClaim[]): ScoutEvidenceClaim[] {
  const bySource = new Map<string, number>();
  const result: ScoutEvidenceClaim[] = [];
  for (const claim of claims) {
    if (result.length >= MAX_COMPARABLE_EVIDENCE_SOURCES) break;
    const sourceCount = bySource.get(claim.sourceId) ?? 0;
    if (sourceCount >= MAX_EVIDENCE_CLAIMS_PER_SOURCE) continue;
    result.push(claim);
    bySource.set(claim.sourceId, sourceCount + 1);
  }
  return result;
}
