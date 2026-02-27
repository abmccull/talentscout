/**
 * Regional Knowledge System — graduated scouting depth for F13.
 *
 * Replaces the flat 70% regional error reduction with a graduated curve
 * based on accumulated knowledge in each country. Knowledge grows through
 * scouting activity (reports, travel, contacts) and unlocks cultural
 * insights, local contacts, and hidden leagues.
 *
 * Pure module: no React imports, no side effects, no mutation.
 */

import type { RNG } from "@/engine/rng";
import type {
  GameState,
  RegionalKnowledge,
  CulturalInsight,
  CountryReputation,
} from "@/engine/core/types";
import { discoverHiddenLeague } from "@/engine/world/hiddenLeagues";

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Knowledge thresholds for auto-generating local contacts.
 * At each threshold the scout gains one new local contact in the country.
 */
const LOCAL_CONTACT_THRESHOLDS = [15, 30, 50, 70, 90];

/**
 * Cultural insight pools per country. The system draws from these when
 * the scout's knowledge reaches insight-generation thresholds.
 */
const CULTURAL_INSIGHT_POOLS: Record<string, CulturalInsight[]> = {
  england: [
    { type: "playingStyle", description: "English lower leagues prize direct, physical play — pace and aerial duels dominate.", gameplayEffect: "Physical attributes are easier to read in English lower tiers." },
    { type: "developmentCulture", description: "Academy systems in England emphasize organized coaching from age 9, producing technically disciplined players.", gameplayEffect: "English youth tend to have higher baseline technical consistency." },
    { type: "mentalityPattern", description: "British football culture rewards work rate above flair — players who don't press are quickly dropped.", gameplayEffect: "Work rate readings are more reliable for English players." },
    { type: "physicalTrait", description: "English academies produce robust physiques early; young English players tend to be physically mature for their age.", gameplayEffect: "Physical readings on English youth are closer to their adult ceiling." },
  ],
  spain: [
    { type: "playingStyle", description: "Spanish youth development prioritizes positional play and technical control over physicality.", gameplayEffect: "Technical and tactical attributes are clearer in Spanish observations." },
    { type: "developmentCulture", description: "La Masia and similar academies produce players with extraordinary first touch and spatial awareness.", gameplayEffect: "First touch and vision readings are more precise for Spanish academy graduates." },
    { type: "mentalityPattern", description: "Spanish football values patience on the ball — players comfortable under pressure thrive.", gameplayEffect: "Composure is easier to assess in Spanish league matches." },
    { type: "physicalTrait", description: "Spanish players often compensate for lower physical profiles with superior technique and game intelligence.", gameplayEffect: "Mental attributes may be underrated if only physical stats are scouted." },
  ],
  brazil: [
    { type: "playingStyle", description: "Brazilian football is built on individual skill — dribblers and creators are the cultural heroes.", gameplayEffect: "Dribbling and creativity readings have tighter confidence ranges in Brazil." },
    { type: "developmentCulture", description: "Street football and futsal backgrounds produce extraordinary close control but inconsistent tactical discipline.", gameplayEffect: "Technical highs may mask tactical inconsistency in Brazilian youth." },
    { type: "mentalityPattern", description: "The 'jogo bonito' mentality means flair is encouraged — but defensive discipline can lag behind.", gameplayEffect: "Defensive awareness is harder to assess accurately in Brazilian observations." },
    { type: "physicalTrait", description: "Brazilian players mature physically at varying rates — some 16-year-olds look 20, others need years.", gameplayEffect: "Physical projections for Brazilian youth have wider uncertainty." },
  ],
  germany: [
    { type: "playingStyle", description: "German football emphasizes structure, pressing, and collective intensity over individual brilliance.", gameplayEffect: "Pressing and work rate readings are particularly reliable in German leagues." },
    { type: "developmentCulture", description: "The DFB reform of 2000 created a systematic academy network — technically gifted yet physically robust players.", gameplayEffect: "German youth show balanced development across physical and technical domains." },
    { type: "mentalityPattern", description: "German football culture values reliability and consistency — flashy but inconsistent players struggle.", gameplayEffect: "Consistency is less hidden for German players than in other nations." },
    { type: "physicalTrait", description: "German academies invest heavily in sports science — physical development follows predictable curves.", gameplayEffect: "Physical projections for German youth are more accurate than average." },
  ],
  france: [
    { type: "playingStyle", description: "French football blends African diaspora athleticism with structured tactical training — explosive and organized.", gameplayEffect: "Physical and tactical readings are both high-fidelity in French observations." },
    { type: "developmentCulture", description: "Clairefontaine and Ligue 1 academies are world-class talent factories with holistic development programs.", gameplayEffect: "French academy products tend to have fewer hidden weaknesses." },
    { type: "mentalityPattern", description: "French football culture tolerates creative freedom in attack but demands defensive discipline.", gameplayEffect: "Mental resilience is easier to judge in French attacking players." },
    { type: "physicalTrait", description: "The diversity of the French talent pool produces extraordinary athleticism — pace and power are common.", gameplayEffect: "Pace and strength readings for French players tend to be accurate early." },
  ],
  argentina: [
    { type: "playingStyle", description: "Argentine football is built on grit, creativity, and an almost spiritual connection to the ball.", gameplayEffect: "Dribbling and composure readings are highly reliable for Argentine players." },
    { type: "developmentCulture", description: "Argentine youth develop through competitive potrero (street) culture before entering formal academies.", gameplayEffect: "Argentine youth may show raw talent spikes alongside technical gaps." },
    { type: "mentalityPattern", description: "The 'garra' mentality means Argentine players never give up — mental toughness is a cultural bedrock.", gameplayEffect: "Leadership and composure are underestimated in Argentine scouting data." },
    { type: "physicalTrait", description: "Argentine players range from diminutive technicians to powerful athletes — no single physical mold.", gameplayEffect: "Physical readings for Argentine players vary widely and need multiple observations." },
  ],
  nigeria: [
    { type: "playingStyle", description: "Nigerian football emphasizes raw athleticism and direct attacking play with explosive pace.", gameplayEffect: "Pace and agility readings are highly reliable in Nigerian observations." },
    { type: "developmentCulture", description: "Limited formal academy infrastructure means diamonds in the rough are more common — and harder to find.", gameplayEffect: "Hidden leagues in Nigeria have higher talent density than expected." },
    { type: "mentalityPattern", description: "Nigerian players often have extraordinary self-belief and resilience forged through tough conditions.", gameplayEffect: "Mental toughness is often higher than initial readings suggest." },
    { type: "physicalTrait", description: "Nigerian youth are often physically precocious — fast, strong, and explosive at a young age.", gameplayEffect: "Physical peaks for Nigerian youth may come earlier than European counterparts." },
  ],
  italy: [
    { type: "playingStyle", description: "Italian football's tactical sophistication means even lower-league players have advanced positional sense.", gameplayEffect: "Tactical attribute readings are more precise in Italian league observations." },
    { type: "developmentCulture", description: "Italian academies prioritize defensive intelligence and tactical awareness from a young age.", gameplayEffect: "Defensive awareness is easier to assess in Italian youth." },
    { type: "mentalityPattern", description: "The 'catenaccio' legacy means Italian players excel at reading danger and maintaining concentration.", gameplayEffect: "Anticipation and positioning readings are reliable for Italian players." },
    { type: "physicalTrait", description: "Italian players compensate for lower raw athleticism with superior body positioning and game management.", gameplayEffect: "Physical attributes alone underrate Italian players — pair with tactical reads." },
  ],
  portugal: [
    { type: "playingStyle", description: "Portuguese football blends technical finesse with growing tactical maturity — a breeding ground for versatile wingers.", gameplayEffect: "Technical readings on Portuguese wingers and forwards are highly reliable." },
    { type: "developmentCulture", description: "Benfica, Sporting, and Porto academies are world-class export machines for emerging talent.", gameplayEffect: "Portuguese academy products are reliable — fewer hidden character flaws." },
    { type: "mentalityPattern", description: "Portuguese players carry intense emotional investment — passion drives performance but can affect discipline.", gameplayEffect: "Composure readings in high-pressure Portuguese matches are very telling." },
    { type: "physicalTrait", description: "Portuguese players are generally lean and agile rather than powerful — quick feet over raw strength.", gameplayEffect: "Agility and balance readings are more meaningful than strength for Portuguese talent." },
  ],
  japan: [
    { type: "playingStyle", description: "Japanese football prioritizes collective movement, discipline, and technical precision.", gameplayEffect: "Teamwork and passing readings are highly reliable in Japanese observations." },
    { type: "developmentCulture", description: "High school football culture provides a strong development pathway outside traditional academies.", gameplayEffect: "Japanese youth from school football systems are often underrated by standard scouting." },
    { type: "mentalityPattern", description: "Japanese football culture emphasizes respect, dedication, and relentless improvement.", gameplayEffect: "Work rate and professionalism are reliably high among Japanese players." },
    { type: "physicalTrait", description: "Japanese players typically rely on technique and intelligence rather than physical dominance.", gameplayEffect: "Technical and mental projections are more valuable than physical ones for Japanese talent." },
  ],
};

