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
  Scout,
  SubRegion,
  ActivityType,
  Contact,
  RegionalKnowledgeLedgerEntry,
  RegionalKnowledgeMaintenanceState,
  RegionalKnowledgeProcessedMetrics,
} from "@/engine/core/types";
import { discoverHiddenLeague } from "@/engine/world/hiddenLeagues";
import { getTravelPostureEffects, isScoutAbroad } from "@/engine/world/travel";
import { deriveRegionalPresence, type RegionalPresenceSnapshot } from "@/engine/world/regionalPresence";
import { countryKeyFromNationality, normalizeCountryKey } from "@/lib/country";
import { getScheduledActivityInstances } from "@/engine/core/calendar";
import { generateContactForType } from "@/engine/network/contacts";
import { hydrateCulturalInsight } from "@/engine/world/footballCulture";

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
const MAX_KNOWLEDGE_LEDGER_ENTRIES = 64;
const NEGLECT_GRACE_WEEKS = 4;
const STALE_KNOWLEDGE_CEILING = 55;

/** Activities that create first-hand or relationship-backed local knowledge. */
const ACTIVITY_KNOWLEDGE_GAIN: Partial<Record<ActivityType, number>> = {
  attendMatch: 1.25,
  trainingVisit: 1.25,
  academyVisit: 1.25,
  youthTournament: 1.5,
  schoolMatch: 1.25,
  grassrootsTournament: 1.5,
  streetFootball: 1.5,
  academyTrialDay: 1.25,
  youthFestival: 1.5,
  followUpSession: 1,
  parentCoachMeeting: 1,
  reserveMatch: 1.25,
  scoutingMission: 1.5,
  agentShowcase: 1,
  trialMatch: 1.25,
  contractNegotiation: 0.75,
  networkMeeting: 1,
  freeAgentOutreach: 0.75,
  loanMonitoring: 0.75,
};

const RELATIONSHIP_KNOWLEDGE_ACTIVITIES = new Set<ActivityType>([
  "parentCoachMeeting",
  "contractNegotiation",
  "networkMeeting",
  "freeAgentOutreach",
  "agentShowcase",
]);

function canonicalizeCountry(value?: string): string | undefined {
  return normalizeCountryKey(value);
}

