/**
 * Contextual hint definitions and evaluator.
 *
 * Each HintDefinition describes a behavioral trigger: a condition function
 * that inspects a snapshot of game state (HintEvalContext) and returns true
 * when the hint is relevant. The evaluateHints() function selects the single
 * highest-priority hint that is both triggered and not yet dismissed.
 */

import type { ContextualHint } from "@/stores/tutorialStore";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Game state snapshot passed to hint evaluators. */
export interface HintEvalContext {
  currentWeek: number;
  currentSeason: number;
  fatigue: number;
  savings: number;
  hasClub: boolean;
  observationCount: number;
  reportCount: number;
  comparisonCount: number;
  networkMeetingsHeld: number;
  unfulfilledDirectiveWeeks: number;
  scheduledRestDays: number;
  /** Weeks until transfer window closes; null when no window is open. */
  transferWindowClosingIn: number | null;
  unsubmittedReportCount: number;
  specialization: string;
  /** Number of unclaimed perks available. */
  unclaimedPerks: number;
  /** Number of empty equipment slots. */
  emptyEquipmentSlots: number;
  /** Number of discoveries tracked. */
  discoveryCount: number;
  /** Number of alumni records. */
  alumniCount: number;
  /** True if the player has ever checked the alumni dashboard. */
  hasCheckedAlumni: boolean;
  /** True if the player has ever checked the leaderboard. */
  hasCheckedLeaderboard: boolean;
  /** Number of NPC scouts available for hire. */
  npcSlotsAvailable: number;
  /** Number of NPC scouts currently hired. */
  npcHiredCount: number;
  /** Number of free agents available. */
  freeAgentCount: number;
  /** True if the player has browsed the free agent list. */
  hasBrowsedFreeAgents: boolean;
  /** True if the loan market is active. */
  loanMarketActive: boolean;
  /** True if the player has browsed the loan market. */
  hasBrowsedLoans: boolean;
  /** Career tier (1-5). */
  careerTier: number;
}

export interface HintDefinition {
  id: string;
  /** Higher values are shown first when multiple conditions are met. */
  priority: number;
  condition: (ctx: HintEvalContext) => boolean;
  hint: ContextualHint;
}

// ---------------------------------------------------------------------------
// Hint definitions
// ---------------------------------------------------------------------------