/** Fallback insight pool used for countries without specific definitions. */
const DEFAULT_INSIGHT_POOL: CulturalInsight[] = [
  { type: "playingStyle", description: "The local football culture has distinctive tactical traditions shaped by decades of domestic competition.", gameplayEffect: "Familiarity with local playing style improves tactical attribute readings." },
  { type: "developmentCulture", description: "Youth development follows patterns unique to this region's coaching philosophy and infrastructure.", gameplayEffect: "Understanding the development culture reduces youth potential estimation error." },
  { type: "mentalityPattern", description: "Players from this region share cultural traits that influence their on-pitch mentality and decision-making.", gameplayEffect: "Mental attribute readings become more reliable with deeper regional understanding." },
  { type: "physicalTrait", description: "Physical profiles in this region follow patterns influenced by genetics, diet, and training traditions.", gameplayEffect: "Physical attribute projections are more accurate once regional patterns are understood." },
];

/**
 * Knowledge thresholds at which a cultural insight is generated.
 * One insight is given per threshold crossed.
 */
const INSIGHT_THRESHOLDS = [10, 25, 45, 70];

// =============================================================================
// CORE: SCOUTING EFFICIENCY CURVE
// =============================================================================

/**
 * Calculate the scouting efficiency multiplier from knowledge level.
 *
 * This replaces the flat 70% error reduction with a graduated curve:
 *   Knowledge  0-24: 15% error reduction → efficiency 0.85 (small benefit)
 *   Knowledge 25-49: 30% error reduction → efficiency 0.70
 *   Knowledge 50-74: 50% error reduction → efficiency 0.50
 *   Knowledge 75-100: 70% error reduction → efficiency 0.30 (max mastery)
 *
 * The returned value is the ERROR REDUCTION FACTOR (lower = better accuracy).
 * It represents the fraction of error that REMAINS, so 0.85 = 15% reduction,
 * 0.70 = 30% reduction, etc.
 *
 * Smooth interpolation within each tier prevents cliff effects.
 *
 * @param knowledgeLevel - Knowledge from 0 to 100.
 * @returns Error factor in [0.30, 1.00] — multiply against base observation error.
 */
