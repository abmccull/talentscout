import type {
  AttributeDomain,
  Observation,
  ObservationContext,
  Player,
  PlayerRole,
} from "@/engine/core/types";
import { getObservationContextTemplate } from "@/engine/observation/contextResolution";
import { rankNextObservationContexts } from "@/engine/observation/informationGain";

export type ObservationObjectiveFamily =
  | "role"
  | "pathway"
  | "personality"
  | "readiness"
  | "upside";

export interface ObservationObjective {
  id: string;
  family: ObservationObjectiveFamily;
  prompt: string;
  existingContexts: ObservationContext[];
  existingObservations: Observation[];
  targetDomains: AttributeDomain[];
  comparisonPrompt?: string;
  playerId: string;
  playerPosition?: Player["position"];
  preferredRole?: PlayerRole;
}

export interface ObservationContextRanking {
  context: ObservationContext;
  score: number;
  confidence: "strong" | "useful" | "weak";
  reason: string;
  repeated: boolean;
}

const ALL_CONTEXTS: ObservationContext[] = [
  "schoolMatch",
  "grassrootsTournament",
  "streetFootball",
  "academyTrialDay",
  "youthFestival",
  "academyVisit",
  "youthTournament",
  "liveMatch",
  "reserveMatch",
  "trainingGround",
  "trialMatch",
  "followUpSession",
  "parentCoachMeeting",
  "videoAnalysis",
  "databaseQuery",
  "deepVideoAnalysis",
  "oppositionAnalysis",
  "agentShowcase",
  "statsBriefing",
];

const FAMILY_TARGET_DOMAINS: Record<ObservationObjectiveFamily, AttributeDomain[]> = {
  role: ["technical", "tactical"],
  pathway: ["mental", "hidden"],
  personality: ["mental", "hidden"],
  readiness: ["technical", "physical", "mental", "tactical"],
  upside: ["technical", "physical", "mental"],
};

const STRUCTURED_ROLES = new Set<PlayerRole>([
  "sweeper",
  "ballPlayingDefender",
  "libero",
  "invertedFullBack",
  "halfBack",
  "deepLyingPlaymaker",
  "advancedPlaymaker",
  "carrilero",
  "enganche",
  "trequartista",
]);

const TRANSITION_ROLES = new Set<PlayerRole>([
  "wingBack",
  "boxToBox",
  "shadowStriker",
  "winger",
  "invertedWinger",
  "insideForward",
  "advancedForward",
  "pressingForward",
]);

