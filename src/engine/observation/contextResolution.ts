import type {
  AttributeDomain,
  Observation,
  ObservationContext,
  Player,
  PlayerAttribute,
  PlayerRole,
  Position,
} from "@/engine/core/types";
import type { ObservationSituationSnapshot } from "./situations";

interface ContextTemplate {
  attributeBudgetDelta: number;
  attributeCap?: number;
  weakSignalRisk: number;
  priorityByDomain: Partial<Record<AttributeDomain, number>>;
  signalByDomain: Partial<Record<AttributeDomain, number>>;
  noiseByDomain: Partial<Record<AttributeDomain, number>>;
  confidenceByDomain: Partial<Record<AttributeDomain, number>>;
  notes: string[];
}

export interface ObservationContextResolution {
  sameContextCount: number;
  sameSituationCount: number;
  changedContext: boolean;
  weakSignal: boolean;
  attributeBudgetDelta: number;
  attributeCap?: number;
  evidencePassBonus: number;
  priorityByDomain: Partial<Record<AttributeDomain, number>>;
  signalByDomain: Partial<Record<AttributeDomain, number>>;
  noiseByDomain: Partial<Record<AttributeDomain, number>>;
  confidenceByDomain: Partial<Record<AttributeDomain, number>>;
  notes: string[];
}

interface ObservationContextResolutionInput {
  player: Pick<Player, "id" | "position" | "secondaryPositions" | "naturalRole">;
  context: ObservationContext;
  existingObservations: readonly Observation[];
  situation?: ObservationSituationSnapshot;
}

const STRUCTURE_DEPENDENT_ROLES = new Set<PlayerRole>([
  "invertedFullBack",
  "halfBack",
  "deepLyingPlaymaker",
  "mezzala",
  "carrilero",
  "enganche",
  "trequartista",
  "libero",
  "ballPlayingDefender",
]);

const DEFENSIVE_OR_STRUCTURED_POSITIONS = new Set<Position>([
  "GK",
  "CB",
  "LB",
  "RB",
  "CDM",
  "CM",
  "CAM",
]);