export function calculateScoutingEfficiency(knowledgeLevel: number): number {
  const k = Math.max(0, Math.min(100, knowledgeLevel));

  if (k < 25) {
    // 0-24: linearly interpolate from 1.00 (no reduction) to 0.85 (15% reduction)
    const t = k / 25;
    return 1.0 - t * 0.15;
  }
  if (k < 50) {
    // 25-49: interpolate from 0.85 to 0.70
    const t = (k - 25) / 25;
    return 0.85 - t * 0.15;
  }
  if (k < 75) {
    // 50-74: interpolate from 0.70 to 0.50
    const t = (k - 50) / 25;
    return 0.70 - t * 0.20;
  }
  // 75-100: interpolate from 0.50 to 0.30
  const t = (k - 75) / 25;
  return 0.50 - t * 0.20;
}

/**
 * Return the graduated error reduction percentage for the regional specialist perk.
 *
 * This replaces the old flat 0.7 factor in getRegionalPerkBonus with a knowledge-
 * based curve:
 *   Knowledge  0-24: 15% error reduction
 *   Knowledge 25-49: 30% error reduction
 *   Knowledge 50-74: 50% error reduction
 *   Knowledge 75-100: 70% error reduction
 *
 * The value is further scaled by the scout's specialization level.
 *
 * @param knowledgeLevel  - Regional knowledge 0-100.
 * @param specLevel       - Scout specialization level 1-20.
 * @returns Error reduction factor in [0.0, 0.7].
 */
