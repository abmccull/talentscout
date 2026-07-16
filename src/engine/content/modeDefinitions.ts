/**
 * Declarative game-mode catalogue.
 *
 * These entries describe the immutable career-mode identity planned for the
 * V2 run manifest. They do not make a future mode playable by themselves;
 * new-game availability must still be controlled by the mode capability
 * boundary when the corresponding engine exists.
 */

import type { GameModeId, Specialization } from "@/engine/core/types";
import {
  CONTENT_SCHEMA_VERSION,
  defineContentPack,
  getContentEntry,
  hasNonBlankString,
  type ContentValidationIssue,
} from "./contracts";

export type { GameModeId } from "@/engine/core/types";

export type GameModeStatus = "available" | "internal" | "planned";

const GAME_MODE_ID_BY_SPECIALIZATION: Record<Specialization, GameModeId> = {
  youth: "youth-scout",
  firstTeam: "first-team-scout",
  regional: "regional-expert",
  data: "data-scout",
};

const GAME_MODE_STATUSES = new Set<GameModeStatus>([
  "available",
  "internal",
  "planned",
]);

export interface GameModeDefinition {
  id: GameModeId;
  modeDefinitionVersion: number;
  status: GameModeStatus;
  name: string;
  role: string;
  fantasy: string;
  differentiators: readonly string[];
  defaultPrimarySpecialization: Specialization;
  requiredCapabilities: readonly string[];
  workspaceIds: readonly string[];
  activityIds: readonly string[];
  reportSchemaId: string;
}

const MODE_DEFINITION_ENTRIES: readonly GameModeDefinition[] = [
  {
    id: "youth-scout",
    modeDefinitionVersion: 1,
    status: "available",
    name: "Youth Scout",
    role: "Discover potential before certainty exists",
    fantasy:
      "Find unsigned and academy prospects early, separate flashes from repeatable qualities, persuade decision-makers, and live with the player careers your reports helped create.",
    differentiators: [
      "Development projection and incomplete evidence",
      "Family, academy, access, and placement relationships",
      "Multi-season accountability for potential, fit, timing, and conviction",
    ],
    defaultPrimarySpecialization: "youth",
    requiredCapabilities: [
      "prospect-discovery",
      "contextual-observation",
      "placement-reporting",
      "longitudinal-accountability",
    ],
    workspaceIds: ["desk", "planner", "core", "artifacts", "world", "career"],
    activityIds: ["observation", "contact-intel", "reflection", "placement-report"],
    reportSchemaId: "youth-placement-report.v1",
  },
  {
    id: "first-team-scout",
    modeDefinitionVersion: 1,
    status: "planned",
    name: "First Team Scout",
    role: "Solve immediate recruitment problems",
    fantasy:
      "Work from urgent club briefs, judge tactical and dressing-room fit, compare attainable targets, and defend recommendations under transfer-window pressure.",
    differentiators: [
      "Role, system, squad, price, and deadline fit",
      "Manager and sporting-director politics",
      "Faster feedback with higher financial and reputational exposure",
    ],
    defaultPrimarySpecialization: "firstTeam",
    requiredCapabilities: [
      "recruitment-briefs",
      "tactical-fit",
      "transfer-window-accountability",
      "stakeholder-committee",
    ],
    workspaceIds: ["desk", "planner", "core", "artifacts", "world", "career"],
    activityIds: ["brief-analysis", "target-comparison", "live-observation", "committee-report"],
    reportSchemaId: "first-team-recruitment-report.v1",
  },
  {
    id: "regional-expert",
    modeDefinitionVersion: 1,
    status: "planned",
    name: "Regional Expert",
    role: "Turn local knowledge into an unfair advantage",
    fantasy:
      "Build a trusted presence across territories, understand competition and culture, earn difficult access, and recognize talent that visiting scouts misread.",
    differentiators: [
      "Persistent regional knowledge and presence",
      "Travel, language, culture, contacts, and access tradeoffs",
      "Territory competition and geographically distinct talent markets",
    ],
    defaultPrimarySpecialization: "regional",
    requiredCapabilities: [
      "regional-knowledge",
      "itinerary-travel",
      "local-access",
      "territory-market-intelligence",
    ],
    workspaceIds: ["desk", "planner", "core", "artifacts", "world", "career"],
    activityIds: ["route-planning", "local-observation", "relationship-work", "market-report"],
    reportSchemaId: "regional-intelligence-report.v1",
  },
  {
    id: "data-scout",
    modeDefinitionVersion: 1,
    status: "planned",
    name: "Data Scout",
    role: "Find signal in noisy football evidence",
    fantasy:
      "Build and challenge models, identify statistical anomalies, account for league and role context, and know when the numbers demand live verification.",
    differentiators: [
      "Models, samples, uncertainty, and competition adjustments",
      "Analyst workflows and evidence conflicts",
      "Data-led discovery followed by accountable human interpretation",
    ],
    defaultPrimarySpecialization: "data",
    requiredCapabilities: [
      "data-provider-access",
      "model-validation",
      "anomaly-investigation",
      "evidence-conflict-resolution",
    ],
    workspaceIds: ["desk", "planner", "core", "artifacts", "world", "career"],
    activityIds: ["query-design", "model-run", "video-validation", "analytical-report"],
    reportSchemaId: "data-scout-report.v1",
  },
];

