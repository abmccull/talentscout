import type {
  AlumniMilestone,
  AlumniRecord,
  AttributeDeltas,
  BoardDirective,
  BoardProfile,
  BoardReaction,
  BoardSatisfactionDelta,
  CardEvent,
  Contact,
  CulturalInsight,
  DisciplinaryRecord,
  Fixture,
  FreeAgent,
  FreeAgentNegotiation,
  FreeAgentPool,
  GameState,
  GutFeeling,
  InboxMessage,
  Injury,
  LoanDeal,
  LoanOutcome,
  LoanRecommendation,
  NPCScout,
  NPCScoutReport,
  Player,
  PlayerAttribute,
  PlayerMatchRating,
  RegionalKnowledge,
  TransferAddOn,
  TransferNegotiation,
  UnsignedYouth,
  Weather,
} from "../types";
import type { PlayerDevelopmentEnvironmentProjection } from "../../world/developmentEnvironment";
import type { RelegationResult } from "../../world/relegation";

export interface Transfer {
  playerId: string;
  fromClubId: string;
  toClubId: string;
  fee: number;
  wage?: number;
  contractLength?: number;
  signingBonus?: number;
  addOns?: TransferAddOn[];
  contingentReserve?: number;
  agreedRole?: "key" | "regular" | "rotation" | "prospect";
  week: number;
  season: number;
}

export interface PlayerDevelopmentResult {
  playerId: string;
  changes: AttributeDeltas;
  abilityChange: number;
  environment?: PlayerDevelopmentEnvironmentProjection;
}

export interface InjuryResult {
  playerId: string;
  weeksOut: number;
  injury: Injury;
}

export interface BreakthroughResult {
  playerId: string;
  changes: AttributeDeltas;
  abilityChange: number;
  improvedAttributes: PlayerAttribute[];
  environment?: PlayerDevelopmentEnvironmentProjection;
}

export interface InjurySetbackResult {
  playerId: string;
  changes: AttributeDeltas;
  environment?: PlayerDevelopmentEnvironmentProjection;
}

export interface SimulatedFixture extends Fixture {
  played: true;
  homeGoals: number;
  awayGoals: number;
  attendance: number;
  weather: Weather;
  scorers?: Array<{ playerId: string; minute: number }>;
  playerRatings?: Record<string, PlayerMatchRating>;
}

export interface HistoricalWorldMatchState {
  fixtures: GameState["fixtures"];
  players: GameState["players"];
  matchRatings: GameState["matchRatings"];
  disciplinaryRecords: NonNullable<GameState["disciplinaryRecords"]>;
}

export interface NPCScoutWeekResult {
  npcScoutId: string;
  updatedNPCScout: NPCScout;
  reportsGenerated: NPCScoutReport[];
}

export interface BoardDirectiveEvaluationResult {
  completed: BoardDirective[];
  failed: BoardDirective[];
  reputationChange: number;
}

export interface FormMomentumUpdate {
  playerId: string;
  formMomentum: number;
  formTrend: "rising" | "stable" | "falling";
  formLockWeeks: number;
  form: number;
}

export interface TickResult {
  fixturesPlayed: SimulatedFixture[];
  standingsUpdated: boolean;
  playerDevelopment: PlayerDevelopmentResult[];
  unsignedYouthDevelopment: PlayerDevelopmentResult[];
  breakthroughs: BreakthroughResult[];
  transfers: Transfer[];
  injuries: InjuryResult[];
  newMessages: InboxMessage[];
  reputationChange: number;
  injurySetbacks: InjurySetbackResult[];
  endOfSeasonTriggered: boolean;
  npcScoutResults: NPCScoutWeekResult[];
  boardDirectiveResult?: BoardDirectiveEvaluationResult;
  formMomentumUpdates: FormMomentumUpdate[];
  satisfactionDeltas: BoardSatisfactionDelta[];
  youthAgingResult?: {
    autoSigned: Array<{ youthId: string; clubId: string }>;
    retired: string[];
    updatedUnsignedYouth: Record<string, UnsignedYouth>;
  };
  playerRetirements?: {
    retiredPlayerIds: string[];
    outlooks: Record<string, NonNullable<Player["retirementOutlook"]>>;
  };
  newUnsignedYouth?: UnsignedYouth[];
  newAcademyIntake?: Player[];
  alumniMilestones?: AlumniMilestone[];
  alumniRecords?: AlumniRecord[];
  gutFeelings?: GutFeeling[];
  regionalKnowledgeResult?: {
    regionalKnowledge: Record<string, RegionalKnowledge>;
    newDiscoveries: Array<{ countryId: string; leagueId: string; leagueName: string }>;
    newInsights: Array<{ countryId: string; insight: CulturalInsight }>;
    newContacts: Array<{ countryId: string; contactId: string; contact: Contact }>;
  };
  seasonEventState?: GameState;
  satisfiedAchievementIds?: string[];
  cardEvents?: CardEvent[];
  updatedDisciplinaryRecords?: Record<string, DisciplinaryRecord>;
  suspensionNotifications?: Array<{ playerId: string; weeks: number; reason: string }>;
  alumniContactPromotions?: Array<{ alumniId: string; contact: Contact }>;
  updatedNegotiations?: TransferNegotiation[];
  updatedFreeAgentNegotiations?: FreeAgentNegotiation[];
  updatedContacts?: Record<string, Contact>;
  accessAgreements?: NonNullable<GameState["accessAgreements"]>;
  boardReactions?: BoardReaction[];
  updatedBoardProfile?: BoardProfile;
  relegationResult?: RelegationResult;
  updatedFreeAgentPool?: FreeAgentPool;
  freeAgentNPCSignings?: Array<{
    playerId: string;
    clubId: string;
    wage: number;
    signingBonus: number;
    contractLength: number;
  }>;
  freeAgentRemovedPlayerIds?: string[];
  midSeasonReleases?: FreeAgent[];
  contractExpiryResult?: {
    renewals: Array<{
      playerId: string;
      clubId: string;
      contractLength: number;
      wage: number;
    }>;
    releasedPlayers: FreeAgent[];
  };
  loanDeals?: LoanDeal[];
  loanReturns?: LoanDeal[];
  loanRecalls?: LoanDeal[];
  updatedActiveLoans?: LoanDeal[];
  updatedLoanRecommendations?: LoanRecommendation[];
  loanOutcomeXp?: number;
}

export type { LoanOutcome };
