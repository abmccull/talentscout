/**
 * Youth tournament system — named domestic tournaments, international events,
 * grassroots discoveries, and agency showcases.
 *
 * Transforms tournaments from always-available generic activities into
 * named, scheduled, discoverable events that create meaningful choices.
 *
 * All functions are pure: no side effects, no mutation.
 */

import type { RNG } from "@/engine/rng";
import type {
  Scout,
  Contact,
  SubRegion,
  TournamentEvent,
  TournamentCategory,
  TournamentPrestige,
} from "@/engine/core/types";
import { STRUCTURED_YOUTH_TOURNAMENTS } from "@/engine/world/international";
import { getScoutHomeCountry, getTravelCost } from "@/engine/world/travel";

// =============================================================================
// TOURNAMENT TEMPLATE
// =============================================================================

interface TournamentTemplate {
  name: string;
  country?: string;
  prestige: TournamentPrestige;
  venueType: "grassrootsTournament" | "youthFestival";
  startWeek: number;
  endWeek: number;
  poolSizeMultiplier: number;
  observationBonus: number;
  extraAttributes: number;
  autoDiscoverTier?: number;
  subRegionName?: string;
  hostCountry?: string;
  estimatedCost?: number;
  frequency?: "annual" | "biennial";
  phaseOffset?: 0 | 1;
  ageGroup?: number;
  confederation?: string;
}

// =============================================================================
// DOMESTIC TOURNAMENT TEMPLATES
// =============================================================================

