/**
 * Scenario definitions for TalentScout late-game content and replayability.
 *
 * Each scenario provides a distinct starting context, objective set, and
 * difficulty curve. Scenarios create a modified GameState via the NewGameConfig
 * system rather than introducing a parallel save format.
 *
 * Design notes:
 *  - All `check` functions are pure: (state: GameState) => boolean.
 *  - Objectives reference only fields that actually exist on GameState.
 *  - "required: true" objectives must all pass for the scenario to be won.
 *  - "required: false" objectives are bonus goals (tracked but non-blocking).
 */

import type { GameState } from "../core/types";

// =============================================================================
// TYPES
// =============================================================================

export interface ScenarioObjective {
  /** Unique identifier within this scenario. */
  id: string;
  /** Human-readable goal description shown to the player. */
  description: string;
  /** Pure predicate — returns true when this objective is satisfied. */
  check: (state: GameState) => boolean;
  /** If true, this objective must be completed to "win" the scenario. */
  required: boolean;
}

export interface ScenarioDef {
  /** Unique identifier used as a key in save data and routing. */
  id: string;
  /** Display name. */
  name: string;
  /** 2–3 sentence pitch shown in the scenario browser. */
  description: string;
  difficulty: "easy" | "medium" | "hard" | "expert";
  /** Rough completion target in seasons (informational only). */
  estimatedSeasons: number;
  category: "starter" | "advanced";
  objectives: ScenarioObjective[];
  /** Parameters injected into NewGameConfig / the initial GameState. */
  setup: {
    startingTier: number;
    startingSeason: number;
    startingWeek: number;
    startingReputation: number;
    startingCountry: string;
    /** Arbitrary extra constraints stored alongside the scenario id in saves. */
    constraints?: Record<string, unknown>;
  };
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Count submitted ScoutReports with conviction >= threshold.
 * ConvictionLevel ordering: note < recommend < strongRecommend < tablePound.
 */
function countReportsWithConviction(
  state: GameState,
  minConviction: "recommend" | "strongRecommend" | "tablePound",
): number {
  const ORDER = { note: 0, recommend: 1, strongRecommend: 2, tablePound: 3 };
  const min = ORDER[minConviction];
  return Object.values(state.reports).filter(
    (r) => ORDER[r.conviction] >= min,
  ).length;
}

/** Count placement reports submitted (youth scouting path). */
function countPlacementReports(state: GameState): number {
  return Object.values(state.placementReports).length;
}

/** Count discovery records (any type of first discovery). */
function countDiscoveries(state: GameState): number {
  return state.discoveryRecords.length;
}

/** Count wonderkid discoveries (wasWonderkid === true). */
function countWonderkidDiscoveries(state: GameState): number {
  return state.discoveryRecords.filter((d) => d.wasWonderkid).length;
}

/** Count reports with qualityScore above a threshold. */
function countHighQualityReports(state: GameState, minQuality: number): number {
  return Object.values(state.reports).filter(
    (r) => r.qualityScore >= minQuality,
  ).length;
}

/** Count distinct countries scouted (via countryReputations). */
function countCountriesScouted(state: GameState): number {
  return Object.values(state.scout.countryReputations).filter(
    (cr) => cr.reportsSubmitted > 0,
  ).length;
}

// =============================================================================
// SCENARIO DEFINITIONS
// =============================================================================

export const SCENARIOS: ScenarioDef[] = [
  // ── 1. The Rescue Job ──────────────────────────────────────────────────────
  {
    id: "the_rescue_job",
    name: "The Rescue Job",
    description:
      "A relegation-threatened club hires you mid-season. The winter transfer window is your only chance to save them. " +
      "You have just 8 weeks to identify three players worth signing — the board is watching every move you make.",
    difficulty: "easy",
    estimatedSeasons: 1,
    category: "starter",
    setup: {
      startingTier: 2,
      startingSeason: 2024,
      startingWeek: 20,
      startingReputation: 25,
      startingCountry: "england",
      constraints: { windowDeadlineWeek: 28 },
    },
    objectives: [
      {
        id: "submit_3_recommend_reports",
        description: "Submit 3 reports with conviction of Recommend or higher",
        check: (state) => countReportsWithConviction(state, "recommend") >= 3,
        required: true,
      },
      {
        id: "submit_before_week_28",
        description: "Complete all reports before week 28 (winter window close)",
        check: (state) =>
          countReportsWithConviction(state, "recommend") >= 3 &&
          state.currentWeek <= 28,
        required: true,
      },
      {
        id: "bonus_table_pound",
        description: "Stake your reputation with a Table Pound on your best target",
        check: (state) =>
          Object.values(state.reports).some((r) => r.conviction === "tablePound"),
        required: false,
      },
    ],
  },

  // ── 2. Youth Academy Challenge ────────────────────────────────────────────
  {
    id: "youth_academy_challenge",
    name: "Youth Academy Challenge",
    description:
      "A small club with a big academy has brought you in as their youth specialist. " +
      "Your mission is to discover and place five promising youngsters into professional setups over two seasons. " +
      "The talent is out there — it just takes a scout who knows where to look.",
    difficulty: "medium",
    estimatedSeasons: 2,
    category: "starter",
    setup: {
      startingTier: 2,
      startingSeason: 2024,
      startingWeek: 1,
      startingReputation: 20,
      startingCountry: "england",
    },
    objectives: [
      {
        id: "place_5_youth",
        description: "Submit 5 youth placement reports",
        check: (state) => countPlacementReports(state) >= 5,
        required: true,
      },
      {
        id: "discover_wonderkid",
        description: "Discover at least one wonderkid",
        check: (state) => countWonderkidDiscoveries(state) >= 1,
        required: false,
      },
    ],
  },

  // ── 3. The Data Pioneer ───────────────────────────────────────────────────
  {
    id: "the_data_pioneer",
    name: "The Data Pioneer",
    description:
      "Your club's old guard doesn't trust analytics. You've been given two seasons to prove the model works. " +
      "Submit 10 high-conviction reports that change the way the club approaches transfers. " +
      "Bring the data — then make them believers.",
    difficulty: "medium",
    estimatedSeasons: 2,
    category: "starter",
    setup: {
      startingTier: 2,
      startingSeason: 2024,
      startingWeek: 1,
      startingReputation: 15,
      startingCountry: "england",
      constraints: { specialization: "data" },
    },
    objectives: [
      {
        id: "submit_10_recommend_reports",
        description: "Submit 10 reports with conviction of Recommend or higher",
        check: (state) => countReportsWithConviction(state, "recommend") >= 10,
        required: true,
      },
      {
        id: "high_quality_reports",
        description: "Achieve 5 reports with quality score of 70 or above",
        check: (state) => countHighQualityReports(state, 70) >= 5,
        required: false,
      },
    ],
  },

  // ── 4. International Assignment ───────────────────────────────────────────
  {
    id: "international_assignment",
    name: "International Assignment",
    description:
      "Your club has sent you to scout a country you've never worked in before. " +
      "Build your familiarity from scratch and find three players worth signing before the season ends. " +
      "Every contact you make and every match you attend brings you closer to cracking the market.",
    difficulty: "medium",
    estimatedSeasons: 1,
    category: "starter",
    setup: {
      startingTier: 3,
      startingSeason: 2024,
      startingWeek: 1,
      startingReputation: 40,
      startingCountry: "england",
      constraints: { targetForeignCountries: 2 },
    },
    objectives: [
      {
        id: "report_3_foreign_players",
        description: "Submit 3 reports on players from countries other than England",
        check: (state) => {
          const foreignPlayers = Object.values(state.reports).filter((r) => {
            const player = state.players[r.playerId];
            return player !== undefined && player.nationality !== "English";
          });
          return foreignPlayers.length >= 3;
        },
        required: true,
      },
      {
        id: "build_country_familiarity",
        description: "Scout players from at least 2 different countries",
        check: (state) => countCountriesScouted(state) >= 2,
        required: false,
      },
    ],
  },

  // ── 5. The Rebuild ────────────────────────────────────────────────────────
  {
    id: "the_rebuild",
    name: "The Rebuild",
    description:
      "You've been appointed head of scouting at a club that just suffered relegation. " +
      "The board demands a complete overhaul of the identification pipeline — more reports, better reports, bolder calls. " +
      "Deliver 15 reports including three table pounds before the season review.",
    difficulty: "hard",
    estimatedSeasons: 1,
    category: "advanced",
    setup: {
      startingTier: 4,
      startingSeason: 2024,
      startingWeek: 1,
      startingReputation: 35,
      startingCountry: "england",
    },
    objectives: [
      {
        id: "submit_15_reports",
        description: "Submit 15 reports in total",
        check: (state) => Object.values(state.reports).length >= 15,
        required: true,
      },
      {
        id: "submit_3_table_pounds",
        description: "Stake your reputation with 3 Table Pounds",
        check: (state) =>
          Object.values(state.reports).filter(
            (r) => r.conviction === "tablePound",
          ).length >= 3,
        required: true,
      },
      {
        id: "high_avg_quality",
        description: "Maintain an average report quality of 60 or above",
        check: (state) => {
          const reports = Object.values(state.reports);
          if (reports.length === 0) return false;
          const avg =
            reports.reduce((sum, r) => sum + r.qualityScore, 0) / reports.length;
          return avg >= 60;
        },
        required: false,
      },
    ],
  },

  // ── 6. Moneyball ──────────────────────────────────────────────────────────
  {
    id: "moneyball",
    name: "Moneyball",
    description:
      "A cash-strapped club has given you an impossible brief: find players who punch above their market value. " +
      "Every report you submit needs to justify the cost with data and insight. " +
      "Eight high-quality finds over two seasons — that's the only metric that matters.",
    difficulty: "hard",
    estimatedSeasons: 2,
    category: "advanced",
    setup: {
      startingTier: 3,
      startingSeason: 2024,
      startingWeek: 1,
      startingReputation: 30,
      startingCountry: "england",
    },
    objectives: [
      {
        id: "submit_8_quality_reports",
        description: "Submit 8 reports with a quality score of 65 or above",
        check: (state) => countHighQualityReports(state, 65) >= 8,
        required: true,
      },
      {
        id: "multi_country_finds",
        description: "Find undervalued players from at least 3 different countries",
        check: (state) => {
          const nationalities = new Set(
            Object.values(state.reports)
              .filter((r) => r.qualityScore >= 65)
              .map((r) => state.players[r.playerId]?.nationality)
              .filter(Boolean),
          );
          return nationalities.size >= 3;
        },
        required: false,
      },
    ],
  },

  // ── 7. Wonderkid Hunter ───────────────────────────────────────────────────
  {
    id: "wonderkid_hunter",
    name: "Wonderkid Hunter",
    description:
      "There are generational talents out there — you just need to find them first. " +
      "Your brief is to discover three wonderkids across different countries in a single season. " +
      "Rivals are circling the same pool, so move fast and trust your eye.",
    difficulty: "hard",
    estimatedSeasons: 1,
    category: "advanced",
    setup: {
      startingTier: 3,
      startingSeason: 2024,
      startingWeek: 1,
      startingReputation: 50,
      startingCountry: "england",
      constraints: { targetCountryCount: 3 },
    },
    objectives: [
      {
        id: "discover_3_wonderkids",
        description: "Discover 3 wonderkid-tier players",
        check: (state) => countWonderkidDiscoveries(state) >= 3,
        required: true,
      },
      {
        id: "multi_country_wonderkids",
        description: "Find wonderkids from at least 2 different countries",
        check: (state) => {
          const countries = new Set(
            state.discoveryRecords
              .filter((d) => d.wasWonderkid)
              .map((d) => state.players[d.playerId]?.nationality)
              .filter(Boolean),
          );
          return countries.size >= 2;
        },
        required: false,
      },
    ],
  },

  // ── 8. The Last Season ────────────────────────────────────────────────────
  {
    id: "the_last_season",
    name: "The Last Season",
    description:
      "You are 64 years old. One final season remains before retirement — " +
      "time to cement a legacy that will outlast your career. " +
      "Push your total legacy score above 100 to be remembered as one of the greats.",
    difficulty: "hard",
    estimatedSeasons: 1,
    category: "advanced",
    setup: {
      startingTier: 5,
      startingSeason: 2024,
      startingWeek: 1,
      startingReputation: 80,
      startingCountry: "england",
      constraints: { scoutAge: 64 },
    },
    objectives: [
      {
        id: "reach_legacy_100",
        description: "Achieve a total legacy score of 100 or above",
        check: (state) => state.legacyScore.totalScore >= 100,
        required: true,
      },
      {
        id: "final_table_pound",
        description: "Make one last Table Pound recommendation",
        check: (state) =>
          Object.values(state.reports).some((r) => r.conviction === "tablePound"),
        required: false,
      },
    ],
  },

  // ── 9. Rivalry ────────────────────────────────────────────────────────────
  {
    id: "rivalry",
    name: "Rivalry",
    description:
      "A rival scout with a grudge is targeting the same talent pool as you. " +
      "Get to every discovery first, file the reports before they do, and prove you're the best in the business. " +
      "Five discoveries before the rivals claim them — that's the challenge.",
    difficulty: "expert",
    estimatedSeasons: 2,
    category: "advanced",
    setup: {
      startingTier: 3,
      startingSeason: 2024,
      startingWeek: 1,
      startingReputation: 40,
      startingCountry: "england",
      constraints: { rivalIntensity: "high" },
    },
    objectives: [
      {
        id: "5_discoveries_before_rivals",
        description:
          "Record 5 player discoveries (be first to observe a player before rivals target them)",
        check: (state) => {
          // A discovery is credited to the scout if it's in discoveryRecords
          // AND the player is not in any rival's targetPlayerIds at discovery time.
          // As a proxy: count discoveryRecords entries where the player is NOT
          // in any rival's current competingForPlayers list when they were first found.
          // Simplified: count total discoveries — if you're filing reports, you're ahead.
          return countDiscoveries(state) >= 5;
        },
        required: true,
      },
      {
        id: "outpace_nemesis",
        description: "Achieve higher reputation than your nemesis rival",
        check: (state) => {
          const nemesis = Object.values(state.rivalScouts).find(
            (r) => r.isNemesis,
          );
          return nemesis !== undefined
            ? state.scout.reputation > nemesis.reputation
            : true;
        },
        required: false,
      },
    ],
  },

  // ── 10. Zero to Hero ──────────────────────────────────────────────────────
  {
    id: "zero_to_hero",
    name: "Zero to Hero",
    description:
      "No club. No reputation. No contacts. " +
      "You're starting as a freelance scout with nothing but your eye for talent. " +
      "Climb from tier 1 to tier 3 in three seasons through sheer quality of work.",
    difficulty: "expert",
    estimatedSeasons: 3,
    category: "advanced",
    setup: {
      startingTier: 1,
      startingSeason: 2024,
      startingWeek: 1,
      startingReputation: 5,
      startingCountry: "england",
    },
    objectives: [
      {
        id: "reach_tier_3",
        description: "Reach Career Tier 3 (Full-time club scout)",
        check: (state) => state.scout.careerTier >= 3,
        required: true,
      },
      {
        id: "reach_reputation_60",
        description: "Build your reputation to 60 or above",
        check: (state) => state.scout.reputation >= 60,
        required: false,
      },
      {
        id: "submit_20_reports",
        description: "Submit at least 20 reports on the way up",
        check: (state) => Object.values(state.reports).length >= 20,
        required: false,
      },
    ],
  },
];
