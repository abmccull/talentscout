/**
 * Hidden Leagues — lower-tier leagues discoverable through regional knowledge.
 *
 * Each hidden league belongs to a country and requires a minimum knowledge
 * level to discover. Once discovered, the scout gains access to a pool of
 * lower-CA players with potentially high PA — the classic "hidden gem" mechanic.
 *
 * Pure module: no React imports, no side effects.
 */

import type { RNG } from "@/engine/rng";
import type { GameState, HiddenLeague, RegionalKnowledge } from "@/engine/core/types";

// =============================================================================
// HIDDEN LEAGUE DEFINITIONS (18 leagues across regions)
// =============================================================================

export const HIDDEN_LEAGUE_DEFINITIONS: HiddenLeague[] = [
  // ── Europe ──────────────────────────────────────────────────────────────
  {
    id: "hl_eng_national_league",
    countryId: "england",
    name: "National League",
    tier: 5,
    discoveryThreshold: 20,
    playerQualityRange: [30, 80],
    talentDensity: 0.06,
  },
  {
    id: "hl_eng_non_league",
    countryId: "england",
    name: "Non-League Pyramid",
    tier: 7,
    discoveryThreshold: 55,
    playerQualityRange: [15, 55],
    talentDensity: 0.08,
  },
  {
    id: "hl_spa_tercera",
    countryId: "spain",
    name: "Tercera Federacion",
    tier: 4,
    discoveryThreshold: 25,
    playerQualityRange: [35, 85],
    talentDensity: 0.07,
  },
  {
    id: "hl_fra_national3",
    countryId: "france",
    name: "National 3",
    tier: 5,
    discoveryThreshold: 30,
    playerQualityRange: [25, 70],
    talentDensity: 0.05,
  },
  {
    id: "hl_ger_regionalliga",
    countryId: "germany",
    name: "Regionalliga",
    tier: 4,
    discoveryThreshold: 20,
    playerQualityRange: [40, 90],
    talentDensity: 0.06,
  },
  {
    id: "hl_ita_serie_d",
    countryId: "italy",
    name: "Serie D",
    tier: 5,
    discoveryThreshold: 30,
    playerQualityRange: [30, 75],
    talentDensity: 0.05,
  },
  {
    id: "hl_por_campeonato",
    countryId: "portugal",
    name: "Campeonato de Portugal",
    tier: 3,
    discoveryThreshold: 20,
    playerQualityRange: [35, 85],
    talentDensity: 0.08,
  },
  {
    id: "hl_ned_tweede",
    countryId: "netherlands",
    name: "Tweede Divisie",
    tier: 3,
    discoveryThreshold: 25,
    playerQualityRange: [30, 80],
    talentDensity: 0.07,
  },
  {
    id: "hl_tur_bol3",
    countryId: "turkey",
    name: "TFF Third League",
    tier: 4,
    discoveryThreshold: 35,
    playerQualityRange: [25, 70],
    talentDensity: 0.06,
  },

  // ── South America ───────────────────────────────────────────────────────
  {
    id: "hl_bra_serie_d",
    countryId: "brazil",
    name: "Campeonato Brasileiro Serie D",
    tier: 4,
    discoveryThreshold: 25,
    playerQualityRange: [30, 85],
    talentDensity: 0.10,
  },
  {
    id: "hl_arg_primera_b_metro",
    countryId: "argentina",
    name: "Primera B Metropolitana",
    tier: 3,
    discoveryThreshold: 20,
    playerQualityRange: [40, 90],
    talentDensity: 0.09,
  },
  {
    id: "hl_col_primera_b",
    countryId: "colombia",
    name: "Categoria Primera B",
    tier: 3,
    discoveryThreshold: 25,
    playerQualityRange: [30, 75],
    talentDensity: 0.07,
  },

  // ── Africa ──────────────────────────────────────────────────────────────
  {
    id: "hl_nga_npl",
    countryId: "nigeria",
    name: "Nigeria National League",
    tier: 3,
    discoveryThreshold: 30,
    playerQualityRange: [20, 70],
    talentDensity: 0.12,
  },
  {
    id: "hl_gha_division_two",
    countryId: "ghana",
    name: "Ghana Division Two",
    tier: 3,
    discoveryThreshold: 25,
    playerQualityRange: [20, 65],
    talentDensity: 0.11,
  },
  {
    id: "hl_sen_ligue2",
    countryId: "senegal",
    name: "Ligue 2 Senegalaise",
    tier: 3,
    discoveryThreshold: 30,
    playerQualityRange: [20, 60],
    talentDensity: 0.10,
  },
  {
    id: "hl_egy_second_division",
    countryId: "egypt",
    name: "Egyptian Second Division",
    tier: 3,
    discoveryThreshold: 25,
    playerQualityRange: [25, 70],
    talentDensity: 0.06,
  },

  // ── Asia & Oceania ──────────────────────────────────────────────────────
  {
    id: "hl_jpn_j3",
    countryId: "japan",
    name: "J3 League",
    tier: 3,
    discoveryThreshold: 20,
    playerQualityRange: [35, 80],
    talentDensity: 0.05,
  },
  {
    id: "hl_mex_liga_expansion",
    countryId: "mexico",
    name: "Liga de Expansion MX",
    tier: 3,
    discoveryThreshold: 20,
    playerQualityRange: [35, 85],
    talentDensity: 0.06,
  },
];

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Get all hidden leagues for a given country.
 */