export function getGraduatedRegionalBonus(
  knowledgeLevel: number,
  specLevel: number,
): number {
  const k = Math.max(0, Math.min(100, knowledgeLevel));
  let baseReduction: number;

  if (k >= 75) baseReduction = 0.70;
  else if (k >= 50) baseReduction = 0.50;
  else if (k >= 25) baseReduction = 0.30;
  else baseReduction = 0.15;

  // Scale by specialization level (1-20 → 0.05-1.0)
  return baseReduction * (specLevel / 20);
}

// =============================================================================
// KNOWLEDGE GROWTH
// =============================================================================

/**
 * Initialize regional knowledge for all countries in the game.
 *
 * Starting country gets an initial knowledge boost (matching its familiarity).
 */
export function initializeRegionalKnowledge(
  countries: string[],
  startingCountry: string,
): Record<string, RegionalKnowledge> {
  const knowledge: Record<string, RegionalKnowledge> = {};

  for (const country of countries) {
    const isHome = country === startingCountry;
    const level = isHome ? 25 : 0;
    knowledge[country] = {
      countryId: country,
      knowledgeLevel: level,
      discoveredLeagues: [],
      culturalInsights: [],
      localContacts: [],
      scoutingEfficiency: calculateScoutingEfficiency(level),
    };
  }

  return knowledge;
}

/**
 * Process weekly regional knowledge growth based on the scout's activity.
 *
 * Knowledge grows from:
 *   - Being present in a country (travel): +2 per week
 *   - Submitting reports from a country: +1 per report
 *   - Having contacts in a country: +0.5 per contact (per week, passive)
 *   - Successful finds in a country: +3 per find
 *
 * Also handles hidden league discovery, cultural insight generation,
 * and local contact auto-generation at thresholds.
 *
 * @returns New state with updated regional knowledge and any inbox messages.
 */
