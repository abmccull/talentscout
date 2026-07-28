import type { Position } from "./player";

/**
 * Tracks a player discovered by the scout across seasons.
 */
export interface DiscoveryRecord {
  playerId: string;
  discoveredWeek: number;
  discoveredSeason: number;
  initialCA: number;
  initialPA?: number;
  careerSnapshots: CareerSnapshot[];
  wasWonderkid: boolean;
  predictionAccuracy?: number;
  placementClubId?: string;
  placementType?: "academyIntake" | "youthContract";
  placementWeek?: number;
  placementSeason?: number;
  careerOutcome?: "starPlayer" | "squadPlayer" | "released" | "retired";
}

export interface CareerSnapshot {
  season: number;
  clubId: string;
  currentAbility: number;
  position: Position;
  age: number;
}

export interface LeaderboardEntry {
  id: string;
  scoutName: string;
  score: number;
  season: number;
  reputation: number;
  totalDiscoveries: number;
  predictionAccuracy: number;
  submittedAt: number;
}