const DOMESTIC_TEMPLATES: TournamentTemplate[] = [
  // --- England ---
  { name: "FA Youth Cup", country: "england", prestige: "national", venueType: "youthFestival", startWeek: 8, endWeek: 10, poolSizeMultiplier: 1.5, observationBonus: 2, extraAttributes: 1, autoDiscoverTier: 3 },
  { name: "Midlands Youth Trophy", country: "england", prestige: "regional", venueType: "grassrootsTournament", startWeek: 5, endWeek: 7, poolSizeMultiplier: 1.2, observationBonus: 1, extraAttributes: 0, subRegionName: "Midlands" },
  { name: "London Schools Trophy", country: "england", prestige: "regional", venueType: "grassrootsTournament", startWeek: 20, endWeek: 22, poolSizeMultiplier: 1.1, observationBonus: 1, extraAttributes: 0, subRegionName: "London" },
  { name: "North West Youth Festival", country: "england", prestige: "regional", venueType: "grassrootsTournament", startWeek: 25, endWeek: 27, poolSizeMultiplier: 1.3, observationBonus: 1, extraAttributes: 0, subRegionName: "North West" },
  { name: "South Coast Development Cup", country: "england", prestige: "local", venueType: "grassrootsTournament", startWeek: 30, endWeek: 32, poolSizeMultiplier: 1.0, observationBonus: 0, extraAttributes: 0 },
  { name: "Premier League U18 Festival", country: "england", prestige: "national", venueType: "youthFestival", startWeek: 16, endWeek: 18, poolSizeMultiplier: 1.6, observationBonus: 2, extraAttributes: 1, autoDiscoverTier: 2 },
  { name: "Northern Youth Shield", country: "england", prestige: "regional", venueType: "grassrootsTournament", startWeek: 34, endWeek: 36, poolSizeMultiplier: 1.2, observationBonus: 1, extraAttributes: 0, subRegionName: "North East" },
  { name: "EFL Youth Alliance Cup", country: "england", prestige: "national", venueType: "youthFestival", startWeek: 12, endWeek: 14, poolSizeMultiplier: 1.4, observationBonus: 2, extraAttributes: 1, autoDiscoverTier: 3 },

  // --- Brazil ---
  { name: "Copa São Paulo de Futebol Júnior", country: "brazil", prestige: "national", venueType: "youthFestival", startWeek: 2, endWeek: 5, poolSizeMultiplier: 1.8, observationBonus: 3, extraAttributes: 2, autoDiscoverTier: 2 },
  { name: "Torneio da Esperança", country: "brazil", prestige: "regional", venueType: "grassrootsTournament", startWeek: 18, endWeek: 20, poolSizeMultiplier: 1.2, observationBonus: 1, extraAttributes: 0 },
  { name: "Copa do Nordeste Juvenil", country: "brazil", prestige: "regional", venueType: "grassrootsTournament", startWeek: 10, endWeek: 12, poolSizeMultiplier: 1.2, observationBonus: 1, extraAttributes: 0, subRegionName: "Nordeste" },
  { name: "Copa Votorantim", country: "brazil", prestige: "national", venueType: "youthFestival", startWeek: 24, endWeek: 26, poolSizeMultiplier: 1.5, observationBonus: 2, extraAttributes: 1, autoDiscoverTier: 3 },
  { name: "Torneio do Sul Juvenil", country: "brazil", prestige: "regional", venueType: "grassrootsTournament", startWeek: 30, endWeek: 32, poolSizeMultiplier: 1.1, observationBonus: 1, extraAttributes: 0, subRegionName: "Sul" },
  { name: "Copa Cidade do Rio", country: "brazil", prestige: "regional", venueType: "grassrootsTournament", startWeek: 14, endWeek: 16, poolSizeMultiplier: 1.3, observationBonus: 1, extraAttributes: 0, subRegionName: "Sudeste" },
  { name: "Campeonato Paulista Juvenil", country: "brazil", prestige: "national", venueType: "youthFestival", startWeek: 34, endWeek: 36, poolSizeMultiplier: 1.6, observationBonus: 2, extraAttributes: 1, autoDiscoverTier: 3 },

  // --- Spain ---
  { name: "LaLiga Promises", country: "spain", prestige: "national", venueType: "youthFestival", startWeek: 12, endWeek: 14, poolSizeMultiplier: 1.5, observationBonus: 2, extraAttributes: 1, autoDiscoverTier: 2 },
  { name: "Copa de Campeones Juvenil", country: "spain", prestige: "national", venueType: "youthFestival", startWeek: 28, endWeek: 30, poolSizeMultiplier: 1.4, observationBonus: 2, extraAttributes: 1, autoDiscoverTier: 3 },
  { name: "Torneo Alevín de Brunete", country: "spain", prestige: "regional", venueType: "grassrootsTournament", startWeek: 6, endWeek: 8, poolSizeMultiplier: 1.2, observationBonus: 1, extraAttributes: 0, subRegionName: "Madrid" },
  { name: "Copa Andalucía Juvenil", country: "spain", prestige: "regional", venueType: "grassrootsTournament", startWeek: 18, endWeek: 20, poolSizeMultiplier: 1.2, observationBonus: 1, extraAttributes: 0, subRegionName: "Andalucía" },
  { name: "Torneo Cataluña Base", country: "spain", prestige: "regional", venueType: "grassrootsTournament", startWeek: 32, endWeek: 34, poolSizeMultiplier: 1.3, observationBonus: 1, extraAttributes: 0, subRegionName: "Cataluña" },
  { name: "Copa del Atlántico", country: "spain", prestige: "regional", venueType: "grassrootsTournament", startWeek: 22, endWeek: 24, poolSizeMultiplier: 1.1, observationBonus: 1, extraAttributes: 0 },

  // --- Germany ---
  { name: "DFB-Junioren-Pokal", country: "germany", prestige: "national", venueType: "youthFestival", startWeek: 6, endWeek: 9, poolSizeMultiplier: 1.4, observationBonus: 2, extraAttributes: 1, autoDiscoverTier: 2 },
  { name: "Bundesliga Nachwuchs Cup", country: "germany", prestige: "national", venueType: "youthFestival", startWeek: 20, endWeek: 22, poolSizeMultiplier: 1.5, observationBonus: 2, extraAttributes: 1, autoDiscoverTier: 3 },
  { name: "Bayern Jugend Pokal", country: "germany", prestige: "regional", venueType: "grassrootsTournament", startWeek: 14, endWeek: 16, poolSizeMultiplier: 1.2, observationBonus: 1, extraAttributes: 0, subRegionName: "Bayern" },
  { name: "NRW Youth Cup", country: "germany", prestige: "regional", venueType: "grassrootsTournament", startWeek: 28, endWeek: 30, poolSizeMultiplier: 1.3, observationBonus: 1, extraAttributes: 0, subRegionName: "Nordrhein-Westfalen" },
  { name: "Niedersachsen-Pokal Junioren", country: "germany", prestige: "regional", venueType: "grassrootsTournament", startWeek: 34, endWeek: 36, poolSizeMultiplier: 1.1, observationBonus: 1, extraAttributes: 0, subRegionName: "Niedersachsen" },

  // --- France ---
  { name: "Coupe Gambardella", country: "france", prestige: "national", venueType: "youthFestival", startWeek: 10, endWeek: 14, poolSizeMultiplier: 1.5, observationBonus: 2, extraAttributes: 1, autoDiscoverTier: 2 },
  { name: "Trophée National U17", country: "france", prestige: "national", venueType: "youthFestival", startWeek: 24, endWeek: 26, poolSizeMultiplier: 1.4, observationBonus: 2, extraAttributes: 1, autoDiscoverTier: 3 },
  { name: "Tournoi des Île-de-France", country: "france", prestige: "regional", venueType: "grassrootsTournament", startWeek: 16, endWeek: 18, poolSizeMultiplier: 1.3, observationBonus: 1, extraAttributes: 0, subRegionName: "Île-de-France" },
  { name: "Challenge Méditerranéen", country: "france", prestige: "regional", venueType: "grassrootsTournament", startWeek: 30, endWeek: 32, poolSizeMultiplier: 1.2, observationBonus: 1, extraAttributes: 0 },
  { name: "Coupe de Bretagne Jeunes", country: "france", prestige: "regional", venueType: "grassrootsTournament", startWeek: 6, endWeek: 8, poolSizeMultiplier: 1.1, observationBonus: 1, extraAttributes: 0, subRegionName: "Bretagne" },

  // --- Argentina ---
  { name: "Torneo Juveniles AFA", country: "argentina", prestige: "national", venueType: "youthFestival", startWeek: 3, endWeek: 7, poolSizeMultiplier: 1.5, observationBonus: 2, extraAttributes: 1, autoDiscoverTier: 2 },
  { name: "Copa de Oro Juvenil", country: "argentina", prestige: "national", venueType: "youthFestival", startWeek: 22, endWeek: 24, poolSizeMultiplier: 1.4, observationBonus: 2, extraAttributes: 1, autoDiscoverTier: 3 },
  { name: "Torneo del Interior Sub-17", country: "argentina", prestige: "regional", venueType: "grassrootsTournament", startWeek: 14, endWeek: 16, poolSizeMultiplier: 1.2, observationBonus: 1, extraAttributes: 0 },
  { name: "Copa Buenos Aires Juvenil", country: "argentina", prestige: "regional", venueType: "grassrootsTournament", startWeek: 30, endWeek: 32, poolSizeMultiplier: 1.3, observationBonus: 1, extraAttributes: 0, subRegionName: "Buenos Aires" },
  { name: "Mundialito de Córdoba", country: "argentina", prestige: "regional", venueType: "grassrootsTournament", startWeek: 10, endWeek: 12, poolSizeMultiplier: 1.1, observationBonus: 1, extraAttributes: 0, subRegionName: "Córdoba" },

  // --- USA ---
  { name: "Generation Adidas Cup", country: "usa", prestige: "national", venueType: "youthFestival", startWeek: 10, endWeek: 12, poolSizeMultiplier: 1.4, observationBonus: 2, extraAttributes: 1, autoDiscoverTier: 3 },
  { name: "ECNL National Playoffs", country: "usa", prestige: "national", venueType: "youthFestival", startWeek: 28, endWeek: 30, poolSizeMultiplier: 1.3, observationBonus: 1, extraAttributes: 1 },
  { name: "Dallas Cup", country: "usa", prestige: "regional", venueType: "grassrootsTournament", startWeek: 16, endWeek: 18, poolSizeMultiplier: 1.3, observationBonus: 1, extraAttributes: 0 },
  { name: "Surf Cup", country: "usa", prestige: "regional", venueType: "grassrootsTournament", startWeek: 34, endWeek: 36, poolSizeMultiplier: 1.2, observationBonus: 1, extraAttributes: 0 },

  // --- Mexico ---
  { name: "Copa Promesas MX", country: "mexico", prestige: "national", venueType: "youthFestival", startWeek: 8, endWeek: 10, poolSizeMultiplier: 1.3, observationBonus: 2, extraAttributes: 1, autoDiscoverTier: 3 },
  { name: "Torneo Sub-17 Liga MX", country: "mexico", prestige: "national", venueType: "youthFestival", startWeek: 24, endWeek: 26, poolSizeMultiplier: 1.4, observationBonus: 2, extraAttributes: 1 },
  { name: "Copa Guadalajara Juvenil", country: "mexico", prestige: "regional", venueType: "grassrootsTournament", startWeek: 16, endWeek: 18, poolSizeMultiplier: 1.1, observationBonus: 1, extraAttributes: 0 },
  { name: "Torneo del Bajío", country: "mexico", prestige: "regional", venueType: "grassrootsTournament", startWeek: 32, endWeek: 34, poolSizeMultiplier: 1.2, observationBonus: 1, extraAttributes: 0 },

  // --- Nigeria ---
  { name: "Milo U-15 Championship", country: "nigeria", prestige: "national", venueType: "youthFestival", startWeek: 12, endWeek: 14, poolSizeMultiplier: 1.3, observationBonus: 2, extraAttributes: 1 },
  { name: "Channels National Kids Cup", country: "nigeria", prestige: "national", venueType: "grassrootsTournament", startWeek: 26, endWeek: 28, poolSizeMultiplier: 1.2, observationBonus: 1, extraAttributes: 0 },
  { name: "Lagos Youth League Finals", country: "nigeria", prestige: "regional", venueType: "grassrootsTournament", startWeek: 34, endWeek: 36, poolSizeMultiplier: 1.1, observationBonus: 1, extraAttributes: 0, subRegionName: "Lagos" },

  // --- Ghana ---
  { name: "Colts Premier League", country: "ghana", prestige: "national", venueType: "youthFestival", startWeek: 10, endWeek: 12, poolSizeMultiplier: 1.2, observationBonus: 1, extraAttributes: 0 },
  { name: "Right to Dream Cup", country: "ghana", prestige: "regional", venueType: "grassrootsTournament", startWeek: 24, endWeek: 26, poolSizeMultiplier: 1.3, observationBonus: 2, extraAttributes: 1 },

  // --- Japan ---
  { name: "All-Japan Youth Championship", country: "japan", prestige: "national", venueType: "youthFestival", startWeek: 14, endWeek: 16, poolSizeMultiplier: 1.3, observationBonus: 2, extraAttributes: 1, autoDiscoverTier: 3 },
  { name: "J-Youth Cup", country: "japan", prestige: "national", venueType: "youthFestival", startWeek: 28, endWeek: 30, poolSizeMultiplier: 1.4, observationBonus: 2, extraAttributes: 1 },
  { name: "Kanto U-16 Festival", country: "japan", prestige: "regional", venueType: "grassrootsTournament", startWeek: 6, endWeek: 8, poolSizeMultiplier: 1.1, observationBonus: 1, extraAttributes: 0, subRegionName: "Kantō" },

  // --- South Korea ---
  { name: "K League Youth Championship", country: "southkorea", prestige: "national", venueType: "youthFestival", startWeek: 16, endWeek: 18, poolSizeMultiplier: 1.3, observationBonus: 2, extraAttributes: 1 },
  { name: "Seoul Youth Cup", country: "southkorea", prestige: "regional", venueType: "grassrootsTournament", startWeek: 30, endWeek: 32, poolSizeMultiplier: 1.1, observationBonus: 1, extraAttributes: 0 },

  // --- Egypt ---
  { name: "Egyptian Youth Cup", country: "egypt", prestige: "national", venueType: "youthFestival", startWeek: 12, endWeek: 14, poolSizeMultiplier: 1.2, observationBonus: 1, extraAttributes: 0 },
  { name: "Cairo Schools Championship", country: "egypt", prestige: "regional", venueType: "grassrootsTournament", startWeek: 26, endWeek: 28, poolSizeMultiplier: 1.1, observationBonus: 1, extraAttributes: 0 },

  // --- Other secondary countries (lighter coverage) ---
  { name: "Copa Canadian Youth", country: "canada", prestige: "national", venueType: "youthFestival", startWeek: 18, endWeek: 20, poolSizeMultiplier: 1.2, observationBonus: 1, extraAttributes: 0 },
  { name: "COSAFA U-17 Showcase", country: "southafrica", prestige: "national", venueType: "youthFestival", startWeek: 14, endWeek: 16, poolSizeMultiplier: 1.3, observationBonus: 2, extraAttributes: 1 },
  { name: "Ivory Coast Jeunesse Cup", country: "ivorycoast", prestige: "national", venueType: "youthFestival", startWeek: 10, endWeek: 12, poolSizeMultiplier: 1.2, observationBonus: 1, extraAttributes: 0 },
  { name: "Senegal Navétanes Jeunes", country: "senegal", prestige: "national", venueType: "grassrootsTournament", startWeek: 20, endWeek: 22, poolSizeMultiplier: 1.2, observationBonus: 1, extraAttributes: 0 },
  { name: "Cameroon Youth Championship", country: "cameroon", prestige: "national", venueType: "youthFestival", startWeek: 24, endWeek: 26, poolSizeMultiplier: 1.2, observationBonus: 1, extraAttributes: 0 },
  { name: "Saudi Youth League Finals", country: "saudiarabia", prestige: "national", venueType: "youthFestival", startWeek: 16, endWeek: 18, poolSizeMultiplier: 1.2, observationBonus: 1, extraAttributes: 0 },
  { name: "Chinese Youth Super Cup", country: "china", prestige: "national", venueType: "youthFestival", startWeek: 22, endWeek: 24, poolSizeMultiplier: 1.3, observationBonus: 1, extraAttributes: 0 },
  { name: "FFA National Youth Championship", country: "australia", prestige: "national", venueType: "youthFestival", startWeek: 12, endWeek: 14, poolSizeMultiplier: 1.2, observationBonus: 1, extraAttributes: 0 },
  { name: "NZ Youth Cup", country: "newzealand", prestige: "regional", venueType: "grassrootsTournament", startWeek: 18, endWeek: 20, poolSizeMultiplier: 1.0, observationBonus: 0, extraAttributes: 0 },
];