export function getHiddenLeaguesForCountry(countryId: string): HiddenLeague[] {
  return HIDDEN_LEAGUE_DEFINITIONS.filter((l) => l.countryId === countryId);
}

/**
 * Attempt to discover a hidden league in a country based on knowledge level.
 *
 * Discovery is probabilistic: the chance scales with how far the knowledge
 * level exceeds the league's discovery threshold.
 *
 * @returns The discovered league, or null if no discovery occurred.
 */
export function discoverHiddenLeague(
  rng: RNG,
  knowledge: RegionalKnowledge,
  countryId: string,
): HiddenLeague | null {
  const candidates = HIDDEN_LEAGUE_DEFINITIONS.filter(
    (l) =>
      l.countryId === countryId &&
      l.discoveryThreshold <= knowledge.knowledgeLevel &&
      !knowledge.discoveredLeagues.includes(l.id),
  );

  if (candidates.length === 0) return null;

  // Sort by threshold ascending (easiest first) for weighted discovery
  const sorted = [...candidates].sort(
    (a, b) => a.discoveryThreshold - b.discoveryThreshold,
  );

  for (const league of sorted) {
    // Discovery chance: 5% base + 1% per point above threshold, capped at 30%
    const excess = knowledge.knowledgeLevel - league.discoveryThreshold;
    const chance = Math.min(0.30, 0.05 + excess * 0.01);
    if (rng.next() < chance) {
      return league;
    }
  }

  return null;
}

/**
 * Get all hidden leagues discovered by the scout across all countries.
 */
export function getAllDiscoveredHiddenLeagues(
  state: GameState,
): HiddenLeague[] {
  const discoveredIds = new Set<string>();
  for (const knowledge of Object.values(state.regionalKnowledge ?? {})) {
    for (const id of knowledge.discoveredLeagues) {
      discoveredIds.add(id);
    }
  }
  return HIDDEN_LEAGUE_DEFINITIONS.filter((l) => discoveredIds.has(l.id));
}

/**
 * Get undiscovered hidden leagues for a given country, sorted by threshold.
 */
export function getUndiscoveredHiddenLeagues(
  knowledge: RegionalKnowledge | undefined,
  countryId: string,
): HiddenLeague[] {
  const discovered = new Set(knowledge?.discoveredLeagues ?? []);
  return HIDDEN_LEAGUE_DEFINITIONS
    .filter((l) => l.countryId === countryId && !discovered.has(l.id))
    .sort((a, b) => a.discoveryThreshold - b.discoveryThreshold);
}
