import type {
  Club,
  FinancialRecord,
  PlacementReport,
  Scout,
  ScoutReport,
} from "../core/types";
import { calculateDiscoveryBonus } from "./clubBonuses";
import { ensureClientRelationship } from "./clientRelationships";
import {
  calculatePlacementFee,
  calculateSellOnPercentage,
  triggerPlacementFee,
} from "./placementFees";

const YOUTH_PLACEMENT_BASIS_BY_REPUTATION = [
  { maxReputation: 39, value: 30_000 },
  { maxReputation: 54, value: 50_000 },
  { maxReputation: 69, value: 75_000 },
  { maxReputation: 84, value: 125_000 },
  { maxReputation: Number.POSITIVE_INFINITY, value: 175_000 },
] as const;

export interface YouthAgencySettlementInput {
  finances: FinancialRecord;
  scout: Pick<Scout, "careerPath" | "careerTier" | "reputation">;
  report: Pick<ScoutReport, "conviction">;
  placementReport: Pick<PlacementReport, "placementType">;
  club: Pick<Club, "id" | "reputation">;
  playerId: string;
  playerAge: number;
  movementId: string;
  week: number;
  season: number;
}

export interface YouthAgencySettlementResult {
  finances: FinancialRecord;
  referenceId: string;
  rewardKind: "placementFee" | "discoveryBonus" | "none";
  amount: number;
  sellOnPercentage: number;
  commercialOutcome: string;
}

function getYouthPlacementCommercialBasis(
  clubReputation: number,
  placementType?: PlacementReport["placementType"],
): number {
  const basis = YOUTH_PLACEMENT_BASIS_BY_REPUTATION.find((band) =>
    clubReputation <= band.maxReputation
  )?.value ?? YOUTH_PLACEMENT_BASIS_BY_REPUTATION.at(-1)!.value;
  return placementType === "academyIntake"
    ? Math.round(basis * 0.85)
    : basis;
}

function getYouthAgencySettlementReferenceId(
  movementId: string,
  rewardKind: YouthAgencySettlementResult["rewardKind"],
): string {
  return `youth-placement:${movementId}:${rewardKind}`;
}

export function settleYouthAgencyPlacement(
  input: YouthAgencySettlementInput,
): YouthAgencySettlementResult {
  if (input.scout.careerPath === "independent") {
    const commercialBasis = getYouthPlacementCommercialBasis(
      input.club.reputation,
      input.placementReport.placementType,
    );
    const amount = calculatePlacementFee(
      commercialBasis,
      input.report as ScoutReport,
      input.scout as Scout,
      0,
      true,
    );
    const sellOnPercentage = calculateSellOnPercentage(
      input.playerAge,
      input.report.conviction,
    );
    const referenceId = getYouthAgencySettlementReferenceId(
      input.movementId,
      "placementFee",
    );
    if (input.finances.transactions.some((transaction) => transaction.referenceId === referenceId)) {
      return {
        finances: input.finances,
        referenceId,
        rewardKind: "placementFee",
        amount,
        sellOnPercentage,
        commercialOutcome: `Commercial outcome: £${amount.toLocaleString()} placement fee${sellOnPercentage > 0 ? ` and ${(sellOnPercentage * 100).toFixed(1)}% sell-on clause already settled.` : " already settled."}`,
      };
    }

    const firstPlacementBonusAvailable = !input.finances.starterBonus?.firstPlacementBonusUsed;
    let finances = triggerPlacementFee(
      input.finances,
      amount,
      input.playerId,
      input.club.id,
      0,
      sellOnPercentage,
      input.week,
      input.season,
      referenceId,
    );
    const welcomeBonus = firstPlacementBonusAvailable
      && finances.starterBonus?.firstPlacementBonusUsed
      ? Math.round(amount * 0.25)
      : 0;
    finances = ensureClientRelationship(finances, input.club.id, input.week, input.season);
    finances = {
      ...finances,
      clientRelationships: finances.clientRelationships.map((relationship) =>
        relationship.clubId === input.club.id
          ? {
              ...relationship,
              totalRevenue: relationship.totalRevenue + amount,
              satisfaction: Math.min(100, relationship.satisfaction + 6),
              status: relationship.status === "prospect" ? "active" as const : relationship.status,
              lastInteractionWeek: input.week,
              lastInteractionSeason: input.season,
            }
          : relationship
      ),
    };

    return {
      finances,
      referenceId,
      rewardKind: "placementFee",
      amount,
      sellOnPercentage,
      commercialOutcome: `Commercial outcome: earned £${amount.toLocaleString()} placement fee${welcomeBonus > 0 ? ` plus a £${welcomeBonus.toLocaleString()} first-placement bonus` : ""}${sellOnPercentage > 0 ? ` and registered a ${(sellOnPercentage * 100).toFixed(1)}% sell-on clause.` : "."}`,
    };
  }

  if (input.scout.careerPath === "club") {
    const baseBonus = calculateDiscoveryBonus(
      getYouthPlacementCommercialBasis(
        input.club.reputation,
        input.placementReport.placementType,
      ),
      input.scout.careerTier,
      input.report.conviction,
    );
    const amount = baseBonus > 0 ? Math.max(100, Math.round(baseBonus * 0.6)) : 0;
    const referenceId = getYouthAgencySettlementReferenceId(
      input.movementId,
      amount > 0 ? "discoveryBonus" : "none",
    );
    if (input.finances.transactions.some((transaction) => transaction.referenceId === referenceId)) {
      return {
        finances: input.finances,
        referenceId,
        rewardKind: amount > 0 ? "discoveryBonus" : "none",
        amount,
        sellOnPercentage: 0,
        commercialOutcome: amount > 0
          ? `Commercial outcome: £${amount.toLocaleString()} club discovery bonus already settled.`
          : "Commercial outcome: no direct youth placement bonus at your current club tier.",
      };
    }
    if (amount <= 0) {
      return {
        finances: input.finances,
        referenceId,
        rewardKind: "none",
        amount: 0,
        sellOnPercentage: 0,
        commercialOutcome: "Commercial outcome: no direct youth placement bonus at your current club tier.",
      };
    }

    return {
      finances: {
        ...input.finances,
        balance: input.finances.balance + amount,
        bonusRevenue: input.finances.bonusRevenue + amount,
        transactions: [
          ...input.finances.transactions,
          {
            week: input.week,
            season: input.season,
            amount,
            description: "Academy discovery bonus",
            referenceId,
            category: "bonus",
            counterpartyId: input.club.id,
          },
        ],
      },
      referenceId,
      rewardKind: "discoveryBonus",
      amount,
      sellOnPercentage: 0,
      commercialOutcome: `Commercial outcome: earned £${amount.toLocaleString()} club discovery bonus.`,
    };
  }

  const referenceId = getYouthAgencySettlementReferenceId(input.movementId, "none");
  return {
    finances: input.finances,
    referenceId,
    rewardKind: "none",
    amount: 0,
    sellOnPercentage: 0,
    commercialOutcome: "Commercial outcome: no direct payment on the current career path.",
  };
}