// =============================================================================
// INTERNATIONAL TOURNAMENT TEMPLATES
// =============================================================================

/** Maps confederation to potential host countries (from available game countries). */
const CONFEDERATION_HOSTS: Record<string, string[]> = {
  FIFA: ["england", "france", "brazil", "japan", "usa", "mexico", "nigeria", "saudiarabia", "argentina", "germany", "spain"],
  UEFA: ["england", "france", "germany", "spain"],
  CONMEBOL: ["brazil", "argentina"],
  CAF: ["nigeria", "ghana", "egypt", "southafrica", "senegal", "cameroon", "ivorycoast"],
  AFC: ["japan", "southkorea", "saudiarabia", "china", "australia"],
  CONCACAF: ["usa", "mexico", "canada"],
  Open: ["france"], // Toulon is always in France
};

/** Maps country keys to their confederation for auto-discovery. */
const COUNTRY_CONFEDERATION: Record<string, string> = {
  england: "UEFA", france: "UEFA", germany: "UEFA", spain: "UEFA",
  brazil: "CONMEBOL", argentina: "CONMEBOL",
  usa: "CONCACAF", mexico: "CONCACAF", canada: "CONCACAF",
  nigeria: "CAF", ghana: "CAF", ivorycoast: "CAF", egypt: "CAF",
  southafrica: "CAF", senegal: "CAF", cameroon: "CAF",
  japan: "AFC", southkorea: "AFC", saudiarabia: "AFC", china: "AFC",
  australia: "AFC", newzealand: "AFC",
};