function round(value: number): number {
  return Math.round(value);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function syntheticObservation(
  playerId: string,
  context: ObservationContext,
  index: number,
): Observation {
  return {
    id: `objective-context-${index}-${context}`,
    playerId,
    scoutId: "objective-scout",
    week: 0,
    season: 0,
    context,
    attributeReadings: [],
    notes: [],
    flaggedMoments: [],
  };
}

function roleContextAdjustment(
  objective: ObservationObjective,
  context: ObservationContext,
): number {
  let adjustment = 0;
  const position = objective.playerPosition;
  const role = objective.preferredRole;

  if (position === "GK") {
    if (context === "trainingGround") adjustment += 8;
    if (context === "trialMatch" || context === "deepVideoAnalysis") adjustment += 5;
    if (context === "streetFootball" || context === "schoolMatch") adjustment -= 8;
  } else if (["CB", "LB", "RB", "CDM"].includes(position ?? "")) {
    if (context === "trainingGround" || context === "reserveMatch" || context === "oppositionAnalysis") {
      adjustment += 6;
    }
  } else if (["CM", "CAM"].includes(position ?? "")) {
    if (context === "trainingGround") adjustment += 5;
    if (context === "oppositionAnalysis" || context === "deepVideoAnalysis") adjustment += 4;
  } else if (["LW", "RW", "ST"].includes(position ?? "")) {
    if (context === "liveMatch" || context === "trialMatch") adjustment += 5;
    if (context === "deepVideoAnalysis") adjustment += 3;
  }

  if (role && STRUCTURED_ROLES.has(role)) {
    if (context === "trainingGround" || context === "trialMatch" || context === "academyTrialDay") {
      adjustment += 7;
    }
    if (context === "streetFootball" || context === "grassrootsTournament" || context === "agentShowcase") {
      adjustment -= 6;
    }
  }
  if (role && TRANSITION_ROLES.has(role)) {
    if (context === "liveMatch" || context === "reserveMatch" || context === "youthTournament") {
      adjustment += 4;
    }
  }

  return adjustment;
}

function roleContextReason(
  objective: ObservationObjective,
  adjustment: number,
): string {
  if (!objective.playerPosition && !objective.preferredRole) return "";
  const roleLabel = objective.preferredRole
    ? objective.preferredRole.replace(/([A-Z])/g, " $1").toLowerCase()
    : `${objective.playerPosition} usage`;
  if (adjustment > 0) {
    return ` It isolates ${roleLabel} more cleanly than a generic watch would.`;
  }
  if (adjustment < 0) {
    return ` It is a noisy environment for judging ${roleLabel}, so any conclusion should stay provisional.`;
  }
  return ` It adds context, but does not isolate ${roleLabel} especially well.`;
}

function observationContexts(
  objective: ObservationObjective,
  existingContexts: ObservationContext[],
): Observation[] {
  if (objective.existingObservations.length > 0) return objective.existingObservations;
  return existingContexts.map((context, index) =>
    syntheticObservation(objective.playerId, context, index));
}

function contextPriorityBoost(
  objective: ObservationObjective,
  context: ObservationContext,
): number {
  const template = getObservationContextTemplate(context);
  if (objective.targetDomains.length === 0) return 0;
  const domainPriority = objective.targetDomains.reduce((sum, domain) =>
    sum + (template.priorityByDomain[domain] ?? 0.45), 0) / objective.targetDomains.length;
  return (domainPriority - 0.75) * 18;
}

function objectiveReason(
  objective: ObservationObjective,
  context: ObservationContext,
  reasons: readonly string[],
  roleAdjustment: number,
): string {
  const template = getObservationContextTemplate(context);
  const primaryReason = template.notes[0] ?? "This context changes the evidence mix.";
  return `${primaryReason} ${reasons.join(" ")}${roleContextReason(objective, roleAdjustment)}`.trim();
}

export function deriveObservationObjectiveTargetDomains(
  family: ObservationObjectiveFamily,
): AttributeDomain[] {
  return [...FAMILY_TARGET_DOMAINS[family]];
}

export function deriveObservationObjective(input: {
  id: string;
  family: ObservationObjectiveFamily;
  prompt: string;
  existingContexts?: ObservationContext[];
  existingObservations?: Observation[];
  playerId?: string;
  player?: Pick<Player, "position" | "secondaryPositions"> & { id?: string };
  preferredRole?: PlayerRole;
  targetDomains?: AttributeDomain[];
}): ObservationObjective {
  const existingObservations = input.existingObservations ?? [];
  const existingContexts = input.existingContexts
    ?? existingObservations.map((observation) => observation.context);
  const playerDescriptor = input.player
    ? `${input.player.position}${input.player.secondaryPositions.length > 0 ? `/${input.player.secondaryPositions.join("/")}` : ""}`
    : undefined;
  const playerId = input.player?.id
    ?? input.playerId
    ?? existingObservations[0]?.playerId
    ?? "observation-objective-player";

  return {
    id: input.id,
    family: input.family,
    prompt: input.preferredRole && playerDescriptor
      ? `${input.prompt} Test it through the lens of ${input.preferredRole} usage for a ${playerDescriptor} player.`
      : input.prompt,
    existingContexts,
    existingObservations,
    targetDomains: [...new Set(input.targetDomains ?? deriveObservationObjectiveTargetDomains(input.family))],
    playerId,
    playerPosition: input.player?.position,
    preferredRole: input.preferredRole,
    comparisonPrompt: existingContexts.length >= 1
      ? `Compare the next context against ${existingContexts[existingContexts.length - 1]}: what changed, what held up, and what became unsafe to assume?`
      : undefined,
  };
}

export function rankObservationContextsForObjective(
  objective: ObservationObjective,
  existingContexts: ObservationContext[] = objective.existingContexts,
): ObservationContextRanking[] {
  const ranked = rankNextObservationContexts({
    observations: observationContexts(objective, existingContexts),
    playerId: objective.playerId,
    candidateContexts: ALL_CONTEXTS,
    targetDomains: objective.targetDomains,
  });

  return ranked
    .map<ObservationContextRanking>((entry) => {
      const roleAdjustment = roleContextAdjustment(objective, entry.context);
      const domainBoost = contextPriorityBoost(objective, entry.context);
      const score = clamp(
        round(entry.score * 0.72 + domainBoost + roleAdjustment),
        0,
        100,
      );
      return {
        context: entry.context,
        score,
        confidence: score >= 78 ? "strong" : score >= 52 ? "useful" : "weak",
        reason: objectiveReason(objective, entry.context, entry.reasons, roleAdjustment),
        repeated: entry.rawSameContextObservations > 0,
      };
    })
    .sort((left, right) => right.score - left.score || left.context.localeCompare(right.context));
}

export function summarizeObservationComparison(
  objective: ObservationObjective,
  previousContext: ObservationContext,
  nextContext: ObservationContext,
): string {
  return `For ${objective.family} evidence, compare ${previousContext} with ${nextContext}: which conclusion survives the change in stakes, structure, and support?`;
}