function validateModeDefinition(
  definition: GameModeDefinition,
): readonly Omit<ContentValidationIssue, "packId" | "definitionId">[] {
  const issues: Array<Omit<ContentValidationIssue, "packId" | "definitionId">> = [];
  if (!Number.isInteger(definition.modeDefinitionVersion) || definition.modeDefinitionVersion < 1) {
    issues.push({ path: "modeDefinitionVersion", message: "must be a positive integer" });
  }
  if (!GAME_MODE_STATUSES.has(definition.status)) {
    issues.push({ path: "status", message: "must be a supported mode status" });
  }
  for (const [path, value] of [
    ["name", definition.name],
    ["role", definition.role],
    ["fantasy", definition.fantasy],
    ["reportSchemaId", definition.reportSchemaId],
  ] as const) {
    if (!hasNonBlankString(value)) {
      issues.push({ path, message: "must be a non-empty string" });
    }
  }
  if (definition.differentiators.length < 3 || definition.differentiators.some((value) => !hasNonBlankString(value))) {
    issues.push({ path: "differentiators", message: "must contain at least three non-empty player-facing distinctions" });
  }
  for (const [path, values] of [
    ["requiredCapabilities", definition.requiredCapabilities],
    ["workspaceIds", definition.workspaceIds],
    ["activityIds", definition.activityIds],
  ] as const) {
    if (values.length === 0 || values.some((value) => !hasNonBlankString(value))) {
      issues.push({ path, message: "must contain at least one non-empty identifier" });
    }
  }
  return issues;
}

export const GAME_MODE_CONTENT_PACK = defineContentPack({
  manifest: {
    id: "talentscout.game-modes",
    kind: "game-mode",
    schemaVersion: CONTENT_SCHEMA_VERSION,
    contentVersion: "modes.1",
  },
  entries: MODE_DEFINITION_ENTRIES,
  getDefinitionId: (mode) => mode.id,
  validateDefinition: validateModeDefinition,
});

export const MODE_DEFINITIONS = GAME_MODE_CONTENT_PACK.entries;

export function getGameModeDefinition(id: string): GameModeDefinition | undefined {
  return getContentEntry(GAME_MODE_CONTENT_PACK, id);
}

/** Stable bridge from the simulation specialization to its authored mode. */
export function getGameModeIdForSpecialization(
  specialization: Specialization,
): GameModeId {
  return GAME_MODE_ID_BY_SPECIALIZATION[specialization];
}
