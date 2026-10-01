/** Persisted club-season contracts, independent of world-history collection and retention. */
import type { ManagerProfile, ScoutingPhilosophy, TacticalStyle } from "@/engine/core/types";
import type { ClubRecruitmentDoctrine } from "./recruitmentIdentityTypes";

export type ClubLeagueMovement = "promoted" | "relegated" | "stayed";

export interface ClubSeasonStanding {
  position: number;
  tableSize: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

export interface ManagerSeasonIdentity {
  managerId: string;
  managerName: string;
  scoutingPreference: ManagerProfile["preference"];
  reportInfluence: number;
  preferredFormation: string;
}

export interface ClubSeasonHistory {
  clubId: string;
  leagueId: string;
  /** Present only when this league produced supported played results. */
  standing?: ClubSeasonStanding;
  /** Present only when the authoritative movement resolver ran this season. */
  leagueMovement?: ClubLeagueMovement;
  nextLeagueId?: string;
  reputation: number;
  budget: number;
  scoutingPhilosophy: ScoutingPhilosophy;
  /** Player-safe doctrine snapshot explains why this season's club acted differently. */
  recruitmentDoctrine?: Pick<
    ClubRecruitmentDoctrine,
    | "version"
    | "archetype"
    | "preferredSeniorAgeRange"
    | "evidencePreference"
    | "riskTolerance"
    | "geographicReach"
    | "adaptationTolerance"
    | "pathwayPatience"
    | "tacticalRoleRigidity"
    | "sellingPressure"
    | "managerInfluence"
    | "directorInfluence"
    | "seasonalObjective"
  >;
  tacticalStyle?: TacticalStyle;
  manager?: ManagerSeasonIdentity;
}
