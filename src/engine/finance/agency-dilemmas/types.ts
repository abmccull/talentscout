import type {
  GameState,
  GameDate,
  FinancialRecord,
  ClientRelationship,
  AgencyEmployee,
} from "@/engine/core/types";
import type { ConsequenceEffect, DecisionOption, EntityRef } from "@/engine/consequences";
import type { StoryCandidateV2 } from "@/engine/events/storyDirectorV2";

export type AgencyDilemmaId =
  | "clientConcentration"
  | "staffQualityDeadline"
  | "regionalCommitment"
  | "capitalCrossroads";

export interface AgencyDilemmaOptionDefinition {
  id: string;
  label: string;
  knownTradeoffs: string[];
  immediateEffects: readonly ConsequenceEffect[];
  scheduledConsequences: DecisionOption["scheduledConsequences"];
}

export interface AgencyDilemmaContext {
  id: AgencyDilemmaId;
  title: string;
  premise: string;
  pressureScore: number;
  semanticSignature: string;
  policyFocusRegionId?: string;
  anchorClientId?: string;
  alternateClientIds: string[];
  deputyEmployeeId?: string;
  regionId?: string;
  focusRegionId?: string;
  targetClubId?: string;
  cast: EntityRef[];
  topics: EntityRef[];
  options: AgencyDilemmaOptionDefinition[];
}

export interface PreparedAgencyDilemmaCandidate {
  candidate: StoryCandidateV2;
  context: AgencyDilemmaContext;
}

export interface AgencyDilemmaPreparationResult {
  prepared?: PreparedAgencyDilemmaCandidate;
  blockedReason?:
    | "wrong-path"
    | "insufficient-context"
    | "cooldown"
    | "open-decision"
    | "no-eligible-dilemma"
    | "trigger-missed";
}

export interface AgencyDilemmaDirectionResult {
  state: GameState;
  offeredDecisionId?: string;
  blockedReason?: AgencyDilemmaPreparationResult["blockedReason"] | "registration-failed";
}

export const AGENCY_DILEMMA_COOLDOWN_WEEKS = 8;
export const AGENCY_DILEMMA_TRIGGER_CHANCE = 0.5;

export interface AgencyDilemmaPreparedInput {
  state: GameState;
  triggerChance?: number;
  forceTrigger?: boolean;
}

export type AgencyDilemmaFinances = FinancialRecord;
export type AgencyDilemmaClient = ClientRelationship;
export type AgencyDilemmaEmployee = AgencyEmployee;