function fallbackNormalizeCountry(value: string): string {
  return canonicalizeCountry(value) ?? value.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getCountryReputationByCountry(
  countryReputations: Record<string, CountryReputation>,
  countryId: string,
): CountryReputation | undefined {
  const canonicalCountryId = canonicalizeCountry(countryId);
  if (!canonicalCountryId) return undefined;

  for (const [key, reputation] of Object.entries(countryReputations)) {
    const reputationCountry =
      canonicalizeCountry(reputation.country) ?? canonicalizeCountry(key);
    if (reputationCountry === canonicalCountryId) {
      return reputation;
    }
  }

  return undefined;
}

function resolveScoutHomeCountry(
  scout: Scout,
  regionalKnowledge?: Record<string, RegionalKnowledge>,
): string | undefined {
  const pinnedHomeCountry = canonicalizeCountry(scout.homeCountry);
  if (pinnedHomeCountry) return pinnedHomeCountry;

  for (const [key, reputation] of Object.entries(scout.countryReputations ?? {})) {
    const countryId =
      canonicalizeCountry(reputation.country) ?? canonicalizeCountry(key);
    if (countryId && reputation.familiarity >= 50) {
      return countryId;
    }
  }

  const nationalityCountry = countryKeyFromNationality(scout.nationality);
  if (nationalityCountry) {
    return nationalityCountry;
  }

  for (const [key, reputation] of Object.entries(scout.countryReputations ?? {})) {
    const countryId =
      canonicalizeCountry(reputation.country) ?? canonicalizeCountry(key);
    if (countryId) {
      return countryId;
    }
  }

  return Object.keys(regionalKnowledge ?? {})
    .map((countryId) => canonicalizeCountry(countryId))
    .find((countryId): countryId is string => !!countryId);
}

function resolveScoutEffectiveCountry(state: GameState): string | undefined {
  const abroadCountry = isScoutAbroad(state.scout, state.currentWeek)
    ? canonicalizeCountry(state.scout.travelBooking?.destinationCountry)
    : undefined;

  return (
    abroadCountry
    ?? resolveScoutHomeCountry(state.scout, state.regionalKnowledge)
    ?? state.countries
      .map((countryId) => canonicalizeCountry(countryId))
      .find((countryId): countryId is string => !!countryId)
  );
}

function travelPostureForCountry(state: GameState, countryId: string) {
  const booking = state.scout.travelBooking;
  if (
    !booking
    || !isScoutAbroad(state.scout, state.currentWeek)
    || canonicalizeCountry(booking.destinationCountry) !== countryId
  ) {
    return getTravelPostureEffects(undefined);
  }
  return getTravelPostureEffects(booking.posture);
}

function currentMetrics(rep: CountryReputation | undefined): RegionalKnowledgeProcessedMetrics {
  return {
    reportsSubmitted: Math.max(0, rep?.reportsSubmitted ?? 0),
    successfulFinds: Math.max(0, rep?.successfulFinds ?? 0),
    contactCount: Math.max(0, rep?.contactCount ?? 0),
  };
}

function metricDelta(
  current: RegionalKnowledgeProcessedMetrics,
  previous: RegionalKnowledgeProcessedMetrics,
  key: keyof RegionalKnowledgeProcessedMetrics,
): number {
  return Math.max(0, current[key] - previous[key]);
}

function makeLedgerEntry(input: {
  countryId: string;
  week: number;
  season: number;
  source: RegionalKnowledgeLedgerEntry["source"];
  amount: number;
  summary: string;
  sourceId?: string;
  activityType?: ActivityType;
}): RegionalKnowledgeLedgerEntry {
  const sourceKey = input.sourceId ?? input.activityType ?? input.source;
  return {
    id: `regional:${input.countryId}:s${input.season}:w${input.week}:${input.source}:${sourceKey}`,
    week: input.week,
    season: input.season,
    source: input.source,
    amount: Math.round(input.amount * 100) / 100,
    summary: input.summary,
    sourceId: input.sourceId,
    activityType: input.activityType,
  };
}

function getScheduledKnowledgeEntries(
  state: GameState,
  countryId: string,
  effectiveCountry: string | undefined,
): RegionalKnowledgeLedgerEntry[] {
  if (!state.schedule) return [];
  const activePosture = state.scout.travelBooking
    && isScoutAbroad(state.scout, state.currentWeek)
    && canonicalizeCountry(state.scout.travelBooking.destinationCountry) === countryId
    ? state.scout.travelBooking.posture
    : undefined;
  const postureEffects = travelPostureForCountry(state, countryId);
  return getScheduledActivityInstances(state.schedule).flatMap((instance) => {
    const activity = instance.activity;
    if (activity.type === "internationalTravel") {
      const destination = canonicalizeCountry(activity.targetId);
      if (destination !== countryId) return [];
      return [makeLedgerEntry({
        countryId,
        week: state.currentWeek,
        season: state.currentSeason,
        source: "fieldActivity",
        amount: 0.5,
        summary: `Route preparation and arrival work added initial context for ${countryId}.`,
        sourceId: instance.key,
        activityType: activity.type,
      })];
    }

    const amount = ACTIVITY_KNOWLEDGE_GAIN[activity.type];
    if (!amount || effectiveCountry !== countryId) return [];
    const specializationMultiplier = state.scout.primarySpecialization === "regional"
      ? 1.2
      : 1;
    const relationshipMultiplier = RELATIONSHIP_KNOWLEDGE_ACTIVITIES.has(activity.type)
      ? Math.sqrt(postureEffects.contactQualityMultiplier)
      : 1;
    return [makeLedgerEntry({
      countryId,
      week: state.currentWeek,
      season: state.currentSeason,
      source: "fieldActivity",
      amount: amount
        * specializationMultiplier
        * postureEffects.regionalKnowledgeMultiplier
        * relationshipMultiplier,
      summary: `${activity.description || activity.type} produced first-hand regional knowledge${activePosture ? ` under a ${activePosture} trip posture` : ""}.`,
      sourceId: instance.key,
      activityType: activity.type,
    })];
  });
}

function appendKnowledgeLedger(
  existing: readonly RegionalKnowledgeLedgerEntry[] | undefined,
  additions: readonly RegionalKnowledgeLedgerEntry[],
): RegionalKnowledgeLedgerEntry[] {
  const byId = new Map<string, RegionalKnowledgeLedgerEntry>();
  for (const entry of [...(existing ?? []), ...additions]) byId.set(entry.id, entry);
  return [...byId.values()].slice(-MAX_KNOWLEDGE_LEDGER_ENTRIES);
}

function materializeLocalContact(
  rng: RNG,
  state: GameState,
  countryId: string,
  contactId: string,
): Contact {
  const generatedContact = generateContactForType(
    rng,
    "localScout",
    "Local football network",
    countryId,
  );
  const postureEffects = travelPostureForCountry(state, countryId);
  return {
    ...generatedContact,
    id: contactId,
    country: countryId,
    region: countryId,
    relationship: Math.max(
      15,
      Math.min(70, Math.round(generatedContact.relationship * postureEffects.contactQualityMultiplier)),
    ),
    trustLevel: Math.max(
      15,
      Math.min(70, Math.round((generatedContact.trustLevel ?? 0) * postureEffects.contactQualityMultiplier)),
    ),
  };
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function isSameProcessedWeek(
  maintenance: RegionalKnowledgeMaintenanceState | undefined,
  season: number,
  week: number,
): boolean {
  return maintenance?.lastProcessedSeason === season
    && maintenance?.lastProcessedWeek === week;
}

function calculateMaintenanceSupport(presence: RegionalPresenceSnapshot): number {
  const structuralSupport = presence.sources
    .filter((source) => source.kind !== "regionalKnowledge")
    .reduce((sum, source) => sum + source.score, 0);

  return clamp(
    structuralSupport
      + (presence.isHomeBase ? 18 : 0)
      + (presence.isActiveLocation ? 12 : 0)
      + (presence.satelliteOfficeId ? 10 : 0)
      + presence.assignedEmployeeIds.length * 4
      + presence.contactIds.length * 2,
    0,
    100,
  );
}

function calculateNeglectedKnowledgeDecay(
  knowledgeLevel: number,
  neglectedWeeks: number,
  supportScore: number,
): number {
  if (knowledgeLevel <= 0 || knowledgeLevel > STALE_KNOWLEDGE_CEILING) return 0;
  if (neglectedWeeks < NEGLECT_GRACE_WEEKS) return 0;

  const vulnerability = knowledgeLevel <= 15
    ? 0.7
    : knowledgeLevel <= 30
      ? 0.55
      : knowledgeLevel <= 45
        ? 0.35
        : 0.2;
  const overduePressure = Math.min(0.35, (neglectedWeeks - (NEGLECT_GRACE_WEEKS - 1)) * 0.08);
  const supportMitigation = clamp(supportScore / 35, 0, 0.85);
  return roundToTenth(
    Math.min(
      knowledgeLevel,
      clamp((vulnerability + overduePressure) * (1 - supportMitigation), 0, 0.9),
    ),
  );
}

function nextMaintenanceState(input: {
  previous: RegionalKnowledgeMaintenanceState | undefined;
  currentSeason: number;
  currentWeek: number;
  hasWeeklyReinforcement: boolean;
  presence: RegionalPresenceSnapshot;
  knowledgeLevel: number;
}): {
  maintenanceState: RegionalKnowledgeMaintenanceState;
  decayAmount: number;
} {
  const {
    previous,
    currentSeason,
    currentWeek,
    hasWeeklyReinforcement,
    presence,
    knowledgeLevel,
  } = input;
  if (isSameProcessedWeek(previous, currentSeason, currentWeek)) {
    return {
      maintenanceState: previous!,
      decayAmount: 0,
    };
  }

  const supportScore = calculateMaintenanceSupport(presence);
  const isStabilityProtected = !presence.generatedWorldEligible
    || presence.isHomeBase
    || presence.isActiveLocation
    || supportScore >= 45;
  const carriedNeglect = previous?.neglectedWeeks ?? 0;
  const neglectedWeeks = !previous
    ? 0
    : hasWeeklyReinforcement || isStabilityProtected
      ? 0
      : carriedNeglect + 1;

  return {
    maintenanceState: {
      lastProcessedSeason: currentSeason,
      lastProcessedWeek: currentWeek,
      neglectedWeeks,
    },
    decayAmount: !previous || hasWeeklyReinforcement || isStabilityProtected
      ? 0
      : calculateNeglectedKnowledgeDecay(knowledgeLevel, neglectedWeeks, supportScore),
  };
}

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
  const homeCountry = canonicalizeCountry(startingCountry) ?? startingCountry;

  for (const rawCountry of countries) {
    const country = canonicalizeCountry(rawCountry) ?? rawCountry;
    if (knowledge[country]) continue;

    const isHome = country === homeCountry;
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
 * Keep the legacy country and sub-region familiarity views aligned with the
 * canonical regional knowledge ledger. Existing more-specific familiarity is
 * preserved, while country mastery supplies a floor for every sub-region.
 */
export function synchronizeRegionalFamiliarity(
  scout: Scout,
  subRegions: Record<string, SubRegion>,
  regionalKnowledge: Record<string, RegionalKnowledge>,
): { scout: Scout; subRegions: Record<string, SubRegion> } {
  const knowledgeByNormalizedCountry = new Map(
    Object.entries(regionalKnowledge).map(([countryId, knowledge]) => [
      fallbackNormalizeCountry(countryId),
      knowledge,
    ]),
  );
  const countryReputations = { ...scout.countryReputations };

  for (const [countryId, knowledge] of Object.entries(regionalKnowledge)) {
    const existingKey = Object.keys(countryReputations).find(
      (key) => fallbackNormalizeCountry(key) === fallbackNormalizeCountry(countryId),
    ) ?? countryId;
    const existing = countryReputations[existingKey];
    countryReputations[existingKey] = {
      country: existing?.country ?? countryId,
      familiarity: Math.max(existing?.familiarity ?? 0, knowledge.knowledgeLevel),
      reportsSubmitted: existing?.reportsSubmitted ?? 0,
      successfulFinds: existing?.successfulFinds ?? 0,
      contactCount: existing?.contactCount ?? 0,
    };
  }

  const synchronizedSubRegions = Object.fromEntries(
    Object.entries(subRegions).map(([id, subRegion]) => {
      const knowledge = knowledgeByNormalizedCountry.get(
        fallbackNormalizeCountry(subRegion.country),
      );
      return [
        id,
        knowledge
          ? {
              ...subRegion,
              familiarity: Math.max(
                subRegion.familiarity ?? 0,
                Math.floor(knowledge.knowledgeLevel),
              ),
            }
          : subRegion,
      ];
    }),
  );

  return {
    scout: { ...scout, countryReputations },
    subRegions: synchronizedSubRegions,
  };
}

/**
 * Process weekly regional knowledge growth based on the scout's activity.
 *
 * Knowledge grows from completed field work, newly recorded reports/finds/
 * contacts, and maintained local infrastructure. Mere idle presence no longer
 * produces mastery. Every gain is retained in a bounded audit ledger.
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
  newContacts: Array<{ countryId: string; contactId: string; contact: Contact }>;
} {
  const knowledge = { ...state.regionalKnowledge };
  const newDiscoveries: Array<{ countryId: string; leagueId: string; leagueName: string }> = [];
  const newInsights: Array<{ countryId: string; insight: CulturalInsight }> = [];
  const newContacts: Array<{ countryId: string; contactId: string; contact: Contact }> = [];
  const materializedContactIds = new Set(Object.keys(state.contacts ?? {}));
  const currentCountry = resolveScoutEffectiveCountry(state);

  for (const [countryId, prev] of Object.entries(knowledge)) {

    // Old saves could persist only a regional contact id. Reconcile those ids
    // into real relationship entities once, without requiring a threshold to
    // be crossed again.
    for (const contactId of prev.localContacts) {
      if (materializedContactIds.has(contactId)) continue;
      const contact = materializeLocalContact(rng, state, countryId, contactId);
      newContacts.push({ countryId, contactId, contact });
      materializedContactIds.add(contactId);
    }

    const rep: CountryReputation | undefined =
      getCountryReputationByCountry(state.scout.countryReputations, countryId);

    const metrics = currentMetrics(rep);
    // A missing legacy watermark initializes at current values. This prevents
    // old career totals from being paid again on the first migrated tick.
    const previousMetrics = prev.processedMetrics ?? metrics;
    const ledgerEntries = getScheduledKnowledgeEntries(state, countryId, currentCountry);

    const reportDelta = metricDelta(metrics, previousMetrics, "reportsSubmitted");
    if (reportDelta > 0) {
      ledgerEntries.push(makeLedgerEntry({
        countryId,
        week: state.currentWeek,
        season: state.currentSeason,
        source: "report",
        amount: reportDelta,
        summary: `${reportDelta} newly filed regional report${reportDelta === 1 ? "" : "s"} consolidated local knowledge.`,
        sourceId: `reports:${metrics.reportsSubmitted}`,
      }));
    }

    const successDelta = metricDelta(metrics, previousMetrics, "successfulFinds");
    if (successDelta > 0) {
      ledgerEntries.push(makeLedgerEntry({
        countryId,
        week: state.currentWeek,
        season: state.currentSeason,
        source: "successfulFind",
        amount: successDelta * 3,
        summary: `${successDelta} successful regional find${successDelta === 1 ? "" : "s"} validated the scout's market model.`,
        sourceId: `finds:${metrics.successfulFinds}`,
      }));
    }

    const contactDelta = metricDelta(metrics, previousMetrics, "contactCount");
    if (contactDelta > 0) {
      ledgerEntries.push(makeLedgerEntry({
        countryId,
        week: state.currentWeek,
        season: state.currentSeason,
        source: "contact",
        amount: contactDelta,
        summary: `${contactDelta} new local relationship${contactDelta === 1 ? "" : "s"} added independent context.`,
        sourceId: `contacts:${metrics.contactCount}`,
      }));
    }

    const presence = deriveRegionalPresence(state, countryId);
    const passiveKnowledgeGain = presence.effects.passiveKnowledgeGain;
    if (passiveKnowledgeGain > 0) {
      ledgerEntries.push(makeLedgerEntry({
        countryId,
        week: state.currentWeek,
        season: state.currentSeason,
        source: "infrastructure",
        amount: passiveKnowledgeGain,
        summary: "Maintained office or delegated coverage consolidated institutional knowledge.",
        sourceId: "maintained-presence",
      }));
    }

    const hasFirstHandWork = ledgerEntries.some((entry) => entry.source === "fieldActivity");
    if (familiarityGainBonus > 0 && hasFirstHandWork) {
      ledgerEntries.push(makeLedgerEntry({
        countryId,
        week: state.currentWeek,
        season: state.currentSeason,
        source: "equipment",
        amount: familiarityGainBonus,
        summary: "Active regional tools preserved more context from this week's field work.",
        sourceId: "familiarity-equipment",
      }));
    }

    const existingLedgerIds = new Set((prev.knowledgeLedger ?? []).map((entry) => entry.id));
    const novelLedgerEntries = ledgerEntries.filter((entry) => !existingLedgerIds.has(entry.id));
    const knowledgeGain = novelLedgerEntries.reduce((sum, entry) => sum + entry.amount, 0);
    const maintenance = nextMaintenanceState({
      previous: prev.maintenanceState,
      currentSeason: state.currentSeason,
      currentWeek: state.currentWeek,
      hasWeeklyReinforcement: knowledgeGain > 0,
      presence,
      knowledgeLevel: prev.knowledgeLevel,
    });
    const baseUpdated: RegionalKnowledge = {
      ...prev,
      processedMetrics: metrics,
      knowledgeLedger: appendKnowledgeLedger(prev.knowledgeLedger, novelLedgerEntries),
      maintenanceState: maintenance.maintenanceState,
    };
    if (knowledgeGain <= 0 && maintenance.decayAmount <= 0) {
      knowledge[countryId] = baseUpdated;
      continue;
    }

    const oldLevel = prev.knowledgeLevel;
    const newLevel = clamp(oldLevel + knowledgeGain - maintenance.decayAmount, 0, 100);

    let updated: RegionalKnowledge = {
      ...baseUpdated,
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
      const materializedContact = materializeLocalContact(rng, state, countryId, contact);
      newContacts.push({ countryId, contactId: contact, contact: materializedContact });
      materializedContactIds.add(contact);
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

  return hydrateCulturalInsight(countryId, { ...available[idx] });
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
