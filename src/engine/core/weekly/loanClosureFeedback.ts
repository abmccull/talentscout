import type {
  Club, GameState, InboxMessage, StoredLoanDeal, LoanOutcome,
  LoanRecommendation, Player, PlayerMovementEvent,
} from "../types";
import type { RNG } from "../../rng/index";
import { processLoanOutcomeReputation } from "../../firstTeam/loanIntegration";
import { expandLoanDeal } from "../../finance/terminalRecordArchive";

export interface LoanClosureFeedbackInput {
  scout: GameState["scout"];
  previousLoanHistory: readonly StoredLoanDeal[];
  loanHistory: readonly StoredLoanDeal[];
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
  const previousIds = new Set(input.previousLoanHistory.map((deal) => expandLoanDeal(deal).id));
  const deals = new Map(input.loanHistory.map((storedDeal) => {
    const deal = expandLoanDeal(storedDeal);
    return [deal.id, deal] as const;
  }));
  const processedIds = new Set<string>();
  const messages: InboxMessage[] = [];
  const updatedRecommendations = [...input.recommendations];
  let reputationDelta = 0;
  let xpAward = 0;

  for (const movement of input.movements) {
    if (!["loanBuyOption", "loanReturn", "loanRecall", "retirement", "footballExit"].includes(movement.type)) continue;
    const dealId = movement.loanDealId;
    if (!dealId || previousIds.has(dealId) || processedIds.has(dealId)) continue;
    const deal = deals.get(dealId);
    if (!deal || deal.status === "active" || deal.playerId !== movement.playerId) continue;
    if (movement.type === "retirement" || movement.type === "footballExit") {
      if (deal.status !== "terminated" || deal.outcome !== "terminated") continue;
      processedIds.add(dealId);
      for (let index = 0; index < updatedRecommendations.length; index++) {
        const recommendation = updatedRecommendations[index];
        if (recommendation.loanDealId !== dealId) continue;
        updatedRecommendations[index] = { ...recommendation, status: "completed", outcome: "terminated",
          reputationApplied: recommendation.scoutId === input.scout.id ? true : recommendation.reputationApplied };
      }
      continue;
    }
    const consistentClosure = movement.type === "loanBuyOption"
      ? deal.status === "completed" && deal.outcome === "buy-option-exercised"
      : movement.type === "loanRecall"
        ? deal.status === "recalled" && deal.outcome === "recalled-early"
        : deal.status === "completed" && ["successful", "neutral", "unsuccessful"].includes(deal.outcome ?? "");
    if (!consistentClosure) continue;
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