/**
 * International templates built from STRUCTURED_YOUTH_TOURNAMENTS + continental.
 * These use the existing data as the source of truth for FIFA/UEFA/Toulon,
 * and add continental championships.
 */
const INTERNATIONAL_TEMPLATES: TournamentTemplate[] = [
  // From STRUCTURED_YOUTH_TOURNAMENTS
  ...STRUCTURED_YOUTH_TOURNAMENTS.map((t): TournamentTemplate => ({
    name: t.name,
    prestige: "international",
    venueType: "youthFestival",
    startWeek: t.weekStart,
    endWeek: t.weekStart + t.duration - 1,
    poolSizeMultiplier: t.confederation === "FIFA" ? 2.5 : t.confederation === "UEFA" ? 2.0 : 1.8,
    observationBonus: t.confederation === "FIFA" ? 4 : 3,
    extraAttributes: t.confederation === "FIFA" ? 2 : 1,
    autoDiscoverTier: t.confederation === "FIFA" ? 3 : undefined,
    frequency: t.frequency,
    phaseOffset: t.phaseOffset,
    ageGroup: t.ageGroup,
    confederation: t.confederation === "Open" ? "Open" : t.confederation,
  })),
  // Additional continental championships
  {
    name: "CONMEBOL U-17 Championship",
    prestige: "international",
    venueType: "youthFestival",
    startWeek: 16,
    endWeek: 18,
    poolSizeMultiplier: 1.8,
    observationBonus: 3,
    extraAttributes: 1,
    frequency: "biennial",
    phaseOffset: 1,
    ageGroup: 17,
    confederation: "CONMEBOL",
  },
  {
    name: "CAF U-17 Championship",
    prestige: "international",
    venueType: "youthFestival",
    startWeek: 14,
    endWeek: 16,
    poolSizeMultiplier: 1.6,
    observationBonus: 2,
    extraAttributes: 1,
    frequency: "biennial",
    phaseOffset: 0,
    ageGroup: 17,
    confederation: "CAF",
  },
  {
    name: "AFC U-17 Asian Cup",
    prestige: "international",
    venueType: "youthFestival",
    startWeek: 24,
    endWeek: 26,
    poolSizeMultiplier: 1.6,
    observationBonus: 2,
    extraAttributes: 1,
    frequency: "biennial",
    phaseOffset: 0,
    ageGroup: 17,
    confederation: "AFC",
  },
  {
    name: "CONCACAF U-17 Championship",
    prestige: "international",
    venueType: "youthFestival",
    startWeek: 18,
    endWeek: 20,
    poolSizeMultiplier: 1.5,
    observationBonus: 2,
    extraAttributes: 1,
    frequency: "biennial",
    phaseOffset: 1,
    ageGroup: 17,
    confederation: "CONCACAF",
  },
  {
    name: "SuperCupNI",
    prestige: "international",
    venueType: "youthFestival",
    startWeek: 34,
    endWeek: 36,
    poolSizeMultiplier: 1.6,
    observationBonus: 2,
    extraAttributes: 1,
    frequency: "annual",
    phaseOffset: 0,
    ageGroup: 17,
    confederation: "UEFA",
  },
];

