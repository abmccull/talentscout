/**
 * Industry awards — annual ceremony at season end for tier 5 agencies.
 */

import type { RNG } from "../rng/index";
import type { FinancialRecord, AwardRecord, Scout } from "../core/types";

// ---------------------------------------------------------------------------
// Annual award processing
// ---------------------------------------------------------------------------

/**
 * Process annual industry awards at the end of a season.
 * Only tier 5 independent scouts are eligible.
 *
 * Awards:
 *  - Scout of the Year:   reputation >= 70 with 30% chance
 *  - Best Agency:         avg client satisfaction >= 70, 3+ employees, 25% chance
 *  - Discovery of the Year: flat 15% chance
 *
 * Each award adds a cash bonus and reputation bonus (stored for UI to apply).
 */
export function processAnnualAwards(
  rng: RNG,
  finances: FinancialRecord,
  scout: Scout,
  season: number,
): { finances: FinancialRecord; wonAwards: AwardRecord[] } {
  // Only tier 5 agencies are eligible
  if ((scout.independentTier ?? 1) < 5) {
    return { finances, wonAwards: [] };
  }

  const awards: AwardRecord[] = [];

  // Scout of the Year
  if (scout.reputation >= 70 && rng.chance(0.3)) {
    awards.push({
      season,
      type: "scoutOfYear",
      title: "Scout of the Year",
      reputationBonus: 20,
      cashBonus: 10000,
    });
  }

  // Best Scouting Agency
  const avgSatisfaction =
    finances.clientRelationships.length > 0
      ? finances.clientRelationships.reduce((sum, cr) => sum + cr.satisfaction, 0) /
        finances.clientRelationships.length
      : 0;

  if (avgSatisfaction >= 70 && finances.employees.length >= 3 && rng.chance(0.25)) {
    awards.push({
      season,
      type: "bestAgency",
      title: "Best Scouting Agency",
      reputationBonus: 25,
      cashBonus: 15000,
    });
  }

  // Discovery of the Year
  if (rng.chance(0.15)) {
    awards.push({
      season,
      type: "discoveryOfYear",
      title: "Discovery of the Year",
      reputationBonus: 15,
      cashBonus: 5000,
    });
  }

  // Apply all awards to finances
  let updated = finances;
  for (const award of awards) {
    updated = {
      ...updated,
      balance: updated.balance + award.cashBonus,
      bonusRevenue: updated.bonusRevenue + award.cashBonus,
      awards: [...updated.awards, award],
      transactions: [
        ...updated.transactions,
        { week: 52, season, amount: award.cashBonus, description: `Award: ${award.title}` },
      ],
    };
  }

  return { finances: updated, wonAwards: awards };
}
