import type {
  Club, InboxMessage, LoanDeal, LoanRecommendation, Player,
  PlayerMovementEvent, Scout,
} from "../core/types";
import { processLoanOutcomeReputation } from "../firstTeam/loanIntegration";

/** Message IDs are reserved during planning to preserve the weekly RNG stream. */
export interface DeferredLoanClosure {
  loanDealId: string;
  movementMessage?: InboxMessage;
  recommendationId?: string;
  feedbackMessageId?: string;
}

function movementMessage(
  prepared: InboxMessage,
  movement: PlayerMovementEvent,
  deal: LoanDeal,
  player: Player | undefined,
  clubs: Record<string, Club>,
  week: number,
  season: number,
): InboxMessage {
  const name = player ? `${player.firstName} ${player.lastName}` : "Unknown Player";
  const parent = clubs[deal.parentClubId]?.shortName ?? deal.parentClubId;
  const destination = clubs[deal.loanClubId]?.shortName ?? deal.loanClubId;
  if (movement.type === "loanBuyOption") {
    return { ...prepared, week, season,
      title: `Loan Buy Option Exercised: ${name}`,
      body: `${destination} has exercised the buy option for ${name}, making the move permanent for £${((movement.fee ?? 0) / 1000).toFixed(0)}K.`,
    };
  }
  if (movement.type === "loanRecall") {
    return { ...prepared, week, season,
      title: `Loan Recall: ${name}`,
      body: `${parent} has recalled ${name} from ${destination}. The player has returned to the parent club.`,
    };
  }
  const description = deal.outcome === "successful" ? "a successful loan spell"
    : deal.outcome === "unsuccessful" ? "an unsuccessful loan spell" : "an uneventful loan spell";
  return { ...prepared, week, season,
    title: `Loan Return: ${name}`,
    body: `${name} has returned to ${parent} after ${description} at ${destination}.${deal.performanceRecord ? ` ${deal.performanceRecord.appearances} appearances, ${deal.performanceRecord.goals} goals.` : ""}`,
  };
}

/** Only an applied movement and its matching closed history can settle a loan. */
export function settleLoanClosures(input: {
  scout: Scout;
  recommendations: LoanRecommendation[];
  prepared: DeferredLoanClosure[];
  applied: PlayerMovementEvent[];
  loanHistory: LoanDeal[];
  players: Record<string, Player>;
  clubs: Record<string, Club>;
  inbox: InboxMessage[];
  week: number;
  season: number;
}): { recommendations: LoanRecommendation[]; messages: InboxMessage[]; reputationDelta: number; xpAward: number } {
  let recommendations = input.recommendations;
  const messages: InboxMessage[] = [];
  let reputationDelta = 0;
  let xpAward = 0;
  const preparedById = new Map(input.prepared.map((item) => [item.loanDealId, item]));
  const historyById = new Map(input.loanHistory.map((deal) => [deal.id, deal]));
  const settled = new Set<string>();
  const messageIds = new Set(input.inbox.map((message) => message.id));
  const appendMessage = (message: InboxMessage) => {
    if (messageIds.has(message.id)) return;
    messageIds.add(message.id);
    messages.push(message);
  };

  for (const movement of input.applied) {
    if (!movement.loanDealId || settled.has(movement.loanDealId)) continue;
    if (movement.type === "retirement" || movement.type === "footballExit") {
      const terminated = historyById.get(movement.loanDealId);
      if (terminated?.status === "terminated" && terminated.outcome === "terminated"
        && terminated.playerId === movement.playerId) {
        // A real terminal movement closes the old recommendation without
        // inventing a scouting failure penalty or a successful buy reward.
        recommendations = recommendations.map((item) => item.loanDealId === terminated.id
          && item.scoutId === input.scout.id && !item.reputationApplied
          ? { ...item, status: "completed", outcome: "terminated", reputationApplied: true }
          : item);
        settled.add(terminated.id);
      }
      continue;
    }
    if (movement.type !== "loanReturn" && movement.type !== "loanRecall" && movement.type !== "loanBuyOption") continue;
    const prepared = preparedById.get(movement.loanDealId);
    const deal = historyById.get(movement.loanDealId);
    if (!prepared || !deal || deal.playerId !== movement.playerId || !deal.outcome) continue;
    const consistentClosure = movement.type === "loanBuyOption"
      ? deal.status === "completed" && deal.outcome === "buy-option-exercised"
      : movement.type === "loanRecall"
        ? deal.status === "recalled" && deal.outcome === "recalled-early"
        : deal.status === "completed" && ["successful", "neutral", "unsuccessful"].includes(deal.outcome);
    if (!consistentClosure) continue;
    settled.add(deal.id);

    const player = input.players[movement.playerId];
    if (prepared.movementMessage) {
      appendMessage(movementMessage(prepared.movementMessage, movement, deal, player,
        input.clubs, input.week, input.season));
    }
    const recommendation = recommendations.find((item) =>
      item.id === prepared.recommendationId && item.loanDealId === deal.id
      && item.scoutId === input.scout.id && !item.reputationApplied);
    if (!recommendation || !prepared.feedbackMessageId) continue;
    const reward = processLoanOutcomeReputation(input.scout, recommendation, deal.outcome,
      deal, player, input.week, input.season, prepared.feedbackMessageId);
    reputationDelta += reward.reputationDelta;
    xpAward += reward.xpAward;
    appendMessage(reward.message);
    if (reward.updatedRecommendation) {
      recommendations = recommendations.map((item) => item.id === recommendation.id
        ? reward.updatedRecommendation! : item);
    }
  }
  return { recommendations, messages, reputationDelta, xpAward };
}
