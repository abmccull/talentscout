/**
 * Finance, economics, equipment, agency, transfer negotiation, free agent,
 * and player loan actions extracted from gameStore.
 *
 * Handles equipment purchase/sell/equip, career path choice, lifestyle changes,
 * report marketplace, retainer/consulting contracts, agency management,
 * loans/distress, infrastructure investments, assistant scouts,
 * transfer negotiations, free agent negotiations, and player loan management.
 */
import type { GetState, SetState } from "./types";
import type { GameScreen } from "../gameStoreTypes";
import type {
  InboxMessage,
  RetainerContract,
  ConsultingContract,
  OfficeTier,
  AgencyEmployeeRole,
  LoanType,
  LifestyleLevel,
  CareerPath,
  DataSubscriptionTier,
  TravelBudgetTier,
  OfficeEquipmentTier,
  TransferRecord,
  EmployeeAssignment,
  TransferAddOn,
  GameState,
} from "@/engine/core/types";
import type { EquipmentItemId } from "@/engine/finance";
import type { AgencyOperatingPolicy } from "@/engine/finance";
import { createRNG } from "@/engine/rng";
import {
  purchaseEquipmentItem,
  sellEquipmentItem,
  equipItem,
  changeLifestyle,
  listReport,
  withdrawListing,
  acceptBid,
  declineBid,
  acceptExclusiveUpgrade,
  acceptRetainer,
  cancelRetainer,
  upgradeOffice,
  hireEmployee,
  fireEmployee,
  takeLoan,
  repayLoanEarly,
  acceptConsulting,
  completeConsulting,
  pitchToClub,
  ensureClientRelationship,
  resolveEmployeeEvent as resolveEmployeeEventEngine,
  openSatelliteOffice,
  closeSatelliteOffice,
  relocateHomeBase,
  assignEmployeeToSatellite,
  enrollInTraining,
  purchaseDataSubscription,
  upgradeTravelBudget,
  upgradeOfficeEquipment,
  hireAssistantScout,
  fireAssistantScout,
  assignAssistantScout,
  unassignAssistantScout,
  renegotiateEmployeeSalary,
  assessClubAffordability,
  buildTransferAddOnObligations,
  getTransferContingentReserve,
  recordRetainerDelivery,
  recordConsultingReportDelivery,
  selectAgencyOperatingPolicy,
} from "@/engine/finance";
import { creditForLoanRepayment } from "@/engine/finance/creditScore";
import { sellEquipmentForCash as sellEquipmentForCashEngine } from "@/engine/finance/distress";
import { canCompleteConsulting } from "@/engine/finance/consulting";
import { getClubScoutingBudget } from "@/engine/finance/reportMarketplace";
import { canChooseCareerPath } from "@/engine/career/pathChoice";
import {
  applyCareerPathTransition,
  applyClubEmploymentTransition,
} from "@/engine/career/transitions";
import {
  canAcceptJobOffer,
  generateJobOffersForTier,
} from "@/engine/career/progression";
import { enrollInCourse } from "@/engine/career/courses";
import {
  generateLoanRecommendation,
  processLoanMonitoringReport,
} from "@/engine/firstTeam";
import * as negotiationEngine from "@/engine/firstTeam/negotiation";
import {
  initiateFreeAgentNegotiation as initFANegotiation,
  advanceFreeAgentNegotiation,
  calculateFreeAgentAcceptance,
  generateNegotiationMessage,
} from "@/engine/freeAgents/negotiation";
import { isTransferWindowOpen } from "@/engine/core/transferWindow";
import { getSeasonLength } from "@/engine/core/gameDate";
import { getScoutHomeCountry, isTravelEligibleCountry } from "@/engine/world";
import {
  getLifecycleWorld,
  resolvePlayerMovements,
  withLifecycleWorld,
} from "@/engine/world/playerLifecycle";
import { useTutorialStore } from "@/stores/tutorialStore";
import { applyScoutSkillXp } from "@/engine/scout/progression";
import {
  attachListingToCase,
  ensureScoutingCaseForReport,
  recordMarketplaceDelivery,
} from "@/engine/reports/scoutingCases";
import { getStaffWorkReviewPreview } from "@/engine/finance/staffWorkReview";

function completeFreeAgentSigning(
  state: GameState,
  playerId: string,
  wage: number,
  signingBonus: number,
  contractLength: number,
): GameState | null {
  const toClubId = state.scout.currentClubId;
  if (!toClubId) return null;
  const resolution = resolvePlayerMovements(
    getLifecycleWorld(state),
    [{
      type: "freeAgentSigning",
      playerId,
      toClubId,
      wage,
      signingBonus,
      contractLength,
      reason: "Scout-led free-agent agreement",
    }],
    state.currentWeek,
    state.currentSeason,
    getSeasonLength(state.fixtures, state.currentSeason),
  );
  return resolution.applied.length > 0
    ? withLifecycleWorld(state, resolution.state)
    : null;
}

