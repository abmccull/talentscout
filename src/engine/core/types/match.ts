import type {
  MatchEventType,
  PlayerAttribute,
  TacticalIdentity,
} from "./player";

export type MatchPhaseType =
  | "buildUp"
  | "transition"
  | "setpiece"
  | "pressingSequence"
  | "counterAttack"
  | "possession";

export interface MatchEvent {
  minute: number;
  description: string;
  playerId: string;
  type: MatchEventType;
  quality: number;
  attributesRevealed: PlayerAttribute[];
}

export type SetPieceVariant = "corner" | "freeKick" | "penalty" | "throwIn";

export interface MatchPhase {
  minute: number;
  type: MatchPhaseType;
  description: string;
  involvedPlayerIds: string[];
  events: MatchEvent[];
  observableAttributes: PlayerAttribute[];
  momentum?: { home: number; away: number };
  setPieceVariant?: SetPieceVariant;
}

export interface TacticalMatchup {
  homeStyle: TacticalIdentity;
  awayStyle: TacticalIdentity;
  homeModifier: number;
  awayModifier: number;
  eventShift: Partial<Record<MatchEventType, number>>;
}

export interface MatchSubstitution {
  minute: number;
  playerOutId: string;
  playerInId: string;
  tacticalReason: "injury" | "tactical" | "fatigue" | "redCard";
}

export interface SeasonAward {
  id: string;
  name: string;
  description: string;
  criteria: string;
  tier: "gold" | "silver" | "bronze";
}

export interface LeagueAward {
  id: string;
  name: string;
  description: string;
  relatedPlayerId?: string;
  stat: string;
}

export interface SeasonAwardsData {
  season: number;
  clubName: string;
  scoutAwards: SeasonAward[];
  leagueAwards: LeagueAward[];
  stats: SeasonStats;
}

export interface SeasonStats {
  reportsSubmitted: number;
  avgReportQuality: number;
  matchesAttended: number;
  playersDiscovered: number;
  highUpsideCalls?: number;
  wonderkidsDiscovered?: number;
  transferRecommendations: number;
  recommendationsAccepted: number;
  recommendationsSigned: number;
  hitRate: number;
  reputationStart: number;
  reputationEnd: number;
  reputationChange: number;
  income: number;
  expenses: number;
  profitLoss: number;
  countriesScouted: number;
  avgFatigue: number;
}
