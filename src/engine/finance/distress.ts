/**
 * Financial Distress Cascade — escalating consequences for sustained negative balance.
 */

import type {
  FinancialRecord,
  DistressLevel,
  InboxMessage,
  Scout,
} from "../core/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DISTRESS_THRESHOLDS: Record<DistressLevel, { balance: number; weeks: number }> = {
  healthy: { balance: 0, weeks: 0 },
  warning: { balance: 0, weeks: 2 },
  distressed: { balance: -500, weeks: 4 },
  critical: { balance: -2000, weeks: 8 },
  bankruptcy: { balance: -5000, weeks: 12 },
};

const DISTRESS_ORDER: DistressLevel[] = [
  "healthy",
  "warning",
  "distressed",
  "critical",
  "bankruptcy",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDistressIndex(level: DistressLevel): number {
  return DISTRESS_ORDER.indexOf(level);
}

function createMessage(
  id: string,
  week: number,
  season: number,
  title: string,
  body: string,
  actionRequired: boolean = false,
): InboxMessage {
  return {
    id,
    week,
    season,
    type: "financial" as any,
    title,
    body,
    read: false,
    actionRequired,
  };
}

// ---------------------------------------------------------------------------
// Core Processing
// ---------------------------------------------------------------------------

export interface DistressResult {
  finances: FinancialRecord;
  scout: Scout;
  messages: InboxMessage[];
  /** Whether a forced rest is triggered (bankruptcy recovery). */
  forcedRest: boolean;
}

/**
 * Process financial distress for one week.
 * Called during advanceWeek after financial processing.
 */
export function processDistress(
  finances: FinancialRecord,
  scout: Scout,
  week: number,
  season: number,
): DistressResult {
  const messages: InboxMessage[] = [];
  let updatedFinances = { ...finances };
  let updatedScout = { ...scout };
  let forcedRest = false;

  const currentLevel = updatedFinances.distressLevel ?? "healthy";
  let weeksInDistress = updatedFinances.weeksInDistress ?? 0;

  // Track negative balance weeks
  if (updatedFinances.balance < 0) {
    weeksInDistress++;
  } else {
    // Recovery: reduce distress if balance is positive
    if (weeksInDistress > 0) weeksInDistress = Math.max(0, weeksInDistress - 2);
  }

  // Check bankruptcy recovery cooldown
  const cooldown = updatedFinances.bankruptcyRecoveryCooldown ?? 0;
  if (cooldown > 0) {
    updatedFinances = {
      ...updatedFinances,
      bankruptcyRecoveryCooldown: cooldown - 1,
      weeksInDistress: weeksInDistress,
    };
    return { finances: updatedFinances, scout: updatedScout, messages, forcedRest };
  }

  // Determine target distress level
  let targetLevel: DistressLevel = "healthy";
  for (const level of DISTRESS_ORDER) {
    const threshold = DISTRESS_THRESHOLDS[level];
    if (updatedFinances.balance <= threshold.balance && weeksInDistress >= threshold.weeks) {
      targetLevel = level;
    }
  }

  // Can only escalate one level at a time (no jumping from healthy to critical)
  const currentIndex = getDistressIndex(currentLevel);
  const targetIndex = getDistressIndex(targetLevel);
  let newLevel = currentLevel;

  if (targetIndex > currentIndex) {
    newLevel = DISTRESS_ORDER[currentIndex + 1];
  } else if (targetIndex < currentIndex && updatedFinances.balance > 0) {
    // De-escalate if balance is positive
    newLevel = DISTRESS_ORDER[Math.max(0, currentIndex - 1)];
  }

  // Apply consequences for the current level
  if (newLevel !== currentLevel) {
    const result = applyDistressTransition(
      updatedFinances,
      updatedScout,
      currentLevel,
      newLevel,
      week,
      season,
    );
    updatedFinances = result.finances;
    updatedScout = result.scout;
    messages.push(...result.messages);
    forcedRest = result.forcedRest;
  }

  // Ongoing per-week consequences
  const ongoing = applyOngoingDistress(updatedFinances, updatedScout, newLevel, week, season);
  updatedFinances = ongoing.finances;
  updatedScout = ongoing.scout;
  messages.push(...ongoing.messages);

  updatedFinances = {
    ...updatedFinances,
    distressLevel: newLevel,
    weeksInDistress: weeksInDistress,
  };

  return { finances: updatedFinances, scout: updatedScout, messages, forcedRest };
}

// ---------------------------------------------------------------------------
// Transition Effects
// ---------------------------------------------------------------------------

function applyDistressTransition(
  finances: FinancialRecord,
  scout: Scout,
  from: DistressLevel,
  to: DistressLevel,
  week: number,
  season: number,
): DistressResult {
  const messages: InboxMessage[] = [];
  let updatedFinances = { ...finances };
  let updatedScout = { ...scout };
  let forcedRest = false;
  const msgId = `distress_${to}_${week}_${season}`;

  switch (to) {
    case "warning":
      messages.push(
        createMessage(
          msgId, week, season,
          "Financial Warning",
          "Your balance has been negative for over 2 weeks. Continued spending beyond your means will have serious consequences. Consider reducing expenses or taking on additional work.",
          true,
        ),
      );
      break;

    case "distressed":
      // Cancel premium data subscription, reduce travel budget
      messages.push(
        createMessage(
          msgId, week, season,
          "Financial Distress — Forced Cutbacks",
          "Your finances are in serious trouble. Premium subscriptions have been cancelled and your travel budget has been reduced. Your reputation is starting to suffer.",
          true,
        ),
      );
      break;

    case "critical": {
      // Assistant scouts quit, lose retainer client
      const assistantCount = updatedFinances.employees.filter(
        (e) => e.role === "scout" || e.role === "mentee",
      ).length;
      if (assistantCount > 0) {
        updatedFinances = {
          ...updatedFinances,
          employees: updatedFinances.employees.filter(
            (e) => e.role !== "scout" && e.role !== "mentee",
          ),
        };
        messages.push(
          createMessage(
            `${msgId}_quit`, week, season,
            "Staff Departure",
            `Your assistant scouts have quit due to unpaid wages. ${assistantCount} employee(s) have left.`,
          ),
        );
      }
      // Lose one retainer client
      if (updatedFinances.retainerContracts.length > 0) {
        const lostContract = updatedFinances.retainerContracts[0];
        updatedFinances = {
          ...updatedFinances,
          retainerContracts: updatedFinances.retainerContracts.slice(1),
        };
        messages.push(
          createMessage(
            `${msgId}_retainer`, week, season,
            "Contract Terminated",
            `A retainer client has terminated their contract due to your financial instability.`,
          ),
        );
      }
      messages.push(
        createMessage(
          msgId, week, season,
          "Financial Crisis",
          "Your finances are critical. Staff have left and clients are pulling contracts. Immediate action required to prevent bankruptcy.",
          true,
        ),
      );
      break;
    }

    case "bankruptcy":
      // Force to tier 1, lose equipment, halve reputation
      updatedScout = {
        ...updatedScout,
        reputation: Math.floor(updatedScout.reputation / 2),
        careerTier: 1 as any,
      };
      updatedFinances = {
        ...updatedFinances,
        equipment: updatedFinances.equipment
          ? { ...updatedFinances.equipment, loadout: { head: null, body: null, accessory: null, tech: null, footwear: null } as any }
          : updatedFinances.equipment,
        retainerContracts: [],
        consultingContracts: [],
        bankruptcyRecoveryCooldown: 10,
      };
      forcedRest = true;
      messages.push(
        createMessage(
          msgId, week, season,
          "Bankruptcy",
          "You have been declared bankrupt. All equipment has been liquidated, contracts terminated, and your reputation has been severely damaged. You must rebuild from Tier 1. A 10-week recovery period is now in effect.",
          true,
        ),
      );
      break;

    case "healthy":
      if (from !== "healthy") {
        messages.push(
          createMessage(
            msgId, week, season,
            "Financial Recovery",
            "Your finances have stabilized. Keep maintaining a positive balance to continue improving your credit standing.",
          ),
        );
      }
      break;
  }

  return { finances: updatedFinances, scout: updatedScout, messages, forcedRest };
}

// ---------------------------------------------------------------------------
// Ongoing Per-Week Effects
// ---------------------------------------------------------------------------

function applyOngoingDistress(
  finances: FinancialRecord,
  scout: Scout,
  level: DistressLevel,
  _week: number,
  _season: number,
): { finances: FinancialRecord; scout: Scout; messages: InboxMessage[] } {
  let updatedScout = { ...scout };

  switch (level) {
    case "warning":
      // -1 credit score per week (handled via creditScore module)
      break;

    case "distressed":
      // -2 reputation per week
      updatedScout = {
        ...updatedScout,
        reputation: Math.max(0, updatedScout.reputation - 2),
      };
      break;

    case "critical":
      // -3 reputation per week
      updatedScout = {
        ...updatedScout,
        reputation: Math.max(0, updatedScout.reputation - 3),
      };
      break;

    default:
      break;
  }

  return { finances, scout: updatedScout, messages: [] };
}

// ---------------------------------------------------------------------------
// Recovery Mechanics
// ---------------------------------------------------------------------------

/**
 * Sell equipment for emergency cash (40% of original value).
 */
export function sellEquipmentForCash(
  finances: FinancialRecord,
  itemValue: number,
  week: number,
  season: number,
): FinancialRecord {
  const cashReceived = Math.round(itemValue * 0.4);
  return {
    ...finances,
    balance: finances.balance + cashReceived,
    transactions: [
      ...finances.transactions,
      {
        week,
        season,
        amount: cashReceived,
        description: "Equipment sold (emergency liquidation)",
      },
    ],
  };
}

/**
 * Get recovery suggestions based on current distress level.
 */
export function getRecoverySuggestions(
  finances: FinancialRecord,
): string[] {
  const level = finances.distressLevel ?? "healthy";
  const suggestions: string[] = [];

  if (level === "healthy") return suggestions;

  suggestions.push("Reduce lifestyle tier to lower monthly expenses");

  if (finances.equipment) {
    suggestions.push("Sell equipment for emergency cash (40% of value)");
  }

  if (finances.lifestyle.level > 1) {
    suggestions.push("Downgrade lifestyle to save on monthly costs");
  }

  if (level === "critical" || level === "bankruptcy") {
    suggestions.push("Take on emergency consulting work to generate income");
  }

  if (finances.careerPath === "club") {
    suggestions.push("Request a salary advance from your employer");
  }

  return suggestions;
}