export function createFinanceActions(get: GetState, set: SetState) {
  return {
    purchaseEquipItem: (itemId: EquipmentItemId) => {
      const { gameState } = get();
      if (!gameState || !gameState.finances) return;

      const updatedFinances = purchaseEquipmentItem(
        gameState.finances,
        itemId,
        gameState.currentWeek,
        gameState.currentSeason,
      );

      if (!updatedFinances) return;
      set({ gameState: { ...gameState, finances: updatedFinances } });
    },

    sellEquipItem: (itemId: EquipmentItemId) => {
      const { gameState } = get();
      if (!gameState || !gameState.finances) return;

      const updatedFinances = sellEquipmentItem(
        gameState.finances,
        itemId,
        gameState.currentWeek,
        gameState.currentSeason,
      );

      if (!updatedFinances) return;
      set({ gameState: { ...gameState, finances: updatedFinances } });
    },

    equipEquipItem: (itemId: EquipmentItemId) => {
      const { gameState } = get();
      if (!gameState || !gameState.finances) return;

      const updatedFinances = equipItem(gameState.finances, itemId);

      if (!updatedFinances) return;
      set({ gameState: { ...gameState, finances: updatedFinances } });
    },

    // Economics actions

    chooseCareerPath: (path: CareerPath) => {
      const { gameState } = get();
      if (!gameState || !gameState.finances) return;
      if (!canChooseCareerPath(gameState.scout, gameState.finances)) return;

      if (path === "club") {
        const currentTierOffers = gameState.jobOffers.filter(
          (offer) =>
            offer.tier === gameState.scout.careerTier
            && canAcceptJobOffer(
              offer,
              gameState.currentWeek,
              gameState.currentSeason,
            ),
        );
        const generatedOffers = currentTierOffers.length > 0
          ? []
          : generateJobOffersForTier(
              createRNG(
                `${gameState.seed}-career-path-club-s${gameState.currentSeason}w${gameState.currentWeek}`,
              ),
              gameState.scout,
              gameState.clubs,
              gameState.currentSeason,
              gameState.scout.careerTier,
              getSeasonLength(gameState.fixtures, gameState.currentSeason),
            );
        const offer = currentTierOffers[0] ?? generatedOffers[0];
        if (!offer) {
          set({
            gameState: {
              ...gameState,
              inbox: [
                ...gameState.inbox,
                {
                  id: `career-path-no-opening-s${gameState.currentSeason}w${gameState.currentWeek}`,
                  week: gameState.currentWeek,
                  season: gameState.currentSeason,
                  type: "feedback",
                  title: "No suitable club opening",
                  body: "No club at your earned level is hiring this week. Your career-path choice remains open; build your reputation or try again after the market changes.",
                  read: false,
                  actionRequired: false,
                },
              ],
            },
          });
          return;
        }

        const stateWithOffer = generatedOffers.length > 0
          ? { ...gameState, jobOffers: [...gameState.jobOffers, ...generatedOffers] }
          : gameState;
        set({ gameState: applyClubEmploymentTransition(stateWithOffer, offer) });
        return;
      }

      set({ gameState: applyCareerPathTransition(gameState, path) });
    },

    setAgencyOperatingPolicy: (
      policy: AgencyOperatingPolicy,
      focusRegionId?: string,
    ) => {
      const { gameState } = get();
      if (
        !gameState?.finances
        || gameState.scout.careerPath !== "independent"
        || gameState.scout.careerTier < 3
      ) return;
      const selected = selectAgencyOperatingPolicy({
        finances: gameState.finances,
        policy,
        now: { week: gameState.currentWeek, season: gameState.currentSeason },
        seasonLength: getSeasonLength(gameState.fixtures, gameState.currentSeason),
        focusRegionId: focusRegionId
          ?? gameState.scout.travelBooking?.destinationCountry
          ?? getScoutHomeCountry(gameState.scout),
      });
      if (!selected.changed) return;
      const strategy = selected.finances.agencyStrategyState!;
      set({
        gameState: {
          ...gameState,
          finances: selected.finances,
          inbox: [
            {
              id: `agency-policy-selected:${policy}:s${gameState.currentSeason}w${gameState.currentWeek}`,
              week: gameState.currentWeek,
              season: gameState.currentSeason,
              type: "financial",
              title: "Agency Operating Policy Set",
              body: `${policy} will shape bids, client trust, staff pressure, operating cost, and regional presence through Season ${strategy.lockedUntil.season}, Week ${strategy.lockedUntil.week}.`,
              read: false,
              actionRequired: false,
            },
            ...gameState.inbox,
          ],
        },
      });
    },

    changeLifestyle: (level: LifestyleLevel) => {
      const { gameState } = get();
      if (!gameState || !gameState.finances) return;
      const updated = changeLifestyle(gameState.finances, level);
      if (updated) {
        set({ gameState: { ...gameState, finances: updated } });
      }
    },

    approveStaffWorkProduct: (workProductId: string) => {
      const { gameState } = get();
      if (!gameState?.finances) return;
      const product = gameState.finances.staffWorkProducts.find(
        (candidate) => candidate.id === workProductId,
      );
      if (!product || product.status !== "awaitingReview") return;
      const alreadyReviewedThisWeek = gameState.finances.staffWorkProducts.some(
        (candidate) =>
          candidate.reviewerId === gameState.scout.id
          && candidate.reviewedWeek === gameState.currentWeek
          && candidate.reviewedSeason === gameState.currentSeason,
      );
      if (alreadyReviewedThisWeek) return;

      const player = gameState.players[product.playerId];
      const seasonLength = getSeasonLength(gameState.fixtures, gameState.currentSeason);
      const reviewPreview = getStaffWorkReviewPreview(
        gameState.finances,
        product,
        {
          week: gameState.currentWeek,
          season: gameState.currentSeason,
        },
        seasonLength,
      );
      const reviewedProduct = {
        ...product,
        reviewerId: gameState.scout.id,
        reviewedWeek: gameState.currentWeek,
        reviewedSeason: gameState.currentSeason,
        reviewPriority: reviewPreview.priority,
        reviewDebtPenalty: reviewPreview.reviewDebtPenalty,
        signedOffQualityScore: reviewPreview.signedOffQualityScore,
        reviewPriorityReason: reviewPreview.priorityReason,
        reviewDeadlineWeek: reviewPreview.deadline?.week,
        reviewDeadlineSeason: reviewPreview.deadline?.season,
      };
      let finances = gameState.finances;
      let delivered = false;
      if (product.clientClubId && player) {
        const beforeRetainer = finances.retainerContracts
          .filter((contract) => contract.clubId === product.clientClubId)
          .reduce((sum, contract) => sum + contract.reportsDeliveredThisMonth, 0);
        const beforeConsulting = finances.consultingContracts
          .filter((contract) => contract.clubId === product.clientClubId)
          .reduce((sum, contract) => sum + (contract.deliveredReportIds ?? []).length, 0);
        finances = recordRetainerDelivery(
          finances,
          product.clientClubId,
          {
            id: reviewedProduct.id,
            qualityScore: reviewPreview.signedOffQualityScore,
          },
          player,
        );
        finances = recordConsultingReportDelivery(
          finances,
          product.clientClubId,
          {
            id: reviewedProduct.id,
            qualityScore: reviewPreview.signedOffQualityScore,
          },
          player,
        );
        const afterRetainer = finances.retainerContracts
          .filter((contract) => contract.clubId === product.clientClubId)
          .reduce((sum, contract) => sum + contract.reportsDeliveredThisMonth, 0);
        const afterConsulting = finances.consultingContracts
          .filter((contract) => contract.clubId === product.clientClubId)
          .reduce((sum, contract) => sum + (contract.deliveredReportIds ?? []).length, 0);
        delivered = afterRetainer > beforeRetainer || afterConsulting > beforeConsulting;
      }
      finances = {
        ...finances,
        staffWorkProducts: finances.staffWorkProducts.map((candidate) =>
          candidate.id === workProductId
            ? {
                ...reviewedProduct,
                status: delivered ? "delivered" as const : "approved" as const,
              }
            : candidate,
        ),
      };
      const signOffSummary = reviewPreview.reviewDebtPenalty > 0
        ? `${reviewPreview.signedOffQualityScore}/100 after ${reviewPreview.reviewDebtPenalty} review-debt points`
        : `${reviewPreview.signedOffQualityScore}/100 with no review debt`;
      set({
        gameState: {
          ...gameState,
          finances,
          scout: {
            ...gameState.scout,
            fatigue: Math.min(100, gameState.scout.fatigue + 2),
          },
          watchlist: gameState.watchlist.includes(product.playerId)
            ? gameState.watchlist
            : [...gameState.watchlist, product.playerId],
          inbox: [...gameState.inbox, {
            id: `staff-review-approved:${workProductId}`,
            week: gameState.currentWeek,
            season: gameState.currentSeason,
            type: "feedback",
            title: delivered ? "Staff work delivered" : "Staff lead approved",
            body: delivered
              ? `${product.employeeName}'s work passed ${reviewPreview.priorityLabel.toLowerCase()} sign-off at ${signOffSummary} and now counts toward the linked client commitment. It remains separate from your personal report history.`
              : `${product.employeeName}'s lead passed sign-off at ${signOffSummary} and has been added to your watchlist. You still need first-hand evidence before authoring a report.`,
            read: false,
            actionRequired: false,
            relatedId: product.playerId,
            relatedEntityType: "player",
          }],
        },
      });
    },

    rejectStaffWorkProduct: (workProductId: string) => {
      const { gameState } = get();
      if (!gameState?.finances) return;
      const product = gameState.finances.staffWorkProducts.find(
        (candidate) => candidate.id === workProductId,
      );
      if (!product || product.status !== "awaitingReview") return;
      const alreadyReviewedThisWeek = gameState.finances.staffWorkProducts.some(
        (candidate) =>
          candidate.reviewerId === gameState.scout.id
          && candidate.reviewedWeek === gameState.currentWeek
          && candidate.reviewedSeason === gameState.currentSeason,
      );
      if (alreadyReviewedThisWeek) return;
      const seasonLength = getSeasonLength(gameState.fixtures, gameState.currentSeason);
      const reviewPreview = getStaffWorkReviewPreview(
        gameState.finances,
        product,
        {
          week: gameState.currentWeek,
          season: gameState.currentSeason,
        },
        seasonLength,
      );
      set({
        gameState: {
          ...gameState,
          finances: {
            ...gameState.finances,
            staffWorkProducts: gameState.finances.staffWorkProducts.map((candidate) =>
              candidate.id === workProductId
                ? {
                    ...candidate,
                    status: "rejected" as const,
                    reviewerId: gameState.scout.id,
                    reviewedWeek: gameState.currentWeek,
                    reviewedSeason: gameState.currentSeason,
                    reviewPriority: reviewPreview.priority,
                    reviewDebtPenalty: reviewPreview.reviewDebtPenalty,
                    signedOffQualityScore: reviewPreview.signedOffQualityScore,
                    reviewPriorityReason: reviewPreview.priorityReason,
                    reviewDeadlineWeek: reviewPreview.deadline?.week,
                    reviewDeadlineSeason: reviewPreview.deadline?.season,
                  }
                : candidate,
            ),
          },
          scout: {
            ...gameState.scout,
            fatigue: Math.min(100, gameState.scout.fatigue + 1),
          },
        },
      });
    },

    listReportForSale: (reportId: string, price: number, isExclusive: boolean, targetClubId?: string) => {
      const { gameState } = get();
      if (!gameState || !gameState.finances) return;
      const report = gameState.reports[reportId];
      if (!report || report.scoutId !== gameState.scout.id) return;
      const linked = ensureScoutingCaseForReport(gameState.scoutingCases ?? {}, report);
      const existingListingIds = new Set(
        gameState.finances.reportListings.map((listing) => listing.id),
      );
      const updated = listReport(
        gameState.finances, reportId, price, isExclusive,
        targetClubId, gameState.currentWeek, gameState.currentSeason,
        linked.scoutingCase.id,
        getSeasonLength(gameState.fixtures, gameState.currentSeason),
      );
      const addedListing = updated.reportListings.find((listing) =>
        listing.reportId === reportId && !existingListingIds.has(listing.id)
      );
      if (!addedListing) return;
      const listingId = addedListing.id;
      const scoutingCases = attachListingToCase(
        linked.scoutingCases,
        linked.scoutingCase.id,
        listingId,
        gameState.currentWeek,
        gameState.currentSeason,
      );
      set({
        gameState: {
          ...gameState,
          finances: updated,
          reports: { ...gameState.reports, [reportId]: linked.report },
          scoutingCases,
        },
      });
      useTutorialStore.getState().completeMilestone("checkedInbox");
    },

    withdrawReportListing: (listingId: string) => {
      const { gameState } = get();
      if (!gameState || !gameState.finances) return;
      const updated = withdrawListing(gameState.finances, listingId);
      set({ gameState: { ...gameState, finances: updated } });
    },

    acceptMarketplaceBid: (bidId: string) => {
      const { gameState } = get();
      if (!gameState || !gameState.finances) return;
      // Find the listing containing this bid
      const listing = gameState.finances.reportListings.find((l) =>
        l.bids.some((b) => b.id === bidId),
      );
      if (!listing) return;
      const bid = listing.bids.find((candidate) => candidate.id === bidId);
      if (!bid || bid.status !== "pending") return;
      const buyer = gameState.clubs[bid.clubId];
      if (!buyer || getClubScoutingBudget(buyer) < bid.amount) return;
      const updated = acceptBid(
        gameState.finances, listing.id, bidId,
        gameState.currentWeek, gameState.currentSeason,
      );
      if (!updated.reportListings.some((candidate) =>
        candidate.id === listing.id
        && candidate.bids.some((candidateBid) =>
          candidateBid.id === bidId && candidateBid.status === "accepted"
        )
      )) return;
      const clubs = {
        ...gameState.clubs,
        [buyer.id]: {
          ...buyer,
          scoutingBudget: getClubScoutingBudget(buyer) - bid.amount,
        },
      };
      // Mark related inbox message as read
      const firstReportBonusEarned = !gameState.finances.starterBonus?.firstReportBonusUsed
        && updated.starterBonus?.firstReportBonusUsed;
      const updatedInbox = [
        ...gameState.inbox.map((m) =>
          m.relatedId === bidId ? { ...m, read: true, actionRequired: false } : m,
        ),
        ...(firstReportBonusEarned ? [{
          id: `welcome-first-report-${listing.id}`,
          week: gameState.currentWeek,
          season: gameState.currentSeason,
          type: "financial" as const,
          title: "First Sale Bonus",
          body: `Your first report sale unlocked the scout-network welcome package: an extra £${Math.round(bid.amount * 0.5).toLocaleString()}.`,
          read: false,
          actionRequired: false,
        }] : []),
      ];
      const report = gameState.reports[listing.reportId];
      if (!report) {
        set({ gameState: { ...gameState, clubs, finances: updated, inbox: updatedInbox } });
        return;
      }
      const recorded = recordMarketplaceDelivery({
        scoutingCases: gameState.scoutingCases ?? {},
        reportDeliveries: gameState.reportDeliveries ?? {},
        report,
        listing,
        bid,
        week: gameState.currentWeek,
        season: gameState.currentSeason,
      });
      const finances = {
        ...updated,
        reportListings: updated.reportListings.map((candidate) =>
          candidate.id === listing.id
            ? {
                ...candidate,
                caseId: recorded.delivery.caseId,
                deliveryIds: candidate.deliveryIds?.includes(recorded.delivery.id)
                  ? candidate.deliveryIds
                  : [...(candidate.deliveryIds ?? []), recorded.delivery.id],
              }
            : candidate,
        ),
      };
      set({
        gameState: {
          ...gameState,
          clubs,
          finances,
          inbox: updatedInbox,
          reports: { ...gameState.reports, [report.id]: recorded.report },
          scoutingCases: recorded.scoutingCases,
          reportDeliveries: recorded.reportDeliveries,
        },
      });
    },

    declineMarketplaceBid: (bidId: string) => {
      const { gameState } = get();
      if (!gameState || !gameState.finances) return;
      const listing = gameState.finances.reportListings.find((l) =>
        l.bids.some((b) => b.id === bidId),
      );
      if (!listing) return;
      const updated = declineBid(gameState.finances, listing.id, bidId);
      const updatedInbox = gameState.inbox.map((m) =>
        m.relatedId === bidId ? { ...m, read: true, actionRequired: false } : m,
      );
      set({ gameState: { ...gameState, finances: updated, inbox: updatedInbox } });
    },

    acceptExclusiveUpgradeBid: (bidId: string) => {
      const { gameState } = get();
      if (!gameState || !gameState.finances) return;
      const listing = gameState.finances.reportListings.find((l) =>
        l.bids.some((b) => b.id === bidId),
      );
      if (!listing) return;
      const bid = listing.bids.find((candidate) => candidate.id === bidId);
      if (!bid || bid.status !== "pending" || !bid.isExclusiveUpgrade) return;
      const buyer = gameState.clubs[bid.clubId];
      if (!buyer || getClubScoutingBudget(buyer) < bid.amount) return;
      const updated = acceptExclusiveUpgrade(
        gameState.finances, listing.id, bidId,
        gameState.currentWeek, gameState.currentSeason,
      );
      if (!updated.reportListings.some((candidate) =>
        candidate.id === listing.id
        && candidate.bids.some((candidateBid) =>
          candidateBid.id === bidId && candidateBid.status === "accepted"
        )
      )) return;
      const clubs = {
        ...gameState.clubs,
        [buyer.id]: {
          ...buyer,
          scoutingBudget: getClubScoutingBudget(buyer) - bid.amount,
        },
      };
      // Mark related inbox messages as read for all declined bids + this accepted bid
      const declinedBidIds = listing.bids
        .filter((b) => b.status === "pending" && b.id !== bidId)
        .map((b) => b.id);
      const affectedIds = new Set([bidId, ...declinedBidIds]);
      const updatedInbox = gameState.inbox.map((m) =>
        m.relatedId && affectedIds.has(m.relatedId)
          ? { ...m, read: true, actionRequired: false }
          : m,
      );
      const report = gameState.reports[listing.reportId];
      if (!report) {
        set({ gameState: { ...gameState, clubs, finances: updated, inbox: updatedInbox } });
        return;
      }
      const recorded = recordMarketplaceDelivery({
        scoutingCases: gameState.scoutingCases ?? {},
        reportDeliveries: gameState.reportDeliveries ?? {},
        report,
        listing,
        bid,
        week: gameState.currentWeek,
        season: gameState.currentSeason,
      });
      const finances = {
        ...updated,
        reportListings: updated.reportListings.map((candidate) =>
          candidate.id === listing.id
            ? {
                ...candidate,
                caseId: recorded.delivery.caseId,
                deliveryIds: candidate.deliveryIds?.includes(recorded.delivery.id)
                  ? candidate.deliveryIds
                  : [...(candidate.deliveryIds ?? []), recorded.delivery.id],
              }
            : candidate,
        ),
      };
      set({
        gameState: {
          ...gameState,
          clubs,
          finances,
          inbox: updatedInbox,
          reports: { ...gameState.reports, [report.id]: recorded.report },
          scoutingCases: recorded.scoutingCases,
          reportDeliveries: recorded.reportDeliveries,
        },
      });
    },

    acceptRetainerContract: (contract: RetainerContract) => {
      const { gameState } = get();
      if (!gameState || !gameState.finances) return;
      // Public actions may receive a negotiated/generated offer or a direct
      // contract assembled by another gameplay system. Anchor either shape to
      // the acceptance date so a missing optional offer timestamp cannot make
      // settlement fall back to an unrelated global week boundary.
      const datedContract: RetainerContract = {
        ...contract,
        startWeek: contract.startWeek ?? contract.offeredWeek ?? gameState.currentWeek,
        startSeason: contract.startSeason ?? contract.offeredSeason ?? gameState.currentSeason,
      };
      const updated = acceptRetainer(
        gameState.finances,
        datedContract,
        gameState.scout,
        getSeasonLength(gameState.fixtures, gameState.currentSeason),
      );
      if (updated) {
        // Remove from pending offers
        const pendingRetainers = (updated.pendingRetainerOffers ?? []).filter(
          (r) => r.id !== contract.id,
        );
        const withRelationship = ensureClientRelationship(
          updated,
          contract.clubId,
          gameState.currentWeek,
          gameState.currentSeason,
        );
        set({
          gameState: {
            ...gameState,
            finances: { ...withRelationship, pendingRetainerOffers: pendingRetainers },
          },
        });
      }
    },

    cancelRetainerContract: (contractId: string) => {
      const { gameState } = get();
      if (!gameState || !gameState.finances) return;
      const updated = cancelRetainer(gameState.finances, contractId);
      set({ gameState: { ...gameState, finances: updated } });
    },

    enrollInCourse: (courseId: string) => {
      const { gameState } = get();
      if (!gameState || !gameState.finances) return;
      const educationBudgetAvailable = gameState.scout.careerPath === "club"
        && gameState.scout.employmentContract?.status !== "terminated"
        ? gameState.scout.employmentContract?.educationBudget ?? 0
        : 0;
      const result = enrollInCourse(
        gameState.finances, courseId,
        gameState.currentWeek, gameState.currentSeason,
        gameState.scout.careerTier,
        getSeasonLength(gameState.fixtures, gameState.currentSeason),
        educationBudgetAvailable,
      );
      if (result.success) {
        const employmentContract = gameState.scout.employmentContract;
        const scout = result.educationBudgetUsed > 0 && employmentContract
          ? {
              ...gameState.scout,
              employmentContract: {
                ...employmentContract,
                educationBudget: Math.max(
                  0,
                  employmentContract.educationBudget - result.educationBudgetUsed,
                ),
              },
            }
          : gameState.scout;
        set({ gameState: { ...gameState, scout, finances: result.finances } });
      } else {
        // Send inbox message with the failure reason
        const msg: InboxMessage = {
          id: `enroll_fail_${gameState.currentWeek}_${courseId}`,
          week: gameState.currentWeek,
          season: gameState.currentSeason,
          type: "event" as const,
          title: "Enrollment Failed",
          body: result.reason,
          read: false,
          actionRequired: false,
        };
        set({
          gameState: {
            ...gameState,
            inbox: [msg, ...gameState.inbox],
          },
        });
      }
    },

    upgradeAgencyOffice: (tier: OfficeTier) => {
      const { gameState } = get();
      if (!gameState || !gameState.finances) return;
      const updated = upgradeOffice(gameState.finances, tier);
      if (updated) {
        set({ gameState: { ...gameState, finances: updated } });
      }
    },

    hireAgencyEmployee: (role: AgencyEmployeeRole) => {
      const { gameState } = get();
      if (!gameState || !gameState.finances) return;
      const actionSequence = (gameState.finances.actionSequence ?? 0) + 1;
      const rng = createRNG(
        `${gameState.runManifest.rootSeed}-hire-s${gameState.currentSeason}w${gameState.currentWeek}-a${actionSequence}`,
      );
      const regions = gameState.countries ?? [];
      const updated = hireEmployee(
        rng,
        gameState.finances,
        role,
        gameState.currentWeek,
        gameState.currentSeason,
        regions,
        actionSequence,
        gameState.scout.reputation,
      );
      if (updated) {
        set({ gameState: { ...gameState, finances: updated } });
      }
    },

    fireAgencyEmployee: (employeeId: string) => {
      const { gameState } = get();
      if (!gameState || !gameState.finances) return;
      const updated = fireEmployee(
        gameState.finances,
        employeeId,
        gameState.currentWeek,
        gameState.currentSeason,
      );
      set({ gameState: { ...gameState, finances: updated } });
    },

    assignAgencyEmployee: (employeeId: string, assignment: EmployeeAssignment) => {
      const { gameState } = get();
      if (!gameState?.finances) return;
      const updated = {
        ...gameState.finances,
        employees: gameState.finances.employees.map((emp) =>
          emp.id === employeeId ? { ...emp, currentAssignment: assignment } : emp,
        ),
      };
      set({ gameState: { ...gameState, finances: updated } });
    },

    pitchToClient: (clubId: string, pitchType: "coldCall" | "referral" | "showcase") => {
      const { gameState } = get();
      if (!gameState?.finances) return;
      const club = gameState.clubs[clubId];
      if (!club) return;
      const actionSequence = (gameState.finances.actionSequence ?? 0) + 1;
      const rng = createRNG(
        `${gameState.runManifest.rootSeed}-pitch-s${gameState.currentSeason}w${gameState.currentWeek}-a${actionSequence}`,
      );
      const sequencedFinances = {
        ...gameState.finances,
        actionSequence,
      };
      const result = pitchToClub(
        rng,
        gameState.scout,
        gameState.finances,
        club,
        pitchType,
        actionSequence,
      );
      if (result.success && result.offeredContract) {
        const financesWithRelationship = ensureClientRelationship(
          sequencedFinances, clubId, gameState.currentWeek, gameState.currentSeason,
        );
        set({
          gameState: {
            ...gameState,
            finances: {
              ...financesWithRelationship,
              pendingRetainerOffers: [...financesWithRelationship.pendingRetainerOffers, result.offeredContract],
            },
          },
        });
      } else {
        // Failed pitches still consume their deterministic action ordinal, so
        // reload/retry cannot replay the same roll or later reuse its ID.
        set({ gameState: { ...gameState, finances: sequencedFinances } });
      }
    },

    resolveAgencyEmployeeEvent: (eventId: string, optionIndex: number) => {
      const { gameState } = get();
      if (!gameState?.finances) return;
      const updated = resolveEmployeeEventEngine(
        gameState.finances,
        eventId,
        optionIndex,
        gameState.currentWeek,
        gameState.currentSeason,
        gameState.scout.reputation,
      );
      set({ gameState: { ...gameState, finances: updated } });
    },

    adjustEmployeeSalary: (employeeId: string, newSalary: number) => {
      const { gameState } = get();
      if (!gameState?.finances) return;
      const updated = renegotiateEmployeeSalary(
        gameState.finances,
        employeeId,
        newSalary,
        gameState.scout.reputation,
        gameState.currentWeek,
        gameState.currentSeason,
      );
      set({ gameState: { ...gameState, finances: updated } });
    },

    openAgencySatelliteOffice: (region: string) => {
      const { gameState } = get();
      if (!gameState?.finances) return;
      if (!isTravelEligibleCountry(gameState, region)) return;
      const actionSequence = (gameState.finances.actionSequence ?? 0) + 1;
      const updated = openSatelliteOffice(
        gameState.finances,
        region,
        gameState.currentWeek,
        gameState.currentSeason,
        actionSequence,
      );
      if (updated) set({ gameState: { ...gameState, finances: updated } });
    },

    closeAgencySatelliteOffice: (officeId: string) => {
      const { gameState } = get();
      if (!gameState?.finances) return;
      const office = gameState.finances.satelliteOffices.find((candidate) => candidate.id === officeId);
      if (!office) return;
      const affectedEmployees = office.employeeIds.length;
      const finances = closeSatelliteOffice(
        gameState.finances,
        officeId,
        gameState.currentWeek,
        gameState.currentSeason,
      );
      set({
        gameState: {
          ...gameState,
          finances,
          inbox: [
            ...gameState.inbox,
            {
              id: `satellite-closed:${office.id}:s${gameState.currentSeason}:w${gameState.currentWeek}`,
              week: gameState.currentWeek,
              season: gameState.currentSeason,
              type: "financial",
              title: `Office closed in ${office.region}`,
              body: affectedEmployees > 0
                ? `${affectedEmployees} employee${affectedEmployees === 1 ? " was" : "s were"} reassigned. The disruption reduced morale, the closure cost was recorded, and local presence fell immediately.`
                : "The closure cost was recorded and local presence fell immediately.",
              read: false,
              actionRequired: false,
            },
          ],
        },
      });
    },

    relocateAgencyHomeBase: (country: string) => {
      const { gameState } = get();
      if (!gameState?.finances || !isTravelEligibleCountry(gameState, country)) return;
      const result = relocateHomeBase(
        gameState.finances,
        gameState.scout,
        country,
        gameState.currentWeek,
        gameState.currentSeason,
      );
      if (!result) return;
      set({
        gameState: {
          ...gameState,
          scout: result.scout,
          finances: result.finances,
          inbox: [
            ...gameState.inbox,
            {
              id: `home-base-relocated:${result.quote.destination}:s${gameState.currentSeason}:w${gameState.currentWeek}`,
              week: gameState.currentWeek,
              season: gameState.currentSeason,
              type: "news",
              title: "Agency headquarters relocated",
              body: `The ${result.quote.destination} office is now your permanent base. Your former base remains as an unstaffed satellite, so preserving that market now requires a deliberate staffing choice.`,
              read: false,
              actionRequired: false,
            },
          ],
        },
      });
    },

    assignEmployeeToAgencySatellite: (employeeId: string, officeId: string) => {
      const { gameState } = get();
      if (!gameState?.finances) return;
      set({ gameState: { ...gameState, finances: assignEmployeeToSatellite(gameState.finances, employeeId, officeId) } });
    },

    trainAgencyEmployee: (employeeId: string, skillIndex: 1 | 2 | 3) => {
      const { gameState } = get();
      if (!gameState?.finances) return;
      const updated = enrollInTraining(gameState.finances, employeeId, skillIndex);
      if (updated) {
        // Fix the week/season on the training transaction
        const lastTx = updated.transactions[updated.transactions.length - 1];
        if (lastTx && lastTx.week === 0) {
          const fixedTransactions = [...updated.transactions];
          fixedTransactions[fixedTransactions.length - 1] = {
            ...lastTx,
            week: gameState.currentWeek,
            season: gameState.currentSeason,
          };
          set({ gameState: { ...gameState, finances: { ...updated, transactions: fixedTransactions } } });
        } else {
          set({ gameState: { ...gameState, finances: updated } });
        }
      }
    },

    takeLoanAction: (type: LoanType, amount: number) => {
      const { gameState } = get();
      if (!gameState || !gameState.finances) return;
      const updated = takeLoan(
        gameState.finances, type, amount,
        gameState.currentWeek, gameState.currentSeason,
        gameState.scout.careerTier,
        getSeasonLength(gameState.fixtures, gameState.currentSeason),
      );
      if (updated) {
        set({ gameState: { ...gameState, finances: updated } });
      }
    },

    repayLoanAction: () => {
      const { gameState } = get();
      if (!gameState || !gameState.finances) return;
      const updated = repayLoanEarly(
        gameState.finances, gameState.currentWeek, gameState.currentSeason,
      );
      if (updated) {
        // Credit score boost for loan repayment
        const withCredit = creditForLoanRepayment(updated);
        set({ gameState: { ...gameState, finances: withCredit } });
      }
    },

    sellEquipmentForCashAction: (itemValue: number) => {
      const { gameState } = get();
      if (!gameState || !gameState.finances) return;
      const updated = sellEquipmentForCashEngine(
        gameState.finances, itemValue, gameState.currentWeek, gameState.currentSeason,
      );
      set({ gameState: { ...gameState, finances: updated } });
    },

    acceptConsultingContract: (contract: ConsultingContract) => {
      const { gameState } = get();
      if (!gameState || !gameState.finances) return;
      const updated = acceptConsulting(
        gameState.finances,
        contract,
        gameState.scout,
        gameState.currentWeek,
        gameState.currentSeason,
      );
      if (updated === gameState.finances) return;
      // Remove from pending offers
      const pendingConsulting = (updated.pendingConsultingOffers ?? []).filter(
        (c) => c.id !== contract.id,
      );
      const withRelationship = ensureClientRelationship(
        updated,
        contract.clubId,
        gameState.currentWeek,
        gameState.currentSeason,
      );
      set({
        gameState: {
          ...gameState,
          finances: { ...withRelationship, pendingConsultingOffers: pendingConsulting },
        },
      });
    },

    declineRetainerOffer: (contractId: string) => {
      const { gameState } = get();
      if (!gameState || !gameState.finances) return;
      const pending = (gameState.finances.pendingRetainerOffers ?? []).filter(
        (r) => r.id !== contractId,
      );
      set({ gameState: { ...gameState, finances: { ...gameState.finances, pendingRetainerOffers: pending } } });
    },

    declineConsultingOffer: (contractId: string) => {
      const { gameState } = get();
      if (!gameState || !gameState.finances) return;
      const pending = (gameState.finances.pendingConsultingOffers ?? []).filter(
        (c) => c.id !== contractId,
      );
      set({ gameState: { ...gameState, finances: { ...gameState.finances, pendingConsultingOffers: pending } } });
    },

    // W3c: Complete a consulting contract and receive payment
    completeConsultingContract: (contractId: string) => {
      const { gameState } = get();
      if (!gameState || !gameState.finances) return;
      const contract = gameState.finances.consultingContracts.find(
        (c) => c.id === contractId && c.status === "active",
      );
      if (!contract || !canCompleteConsulting(contract)) return;
      const updated = completeConsulting(
        gameState.finances,
        contractId,
        gameState.currentWeek,
        gameState.currentSeason,
      );
      if (updated === gameState.finances) return;
      set({
        gameState: {
          ...gameState,
          finances: updated,
          inbox: [
            ...gameState.inbox,
            {
              id: `consulting-complete-${contractId}`,
              week: gameState.currentWeek,
              season: gameState.currentSeason,
              type: "event" as const,
              title: "Consulting Contract Completed",
              body: `You've completed a ${contract.type.replace(/([A-Z])/g, " $1").toLowerCase()} consulting engagement. Payment of \u00A3${contract.fee.toLocaleString()} received.`,
              read: false,
              actionRequired: false,
            },
          ],
        },
      });
    },

    // F14: Financial Strategy Layer — infrastructure investments

    purchaseDataSubscriptionAction: (tier: DataSubscriptionTier) => {
      const { gameState } = get();
      if (!gameState) return;
      const updated = purchaseDataSubscription(gameState, tier);
      if (updated) set({ gameState: updated });
    },

    upgradeTravelBudgetAction: (tier: TravelBudgetTier) => {
      const { gameState } = get();
      if (!gameState) return;
      const updated = upgradeTravelBudget(gameState, tier);
      if (updated) set({ gameState: updated });
    },

    upgradeOfficeEquipmentAction: (tier: OfficeEquipmentTier) => {
      const { gameState } = get();
      if (!gameState) return;
      const updated = upgradeOfficeEquipment(gameState, tier);
      if (updated) set({ gameState: updated });
    },

    // F14: Financial Strategy Layer — assistant scouts

    hireAssistantScoutAction: () => {
      const { gameState } = get();
      if (!gameState?.finances) return;
      const actionSequence = (gameState.finances.actionSequence ?? 0) + 1;
      const rng = createRNG(
        `${gameState.runManifest.rootSeed}-hire-asst-s${gameState.currentSeason}w${gameState.currentWeek}-a${actionSequence}`,
      );
      const updated = hireAssistantScout(rng, gameState, actionSequence);
      if (updated) set({ gameState: updated });
    },

    fireAssistantScoutAction: (scoutId: string) => {
      const { gameState } = get();
      if (!gameState) return;
      set({ gameState: fireAssistantScout(gameState, scoutId) });
    },

    assignAssistantScoutAction: (scoutId: string, task: { playerId?: string; region?: string }) => {
      const { gameState } = get();
      if (!gameState) return;
      const updated = assignAssistantScout(gameState, scoutId, task);
      if (updated) set({ gameState: updated });
    },

    unassignAssistantScoutAction: (scoutId: string) => {
      const { gameState } = get();
      if (!gameState) return;
      const updated = unassignAssistantScout(gameState, scoutId);
      if (updated) set({ gameState: updated });
    },

    // ── Transfer Negotiation actions (F4) ──────────────────────────────────────

    initiateTransferNegotiation: (playerId: string) => {
      const { gameState } = get();
      if (!gameState || !gameState.scout.currentClubId) return;
      const windowOpen = gameState.transferWindow
        ? isTransferWindowOpen([gameState.transferWindow], gameState.currentWeek)
        : false;
      if (!windowOpen) {
        const message: InboxMessage = {
          id: `neg_window_closed_${playerId}_${gameState.currentSeason}_${gameState.currentWeek}`,
          week: gameState.currentWeek,
          season: gameState.currentSeason,
          type: "transferUpdate",
          title: "Transfer Window Closed",
          body: "Permanent transfer negotiations can only be opened during the summer or winter registration window.",
          read: false,
          actionRequired: false,
        };
        set({ gameState: { ...gameState, inbox: [...gameState.inbox, message] } });
        return;
      }
      const rng = createRNG(`${gameState.seed}-neg-init-${playerId}-${gameState.currentWeek}`);
      const negotiation = negotiationEngine.initiateNegotiation(rng, gameState, playerId, gameState.scout.currentClubId);
      if (!negotiation) return;
      const player = gameState.players[playerId];
      const fromClub = gameState.clubs[negotiation.fromClubId];
      const playerName = player ? `${player.firstName} ${player.lastName}` : "Unknown";
      const fmtPrice = negotiation.initialAskingPrice >= 1_000_000
        ? `\u00A3${(negotiation.initialAskingPrice / 1_000_000).toFixed(1)}M`
        : `\u00A3${(negotiation.initialAskingPrice / 1_000).toFixed(0)}K`;
      const message: InboxMessage = {
        id: `neg_start_${negotiation.id}`, week: gameState.currentWeek, season: gameState.currentSeason,
        type: "transferUpdate" as const, title: `Negotiation Started: ${playerName}`,
        body: `Your club has opened negotiations with ${fromClub?.name ?? "Unknown"} for ${playerName}. Their initial asking price is ${fmtPrice}.${negotiation.agentInvolved ? " An agent is involved in this deal." : ""}`,
        read: false, actionRequired: true, relatedId: negotiation.id, relatedEntityType: "transfer" as const,
      };
      set({
        gameState: { ...gameState, activeNegotiations: [...(gameState.activeNegotiations ?? []), negotiation], inbox: [...gameState.inbox, message] },
        activeNegotiationId: negotiation.id, currentScreen: "negotiation" as GameScreen,
      });
    },

    submitTransferOffer: (negotiationId: string, amount: number, addOns?: TransferAddOn[]) => {
      const { gameState } = get();
      if (!gameState) return;
      const negotiations = gameState.activeNegotiations ?? [];
      const negIndex = negotiations.findIndex((n) => n.id === negotiationId);
      if (negIndex === -1) return;
      const neg = negotiations[negIndex];
      if (neg.phase === "completed" || neg.phase === "collapsed") return;
      const buyingClub = gameState.clubs[neg.toClubId];
      const signingBonus = neg.agentDemands?.signingBonus ?? 0;
      const player = gameState.players[neg.playerId];
      if (!buyingClub || !player || amount < 0) return;
      const projectedWage = Math.max(
        player.wage,
        Math.round(player.wage * (1 + (neg.agentDemands?.wagePremium ?? 0.1))),
      );
      const projectedAddOnObligations = buildTransferAddOnObligations({
        playerId: player.id,
        creditorClubId: neg.fromClubId,
        addOns: addOns ?? [],
        currentWeek: gameState.currentWeek,
        currentSeason: gameState.currentSeason,
      });
      const projectedAddOnCommitment = projectedAddOnObligations.reduce(
        (total, obligation) => total + (obligation.weeklyAmount ?? 0),
        0,
      );
      if (!assessClubAffordability({
        club: buyingClub,
        players: gameState.players,
        upfrontCost: amount + signingBonus,
        weeklyWageCommitment: projectedWage,
        weeklyObligationCommitment: projectedAddOnCommitment,
        contingentReserve: getTransferContingentReserve(projectedAddOnObligations),
      }).affordable) return;
      const rng = createRNG(`${gameState.seed}-neg-offer-${negotiationId}-${neg.rounds.length}`);
      const updated = negotiationEngine.submitOffer(rng, neg, amount, addOns, gameState);
      const updatedNegotiations = [...negotiations];
      updatedNegotiations[negIndex] = updated;
      const lastRound = updated.rounds[updated.rounds.length - 1];
      const playerNameRecord = gameState.players[updated.playerId];
      const playerName = playerNameRecord ? `${playerNameRecord.firstName} ${playerNameRecord.lastName}` : "Unknown";
      const fromClub = gameState.clubs[updated.fromClubId];
      const fmtAmt = (v: number) => v >= 1_000_000 ? `\u00A3${(v / 1_000_000).toFixed(1)}M` : `\u00A3${(v / 1_000).toFixed(0)}K`;
      let messageBody: string;
      if (lastRound.response === "accepted") {
        messageBody = `${fromClub?.name ?? "The selling club"} has accepted your offer of ${fmtAmt(amount)} for ${playerName}!`;
      } else if (lastRound.response === "rejected") {
        messageBody = `${fromClub?.name ?? "The selling club"} has rejected your offer for ${playerName}. Negotiations have collapsed.`;
      } else {
        messageBody = `${fromClub?.name ?? "The selling club"} has countered with an asking price of ${fmtAmt(lastRound.askingAmount)} for ${playerName}.`;
      }
      const message: InboxMessage = {
        id: `neg_round_${negotiationId}_${updated.rounds.length}`, week: gameState.currentWeek, season: gameState.currentSeason,
        type: "transferUpdate" as const,
        title: lastRound.response === "accepted" ? `Offer Accepted: ${playerName}` : lastRound.response === "rejected" ? `Offer Rejected: ${playerName}` : `Counter-Offer: ${playerName}`,
        body: messageBody, read: false, actionRequired: lastRound.response === "countered",
        relatedId: negotiationId, relatedEntityType: "transfer" as const,
      };
      set({ gameState: { ...gameState, activeNegotiations: updatedNegotiations, inbox: [...gameState.inbox, message] } });
    },

    acceptNegotiation: (negotiationId: string) => {
      const { gameState } = get();
      if (!gameState) return;
      const windowOpen = gameState.transferWindow
        ? isTransferWindowOpen([gameState.transferWindow], gameState.currentWeek)
        : false;
      if (!windowOpen) return;
      const negotiations = gameState.activeNegotiations ?? [];
      const neg = negotiations.find((n) => n.id === negotiationId);
      if (!neg || neg.phase !== "completed") return;
      const player = gameState.players[neg.playerId];
      const fromClub = gameState.clubs[neg.fromClubId];
      const toClub = gameState.clubs[neg.toClubId];
      if (!player || !fromClub || !toClub) return;
      const outcome = negotiationEngine.evaluateNegotiationOutcome(neg, player, fromClub, toClub);
      if (!outcome.accepted) {
        const failedNeg = { ...neg, phase: "collapsed" as const };
        const updatedNegs = negotiations.map((n) => n.id === negotiationId ? failedNeg : n);
        const message: InboxMessage = {
          id: `neg_personal_fail_${negotiationId}`, week: gameState.currentWeek, season: gameState.currentSeason,
          type: "transferUpdate" as const, title: `Personal Terms Rejected: ${player.firstName} ${player.lastName}`,
          body: outcome.reason, read: false, actionRequired: false,
          relatedId: neg.playerId, relatedEntityType: "player" as const,
        };
        set({ gameState: { ...gameState, activeNegotiations: updatedNegs, inbox: [...gameState.inbox, message] }, activeNegotiationId: null, currentScreen: "dashboard" as GameScreen });
        return;
      }
      const lastRound = neg.rounds[neg.rounds.length - 1];
      const transferFee = lastRound?.offerAmount ?? neg.initialAskingPrice;
      const signingBonus = neg.agentDemands?.signingBonus ?? 0;
      const agreedWage = Math.max(
        player.wage,
        Math.round(player.wage * (1 + (neg.agentDemands?.wagePremium ?? 0.1))),
      );
      const resolution = resolvePlayerMovements(
        getLifecycleWorld(gameState),
        [{
          type: "permanentTransfer",
          playerId: player.id,
          fromClubId: neg.fromClubId,
          toClubId: neg.toClubId,
          fee: transferFee,
          signingBonus,
          wage: agreedWage,
          addOns: lastRound?.addOns ?? [],
          contractLength: player.age >= 32 ? 2 : 4,
          reason: "Scout-led transfer negotiation completed",
        }],
        gameState.currentWeek,
        gameState.currentSeason,
        getSeasonLength(gameState.fixtures, gameState.currentSeason),
      );
      if (resolution.applied.length === 0) {
        const failedNeg = { ...neg, phase: "collapsed" as const };
        const failedMessage: InboxMessage = {
          id: `neg_lifecycle_fail_${negotiationId}`,
          week: gameState.currentWeek,
          season: gameState.currentSeason,
          type: "transferUpdate",
          title: `Transfer Could Not Be Registered: ${player.firstName} ${player.lastName}`,
          body: resolution.rejected[0]?.reason ?? "The transfer no longer meets registration requirements.",
          read: false,
          actionRequired: false,
          relatedId: player.id,
          relatedEntityType: "player",
        };
        set({
          gameState: {
            ...gameState,
            activeNegotiations: negotiations.map((n) => n.id === negotiationId ? failedNeg : n),
            inbox: [...gameState.inbox, failedMessage],
          },
          activeNegotiationId: null,
          currentScreen: "dashboard" as GameScreen,
        });
        return;
      }

      const lifecycleState = withLifecycleWorld(gameState, resolution.state);
      const matchingReport = Object.values(gameState.reports)
        .filter((report) => report.playerId === neg.playerId && report.scoutId === gameState.scout.id)
        .sort((a, b) => b.submittedSeason - a.submittedSeason || b.submittedWeek - a.submittedWeek)[0];
      const transferRecord: TransferRecord = {
        id: `tr_${neg.id}`, playerId: neg.playerId, reportId: matchingReport?.id ?? "",
        scoutId: gameState.scout.id,
        fromClubId: neg.fromClubId, toClubId: neg.toClubId, fee: transferFee,
        transferSeason: gameState.currentSeason, transferWeek: gameState.currentWeek,
        scoutConviction: matchingReport?.conviction ?? "recommend",
        caAtTransfer: player.currentAbility,
        seasonsSinceTransfer: 0,
        accountabilityApplied: false,
      };
      const updatedNegs = negotiations.map((n) => n.id === negotiationId ? { ...n, phase: "completed" as const } : n);
      const feeLabel = transferFee >= 1_000_000
        ? `£${(transferFee / 1_000_000).toFixed(1)}M`
        : `£${Math.round(transferFee / 1_000)}K`;
      const completionMessage: InboxMessage = {
        id: `transfer_${neg.id}`,
        week: gameState.currentWeek,
        season: gameState.currentSeason,
        type: "transferUpdate",
        title: `Transfer Complete: ${player.firstName} ${player.lastName}`,
        body: `${player.firstName} ${player.lastName} has joined ${toClub.name} from ${fromClub.name} for ${feeLabel}. A ${player.age >= 32 ? 2 : 4}-year contract was registered at £${agreedWage.toLocaleString()}/week${signingBonus > 0 ? ` with a £${signingBonus.toLocaleString()} signing bonus` : ""}.${(lastRound?.addOns?.length ?? 0) > 0 ? ` ${lastRound!.addOns!.length} negotiated add-on${lastRound!.addOns!.length === 1 ? "" : "s"} now sit in the club's future obligations.` : ""}`,
        read: false,
        actionRequired: false,
        relatedId: player.id,
        relatedEntityType: "player",
      };
      set({
        gameState: {
          ...lifecycleState,
          activeNegotiations: updatedNegs, transferRecords: [...gameState.transferRecords, transferRecord],
          reports: matchingReport
            ? { ...gameState.reports, [matchingReport.id]: { ...matchingReport, clubResponse: "signed" } }
            : gameState.reports,
          inbox: [...gameState.inbox, completionMessage],
        },
        activeNegotiationId: null, currentScreen: "dashboard" as GameScreen,
      });
    },

    walkAway: (negotiationId: string) => {
      const { gameState } = get();
      if (!gameState) return;
      const negotiations = gameState.activeNegotiations ?? [];
      const neg = negotiations.find((n) => n.id === negotiationId);
      if (!neg) return;
      const rng = createRNG(`${gameState.seed}-neg-walkaway-${negotiationId}`);
      const result = negotiationEngine.walkAwayFromNegotiation(neg, gameState, rng);
      const updatedNegs = negotiations.map((n) => n.id === negotiationId ? result.negotiation : n);
      set({
        gameState: {
          ...gameState, activeNegotiations: updatedNegs, inbox: [...gameState.inbox, result.message],
          scout: { ...gameState.scout, reputation: Math.max(0, Math.min(100, gameState.scout.reputation + result.reputationDelta)) },
        },
        activeNegotiationId: null, currentScreen: "dashboard" as GameScreen,
      });
    },

    // ── Free Agent Negotiation actions ────────────────────────────────────────

    initiateFreeAgentNegotiation: (playerId: string, wage: number, bonus: number, contractLength: number) => {
      const { gameState } = get();
      if (!gameState || !gameState.scout.currentClubId) return;
      const pool = gameState.freeAgentPool;
      const agent = pool.agents.find((a) => a.playerId === playerId && a.status === "available");
      if (!agent) return;
      const player = gameState.players[playerId];
      if (!player) return;
      const club = gameState.clubs[gameState.scout.currentClubId];
      if (!club) return;
      if (wage < 100 || bonus < 0 || bonus > club.budget || contractLength < 1) return;
      const affordability = assessClubAffordability({
        club,
        players: gameState.players,
        upfrontCost: bonus,
        weeklyWageCommitment: wage,
      });
      if (!affordability.affordable) {
        set({
          gameState: {
            ...gameState,
            inbox: [
              ...gameState.inbox,
              {
                id: `fa_budget_reject_${playerId}_${gameState.currentSeason}_${gameState.currentWeek}`,
                week: gameState.currentWeek,
                season: gameState.currentSeason,
                type: "financial",
                title: "Package Exceeds Club Budget",
                body: `This offer would leave ${club.name} with ${Math.max(0, affordability.remainingWeeklyHeadroom).toLocaleString()} in weekly wage headroom and ${Math.max(0, affordability.remainingBudget).toLocaleString()} in transfer cash. Reduce the wage or bonus before opening talks.`,
                read: false,
                actionRequired: false,
              },
            ],
          },
        });
        return;
      }

      // Check club acceptance first (conviction-based)
      const observations = Object.values(gameState.observations).filter((o) => o.playerId === playerId);
      const acceptanceChance = calculateFreeAgentAcceptance(player, club, gameState.scout, observations);
      const acceptRng = createRNG(`${gameState.seed}-fa-accept-${playerId}-${gameState.currentWeek}`);
      if (!acceptRng.chance(acceptanceChance)) {
        const rejectMsg: InboxMessage = {
          id: `fa_club_reject_${playerId}_${gameState.currentWeek}`,
          week: gameState.currentWeek, season: gameState.currentSeason,
          type: "clubResponse" as const,
          title: `${club.name} Declines Free Agent Pursuit`,
          body: `The club has decided not to pursue ${player.firstName} ${player.lastName} as a free agent signing at this time. Build more conviction through additional observations.`,
          read: false, actionRequired: false,
        };
        set({ gameState: { ...gameState, inbox: [...gameState.inbox, rejectMsg] } });
        return;
      }

      const rng = createRNG(`${gameState.seed}-fa-neg-${playerId}-${gameState.currentWeek}`);
      const negotiation = initFANegotiation(
        agent,
        player,
        wage,
        bonus,
        contractLength,
        gameState.currentWeek,
        gameState.currentSeason,
        rng,
        getSeasonLength(gameState.fixtures, gameState.currentSeason),
      );
      const message = generateNegotiationMessage(negotiation, player, club, rng, gameState.currentWeek, gameState.currentSeason);

      // Mark agent as in negotiation
      const updatedAgents = pool.agents.map((a) =>
        a.playerId === playerId ? { ...a, status: "inNegotiation" as const } : a,
      );

      if (negotiation.status === "accepted") {
        // Immediate acceptance — process signing
        const signingState = completeFreeAgentSigning(
          gameState,
          playerId,
          wage,
          bonus,
          contractLength,
        );
        if (!signingState) return;
        set({
          gameState: {
            ...signingState,
            freeAgentNegotiations: gameState.freeAgentNegotiations.filter((n) => n.freeAgentId !== playerId),
            inbox: [...gameState.inbox, message],
          },
        });
      } else {
        set({
          gameState: {
            ...gameState,
            freeAgentPool: { ...pool, agents: updatedAgents },
            freeAgentNegotiations: [...gameState.freeAgentNegotiations, negotiation],
            inbox: [...gameState.inbox, message],
          },
        });
      }
    },

    submitFreeAgentOffer: (playerId: string, wage: number, bonus: number, contractLength: number) => {
      const { gameState } = get();
      if (!gameState || !gameState.scout.currentClubId) return;
      const negIndex = gameState.freeAgentNegotiations.findIndex((n) => n.freeAgentId === playerId);
      if (negIndex === -1) return;
      const negotiation = gameState.freeAgentNegotiations[negIndex];
      if (negotiation.status !== "countered") return;

      const pool = gameState.freeAgentPool;
      const agent = pool.agents.find((a) => a.playerId === playerId);
      if (!agent) return;
      const player = gameState.players[playerId];
      if (!player) return;
      const club = gameState.clubs[gameState.scout.currentClubId];
      if (!club) return;
      if (wage < 100 || bonus < 0 || bonus > club.budget || contractLength < 1) return;

      const rng = createRNG(`${gameState.seed}-fa-offer-${playerId}-${negotiation.round}`);
      const updated = advanceFreeAgentNegotiation(negotiation, agent, player, wage, bonus, contractLength, rng);
      const message = generateNegotiationMessage(updated, player, club, rng, gameState.currentWeek, gameState.currentSeason);

      if (updated.status === "accepted") {
        const signingState = completeFreeAgentSigning(
          gameState,
          playerId,
          wage,
          bonus,
          contractLength,
        );
        if (!signingState) return;
        set({
          gameState: {
            ...signingState,
            freeAgentNegotiations: gameState.freeAgentNegotiations.filter((n) => n.freeAgentId !== playerId),
            inbox: [...gameState.inbox, message],
          },
        });
      } else if (updated.status === "rejected") {
        const releasedAgents = pool.agents.map((a) =>
          a.playerId === playerId ? { ...a, status: "available" as const } : a,
        );
        set({
          gameState: {
            ...gameState,
            freeAgentPool: { ...pool, agents: releasedAgents },
            freeAgentNegotiations: gameState.freeAgentNegotiations.filter((n) => n.freeAgentId !== playerId),
            inbox: [...gameState.inbox, message],
          },
        });
      } else {
        const updatedNegotiations = [...gameState.freeAgentNegotiations];
        updatedNegotiations[negIndex] = updated;
        set({
          gameState: {
            ...gameState,
            freeAgentNegotiations: updatedNegotiations,
            inbox: [...gameState.inbox, message],
          },
        });
      }
    },

    // Player Loan actions

    recommendPlayerForLoan: (playerId: string, targetClubId: string, rationale: "development" | "playing-time" | "experience" | "squad-depth", duration: number) => {
      const { gameState } = get();
      if (!gameState) return;
      const scout = gameState.scout;
      const player = gameState.players[playerId];
      const targetClub = gameState.clubs[targetClubId];
      if (!player || !targetClub) return;
      const ownerClubId = player.contractClubId ?? player.loanParentClubId ?? player.clubId;
      if (!scout.currentClubId || ownerClubId !== scout.currentClubId || player.onLoan) return;
      const windowOpen = gameState.transferWindow
        ? isTransferWindowOpen([gameState.transferWindow], gameState.currentWeek)
        : false;
      if (!windowOpen || targetClubId === ownerClubId) return;
      if ((gameState.loanRecommendations ?? []).some((item) =>
        item.playerId === playerId && (item.status ?? "pending") === "pending"
      )) return;

      const rng = createRNG(`${gameState.seed}-loanrec-${playerId}-${gameState.currentWeek}`);
      const wageContribution = 50; // default 50% wage contribution suggestion
      const recommendation = generateLoanRecommendation(
        scout, player, targetClub, rationale, duration, wageContribution,
        gameState.currentWeek, gameState.currentSeason, rng,
      );

      const message: InboxMessage = {
        id: `msg_loanrec_${playerId}_${gameState.currentWeek}`,
        week: gameState.currentWeek,
        season: gameState.currentSeason,
        type: "feedback",
        title: `Loan Recommendation Submitted`,
        body: `You recommended ${player.firstName} ${player.lastName} for a ${duration}-week loan to ${targetClub.name} (${rationale}).`,
        read: false,
        actionRequired: false,
        relatedId: playerId,
        relatedEntityType: "player",
      };

      set({
        gameState: {
          ...gameState,
          loanRecommendations: [...(gameState.loanRecommendations ?? []), recommendation],
          inbox: [...gameState.inbox, message],
        },
      });
    },

    submitLoanMonitoringReport: (loanDealId: string) => {
      const { gameState } = get();
      if (!gameState) return;
      const deal = (gameState.activeLoans ?? []).find((l) => l.id === loanDealId);
      if (!deal) return;
      const monitoringKey = `${gameState.currentSeason}:${gameState.currentWeek}`;
      if ((deal.monitoringWeeks ?? []).includes(monitoringKey)) return;
      const player = gameState.players[deal.playerId];

      const rng = createRNG(`${gameState.seed}-loanmon-${loanDealId}-${gameState.currentWeek}`);
      const result = processLoanMonitoringReport(
        gameState.scout, deal, player, gameState.currentWeek, gameState.currentSeason, rng,
      );

      const reputationUpdatedScout = {
        ...gameState.scout,
        reputation: Math.min(100, gameState.scout.reputation + result.reputationDelta),
      };
      const updatedScout = applyScoutSkillXp(
        reputationUpdatedScout,
        {
          [gameState.scout.primarySpecialization === "youth"
            ? "potentialAssessment"
            : "playerJudgment"]: result.xpAward,
        },
      );
      const updatedLoans = (gameState.activeLoans ?? []).map((activeDeal) =>
        activeDeal.id === deal.id
          ? { ...activeDeal, monitoringWeeks: [...(activeDeal.monitoringWeeks ?? []), monitoringKey] }
          : activeDeal,
      );

      set({
        gameState: {
          ...gameState,
          scout: updatedScout,
          activeLoans: updatedLoans,
          inbox: [...gameState.inbox, result.message],
        },
      });
    },

    recallLoanPlayer: (loanDealId: string) => {
      const { gameState } = get();
      if (!gameState) return;
      const dealIndex = (gameState.activeLoans ?? []).findIndex((l) => l.id === loanDealId);
      if (dealIndex === -1) return;
      const deal = gameState.activeLoans![dealIndex];
      if (!deal.recallClause) return; // recall only allowed with clause

      // Check transfer window is open
      if (gameState.transferWindow && !isTransferWindowOpen([gameState.transferWindow], gameState.currentWeek)) return;

      const player = gameState.players[deal.playerId];
      if (!player) return;
      const parentClub = gameState.clubs[deal.parentClubId];
      const loanClub = gameState.clubs[deal.loanClubId];
      if (!parentClub || !loanClub) return;

      const resolution = resolvePlayerMovements(
        getLifecycleWorld(gameState),
        [{
          type: "loanEnd",
          playerId: player.id,
          dealId: deal.id,
          resolution: "recall",
          outcome: "recalled-early",
          reason: "Scout requested an in-window loan recall",
        }],
        gameState.currentWeek,
        gameState.currentSeason,
        getSeasonLength(gameState.fixtures, gameState.currentSeason),
      );
      if (resolution.applied.length === 0) return;
      const lifecycleState = withLifecycleWorld(gameState, resolution.state);

      const message: InboxMessage = {
        id: `msg_recall_${deal.playerId}_${gameState.currentWeek}`,
        week: gameState.currentWeek,
        season: gameState.currentSeason,
        type: "feedback",
        title: `Loan Recall: ${player.firstName} ${player.lastName}`,
        body: `${player.firstName} ${player.lastName} has been recalled from loan at ${loanClub.name} and returned to ${parentClub.name}.`,
        read: false,
        actionRequired: false,
        relatedId: player.id,
        relatedEntityType: "player",
      };

      set({
        gameState: {
          ...lifecycleState,
          inbox: [...gameState.inbox, message],
        },
      });
    },
  };
}