// =============================================================================
// GRASSROOTS NAME POOLS
// =============================================================================

/** Generic grassroots tournament name patterns, used with region/city substitution. */
const GRASSROOTS_PREFIXES = [
  "Street Tournament", "Youth Kickabout", "Community Cup",
  "Local League Finals", "Neighbourhood Challenge", "Youth Showcase",
  "Park Tournament", "School Holiday Cup", "Junior Challenge",
  "Summer Festival", "Youth Open", "Community Shield",
];

// =============================================================================
// CORE FUNCTIONS
// =============================================================================

/**
 * Generate all tournaments for a season. Called at season start.
 * Creates named domestic events for all active countries and
 * international events based on biennial schedule.
 */
export function generateSeasonTournaments(
  rng: RNG,
  season: number,
  countries: string[],
  scout: Scout,
): Record<string, TournamentEvent> {
  const tournaments: Record<string, TournamentEvent> = {};
  const scoutCountry = getScoutHomeCountry(scout);
  const countrySet = new Set(countries.map(c => c.toLowerCase()));

  // 1. Domestic tournaments for all active countries
  for (const tmpl of DOMESTIC_TEMPLATES) {
    if (!tmpl.country || !countrySet.has(tmpl.country)) continue;

    const id = `dom-${tmpl.country}-${tmpl.name.replace(/\s+/g, "-").toLowerCase()}-s${season}`;
    const autoDiscover =
      (tmpl.autoDiscoverTier != null && scout.careerTier >= tmpl.autoDiscoverTier) ||
      (tmpl.prestige === "national" && scout.careerTier >= 4 && tmpl.country === scoutCountry);

    tournaments[id] = {
      id,
      name: tmpl.name,
      country: tmpl.country,
      category: "named",
      prestige: tmpl.prestige,
      startWeek: tmpl.startWeek,
      endWeek: tmpl.endWeek,
      season,
      discovered: autoDiscover,
      discoverySource: autoDiscover ? "reputation" : undefined,
      discoveryWeek: autoDiscover ? 1 : undefined,
      attended: false,
      poolSizeMultiplier: tmpl.poolSizeMultiplier,
      observationBonus: tmpl.observationBonus,
      extraAttributes: tmpl.extraAttributes,
    };
  }

  // 2. International tournaments (biennial filtering)
  for (const tmpl of INTERNATIONAL_TEMPLATES) {
    if (tmpl.frequency === "biennial" && season % 2 !== tmpl.phaseOffset) continue;

    const hostCandidates = CONFEDERATION_HOSTS[tmpl.confederation ?? "FIFA"] ?? CONFEDERATION_HOSTS.FIFA;
    const hostCountry = hostCandidates[rng.nextInt(0, hostCandidates.length - 1)];
    const nameSlug = tmpl.name.replace(/\s+/g, "-").toLowerCase();
    const id = `intl-${nameSlug}-s${season}`;

    const duration = tmpl.endWeek - tmpl.startWeek + 1;
    const travelCost = getTravelCost(scoutCountry, hostCountry) + (duration * 500);

    // Auto-discover: FIFA events at tier 3+, continental if scout is from same confederation
    const scoutConfed = COUNTRY_CONFEDERATION[scoutCountry];
    const autoDiscover =
      (tmpl.autoDiscoverTier != null && scout.careerTier >= tmpl.autoDiscoverTier) ||
      (tmpl.confederation === scoutConfed && scout.careerTier >= 2);

    tournaments[id] = {
      id,
      name: tmpl.name,
      country: hostCountry,
      category: "international",
      prestige: "international",
      startWeek: tmpl.startWeek,
      endWeek: tmpl.endWeek,
      season,
      discovered: autoDiscover,
      discoverySource: autoDiscover ? "reputation" : undefined,
      discoveryWeek: autoDiscover ? 1 : undefined,
      attended: false,
      poolSizeMultiplier: tmpl.poolSizeMultiplier,
      observationBonus: tmpl.observationBonus,
      extraAttributes: tmpl.extraAttributes,
      confederation: tmpl.confederation,
      ageGroup: tmpl.ageGroup,
      travelCost,
    };
  }

  return tournaments;
}