const CONTEXT_TEMPLATES: Record<ObservationContext, ContextTemplate> = {
  liveMatch: {
    attributeBudgetDelta: 0,
    weakSignalRisk: 0.08,
    priorityByDomain: { tactical: 1.1, mental: 0.8, technical: 0.6 },
    signalByDomain: { technical: 1.01, physical: 1, mental: 1.02, tactical: 1.04 },
    noiseByDomain: {},
    confidenceByDomain: {},
    notes: ["Senior live football usually gives the cleanest role and pressure read."],
  },
  videoAnalysis: {
    attributeBudgetDelta: -1,
    weakSignalRisk: 0.12,
    priorityByDomain: { tactical: 1.3, technical: 1.1 },
    signalByDomain: { technical: 1.06, tactical: 1.12, physical: 0.72, mental: 0.88, hidden: 0.55 },
    noiseByDomain: { physical: 1.18, hidden: 1.28 },
    confidenceByDomain: { tactical: 0.02, technical: 0.02, physical: -0.04, hidden: -0.06 },
    notes: ["Video sharpens technique and shape, but it hides true pace, contact, and off-camera detail."],
  },
  trainingGround: {
    attributeBudgetDelta: 1,
    weakSignalRisk: 0.06,
    priorityByDomain: { tactical: 1.3, technical: 1.2, physical: 0.7 },
    signalByDomain: { technical: 1.1, tactical: 1.14, physical: 1.02, mental: 0.88, hidden: 0.62 },
    noiseByDomain: { tactical: 0.95, technical: 0.96 },
    confidenceByDomain: { tactical: 0.03, technical: 0.02, mental: -0.03 },
    notes: ["Training reveals coached role execution well, but drills can flatter discipline and hide match stress."],
  },
  youthTournament: {
    attributeBudgetDelta: 0,
    weakSignalRisk: 0.14,
    priorityByDomain: { physical: 1.1, mental: 1, technical: 0.8 },
    signalByDomain: { technical: 0.98, physical: 1.07, mental: 1.03, tactical: 0.86 },
    noiseByDomain: { tactical: 1.08, physical: 1.03 },
    confidenceByDomain: { physical: 0.01, tactical: -0.03 },
    notes: ["Tournament football reveals standout traits quickly, but short samples and uneven opponents distort fit."],
  },
  academyVisit: {
    attributeBudgetDelta: 1,
    weakSignalRisk: 0.07,
    priorityByDomain: { technical: 1.1, tactical: 1, mental: 0.7 },
    signalByDomain: { technical: 1.08, tactical: 1.08, physical: 0.98, mental: 0.94 },
    noiseByDomain: { tactical: 0.96, technical: 0.97 },
    confidenceByDomain: { technical: 0.02, tactical: 0.02 },
    notes: ["Academy structure clarifies habits and development environment better than pure upside."],
  },
  schoolMatch: {
    attributeBudgetDelta: -1,
    weakSignalRisk: 0.18,
    priorityByDomain: { technical: 1.05, physical: 0.95 },
    signalByDomain: { technical: 1.04, physical: 0.96, mental: 0.92, tactical: 0.62, hidden: 0.52 },
    noiseByDomain: { tactical: 1.18, physical: 1.08 },
    confidenceByDomain: { tactical: -0.05, mental: -0.02, physical: -0.02 },
    notes: ["School football is ideal for first discovery, but tactical and opponent-quality conclusions stay unsafe."],
  },
  grassrootsTournament: {
    attributeBudgetDelta: -1,
    weakSignalRisk: 0.2,
    priorityByDomain: { physical: 1.1, technical: 0.95, mental: 0.9 },
    signalByDomain: { technical: 0.98, physical: 1.08, mental: 1, tactical: 0.66 },
    noiseByDomain: { tactical: 1.15, physical: 1.08 },
    confidenceByDomain: { tactical: -0.05, physical: -0.02 },
    notes: ["Grassroots events reward breadth, but the level gap can exaggerate physical dominance."],
  },
  streetFootball: {
    attributeBudgetDelta: -1,
    attributeCap: 4,
    weakSignalRisk: 0.24,
    priorityByDomain: { technical: 1.2, physical: 0.9 },
    signalByDomain: { technical: 1.12, physical: 0.98, mental: 0.92, tactical: 0.56 },
    noiseByDomain: { tactical: 1.22, mental: 1.06 },
    confidenceByDomain: { technical: 0.01, tactical: -0.06 },
    notes: ["Street football can expose flair and improvisation, but almost nothing about structured role fit."],
  },
  academyTrialDay: {
    attributeBudgetDelta: 1,
    weakSignalRisk: 0.08,
    priorityByDomain: { tactical: 1.25, mental: 1.05, technical: 1 },
    signalByDomain: { technical: 1.03, physical: 1, mental: 1.08, tactical: 1.14, hidden: 0.66 },
    noiseByDomain: { tactical: 0.94, mental: 0.96 },
    confidenceByDomain: { tactical: 0.03, mental: 0.03 },
    notes: ["Trial environments are strong for role discipline and reaction to instruction under selection pressure."],
  },
  youthFestival: {
    attributeBudgetDelta: 0,
    weakSignalRisk: 0.15,
    priorityByDomain: { physical: 1.1, mental: 1.05, technical: 0.95 },
    signalByDomain: { technical: 1.01, physical: 1.08, mental: 1.08, tactical: 0.8 },
    noiseByDomain: { tactical: 1.1, physical: 1.02 },
    confidenceByDomain: { mental: 0.02, tactical: -0.04 },
    notes: ["Festival showcases create pressure and comparison, but the football itself can become chaotic and selective."],
  },
  followUpSession: {
    attributeBudgetDelta: 1,
    weakSignalRisk: 0.07,
    priorityByDomain: { tactical: 1.15, mental: 1.05, technical: 1 },
    signalByDomain: { technical: 1.06, physical: 1.02, mental: 1.05, tactical: 1.1, hidden: 0.64 },
    noiseByDomain: { tactical: 0.96, mental: 0.97 },
    confidenceByDomain: { tactical: 0.02, mental: 0.02 },
    notes: ["A focused follow-up is most valuable when it deliberately tests the first impression."],
  },
  parentCoachMeeting: {
    attributeBudgetDelta: -2,
    attributeCap: 2,
    weakSignalRisk: 0.22,
    priorityByDomain: { mental: 1.2, hidden: 1.15 },
    signalByDomain: { technical: 0.45, physical: 0.45, mental: 1.08, tactical: 0.58, hidden: 1.12 },
    noiseByDomain: { technical: 1.25, physical: 1.25, tactical: 1.18, hidden: 1.06 },
    confidenceByDomain: { mental: 0.02, hidden: 0.02, technical: -0.07, physical: -0.07, tactical: -0.05 },
    notes: ["Family and coach testimony is useful for pathway and trust, not for clean football execution reads."],
  },
  reserveMatch: {
    attributeBudgetDelta: 0,
    weakSignalRisk: 0.1,
    priorityByDomain: { tactical: 1.15, mental: 1, physical: 0.85 },
    signalByDomain: { technical: 1.02, physical: 1, mental: 1, tactical: 1.08 },
    noiseByDomain: { tactical: 0.97 },
    confidenceByDomain: { tactical: 0.02 },
    notes: ["Reserve football sits between development and senior demands, making it useful for readiness checks."],
  },
  oppositionAnalysis: {
    attributeBudgetDelta: -1,
    weakSignalRisk: 0.1,
    priorityByDomain: { tactical: 1.35, mental: 0.9 },
    signalByDomain: { technical: 0.94, physical: 0.64, mental: 0.9, tactical: 1.16, hidden: 0.5 },
    noiseByDomain: { physical: 1.18, hidden: 1.28 },
    confidenceByDomain: { tactical: 0.03, physical: -0.05, hidden: -0.07 },
    notes: ["Opposition analysis is a tactical sample first; it should not be mistaken for a whole-player judgment."],
  },
  agentShowcase: {
    attributeBudgetDelta: -1,
    attributeCap: 5,
    weakSignalRisk: 0.26,
    priorityByDomain: { technical: 1.12, physical: 1.08, mental: 0.9 },
    signalByDomain: { technical: 1.08, physical: 1.08, mental: 0.98, tactical: 0.7, hidden: 0.52 },
    noiseByDomain: { tactical: 1.2, hidden: 1.18, technical: 1.03 },
    confidenceByDomain: { tactical: -0.06, physical: -0.02, technical: -0.01 },
    notes: ["Showcases are curated and incentive-distorted; they can confirm talent but rarely settle fit."],
  },
  trialMatch: {
    attributeBudgetDelta: 1,
    weakSignalRisk: 0.09,
    priorityByDomain: { tactical: 1.25, mental: 1.05, technical: 1 },
    signalByDomain: { technical: 1.02, physical: 1.02, mental: 1.1, tactical: 1.15, hidden: 0.68 },
    noiseByDomain: { tactical: 0.95, mental: 0.96 },
    confidenceByDomain: { tactical: 0.03, mental: 0.03 },
    notes: ["Trial matches are one of the best contexts for present readiness because instruction and pressure are both visible."],
  },
  databaseQuery: {
    attributeBudgetDelta: -2,
    attributeCap: 3,
    weakSignalRisk: 0.18,
    priorityByDomain: { tactical: 1.05, technical: 0.95 },
    signalByDomain: { technical: 0.9, physical: 0.55, mental: 0.52, tactical: 1, hidden: 0.42 },
    noiseByDomain: { physical: 1.28, mental: 1.22, hidden: 1.3 },
    confidenceByDomain: { tactical: 0.01, technical: -0.02, physical: -0.08, mental: -0.08, hidden: -0.08 },
    notes: ["Database work is a directional clue. It should trigger live follow-up, not close the case."],
  },
  statsBriefing: {
    attributeBudgetDelta: -2,
    attributeCap: 2,
    weakSignalRisk: 0.2,
    priorityByDomain: { tactical: 1, technical: 0.9 },
    signalByDomain: { technical: 0.84, physical: 0.48, mental: 0.46, tactical: 0.92, hidden: 0.4 },
    noiseByDomain: { physical: 1.3, mental: 1.26, hidden: 1.32 },
    confidenceByDomain: { tactical: 0, technical: -0.03, physical: -0.08, mental: -0.08, hidden: -0.08 },
    notes: ["A stats briefing summarizes trends, but the missing context is part of the risk."],
  },
  deepVideoAnalysis: {
    attributeBudgetDelta: 0,
    weakSignalRisk: 0.11,
    priorityByDomain: { tactical: 1.3, technical: 1.15, mental: 0.9 },
    signalByDomain: { technical: 1.1, physical: 0.76, mental: 0.94, tactical: 1.14, hidden: 0.58 },
    noiseByDomain: { tactical: 0.97, physical: 1.15, hidden: 1.18 },
    confidenceByDomain: { tactical: 0.03, technical: 0.02, physical: -0.04, hidden: -0.05 },
    notes: ["Deep video can validate patterns and role timing, but it still cannot replace live contact and adaptation evidence."],
  },
};

