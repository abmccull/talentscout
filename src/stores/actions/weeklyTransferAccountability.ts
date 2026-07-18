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
import {
  deriveRecruitmentOpportunities,
  getRecruitmentOpportunityTransferReference,
} from "@/engine/recruitment";

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
  const recruitmentOpportunities = deriveRecruitmentOpportunities(state);

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
    // Transfer records evaluate prior judgment against later observable
    // outcomes. Only destination-matching delivered opportunities can claim
    // the stronger player-facing "signed from this report" state.
    const causallySignedReportIds = new Set(
      appliedTransfers
        .map((transfer) => checkPlacementFeeEligibility(
          state,
          transfer,
          state.scout.id,
          recruitmentOpportunities,
        ))
        .filter((eligibility) => Boolean(eligibility))
        .map((eligibility) => eligibility!.report.id),
    );
    state = {
      ...state,
      reports: Object.fromEntries(
        Object.entries(state.reports).map(([reportId, report]) => [
          reportId,
          causallySignedReportIds.has(reportId)
            ? { ...report, clubResponse: "signed" as const }
            : report,
        ]),
      ),
      transferRecords: [...state.transferRecords, ...newTransferRecords],
    };
  }

  if (state.finances) {
    let finances = state.finances;
    const messages: InboxMessage[] = [];
    for (const transfer of appliedTransfers) {
      // Tick transfers carry the source date. `state` has already advanced to
      // the following week, so replacing this date would sever the movement
      // ledger link and make manual/batch attribution diverge at rollover.
      const datedTransfer = transfer;
      const eligibility = checkPlacementFeeEligibility(
        state,
        datedTransfer,
        state.scout.id,
        recruitmentOpportunities,
      );
      if (!eligibility) continue;
      const { report, opportunity } = eligibility;
      const causalReference = getRecruitmentOpportunityTransferReference(
        opportunity,
        datedTransfer,
      );
      const player = state.players[transfer.playerId];
      const playerName = player ? `${player.firstName} ${player.lastName}` : "a player";

      if (state.scout.careerPath === "club") {
        const referenceId = `${causalReference}:discoveryBonus`;
        if (finances.transactions.some((transaction) => transaction.referenceId === referenceId)) {
          continue;
        }
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
                referenceId,
                category: "bonus",
                counterpartyId: transfer.toClubId,
              },
            ],
          };
          messages.push({
            id: `discovery-bonus-${opportunity.deliveryId}-w${state.currentWeek}`,
            week: state.currentWeek,
            season: state.currentSeason,
            type: "event",
            title: "Discovery Bonus",
            body: `Your report on ${playerName} reached ${state.clubs[opportunity.targetClubId]?.name ?? "the destination club"} before the £${transfer.fee.toLocaleString()} transfer, qualifying you for a £${bonus.toLocaleString()} discovery bonus.`,
            read: false,
            actionRequired: false,
          });
        }
      } else if (state.scout.careerPath === "independent") {
        const referenceId = `${causalReference}:placementFee`;
        if (finances.transactions.some((transaction) => transaction.referenceId === referenceId)) {
          continue;
        }
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
          opportunity.exclusivity === "exclusive",
        );
        const firstPlacementBonusAvailable = !finances.starterBonus?.firstPlacementBonusUsed;
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
          referenceId,
        );
        const welcomeBonus = firstPlacementBonusAvailable
          && finances.starterBonus?.firstPlacementBonusUsed
          ? Math.round(fee * 0.25)
          : 0;
        messages.push({
          id: `placement-fee-${opportunity.deliveryId}-w${state.currentWeek}`,
          week: state.currentWeek,
          season: state.currentSeason,
          type: "event",
          title: "Placement Fee Earned",
          body: `Your report on ${playerName} reached ${state.clubs[opportunity.targetClubId]?.name ?? "the destination club"} before the £${transfer.fee.toLocaleString()} transfer, qualifying you for a £${fee.toLocaleString()} placement fee.${welcomeBonus > 0 ? ` Your first placement also unlocked a £${welcomeBonus.toLocaleString()} welcome bonus.` : ""}${sellOnPercentage > 0 ? ` A ${(sellOnPercentage * 100).toFixed(1)}% sell-on clause has been registered.` : ""}`,
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
        fromClubId: transfer.fromClubId,
        toClubId: transfer.toClubId,
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