/**
 * Passive discovery of tournaments via regional familiarity.
 * Called each week during advanceWeek. Only discovers tournaments
 * starting within the next 4 weeks.
 */
export function discoverTournamentsPassive(
  rng: RNG,
  tournaments: Record<string, TournamentEvent>,
  subRegions: Record<string, SubRegion>,
  currentWeek: number,
  scoutCountry: string,
): { updatedTournaments: Record<string, TournamentEvent>; discovered: TournamentEvent[] } {
  const updated = { ...tournaments };
  const discovered: TournamentEvent[] = [];

  // Average familiarity across all sub-regions in scout's country
  const regionEntries = Object.values(subRegions).filter(
    sr => sr.country.toLowerCase() === scoutCountry.toLowerCase(),
  );
  const avgFamiliarity = regionEntries.length > 0
    ? regionEntries.reduce((sum, sr) => sum + sr.familiarity, 0) / regionEntries.length
    : 0;

  for (const [id, t] of Object.entries(updated)) {
    if (t.discovered || t.attended) continue;
    // Only discover tournaments starting within 4 weeks
    if (t.startWeek > currentWeek + 4 || t.endWeek < currentWeek) continue;

    let chance = 0;

    if (t.category === "named") {
      // Domestic: familiarity-based discovery
      if (t.country.toLowerCase() === scoutCountry.toLowerCase()) {
        chance = Math.min(0.45, 0.05 + avgFamiliarity * 0.004);
      }
    } else if (t.category === "international") {
      // International: lower base chance, reputation helps
      chance = Math.min(0.30, 0.02 + avgFamiliarity * 0.003);
    }

    if (chance > 0 && rng.next() < chance) {
      const found: TournamentEvent = {
        ...t,
        discovered: true,
        discoverySource: "familiarity",
        discoveryWeek: currentWeek,
      };
      updated[id] = found;
      discovered.push(found);
    }
  }

  return { updatedTournaments: updated, discovered };
}

