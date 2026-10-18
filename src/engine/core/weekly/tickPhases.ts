import { processWeeklyGossip } from "../../network/gossip";
import { processWeeklyReferrals } from "../../network/referrals";
import { processWeeklyContactDecay } from "../../network/contacts";
import {
  processWeeklyAccessAgreements,
  revokeAccessAgreements,
} from "../../consequences/accessAgreements";
import {
  processAILoanDeals,
  processLoanPerformance,
  processLoanRecalls,
  processLoanReturns,
} from "../../world/loans";
import { evaluatePlayerDevelopmentEnvironment } from "../../world/developmentEnvironment";
import { getSeasonLength } from "../gameDate";
import type {
  GameState,
  LoanDeal,
  LoanRecommendation,
} from "../types";
import type {
  InjuryResult,
  InjurySetbackResult,
  SimulatedFixture,
} from "./types";
import type { RNG } from "../../rng/index";

export interface WeeklyLoanPhaseResult {
  updatedActiveLoans: LoanDeal[];
  loanReturnResult: ReturnType<typeof processLoanReturns>;
  loanDealResult: ReturnType<typeof processAILoanDeals> | {
    deals: [];
    messages: [];
    updatedRecommendations: LoanRecommendation[];
    reputationDelta: number;
    xpAward: number;
  };
  loanRecallResult: ReturnType<typeof processLoanRecalls> | {
    deals: [];
    messages: [];
  };
  updatedLoanRecommendations: LoanRecommendation[];
  loanOutcomeReputation: number;
  loanOutcomeXp: number;
  loanMessages: GameState["inbox"];
}

export function runWeeklyLoanPhase(
  state: GameState,
  rng: RNG,
  fixturesPlayed: SimulatedFixture[],
  transferWindowOpen: boolean,
): WeeklyLoanPhaseResult {
  const activeSeasonLength = getSeasonLength(state.fixtures, state.currentSeason);
  const updatedActiveLoans = processLoanPerformance(
    state,
    state.currentWeek,
    state.currentSeason,
    fixturesPlayed,
    activeSeasonLength,
  );
  const loanState = { ...state, activeLoans: updatedActiveLoans };
  const loanReturnResult = processLoanReturns(
    loanState,
    state.currentWeek,
    state.currentSeason,
    rng,
    activeSeasonLength,
  );
  const loanDealResult = transferWindowOpen
    ? processAILoanDeals(
        loanState,
        state.currentWeek,
        state.currentSeason,
        rng,
        activeSeasonLength,
      )
    : {
        deals: [],
        messages: [],
        updatedRecommendations: state.loanRecommendations ?? [],
        reputationDelta: 0,
        xpAward: 0,
      };
  const loanRecallResult = transferWindowOpen
    ? processLoanRecalls(loanState, state.currentWeek, state.currentSeason, rng)
    : { deals: [], messages: [] };

  // Closure feedback waits for the canonical lifecycle to approve ownership
  // and funds. Loan-start messages/rewards retain their existing phase.
  const updatedLoanRecommendations = loanDealResult.updatedRecommendations;
  const loanOutcomeReputation = 0;
  const loanOutcomeXp = loanDealResult.xpAward;
  const loanMessages = [...loanDealResult.messages];

  return {
    updatedActiveLoans,
    loanReturnResult,
    loanDealResult,
    loanRecallResult,
    updatedLoanRecommendations,
    loanOutcomeReputation,
    loanOutcomeXp,
    loanMessages,
  };
}

export function buildWeeklyInjurySetbacks(
  state: GameState,
  rng: RNG,
  injuries: InjuryResult[],
  seriousInjuryThreshold: number,
  developmentEnvironmentIndex: ReturnType<typeof import("../../world/developmentEnvironment").createDevelopmentEnvironmentIndex>,
  computeInjurySetback: (
    player: GameState["players"][string],
    weeksOut: number,
    phaseRng: RNG,
  ) => InjurySetbackResult | null,
): InjurySetbackResult[] {
  const injurySetbacks: InjurySetbackResult[] = [];
  for (const injury of injuries) {
    if (injury.weeksOut <= seriousInjuryThreshold) continue;
    const player = state.players[injury.playerId];
    if (!player) continue;
    const setback = computeInjurySetback(player, injury.weeksOut, rng);
    if (!setback) continue;
    setback.environment = evaluatePlayerDevelopmentEnvironment(state, player, {
      index: developmentEnvironmentIndex,
    }).projection;
    injurySetbacks.push(setback);
  }
  return injurySetbacks;
}

export interface WeeklyContactNetworkPhaseResult {
  updatedContacts: NonNullable<GameState["contacts"]>;
  accessAgreements: NonNullable<GameState["accessAgreements"]>;
  messages: GameState["inbox"];
}

export function runWeeklyContactNetworkPhase(
  state: GameState,
  rng: RNG,
): WeeklyContactNetworkPhaseResult {
  const messages = [] as GameState["inbox"];
  const contactDecayResult = processWeeklyContactDecay(state, rng);
  messages.push(...contactDecayResult.betrayalMessages);
  const revokedAccessAgreements = revokeAccessAgreements(
    state.accessAgreements,
    contactDecayResult.revokedAccessAgreementIds,
    { season: state.currentSeason, week: state.currentWeek },
  );

  const gossipState: GameState = {
    ...state,
    contacts: contactDecayResult.updatedContacts,
    accessAgreements: revokedAccessAgreements,
  };
  const gossipResult = processWeeklyGossip(gossipState, rng);
  messages.push(...gossipResult.gossipMessages);

  const referralState: GameState = {
    ...state,
    contacts: gossipResult.updatedContacts,
  };
  const referralResult = processWeeklyReferrals(referralState, rng);
  messages.push(...referralResult.referralMessages);

  const accessAgreementResult = processWeeklyAccessAgreements({
    accessAgreements: revokedAccessAgreements,
    contacts: referralResult.updatedContacts,
    players: state.players,
    fixtures: state.fixtures,
    currentSeason: state.currentSeason,
    currentWeek: state.currentWeek,
    scout: state.scout,
  }, rng);
  messages.push(...accessAgreementResult.exclusiveMessages);

  return {
    updatedContacts: referralResult.updatedContacts,
    accessAgreements: accessAgreementResult.accessAgreements,
    messages,
  };
}