export const HINT_DEFINITIONS: HintDefinition[] = [
  // ── Priority 9 ──────────────────────────────────────────────────────────

  {
    id: "high-fatigue",
    priority: 9,
    condition: (ctx) => ctx.fatigue >= 70 && ctx.scheduledRestDays === 0,
    hint: {
      id: "high-fatigue",
      message:
        "Your [[fatigue]] is getting dangerous. Schedule a [[rest-day]] or two — exhausted scouts make worse [[observation]]s.",
      cta: { label: "Open Calendar", screen: "calendar" },
      wikiArticle: "fatigue",
    },
  },

  {
    id: "low-savings",
    priority: 9,
    condition: (ctx) =>
      !ctx.hasClub && ctx.savings < 1000 && ctx.currentWeek >= 5,
    hint: {
      id: "low-savings",
      message:
        "Your [[savings]] are running low. Submit reports to the [[marketplace]] or place a youth player to earn income.",
      cta: { label: "Check Finances", screen: "finances" },
      wikiArticle: "income-sources",
    },
  },

  // ── Priority 8 ──────────────────────────────────────────────────────────

  {
    id: "unwritten-reports",
    priority: 8,
    condition: (ctx) =>
      ctx.observationCount >= 3 && ctx.reportCount === 0,
    hint: {
      id: "unwritten-reports",
      message:
        "You've observed several players but haven't written a report yet. Reports are how you build [[reputation]] and earn income.",
      cta: { label: "Write a Report", screen: "reportWriter" },
      wikiArticle: "conviction-levels",
    },
  },

  {
    id: "directive-unfulfilled",
    priority: 8,
    condition: (ctx) =>
      ctx.hasClub && ctx.unfulfilledDirectiveWeeks >= 4,
    hint: {
      id: "directive-unfulfilled",
      message:
        "Your manager's [[directive]] has been open for a while. Unfulfilled directives can affect your job security.",
      cta: { label: "Check Inbox", screen: "inbox" },
    },
  },

  // ── Priority 7 ──────────────────────────────────────────────────────────

  {
    id: "transfer-window-closing",
    priority: 7,
    condition: (ctx) =>
      ctx.transferWindowClosingIn !== null &&
      ctx.transferWindowClosingIn <= 2 &&
      ctx.unsubmittedReportCount > 0,
    hint: {
      id: "transfer-window-closing",
      message:
        "The [[transfer-window]] closes soon and you have unsubmitted reports. Submit them now or they'll miss the window.",
      cta: { label: "View Reports", screen: "reportHistory" },
    },
  },

  // ── Priority 6 ──────────────────────────────────────────────────────────

  {
    id: "first-conviction-tip",
    priority: 6,
    condition: (ctx) => ctx.reportCount === 1,
    hint: {
      id: "first-conviction-tip",
      message:
        "Nice work on your first report. Remember: higher [[conviction-level]] means bigger rewards — but also bigger [[reputation]] risk if you're wrong.",
      wikiArticle: "conviction-levels",
    },
  },

  {
    id: "no-contacts-met",
    priority: 6,
    condition: (ctx) =>
      ctx.currentWeek >= 4 && ctx.networkMeetingsHeld === 0,
    hint: {
      id: "no-contacts-met",
      message:
        "You haven't met any [[contact]]s yet. Network meetings reveal [[intel]] and open doors to new opportunities.",
      cta: { label: "Scout Network", screen: "network" },
      wikiArticle: "contact-types",
    },
  },

  // ── Priority 5 ──────────────────────────────────────────────────────────

  {
    id: "never-compared",
    priority: 5,
    condition: (ctx) =>
      ctx.observationCount >= 5 && ctx.comparisonCount === 0,
    hint: {
      id: "never-compared",
      message:
        "You've been observing players but haven't compared any yet. Comparisons help clubs see relative strengths.",
      cta: { label: "View Players", screen: "playerDatabase" },
    },
  },

  // ── Priority 4 ──────────────────────────────────────────────────────────

  {
    id: "explore-equipment",
    priority: 4,
    condition: (ctx) => ctx.currentWeek >= 6 && ctx.currentSeason === 1,
    hint: {
      id: "explore-equipment",
      message:
        "Have you checked your equipment? Better gear improves [[observation]] [[accuracy]], [[gut-feeling]] rates, and more.",
      cta: { label: "Equipment", screen: "equipment" },
      wikiArticle: "equipment-overview",
    },
  },

  {
    id: "try-training",
    priority: 4,
    condition: (ctx) => ctx.currentWeek >= 8 && ctx.currentSeason === 1,
    hint: {
      id: "try-training",
      message:
        "Training courses can boost your skills permanently. Check what's available.",
      cta: { label: "Training", screen: "training" },
    },
  },

  // ── Phase 4B: Expanded hints ──────────────────────────────────────────────

  {
    id: "unclaimed-perk",
    priority: 7,
    condition: (ctx) => ctx.unclaimedPerks > 0,
    hint: {
      id: "unclaimed-perk",
      message:
        "You've unlocked a new [[perk]]! Check your Career screen to claim it.",
      cta: { label: "Career", screen: "career" },
      wikiArticle: "career-tiers",
    },
  },

  {
    id: "empty-equipment-slots",
    priority: 7,
    condition: (ctx) => ctx.emptyEquipmentSlots > 0 && ctx.careerTier >= 2,
    hint: {
      id: "empty-equipment-slots",
      message:
        "You have empty [[equipment-slot]]s. Gear boosts your [[accuracy]] and [[report-quality]].",
      cta: { label: "Equipment", screen: "equipment" },
      wikiArticle: "equipment-overview",
    },
  },

  {
    id: "reports-no-discoveries",
    priority: 6,
    condition: (ctx) =>
      ctx.reportCount >= 3 && ctx.discoveryCount === 0,
    hint: {
      id: "reports-no-discoveries",
      message:
        "Keep submitting reports — clubs review them and may sign your finds. Your first [[discovery]] is a career milestone.",
      cta: { label: "Reports", screen: "reportHistory" },
    },
  },

  {
    id: "alumni-unchecked",
    priority: 6,
    condition: (ctx) => ctx.alumniCount > 0 && !ctx.hasCheckedAlumni,
    hint: {
      id: "alumni-unchecked",
      message:
        "Your placed youth are developing. Check the [[alumni]] Dashboard to see how they're progressing.",
      cta: { label: "Alumni", screen: "alumniDashboard" },
    },
  },

  {
    id: "season-over-leaderboard",
    priority: 5,
    condition: (ctx) =>
      ctx.currentSeason >= 2 && !ctx.hasCheckedLeaderboard,
    hint: {
      id: "season-over-leaderboard",
      message:
        "Season over! See how you rank against other scouts on the Leaderboard.",
      cta: { label: "Leaderboard", screen: "leaderboard" },
    },
  },

  {
    id: "npc-scouts-available",
    priority: 5,
    condition: (ctx) =>
      ctx.npcSlotsAvailable > 0 && ctx.npcHiredCount === 0 && ctx.careerTier >= 4,
    hint: {
      id: "npc-scouts-available",
      message:
        "You can now hire [[npc-scout]]s. Delegate territory coverage to extend your reach.",
      cta: { label: "Scouts", screen: "npcManagement" },
    },
  },

  {
    id: "free-agents-unbrowsed",
    priority: 5,
    condition: (ctx) =>
      ctx.freeAgentCount > 0 && !ctx.hasBrowsedFreeAgents,
    hint: {
      id: "free-agents-unbrowsed",
      message:
        "Free agents are available. Some could be hidden gems — no [[transfer-window]] required.",
      cta: { label: "Free Agents", screen: "agency" },
    },
  },

  {
    id: "never-used-comparison",
    priority: 4,
    condition: (ctx) =>
      ctx.observationCount >= 10 && ctx.comparisonCount === 0,
    hint: {
      id: "never-used-comparison",
      message:
        "Try comparing two players side-by-side in the Player Database. [[shortlist]] comparisons help clubs decide.",
      cta: { label: "Players", screen: "playerDatabase" },
    },
  },

  {
    id: "loan-market-active",
    priority: 4,
    condition: (ctx) => ctx.loanMarketActive && !ctx.hasBrowsedLoans,
    hint: {
      id: "loan-market-active",
      message:
        "The [[loan-deal]] market has opened. Check for temporary deals that could benefit your clients.",
      cta: { label: "Players", screen: "playerDatabase" },
    },
  },
];

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------

/**
 * Evaluates all hint definitions against the provided game state context
 * and returns the single highest-priority hint that is:
 *   1. Not in the dismissedHints set.
 *   2. Has a condition that passes for the current context.
 *
 * Returns null when no hints are applicable.
 */
export function evaluateHints(
  ctx: HintEvalContext,
  dismissedHints: Set<string>,
): ContextualHint | null {
  const candidates = HINT_DEFINITIONS.filter(
    (def) => !dismissedHints.has(def.id) && def.condition(ctx),
  );

  if (candidates.length === 0) return null;

  // Sort descending by priority; pick the first (highest priority).
  candidates.sort((a, b) => b.priority - a.priority);
  return candidates[0].hint;
}