/**
 * Generate a grassroots tournament discovered dynamically mid-season.
 * Typically triggered by a contact tip or high familiarity.
 */
export function generateGrassrootsTournament(
  rng: RNG,
  country: string,
  subRegionId: string | undefined,
  subRegionName: string | undefined,
  currentWeek: number,
  season: number,
  source: "contact" | "familiarity",
  contactId?: string,
): TournamentEvent {
  const prefix = GRASSROOTS_PREFIXES[rng.nextInt(0, GRASSROOTS_PREFIXES.length - 1)];
  const regionLabel = subRegionName ?? country.charAt(0).toUpperCase() + country.slice(1);
  const name = `${regionLabel} ${prefix}`;
  const startOffset = rng.nextInt(1, 3);
  const duration = rng.nextInt(1, 2);
  const startWeek = currentWeek + startOffset;
  const id = `grass-${country}-w${startWeek}-s${season}-${rng.nextInt(1000, 9999)}`;

  return {
    id,
    name,
    country,
    subRegionId,
    category: "grassroots",
    prestige: rng.next() < 0.3 ? "regional" : "local",
    startWeek,
    endWeek: startWeek + duration - 1,
    season,
    discovered: true,
    discoverySource: source,
    discoveryContactId: contactId,
    discoveryWeek: currentWeek,
    attended: false,
    poolSizeMultiplier: 1.0 + rng.next() * 0.3, // 1.0-1.3
    observationBonus: rng.nextInt(0, 1),
    extraAttributes: 0,
  };
}

/** Contact types eligible to provide tournament tips. */
const TIP_CONTACT_TYPES = new Set(["grassrootsOrganizer", "localScout", "schoolCoach", "academyCoach"]);