export function getObservationContextTemplate(
  context: ObservationContext,
): Readonly<ContextTemplate> {
  return CONTEXT_TEMPLATES[context];
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function roundHundredth(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizedHash(seed: string): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return ((hash >>> 0) % 1000) / 1000;
}

function countSameSituation(
  observations: readonly Observation[],
  playerId: string,
  repetitionKey: string | undefined,
): number {
  if (!repetitionKey) return 0;
  return observations.filter(
    (observation) =>
      observation.playerId === playerId
      && observation.situation?.repetitionKey === repetitionKey,
  ).length;
}

function needsStructure(player: Pick<Player, "position" | "naturalRole">): boolean {
  return DEFENSIVE_OR_STRUCTURED_POSITIONS.has(player.position)
    || (player.naturalRole ? STRUCTURE_DEPENDENT_ROLES.has(player.naturalRole) : false);
}

function isLowStructureSituation(situation: ObservationSituationSnapshot | undefined): boolean {
  if (!situation) return false;
  return situation.tacticalFrame === "unstructured"
    || situation.tacticalFrame === "direct"
    || situation.competitionLevel === "community"
    || situation.competitionLevel === "school"
    || situation.contextTags.includes("limited-structure")
    || situation.contextTags.includes("uneven-opposition");
}

function cloneDomainRecord(
  source: Partial<Record<AttributeDomain, number>>,
): Partial<Record<AttributeDomain, number>> {
  return { ...source };
}

function mergeNotes(base: readonly string[], extra: readonly string[]): string[] {
  return [...new Set([...base, ...extra])];
}

export function deriveObservationContextResolution(
  input: ObservationContextResolutionInput,
): ObservationContextResolution {
  const template = CONTEXT_TEMPLATES[input.context];
  const playerObservations = input.existingObservations.filter(
    (observation) => observation.playerId === input.player.id,
  );
  const sameContextCount = playerObservations.filter(
    (observation) => observation.context === input.context,
  ).length;
  const sameSituationCount = countSameSituation(
    playerObservations,
    input.player.id,
    input.situation?.repetitionKey,
  );
  const changedContext = playerObservations.length > 0 && sameContextCount === 0;
  const lowStructure = isLowStructureSituation(input.situation);
  const structuredPlayer = needsStructure(input.player);

  const signalByDomain = cloneDomainRecord(template.signalByDomain);
  const noiseByDomain = cloneDomainRecord(template.noiseByDomain);
  const confidenceByDomain = cloneDomainRecord(template.confidenceByDomain);
  const priorityByDomain = cloneDomainRecord(template.priorityByDomain);
  let attributeBudgetDelta = template.attributeBudgetDelta;
  let attributeCap = template.attributeCap;
  let evidencePassBonus = changedContext ? 1 : 0;
  const notes = [...template.notes];

  if (changedContext) {
    attributeBudgetDelta += 1;
    notes.push("Changed context directly tests whether the first read holds up outside its original environment.");
    for (const domain of ["technical", "physical", "mental", "tactical"] as const) {
      confidenceByDomain[domain] = roundHundredth((confidenceByDomain[domain] ?? 0) + 0.02);
    }
  }

  if (sameContextCount > 0) {
    attributeBudgetDelta -= Math.min(2, sameContextCount);
    evidencePassBonus = Math.max(0, evidencePassBonus - 1);
    notes.push("Repeating the same context mostly sharpens known reads rather than answering a new scouting question.");
  }

  if (sameSituationCount > 0) {
    attributeBudgetDelta -= Math.min(2, sameSituationCount);
    attributeCap = Math.min(attributeCap ?? Number.POSITIVE_INFINITY, sameSituationCount >= 2 ? 2 : 4);
    for (const domain of ["technical", "physical", "mental", "tactical"] as const) {
      confidenceByDomain[domain] = roundHundredth((confidenceByDomain[domain] ?? 0) - 0.01 * sameSituationCount);
      noiseByDomain[domain] = roundHundredth((noiseByDomain[domain] ?? 1) + 0.04 * sameSituationCount);
    }
  }

  if (lowStructure && structuredPlayer) {
    signalByDomain.tactical = roundHundredth((signalByDomain.tactical ?? 1) * 0.78);
    signalByDomain.mental = roundHundredth((signalByDomain.mental ?? 1) * 0.92);
    noiseByDomain.tactical = roundHundredth((noiseByDomain.tactical ?? 1) * 1.1);
    confidenceByDomain.tactical = roundHundredth((confidenceByDomain.tactical ?? 0) - 0.04);
    notes.push("The football setting is too loose to trust a clean role-fit read for this kind of player.");
  }

  if (
    input.situation
    && (input.situation.competitionLevel === "community" || input.situation.competitionLevel === "school")
  ) {
    signalByDomain.physical = roundHundredth((signalByDomain.physical ?? 1) * 0.92);
    signalByDomain.tactical = roundHundredth((signalByDomain.tactical ?? 1) * 0.88);
    confidenceByDomain.physical = roundHundredth((confidenceByDomain.physical ?? 0) - 0.02);
    confidenceByDomain.tactical = roundHundredth((confidenceByDomain.tactical ?? 0) - 0.02);
    notes.push("Low-level opposition can flatter physical advantage and hide what translates upward.");
  }

  if (input.situation?.competitionLevel === "elite") {
    signalByDomain.mental = roundHundredth((signalByDomain.mental ?? 1) * 1.04);
    signalByDomain.tactical = roundHundredth((signalByDomain.tactical ?? 1) * 1.03);
    confidenceByDomain.mental = roundHundredth((confidenceByDomain.mental ?? 0) + 0.01);
  }

  const weakSignalRisk = clamp(
    template.weakSignalRisk
      + sameSituationCount * 0.12
      + Math.max(0, sameContextCount - sameSituationCount) * 0.05
      + (input.situation?.misleadingSignalRisk ?? 0) * 0.35
      + (lowStructure ? 0.05 : 0)
      - (changedContext ? 0.1 : 0),
    0,
    0.7,
  );
  const weakSignal = normalizedHash([
    input.context,
    input.player.id,
    input.situation?.id ?? "no-situation",
    sameContextCount,
    sameSituationCount,
  ].join(":")) < weakSignalRisk;

  if (weakSignal) {
    attributeBudgetDelta -= 1;
    attributeCap = Math.min(attributeCap ?? Number.POSITIVE_INFINITY, 2);
    for (const domain of ["technical", "physical", "mental", "tactical"] as const) {
      confidenceByDomain[domain] = roundHundredth((confidenceByDomain[domain] ?? 0) - 0.04);
      noiseByDomain[domain] = roundHundredth((noiseByDomain[domain] ?? 1) * 1.08);
    }
    notes.push("The sample never settled into a clean read, so only narrow evidence is safe to log.");
  }

  return {
    sameContextCount,
    sameSituationCount,
    changedContext,
    weakSignal,
    attributeBudgetDelta,
    attributeCap,
    evidencePassBonus,
    priorityByDomain,
    signalByDomain,
    noiseByDomain,
    confidenceByDomain,
    notes: mergeNotes([], notes),
  };
}

export function getContextResolutionDomainModifier(
  resolution: ObservationContextResolution,
  _attribute: PlayerAttribute,
  domain: AttributeDomain,
): {
  signalMultiplier: number;
  noiseMultiplier: number;
  confidenceDelta: number;
} {
  const signalMultiplier = clamp(resolution.signalByDomain[domain] ?? 1, 0.45, 1.4);
  const noiseMultiplier = clamp(
    (resolution.noiseByDomain[domain] ?? 1) / Math.sqrt(signalMultiplier),
    0.7,
    1.5,
  );
  const confidenceDelta = clamp(
    (resolution.confidenceByDomain[domain] ?? 0) + (signalMultiplier - 1) * 0.06,
    -0.12,
    0.12,
  );

  return {
    signalMultiplier: roundHundredth(signalMultiplier),
    noiseMultiplier: roundHundredth(noiseMultiplier),
    confidenceDelta: roundHundredth(confidenceDelta),
  };
}
