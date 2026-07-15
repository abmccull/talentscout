import type { GameState, InboxMessage, TransferRecord } from "@/engine/core/types";
import type { TickResult } from "@/engine/core/gameLoop";
import { gameWeeksBetween } from "@/engine/core/gameDate";
import { createRNG } from "@/engine/rng";
import {
  linkReportsToTransfers,
} from "@/engine/firstTeam";
import {
  calculateDiscoveryBonus,
  calculatePlacementFee,
  calculateSellOnPercentage,
  checkPlacementFeeEligibility,
  processSellOnClauses,
  triggerPlacementFee,
} from "@/engine/finance";

export interface WeeklyTransferAccountabilityInput {
  beforeTick: GameState;
  state: GameState;
  transfers: TickResult["transfers"];
}

/** Link only lifecycle-applied transfers to reports, rewards, and sell-ons. */
export function processWeeklyTransferAccountability(
  input: WeeklyTransferAccountabilityInput,
): GameState {
  let state = input.state;
  const newMovements = state.playerMovementHistory.slice(
    input.beforeTick.playerMovementHistory.length,
  );
  const appliedTransferKeys = new Set(
    newMovements
      .filter((movement) => movement.type === "permanentTransfer")
      .map((movement) =>
        `${movement.playerId}:${movement.fromClubId ?? ""}:${movement.toClubId ?? ""}:${movement.fee ?? 0}`,
      ),
  );
  const appliedTransfers = input.transfers.filter((transfer) =>
    appliedTransferKeys.has(
      `${transfer.playerId}:${transfer.fromClubId}:${transfer.toClubId}:${transfer.fee}`,
    ),
  );
  if (appliedTransfers.length === 0) return state;

  const rng = createRNG(
    `${input.beforeTick.seed}-trlink-${input.beforeTick.currentWeek}-${input.beforeTick.currentSeason}`,
  );
  const existingTransferKeys = new Set(
    state.transferRecords.map((record: TransferRecord) =>
      `${record.playerId}:${record.fromClubId}:${record.toClubId}:${record.transferSeason}:${record.transferWeek}`,
    ),
  );
  const newTransferRecords = linkReportsToTransfers(
    rng,
    appliedTransfers,
    state.reports,
    state.players,
    state.scout.id,
    input.beforeTick.currentWeek,
    input.beforeTick.currentSeason,
    existingTransferKeys,
  );
  if (newTransferRecords.length > 0) {
    state = {
      ...state,
      transferRecords: [...state.transferRecords, ...newTransferRecords],
    };
  }

  if (state.finances) {
    let finances = state.finances;
    const messages: InboxMessage[] = [];
    for (const transfer of appliedTransfers) {
      const report = checkPlacementFeeEligibility(
        transfer.playerId,
        state.reports,
        state.scout.id,
      );
      if (!report) continue;
      const player = state.players[transfer.playerId];
      const playerName = player ? `${player.firstName} ${player.lastName}` : "a player";

      if (state.scout.careerPath === "club") {
        const bonus = calculateDiscoveryBonus(
          transfer.fee,
          state.scout.careerTier,
          report.conviction,
        );
        if (bonus > 0) {
          finances = {
            ...finances,
            balance: finances.balance + bonus,
            bonusRevenue: finances.bonusRevenue + bonus,
            transactions: [
              ...finances.transactions,
              {
                week: state.currentWeek,
                season: state.currentSeason,
                amount: bonus,
                description: `Discovery bonus (${playerName})`,
              },
            ],
          };
          messages.push({
            id: `discovery-bonus-${transfer.playerId}-w${state.currentWeek}`,
            week: state.currentWeek,
            season: state.currentSeason,
            type: "event",
            title: "Discovery Bonus",
            body: `Your scouting report on ${playerName} contributed to a successful transfer (£${transfer.fee.toLocaleString()}). You've received a £${bonus.toLocaleString()} discovery bonus.`,
            read: false,
            actionRequired: false,
          });
        }
      } else if (state.scout.careerPath === "independent") {
        const weeksAgo = gameWeeksBetween(
          state.fixtures,
          { season: report.submittedSeason, week: report.submittedWeek },
          { season: state.currentSeason, week: state.currentWeek },
        );
        const fee = calculatePlacementFee(
          transfer.fee,
          report,
          state.scout,
          weeksAgo,
          false,
        );
        const sellOnPercentage = player
          ? calculateSellOnPercentage(player.age, report.conviction)
          : 0;
        finances = triggerPlacementFee(
          finances,
          fee,
          transfer.playerId,
          transfer.toClubId,
          transfer.fee,
          sellOnPercentage,
          state.currentWeek,
          state.currentSeason,
        );
        messages.push({
          id: `placement-fee-${transfer.playerId}-w${state.currentWeek}`,
          week: state.currentWeek,
          season: state.currentSeason,
          type: "event",
          title: "Placement Fee Earned",
          body: `Your scouting report on ${playerName} led to a transfer (£${transfer.fee.toLocaleString()}). You've earned a £${fee.toLocaleString()} placement fee.${sellOnPercentage > 0 ? ` A ${(sellOnPercentage * 100).toFixed(1)}% sell-on clause has been registered.` : ""}`,
          read: false,
          actionRequired: false,
        });
      }
    }
    state = {
      ...state,
      finances,
      inbox: [...state.inbox, ...messages],
    };
  }

  if (state.finances && state.finances.placementFeeRecords.length > 0) {
    const afterSellOn = processSellOnClauses(
      state.finances,
      appliedTransfers.map((transfer) => ({
        playerId: transfer.playerId,
        fee: transfer.fee,
      })),
      state.currentWeek,
      state.currentSeason,
    );
    const sellOnEarned = afterSellOn.sellOnRevenue - state.finances.sellOnRevenue;
    state = {
      ...state,
      finances: afterSellOn,
      inbox: sellOnEarned > 0
        ? [
            ...state.inbox,
            {
              id: `sell-on-w${state.currentWeek}-s${state.currentSeason}`,
              week: state.currentWeek,
              season: state.currentSeason,
              type: "event",
              title: "Sell-On Clause Payment",
              body: `A player you previously placed has been transferred. You've received £${sellOnEarned.toLocaleString()} from sell-on clauses.`,
              read: false,
              actionRequired: false,
            },
          ]
        : state.inbox,
    };
  }

  return state;
}