/**
 * Process a contact meeting for potential tournament discovery.
 * Returns a newly discovered or generated tournament, or null.
 */
export function processContactTournamentTip(
  rng: RNG,
  contact: Contact,
  tournaments: Record<string, TournamentEvent>,
  subRegions: Record<string, SubRegion>,
  currentWeek: number,
  season: number,
): TournamentEvent | null {
  if (!TIP_CONTACT_TYPES.has(contact.type)) return null;

  const chance = Math.min(0.50, 0.15 + contact.relationship * 0.003);
  if (rng.next() >= chance) return null;

  // 60%: discover an existing undiscovered tournament
  const undiscovered = Object.values(tournaments).filter(
    t => !t.discovered && !t.attended &&
    t.startWeek >= currentWeek && t.startWeek <= currentWeek + 6 &&
    (contact.country ? t.country.toLowerCase() === contact.country.toLowerCase() : true),
  );

  if (undiscovered.length > 0 && rng.next() < 0.6) {
    const target = undiscovered[rng.nextInt(0, undiscovered.length - 1)];
    return {
      ...target,
      discovered: true,
      discoverySource: "contact",
      discoveryContactId: contact.id,
      discoveryWeek: currentWeek,
    };
  }

  // 40%: generate a new grassroots event
  const contactCountry = contact.country?.toLowerCase() ?? "england";
  const matchingRegions = Object.values(subRegions).filter(
    sr => sr.country.toLowerCase() === contactCountry,
  );
  const region = matchingRegions.length > 0
    ? matchingRegions[rng.nextInt(0, matchingRegions.length - 1)]
    : undefined;

  return generateGrassrootsTournament(
    rng, contactCountry, region?.id, region?.name,
    currentWeek, season, "contact", contact.id,
  );
}

/**
 * Get tournaments that are active (week in range), discovered, and unattended.
 */
export function getActiveTournaments(
  tournaments: Record<string, TournamentEvent>,
  currentWeek: number,
): TournamentEvent[] {
  return Object.values(tournaments).filter(
    t => t.discovered && !t.attended && t.startWeek <= currentWeek && t.endWeek >= currentWeek,
  );
}

/**
 * Split active tournaments into grassroots (local/regional) and festivals
 * (national/international) matching the existing activity types.
 */
export function getTournamentActivities(
  tournaments: Record<string, TournamentEvent>,
  currentWeek: number,
): { grassroots: TournamentEvent[]; festivals: TournamentEvent[] } {
  const active = getActiveTournaments(tournaments, currentWeek);
  return {
    grassroots: active.filter(t => t.prestige === "local" || t.prestige === "regional"),
    festivals: active.filter(t => t.prestige === "national" || t.prestige === "international"),
  };
}

/**
 * Create an agency showcase tournament.
 * Requires professional/hq office, 3+ employees, and 5000+ balance.
 * Costs 3000 to organize.
 */
export function createAgencyShowcase(
  rng: RNG,
  finances: { balance: number; office: { tier: string }; employees: { id: string }[] },
  currentWeek: number,
  season: number,
  scoutCountry: string,
): { tournament: TournamentEvent; cost: number } | null {
  const validOffice = finances.office.tier === "professional" || finances.office.tier === "hq";
  if (!validOffice) return null;
  if (finances.employees.length < 3) return null;
  if (finances.balance < 5000) return null;

  const cost = 3000;
  const startWeek = currentWeek + 2;
  const id = `showcase-s${season}-w${startWeek}-${rng.nextInt(1000, 9999)}`;

  const tournament: TournamentEvent = {
    id,
    name: "Agency Youth Showcase",
    country: scoutCountry,
    category: "agencyShowcase",
    prestige: "national",
    startWeek,
    endWeek: startWeek + 1,
    season,
    discovered: true,
    discoverySource: "agency",
    discoveryWeek: currentWeek,
    attended: false,
    poolSizeMultiplier: 2.0,
    observationBonus: 3,
    extraAttributes: 2,
    organizationCost: cost,
  };

  return { tournament, cost };
}

/**
 * Estimate the total cost of attending a tournament.
 */
export function estimateTournamentCost(
  tournament: TournamentEvent,
  scoutCountry: string,
): number {
  if (tournament.organizationCost) return tournament.organizationCost;
  if (tournament.travelCost) return tournament.travelCost;
  if (tournament.category === "international") {
    const duration = tournament.endWeek - tournament.startWeek + 1;
    return getTravelCost(scoutCountry, tournament.country) + (duration * 500);
  }
  return 0;
}
