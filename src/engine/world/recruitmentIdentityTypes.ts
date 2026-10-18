/** Shared recruitment contracts; this module does not depend on simulation implementations. */
import type { ScoutingPhilosophy, Specialization, YouthBriefPriority } from "@/engine/core/types";
import type {
  ClubRecruitmentExpressionId,
  RecruitmentEvidencePreference,
  RecruitmentReach,
  RecruitmentRiskTolerance,
} from "./recruitmentDoctrineCatalog";

type RecruitmentFocus = YouthBriefPriority;

export type ClubRecruitmentArchetype =
  | "academyBuilder"
  | "immediateImpact"
  | "valueTrader"
  | "crossBorderNetwork";

/**
 * One authoritative, player-safe description of how a club recruits.
 *
 * Numeric traits are 0-100 and intentionally derive only from visible club,
 * manager, region, season, and run-seed facts. Consumers must not recreate
 * philosophy switches of their own; this contract keeps briefs, market bids,
 * tactical fit, development patience, and career affinity explainable.
 */
export interface ClubRecruitmentDoctrine {
  version: 1;
  clubId: string;
  family: ScoutingPhilosophy;
  archetype: ClubRecruitmentArchetype;
  expressionId: ClubRecruitmentExpressionId;
  expressionLabel: string;
  preferredSeniorAgeRange: [number, number];
  academyIntakeAgeRange: [number, number];
  evidencePreference: RecruitmentEvidencePreference;
  riskTolerance: RecruitmentRiskTolerance;
  geographicReach: RecruitmentReach;
  adaptationTolerance: number;
  pathwayPatience: number;
  tacticalRoleRigidity: number;
  sellingPressure: number;
  managerInfluence: number;
  directorInfluence: number;
  minimumEvidenceQuality: number;
  seasonalObjective: RecruitmentFocus;
  specializationAffinity: Specialization[];
  reasons: string[];
}

export interface HistoricalRecruitmentDoctrineSnapshot extends ClubRecruitmentDoctrine {
  snapshotVersion: 1;
  capturedWeek: number;
  capturedSeason: number;
  primaryFocus: RecruitmentFocus;
}
