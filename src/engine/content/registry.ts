/** Canonical list of shipped authored content packs. */

import { EVENT_TEMPLATE_CONTENT_PACK } from "@/engine/events/eventTemplates";
import { INSIGHT_NARRATIVE_CONTENT_PACK } from "@/engine/insight/actions";
import {
  INVESTIGATION_CONSEQUENCE_NARRATIVE_CONTENT_PACK,
} from "@/engine/observation/investigation";
import {
  OBSERVATION_ATMOSPHERE_EVENT_CONTENT_PACK,
} from "@/engine/observation/atmosphere";
import { SCENARIO_CONTENT_PACK } from "@/engine/scenarios/scenarioDefinitions";
import {
  getContentDefinitionIds,
  getContentEntry,
} from "./contracts";
import {
  GAME_MODE_CONTENT_PACK,
  type GameModeId,
} from "./modeDefinitions";

export const SHIPPED_CONTENT_PACKS = Object.freeze([
  EVENT_TEMPLATE_CONTENT_PACK,
  SCENARIO_CONTENT_PACK,
  GAME_MODE_CONTENT_PACK,
  INSIGHT_NARRATIVE_CONTENT_PACK,
  OBSERVATION_ATMOSPHERE_EVENT_CONTENT_PACK,
  INVESTIGATION_CONSEQUENCE_NARRATIVE_CONTENT_PACK,
]);

export function getShippedContentDefinitionIds(): string[] {
  return [
    ...getContentDefinitionIds(EVENT_TEMPLATE_CONTENT_PACK),
    ...getContentDefinitionIds(SCENARIO_CONTENT_PACK),
    ...getContentDefinitionIds(GAME_MODE_CONTENT_PACK),
    ...getContentDefinitionIds(INSIGHT_NARRATIVE_CONTENT_PACK),
    ...getContentDefinitionIds(OBSERVATION_ATMOSPHERE_EVENT_CONTENT_PACK),
    ...getContentDefinitionIds(INVESTIGATION_CONSEQUENCE_NARRATIVE_CONTENT_PACK),
  ];
}

/**
 * The immutable catalogue entries that can affect one specific career. This
 * deliberately excludes planned modes and inactive scenarios: roadmap copy
 * must not rewrite a live Youth Scout run fingerprint.
 */
export function getRunContentDefinitionIds(
  modeId: GameModeId,
  scenarioId?: string,
): string[] {
  const activeMode = getContentEntry(GAME_MODE_CONTENT_PACK, modeId);
  if (!activeMode) {
    throw new RangeError(`Unknown game mode content: ${modeId}`);
  }
  const activeScenario = scenarioId
    ? getContentEntry(SCENARIO_CONTENT_PACK, scenarioId)
    : undefined;
  if (scenarioId && !activeScenario) {
    throw new RangeError(`Unknown scenario content: ${scenarioId}`);
  }
  return [
    ...getContentDefinitionIds(EVENT_TEMPLATE_CONTENT_PACK),
    ...getContentDefinitionIds(INSIGHT_NARRATIVE_CONTENT_PACK),
    ...getContentDefinitionIds(OBSERVATION_ATMOSPHERE_EVENT_CONTENT_PACK),
    ...getContentDefinitionIds(INVESTIGATION_CONSEQUENCE_NARRATIVE_CONTENT_PACK),
    `${GAME_MODE_CONTENT_PACK.manifest.kind}:${GAME_MODE_CONTENT_PACK.getDefinitionId(activeMode)}@${GAME_MODE_CONTENT_PACK.manifest.contentVersion}`,
    ...(activeScenario
      ? [`${SCENARIO_CONTENT_PACK.manifest.kind}:${SCENARIO_CONTENT_PACK.getDefinitionId(activeScenario)}@${SCENARIO_CONTENT_PACK.manifest.contentVersion}`]
      : []),
  ];
}

export function getShippedContentPack(
  id: string,
): (typeof SHIPPED_CONTENT_PACKS)[number] | undefined {
  return SHIPPED_CONTENT_PACKS.find((pack) => pack.manifest.id === id);
}
