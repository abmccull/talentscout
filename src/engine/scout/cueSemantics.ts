import type { EvidenceClassificationId, PlayerAttribute, ScoutCueReading } from "@/engine/core/types";
import { FOOTBALL_ACTIONS } from "@/engine/observation/footballActions";

interface SemanticEvidenceSource {
  actionId?: string;
  attributesHinted: readonly PlayerAttribute[];
  pressureContext: boolean;
}

const actionById = new Map(FOOTBALL_ACTIONS.map((action) => [action.id, action]));
const technical = new Set<PlayerAttribute>(["passing", "firstTouch", "dribbling", "crossing", "shooting", "finishing", "heading", "tackling"]);
const physical = new Set<PlayerAttribute>(["pace", "strength", "stamina", "agility", "jumping", "balance"]);
const offBall = new Set<PlayerAttribute>(["offTheBall", "positioning"]);
const defensive = new Set<PlayerAttribute>(["pressing", "marking", "defensiveAwareness"]);

/** Event semantics cannot be supplied by a scouting question or an old selected option. */
export function getSupportedMomentClassifications(source: SemanticEvidenceSource): EvidenceClassificationId[] {
  if (!Array.isArray(source.attributesHinted) || source.attributesHinted.length === 0) return ["noConclusion"];
  if (source.actionId !== undefined) {
    const action = actionById.get(source.actionId);
    if (!action || (action.requiresPressure && !source.pressureContext)
      || source.attributesHinted.some((attribute) => !action.attributes.includes(attribute))) return ["noConclusion"];
    return [...new Set<EvidenceClassificationId>([...action.classifications, "noConclusion"])];
  }
  // Old passages can support only what their retained contributors establish.
  // Timing before reception, repeated output, and anomaly require explicit
  // action semantics; neither a broad moment type nor prose parsing invents them.
  const supported: EvidenceClassificationId[] = [];
  if (source.attributesHinted.some((attribute) => technical.has(attribute))) supported.push("technicalExecution");
  if (source.attributesHinted.some((attribute) => physical.has(attribute))) supported.push("physicalExecution");
  if (source.attributesHinted.some((attribute) => defensive.has(attribute))) supported.push("defensiveReading");
  if (source.attributesHinted.some((attribute) => offBall.has(attribute))) supported.push("offBallMovement");
  if (source.attributesHinted.includes("decisionMaking")) supported.push("decisionMaking");
  if (source.pressureContext && source.attributesHinted.includes("composure")) supported.push("pressureResponse");
  return [...supported, "noConclusion"];
}

export function getSupportedCueClassifications(cue: Pick<ScoutCueReading,
  "actionId" | "attributesHinted" | "pressureContext" | "clarity">): EvidenceClassificationId[] {
  return cue.clarity === "glimpse" || cue.clarity === "missed"
    ? ["noConclusion"] : getSupportedMomentClassifications(cue);
}
