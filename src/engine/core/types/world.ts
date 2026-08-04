import type { TacticalStyle } from "./player";

export type ScoutingPhilosophy =
  | "academyFirst"
  | "winNow"
  | "marketSmart"
  | "globalRecruiter";

export type ClubFinancialObligationType =
  | "loanWageContribution"
  | "appearanceBonus"
  | "performanceBonus"
  | "relegationClause"
  | "sellOnClause";

export interface ClubFinancialObligation {
  id: string;
  type: ClubFinancialObligationType;
  playerId: string;
  creditorClubId?: string;
  amount?: number;
  percentage?: number;
  weeklyAmount?: number;
  remainingWeeks?: number;
  createdWeek: number;
  createdSeason: number;
  status: "active" | "settled" | "expired";
  trigger?: string;
  triggeredWeek?: number;
  triggeredSeason?: number;
  lastProcessedWeek?: number;
  lastProcessedSeason?: number;
  appearanceThreshold?: number;
  goalThreshold?: number;
  assistThreshold?: number;
  appearancesRecorded?: number;
  goalsRecorded?: number;
  assistsRecorded?: number;
  lastTriggerEvaluationWeek?: number;
  lastTriggerEvaluationSeason?: number;
}

export interface Club {
  id: string;
  name: string;
  shortName: string;
  leagueId: string;
  reputation: number;
  budget: number;
  weeklyWageBudget?: number;
  scoutingBudget?: number;
  financialObligations?: ClubFinancialObligation[];
  scoutingPhilosophy: ScoutingPhilosophy;
  managerId: string;
  playerIds: string[];
  academyPlayerIds?: string[];
  youthAcademyRating: number;
  tacticalStyle?: TacticalStyle;
  loanedOutPlayerIds?: string[];
  loanedInPlayerIds?: string[];
}

export type LeagueCoverageTier = "full" | "abstract" | "contactOnly";

export interface League {
  id: string;
  name: string;
  shortName: string;
  country: string;
  tier: number;
  clubIds: string[];
  season: number;
  coverageTier?: LeagueCoverageTier;
}

export type Weather =
  | "clear"
  | "cloudy"
  | "rain"
  | "heavyRain"
  | "snow"
  | "windy";

export interface Fixture {
  id: string;
  homeClubId: string;
  awayClubId: string;
  leagueId: string;
  season?: number;
  week: number;
  played: boolean;
  homeGoals?: number;
  awayGoals?: number;
  attendance?: number;
  weather?: Weather;
  simulationDetail?: "full" | "abstract";
}

/** A single club's row in a league standings table. */
export interface StandingEntry {
  clubId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}