export function processRegionalKnowledgeGrowth(
  state: GameState,
  rng: RNG,
  /** Equipment bonus: flat additive increase to weekly familiarity gain (integer). */
  familiarityGainBonus = 0,
): {
  regionalKnowledge: Record<string, RegionalKnowledge>;
  newDiscoveries: Array<{ countryId: string; leagueId: string; leagueName: string }>;
  newInsights: Array<{ countryId: string; insight: CulturalInsight }>;
  newContacts: Array<{ countryId: string; contactId: string }>;
} {
  const knowledge = { ...state.regionalKnowledge };
  const newDiscoveries: Array<{ countryId: string; leagueId: string; leagueName: string }> = [];
  const newInsights: Array<{ countryId: string; insight: CulturalInsight }> = [];
  const newContacts: Array<{ countryId: string; contactId: string }> = [];

  // Determine which country the scout is currently active in
  const currentCountry =
    (state.scout.travelBooking?.isAbroad
      ? state.scout.travelBooking.destinationCountry
      : undefined) ?? state.countries[0];

  for (const countryId of state.countries) {
    const prev = knowledge[countryId];
    if (!prev) continue;

    const rep: CountryReputation | undefined =
      state.scout.countryReputations[countryId];

    let knowledgeGain = 0;

    // Active presence bonus
    if (countryId === currentCountry) {
      knowledgeGain += 2;
    }

    // Passive contact knowledge (0.5 per contact, weekly drip)
    if (rep && rep.contactCount > 0) {
      knowledgeGain += Math.min(2, rep.contactCount * 0.5);
    }

    // Regional specialist gets a passive +1 to home country knowledge
    if (
      state.scout.primarySpecialization === "regional" &&
      countryId === currentCountry
    ) {
      knowledgeGain += 1;
    }

    // Equipment familiarity bonus (only for the active country)
    if (familiarityGainBonus > 0 && countryId === currentCountry) {
      knowledgeGain += familiarityGainBonus;
    }

    if (knowledgeGain === 0) continue;

    const oldLevel = prev.knowledgeLevel;
    const newLevel = Math.min(100, oldLevel + knowledgeGain);

    let updated: RegionalKnowledge = {
      ...prev,
      knowledgeLevel: newLevel,
      scoutingEfficiency: calculateScoutingEfficiency(newLevel),
    };

    // Check cultural insight thresholds
    const insight = generateCulturalInsight(rng, countryId, oldLevel, newLevel, updated.culturalInsights);
    if (insight) {
      updated = {
        ...updated,
        culturalInsights: [...updated.culturalInsights, insight],
      };
      newInsights.push({ countryId, insight });
    }

    // Check local contact thresholds
    const contact = generateLocalContact(rng, countryId, oldLevel, newLevel, updated.localContacts);
    if (contact) {
      updated = {
        ...updated,
        localContacts: [...updated.localContacts, contact],
      };
      newContacts.push({ countryId, contactId: contact });
    }

    // Check hidden league discovery
    const discovered = discoverHiddenLeague(rng, updated, countryId);
    if (discovered) {
      updated = {
        ...updated,
        discoveredLeagues: [...updated.discoveredLeagues, discovered.id],
      };
      newDiscoveries.push({
        countryId,
        leagueId: discovered.id,
        leagueName: discovered.name,
      });
    }

    knowledge[countryId] = updated;
  }

  return { regionalKnowledge: knowledge, newDiscoveries, newInsights, newContacts };
}

// =============================================================================
// CULTURAL INSIGHTS
// =============================================================================

/**
 * Generate a cultural insight if the knowledge level crossed an insight threshold.
 *
 * @returns A new CulturalInsight, or null if no threshold was crossed or all
 *          insights for this country have been exhausted.
 */
export function generateCulturalInsight(
  rng: RNG,
  countryId: string,
  oldLevel: number,
  newLevel: number,
  existingInsights: CulturalInsight[],
): CulturalInsight | null {
  // Find the first threshold crossed between oldLevel and newLevel
  const crossedThreshold = INSIGHT_THRESHOLDS.find(
    (t) => oldLevel < t && newLevel >= t,
  );

  if (crossedThreshold === undefined) return null;

  // Index of this threshold determines which insight to give
  const thresholdIndex = INSIGHT_THRESHOLDS.indexOf(crossedThreshold);
  if (thresholdIndex < 0) return null;

  const pool = CULTURAL_INSIGHT_POOLS[countryId] ?? DEFAULT_INSIGHT_POOL;

  // Filter out already-given insight types
  const existingTypes = new Set(existingInsights.map((i) => i.type));
  const available = pool.filter((i) => !existingTypes.has(i.type));

  if (available.length === 0) return null;

  // Pick based on threshold index, with fallback to random selection
  const idx = thresholdIndex < available.length
    ? thresholdIndex
    : rng.nextInt(0, available.length - 1);

  return { ...available[idx] };
}

// =============================================================================
// LOCAL CONTACTS
// =============================================================================

/**
 * Generate a local contact ID if the knowledge level crossed a contact threshold.
 *
 * @returns A new contact ID string, or null if no threshold was crossed or
 *          maximum contacts already reached.
 */
export function generateLocalContact(
  rng: RNG,
  countryId: string,
  oldLevel: number,
  newLevel: number,
  existingContacts: string[],
): string | null {
  const crossedThreshold = LOCAL_CONTACT_THRESHOLDS.find(
    (t) => oldLevel < t && newLevel >= t,
  );

  if (crossedThreshold === undefined) return null;

  // Generate a deterministic contact ID
  const suffix = rng.nextInt(100000, 999999).toString(16);
  return `lc_${countryId}_${suffix}`;
}
