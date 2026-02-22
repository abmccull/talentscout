/**
 * Economic events — dynamic market conditions affecting pricing, demand,
 * and club behavior.
 */

import type { RNG } from "../rng/index";
import type {
  FinancialRecord,
  MarketTemperature,
  EconomicEvent,
  EconomicEventType,
  TransferWindowState,
} from "../core/types";

// ---------------------------------------------------------------------------
// Market temperature
// ---------------------------------------------------------------------------

/**
 * Update market temperature based on transfer window state and week.
 */
export function updateMarketTemperature(
  transferWindow: TransferWindowState | undefined,
  currentWeek: number,
): MarketTemperature {
  if (!transferWindow || !transferWindow.isOpen) {
    return "cold";
  }

  // Deadline pressure: last 2 weeks of window
  const weeksRemaining = transferWindow.closeWeek - currentWeek;
  if (weeksRemaining <= 2) {
    return "deadline";
  }

  // Hot during first half of window
  const windowLength = transferWindow.closeWeek - transferWindow.openWeek;
  const weeksSinceOpen = currentWeek - transferWindow.openWeek;
  if (weeksSinceOpen < windowLength / 2) {
    return "hot";
  }

  return "normal";
}

// ---------------------------------------------------------------------------
// Economic event generation
// ---------------------------------------------------------------------------

const EVENT_CONFIGS: Record<EconomicEventType, {
  description: string;
  multiplier: number;
  durationWeeks: number;
}> = {
  marketCrash: {
    description: "A financial crisis has hit football — transfer fees and scout fees are depressed.",
    multiplier: 0.6,
    durationWeeks: 12,
  },
  tvDealBonanza: {
    description: "A massive TV deal has flooded clubs with cash — prices are inflated.",
    multiplier: 1.5,
    durationWeeks: 16,
  },
  ffpInvestigation: {
    description: "FFP investigations are making clubs cautious with spending.",
    multiplier: 0.8,
    durationWeeks: 8,
  },
  newOwnership: {
    description: "A major club has new wealthy owners — spending is up across the league.",
    multiplier: 1.3,
    durationWeeks: 10,
  },
  wageCap: {
    description: "New wage regulations are constraining club budgets.",
    multiplier: 0.85,
    durationWeeks: 20,
  },
};

/**
 * Potentially generate a new economic event. ~5% chance per week.
 */
export function generateEconomicEvent(
  rng: RNG,
  finances: FinancialRecord,
  week: number,
  season: number,
): EconomicEvent | null {
  // Don't stack too many events
  if (finances.activeEconomicEvents.length >= 2) return null;

  // 5% chance per week
  if (!rng.chance(0.05)) return null;

  const types: EconomicEventType[] = [
    "marketCrash", "tvDealBonanza", "ffpInvestigation", "newOwnership", "wageCap",
  ];
  const type = rng.pick(types);

  // Don't duplicate active event types
  if (finances.activeEconomicEvents.some((e) => e.type === type)) return null;

  const config = EVENT_CONFIGS[type];

  return {
    id: `event_${type}_${week}_${season}`,
    type,
    description: config.description,
    multiplier: config.multiplier,
    startWeek: week,
    startSeason: season,
    durationWeeks: config.durationWeeks,
  };
}

/**
 * Apply a new economic event to the financial record.
 */
export function applyEconomicEvent(
  finances: FinancialRecord,
  event: EconomicEvent,
): FinancialRecord {
  return {
    ...finances,
    activeEconomicEvents: [...finances.activeEconomicEvents, event],
  };
}

/**
 * Expire old economic events that have exceeded their duration.
 */
export function expireEconomicEvents(
  finances: FinancialRecord,
  currentWeek: number,
  currentSeason: number,
): FinancialRecord {
  const active = finances.activeEconomicEvents.filter((event) => {
    const elapsed = event.startSeason === currentSeason
      ? currentWeek - event.startWeek
      : currentWeek + (38 - event.startWeek);
    return elapsed < event.durationWeeks;
  });

  return { ...finances, activeEconomicEvents: active };
}

/**
 * Get the combined price multiplier from market temperature and active events.
 */
export function getActiveEconomicMultiplier(finances: FinancialRecord): number {
  // Base multiplier from market temperature
  const tempMultipliers: Record<MarketTemperature, number> = {
    cold: 0.7,
    normal: 1.0,
    hot: 1.3,
    deadline: 1.8,
  };

  let multiplier = tempMultipliers[finances.marketTemperature];

  // Stack event multipliers
  for (const event of finances.activeEconomicEvents) {
    multiplier *= event.multiplier;
  }

  return multiplier;
}
