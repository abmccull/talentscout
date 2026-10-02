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

/** Presence-mask archive retains optional null values before normalization. */
export interface CompactTerminalObligationV1 {
  id: string;
  obligationArchiveV1: [presenceMask: number, ...values: (string | number | null)[]];
}
/** Undefined bits consume no payload column and restore ordinary own data fields. */
export interface CompactTerminalObligationV2 {
  id: string;
  obligationArchiveV2: [presenceMask: number, undefinedMask: number, ...values: (string | number | null)[]];
}
export type StoredClubFinancialObligation = ClubFinancialObligation | CompactTerminalObligationV1 | CompactTerminalObligationV2;
export type FinancialObligationsStored = StoredClubFinancialObligation[];

export interface Club {
  id: string;
  name: string;
  shortName: string;
  leagueId: string;
  reputation: number;
  budget: number;
  /** Latest annual board transfer allocation; also prevents duplicate awards. */
  recruitmentAllocation?: { season: number; amount: number; budgetBefore: number; budgetAfter: number };
  weeklyWageBudget?: number;
  scoutingBudget?: number;
  financialObligations?: FinancialObligationsStored;
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
