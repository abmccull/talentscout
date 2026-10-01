import type {
  Club, GameState, InboxMessage, LoanDeal, LoanOutcome,
  LoanRecommendation, Player, PlayerMovementEvent,
} from "../types";
import type { RNG } from "../../rng/index";
import { processLoanOutcomeReputation } from "../../firstTeam/loanIntegration";

export interface LoanClosureFeedbackInput {
  scout: GameState["scout"];
  previousLoanHistory: readonly LoanDeal[];
  loanHistory: readonly LoanDeal[];
  movements: readonly PlayerMovementEvent[];
  recommendations: readonly LoanRecommendation[];
  players: Record<string, Player>;
  clubs: Record<string, Club>;
  week: number;
  season: number;
}

/** Project closure confirmations and rewards only after ownership settles. */
export function projectAppliedLoanClosures(input: LoanClosureFeedbackInput, rng: RNG): {
  messages: InboxMessage[];
  updatedRecommendations: LoanRecommendation[];
  reputationDelta: number;
  xpAward: number;
} {
  const previousIds = new Set(input.previousLoanHistory.map((deal) => deal.id));
  const deals = new Map(input.loanHistory.map((deal) => [deal.id, deal]));
  const processedIds = new Set<string>();
  const messages: InboxMessage[] = [];
  const updatedRecommendations = [...input.recommendations];
  let reputationDelta = 0;
  let xpAward = 0;

  for (const movement of input.movements) {
    if (!["loanBuyOption", "loanReturn", "loanRecall"].includes(movement.type)) continue;
    const dealId = movement.loanDealId;
    if (!dealId || previousIds.has(dealId) || processedIds.has(dealId)) continue;
    const deal = deals.get(dealId);
    if (!deal || deal.status === "active" || deal.playerId !== movement.playerId) continue;
    processedIds.add(dealId);
    const outcome: LoanOutcome = movement.type === "loanBuyOption"
      ? "buy-option-exercised"
      : movement.type === "loanRecall"
        ? "recalled-early"
        : deal.outcome === "buy-option-exercised" ? "neutral" : deal.outcome ?? "neutral";
    const player = input.players[deal.playerId];
    const playerName = player ? `${player.firstName} ${player.lastName}` : "Unknown Player";
    const parentName = input.clubs[deal.parentClubId]?.shortName ?? deal.parentClubId;
    const borrowerName = input.clubs[deal.loanClubId]?.shortName ?? deal.loanClubId;
    const outcomeText = outcome === "successful" ? "a successful loan spell"
      : outcome === "unsuccessful" ? "an unsuccessful loan spell" : "an uneventful loan spell";
    const purchased = movement.type === "loanBuyOption";
    const recalled = movement.type === "loanRecall";
    messages.push({
      id: `loan-closure-${movement.id}`, week: input.week, season: input.season,
      type: "transferUpdate", read: false, actionRequired: false,
      relatedId: deal.playerId, relatedEntityType: "player",
      title: `${purchased ? "Loan Buy Option Exercised" : recalled ? "Loan Recall" : "Loan Return"}: ${playerName}`,
      body: purchased
        ? `${borrowerName} has exercised the buy option for ${playerName}, making the move permanent for £${((movement.fee ?? deal.buyOptionFee ?? 0) / 1000).toFixed(0)}K.`
        : recalled
          ? `${playerName} has been recalled by ${parentName} from the loan at ${borrowerName}.`
          : `${playerName} has returned to ${parentName} after ${outcomeText} at ${borrowerName}.${deal.performanceRecord ? ` ${deal.performanceRecord.appearances} appearances, ${deal.performanceRecord.goals} goals.` : ""}`,
    });

    let rewardApplied = updatedRecommendations.some((recommendation) =>
      recommendation.loanDealId === dealId && recommendation.scoutId === input.scout.id
      && recommendation.reputationApplied,
    );
    for (let index = 0; index < updatedRecommendations.length; index++) {
      const recommendation = updatedRecommendations[index];
      if (recommendation.loanDealId !== dealId) continue;
      if (recommendation.scoutId !== input.scout.id || rewardApplied) {
        updatedRecommendations[index] = { ...recommendation, status: "completed", outcome,
          reputationApplied: recommendation.scoutId === input.scout.id ? rewardApplied : recommendation.reputationApplied };
        continue;
      }
      const reward = processLoanOutcomeReputation(
        input.scout, recommendation, outcome, deal, player,
        input.week, input.season, rng,
      );
      reputationDelta += reward.reputationDelta;
      xpAward += reward.xpAward;
      rewardApplied = true;
      messages.push({ ...reward.message, id: `loan-closure-feedback-${movement.id}` });
      if (reward.updatedRecommendation) updatedRecommendations[index] = reward.updatedRecommendation;
    }
  }

  return { messages, updatedRecommendations, reputationDelta, xpAward };
}
