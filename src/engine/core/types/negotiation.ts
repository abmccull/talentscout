export interface EventChain {
  id: string;
  templateKey: string;
  startWeek: number;
  currentStep: number;
  maxSteps: number;
  resolved: boolean;
  choiceHistory: number[];
  context: Record<string, string>;
  nextStepWeek: number;
  eventIds: string[];
  awaitingChoice?: {
    eventId: string;
    stepIndex: number;
    terminal: boolean;
  };
}

export type ClubNegotiationPersonality =
  | "hardball"
  | "reasonable"
  | "desperate"
  | "prestige";

export interface NegotiationRound {
  roundNumber: number;
  offerAmount: number;
  askingAmount: number;
  addOns?: TransferAddOn[];
  response: "accepted" | "rejected" | "countered";
  week: number;
}

export interface TransferAddOn {
  type: "appearanceBonus" | "sellOnClause" | "performanceBonus" | "relegationClause";
  value: number;
  trigger?: string;
}

export interface RivalBid {
  clubId: string;
  amount: number;
  week: number;
  scoutName?: string;
}

export interface TransferNegotiation {
  id: string;
  playerId: string;
  fromClubId: string;
  toClubId: string;
  phase: "initial" | "counterOffer" | "finalOffer" | "completed" | "collapsed";
  rounds: NegotiationRound[];
  maxRounds: number;
  rivalBids: RivalBid[];
  deadline: number;
  deadlineSeason?: number;
  clubPersonality: ClubNegotiationPersonality;
  agentInvolved: boolean;
  agentDemands?: { wagePremium: number; signingBonus: number };
  initialAskingPrice: number;
  season: number;
  startWeek: number;
  isLoan?: boolean;
  loanDuration?: number;
  loanWageContribution?: number;
  loanBuyOption?: number;
  loanRecallClause?: boolean;
}
