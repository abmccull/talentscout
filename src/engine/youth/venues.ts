/**
 * Youth venue processing — pool selection, observation processing, and
 * venue-specific mechanics for discovering unsigned youth.
 *
 * Each venue type exposes different pools of youth and different
 * observation conditions. Street football rewards intuition,
 * academy trial days reward networking, and follow-up sessions
 * provide the widest attribute window.
 *
 * All functions are pure: no side effects, no mutation.
 */

import type { RNG } from "@/engine/rng";
import type {
  UnsignedYouth,
  Scout,
  Observation,
  ObservationContext,
  PersonalityTrait,
  YouthVenueType,
  TournamentEvent,
} from "@/engine/core/types";
import { observePlayerLight } from "@/engine/scout/perception";
import { isScoutAbroad } from "@/engine/world/travel";
import { countryKeyFromNationality, normalizeCountryKey } from "@/lib/country";

// =============================================================================
// VENUE POOL CONFIGURATION
// =============================================================================

interface VenueConfig {
  minPoolSize: number;
  maxPoolSize: number;
}

const VENUE_POOL_SIZES: Record<YouthVenueType, VenueConfig> = {
  schoolMatch:          { minPoolSize: 3,  maxPoolSize: 6  },
  grassrootsTournament: { minPoolSize: 5,  maxPoolSize: 10 },
  streetFootball:       { minPoolSize: 2,  maxPoolSize: 5  },
  academyTrialDay:      { minPoolSize: 4,  maxPoolSize: 8  },
  youthFestival:        { minPoolSize: 8,  maxPoolSize: 15 },
  followUpSession:      { minPoolSize: 1,  maxPoolSize: 1  },
  parentCoachMeeting:   { minPoolSize: 1,  maxPoolSize: 1  },
};

// =============================================================================
// HIDDEN ATTRIBUTE INTEL POOLS
// =============================================================================

const HIDDEN_INTEL_POOLS = {
  injuryProneness: {
    low: ["The coach cannot remember the player missing a session through injury."],
    medium: ["There have been a few minor knocks, but no clear injury pattern yet."],
    high: ["The family and coach both mention recurring physical problems."],
  },
  consistency: {
    low: ["Performance levels swing noticeably from one week to the next."],
    medium: ["The coach sees a normal mix of strong and quiet performances."],
    high: ["The player delivers much the same standard in training and matches every week."],
  },
  professionalism: {
    low: ["The coach has repeatedly challenged the player's preparation and punctuality."],
    medium: ["Training habits are acceptable, though the player still needs reminders."],
    high: ["The player arrives early, listens closely, and takes development seriously."],
  },
  bigGameTemperament: {
    low: ["The player has tended to withdraw when matches become emotionally demanding."],
    medium: ["Big occasions still bring nerves, but the player usually settles into the game."],
    high: ["The coach trusts the player most when the pressure and stakes rise."],
  },
} as const;

const CHARACTER_NOTE_POOL: readonly string[] = [
  "Supportive family — both parents attend every game",
  "Single-parent household. Mum drives him 40 minutes each way to training.",
  "Father was a professional footballer — the boy has football in his blood",
  "Struggles with discipline at school but transforms on the pitch",
  "Quiet kid, keeps to himself. On the pitch he's a different person.",
  "Very popular in the dressing room — natural leader among his peers",
  "Has been scouted by two other clubs already — there's competition for his signature",
  "The family is considering moving abroad — could be now or never",
] as const;

const PERSONALITY_CHARACTER_NOTES: Partial<Record<PersonalityTrait, string>> = {
  ambitious: "The family describes a player who constantly asks what the next level requires.",
  loyal: "The coach says the player forms strong bonds and does not chase every new offer.",
  professional: "Training habits and preparation are unusually mature for this age.",
  temperamental: "Emotions can run hot when sessions or decisions go against the player.",
  determined: "Setbacks tend to produce extra work rather than excuses.",
  easygoing: "The player is relaxed and well liked, though occasionally needs pushing.",
  leader: "Teammates naturally look to the player for direction and reassurance.",
  introvert: "The player is quiet away from the pitch and takes time to trust new people.",
  flair: "The coach actively gives the player freedom to improvise and try difficult actions.",
  controversialCharacter: "Staff have needed to manage friction around the player more than once.",
  modelCitizen: "School, family, and coaching staff all describe an exceptionally grounded youngster.",
  pressurePlayer: "The player appears to enjoy responsibility when a match becomes tense.",
  bigGamePlayer: "The strongest performances have tended to arrive in the biggest fixtures.",
  inconsistent: "Staff are still trying to understand the gap between the player's best and quietest days.",
  injuryProne: "The development plan has repeatedly been interrupted by physical complaints.",
  lateDeveloper: "The coach believes the player is physically and technically behind the eventual timeline.",
};

const HIDDEN_ATTRIBUTE_KEYS = Object.keys(HIDDEN_INTEL_POOLS) as Array<keyof typeof HIDDEN_INTEL_POOLS>;

function canonicalizeCountry(value?: string): string | undefined {
  return normalizeCountryKey(value);
}

function resolveScoutHomeCountry(scout: Scout): string {
  for (const [key, reputation] of Object.entries(scout.countryReputations ?? {})) {
    const countryId = canonicalizeCountry(reputation.country) ?? canonicalizeCountry(key);
    if (countryId && reputation.familiarity >= 50) {
      return countryId;
    }
  }

  const nationalityCountry = countryKeyFromNationality(scout.nationality);
  if (nationalityCountry) {
    return nationalityCountry;
  }

  for (const [key, reputation] of Object.entries(scout.countryReputations ?? {})) {
    const countryId = canonicalizeCountry(reputation.country) ?? canonicalizeCountry(key);
    if (countryId) {
      return countryId;
    }
  }

  return "england";
}

function resolveEffectiveScoutCountry(scout: Scout, currentWeek?: number): string {
  const abroadCountry = currentWeek != null && isScoutAbroad(scout, currentWeek)
    ? canonicalizeCountry(scout.travelBooking?.destinationCountry)
    : undefined;

  return abroadCountry ?? resolveScoutHomeCountry(scout);
}

// =============================================================================
// SCOUT QUALITY DATA FOR POOL WEIGHTING
// =============================================================================

/** Scout attributes that influence the quality of youth surfaced in venue pools. */
export interface ScoutQualityData {
  /** Scout's intuition attribute (1–20). */
  intuition: number;
  /** Regional knowledge level for the venue's country (0–100). */
  regionalKnowledge: number;
  /** Scout's specialization level (0–50). */
  specializationLevel: number;
  /** Whether the scout is a youth specialist. */
  isYouthSpecialist: boolean;
  /** Access-driven breadth. This changes who can be reached, not player truth. */
  presenceDiscoveryMultiplier?: number;
}

/**
 * Compute a 0–1 quality weight that determines how much the pool
 * selection favours higher-PA youth.
 *
 * - Low weight (~0.1): nearly random — scout can't distinguish talent.
 * - High weight (~0.7): strong bias toward higher PA.
 * - Max (~1.0): almost always sees the best available.
 */
function computeQualityWeight(data: ScoutQualityData): number {
  // Early-career scouts should still see a mixed pool. Keep the bias toward
  // top-end prospects modest until intuition, knowledge, and specialization
  // are genuinely strong.
  let weight = 0.08 + ((data.intuition - 1) / 19) * 0.28;

  // Regional knowledge bonus
  if (data.regionalKnowledge >= 80) weight += 0.12;
  else if (data.regionalKnowledge >= 50) weight += 0.06;

  // Youth specialization bonus: up to +0.14 at level 50
  if (data.isYouthSpecialist) {
    weight += (data.specializationLevel / 50) * 0.14;
  }

  return Math.min(0.65, Math.max(0.05, weight));
}

/**
 * Weighted shuffle: biases selection toward higher-PA youth based on
 * the scout's quality weight. Each youth gets a sort score that blends
 * their PA rank with randomness. Higher quality weight = less randomness.
 */
function weightedShuffle(
  rng: RNG,
  pool: UnsignedYouth[],
  qualityWeight: number,
): UnsignedYouth[] {
  const scored = pool.map((y) => ({
    youth: y,
    score:
      (y.player.potentialAbility / 200) * qualityWeight +
      rng.next() * (1 - qualityWeight),
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.youth);
}

// =============================================================================
// PUBLIC FUNCTIONS
// =============================================================================

/**
 * Returns the pool of unsigned youth available at a given venue event.
 *
 * For followUpSession and parentCoachMeeting, pass the specific youth ID as
 * targetYouthId. If not provided for these venues, an empty array is returned.
 *
 * @param rng            - Seeded RNG instance.
 * @param venueType      - The type of venue event.
 * @param unsignedYouth  - All unsigned youth in the world, keyed by ID.
 * @param scout          - The observing scout (location/country context).
 * @param subRegionId    - Optional sub-region filter (used by streetFootball).
 * @param targetYouthId  - Optional specific youth ID (required by followUpSession
 *                         and parentCoachMeeting).
 * @param youthDiscoveryBonus - Fractional bonus to discovery pool size from equipment.
 * @param currentWeek    - Current game week, used to determine if scout is abroad.
 */
export function getYouthVenuePool(
  rng: RNG,
  venueType: YouthVenueType,
  unsignedYouth: Record<string, UnsignedYouth>,
  scout: Scout,
  subRegionId?: string,
  targetYouthId?: string,
  /** Fractional bonus to discovery pool size from equipment (e.g. 0.10 = +10% more youth visible). */
  youthDiscoveryBonus?: number,
  currentWeek?: number,
  /** Tournament context — applies pool size multiplier when attending a named tournament. */
  tournament?: TournamentEvent,
  /** Scout quality data for quality-weighted pool selection. */
  scoutQualityData?: ScoutQualityData,
): UnsignedYouth[] {
  // Step 1: base pool — active (not placed, not retired) youth
  const activeYouth = Object.values(unsignedYouth).filter(
    (y) => !y.placed && !y.retired,
  );

  // Step 2: targeted venues — return immediately with specific youth if found
  if (venueType === "followUpSession" || venueType === "parentCoachMeeting") {
    if (!targetYouthId) return [];
    const target = unsignedYouth[targetYouthId];
    if (!target || target.placed || target.retired) return [];
    return [target];
  }

  // Step 3: apply venue-specific filters
  // Use the scout's effective location: if abroad, use destination country;
  // otherwise use home country. This ensures scouting in Brazil finds
  // Brazilian youth, not English youth.
  const scoutCountry = resolveEffectiveScoutCountry(scout, currentWeek);
  const tournamentCountries = new Set(
    (tournament?.participantCountries ?? [])
      .map((country) => canonicalizeCountry(country))
      .filter((country): country is string => !!country),
  );
  const allowedCountries = tournamentCountries.size > 0
    ? tournamentCountries
    : new Set([scoutCountry]);
  let filtered: UnsignedYouth[];

  switch (venueType) {
    case "schoolMatch":
      // Same country as scout's location, age 14-16, low visibility
      filtered = activeYouth.filter(
        (y) =>
          canonicalizeCountry(y.country) === scoutCountry &&
          y.player.age >= 14 &&
          y.player.age <= 16 &&
          y.visibility < 30,
      );
      break;

    case "grassrootsTournament":
      // Domestic grassroots by default; tournament context can override host/participant country.
      filtered = activeYouth.filter((y) =>
        allowedCountries.has(canonicalizeCountry(y.country) ?? ""),
      );
      break;

    case "streetFootball":
      // Same country as scout's location, specific sub-region (if provided), age 14-17, lower visibility
      filtered = activeYouth.filter(
        (y) =>
          canonicalizeCountry(y.country) === scoutCountry &&
          y.player.age >= 14 &&
          y.player.age <= 17 &&
          y.visibility < 50,
      );
      if (subRegionId) {
        filtered = filtered.filter((y) => y.regionId === subRegionId);
      }
      break;

    case "academyTrialDay":
      // Same country as scout's location, youth with buzz
      filtered = activeYouth.filter(
        (y) => canonicalizeCountry(y.country) === scoutCountry && y.buzzLevel > 30,
      );
      break;

    case "youthFestival":
      // Domestic by default; explicit tournaments can widen the participant country set.
      filtered = activeYouth.filter(
        (y) =>
          allowedCountries.has(canonicalizeCountry(y.country) ?? "") &&
          y.player.age >= 14 &&
          y.player.age <= 17,
      );
      break;
  }

  // Step 4: quality-weighted selection + slice to venue pool size
  const config = VENUE_POOL_SIZES[venueType];
  const bonusMultiplier = 1 + (youthDiscoveryBonus ?? 0);
  const tournamentMultiplier = tournament?.poolSizeMultiplier ?? 1.0;
  const presenceMultiplier = Math.max(
    0.75,
    Math.min(1.35, scoutQualityData?.presenceDiscoveryMultiplier ?? 1),
  );
  const poolSize = Math.round(
    rng.nextInt(config.minPoolSize, config.maxPoolSize)
      * bonusMultiplier
      * tournamentMultiplier
      * presenceMultiplier,
  );

  // If scout quality data is provided, use weighted shuffle to bias toward higher-PA youth.
  // Otherwise, fall back to pure random shuffle (backwards compatible).
  const sorted = scoutQualityData
    ? weightedShuffle(rng, filtered, computeQualityWeight(scoutQualityData))
    : rng.shuffle(filtered);
  return sorted.slice(0, poolSize);
}

/**
 * Processes a single youth observation at a venue.
 *
 * Calls the perception engine to generate an observation, then calculates
 * venue-specific buzz and visibility increases, and returns an updated
 * UnsignedYouth snapshot (no mutation of the input).
 */
export function processVenueObservation(
  rng: RNG,
  scout: Scout,
  youth: UnsignedYouth,
  context: ObservationContext,
  existingObservations: Observation[],
  week: number,
  season: number,
  /** Extra attributes to observe per session (e.g. focus passes reveal more). */
  extraAttributes?: number,
  /** Tournament context — applies observation and buzz bonuses. */
  tournament?: TournamentEvent,
): {
  observation: Observation;
  buzzIncrease: number;
  visibilityIncrease: number;
  updatedYouth: UnsignedYouth;
} {
  // Generate the observation via the light perception pipeline
  const totalExtraAttributes = (extraAttributes ?? 0) + (tournament?.extraAttributes ?? 0);
  const observation = observePlayerLight(
    rng,
    youth.player,
    scout,
    context,
    existingObservations,
    totalExtraAttributes > 0 ? totalExtraAttributes : undefined,
  );

  // Stamp week and season (perception engine leaves these as 0)
  const stampedObservation: Observation = {
    ...observation,
    week,
    season,
  };

  // Buzz increase: base 3-8, with venue + tournament bonuses
  let buzzIncrease = rng.nextInt(3, 8);
  if (context === "followUpSession") buzzIncrease += 3;
  else if (context === "youthFestival") buzzIncrease += 2;
  else if (context === "grassrootsTournament") buzzIncrease += 1;
  buzzIncrease += tournament?.observationBonus ?? 0;

  // Visibility increase: base 2-5, with venue + tournament bonuses
  let visibilityIncrease = rng.nextInt(2, 5);
  if (context === "academyTrialDay") visibilityIncrease += 3;
  else if (context === "youthFestival") visibilityIncrease += 2;
  visibilityIncrease += Math.floor((tournament?.observationBonus ?? 0) * 0.5);

  // Build updated youth — no mutation
  const alreadyDiscovered = youth.discoveredBy.includes(scout.id);
  const alreadyHasVenue = youth.venueAppearances.includes(
    context as YouthVenueType,
  );

  const updatedYouth: UnsignedYouth = {
    ...youth,
    buzzLevel: Math.min(100, youth.buzzLevel + buzzIncrease),
    visibility: Math.min(100, youth.visibility + visibilityIncrease),
    discoveredBy: alreadyDiscovered
      ? youth.discoveredBy
      : [...youth.discoveredBy, scout.id],
    venueAppearances: alreadyHasVenue
      ? youth.venueAppearances
      : [...youth.venueAppearances, context as YouthVenueType],
  };

  return {
    observation: stampedObservation,
    buzzIncrease,
    visibilityIncrease,
    updatedYouth,
  };
}

/**
 * Simulates a parent/coach meeting that reveals hidden intel about a youth.
 *
 * Returns qualitative text descriptions of 1-2 hidden attributes and a
 * character note drawn from a curated pool. No numeric attribute values are
 * revealed — only narrative hints, matching how scouts actually gather
 * this kind of intelligence.
 */
export function processParentCoachMeeting(
  rng: RNG,
  scout: Scout,
  youth: UnsignedYouth,
): { hiddenIntel: string[]; characterNotes: string[] } {
  // Pick 1-2 hidden attributes to reveal
  const attributeCount = rng.nextInt(1, 2);
  const availableKeys = rng.shuffle(HIDDEN_ATTRIBUTE_KEYS);
  const selectedKeys = availableKeys.slice(0, attributeCount);

  const reliability = Math.max(
    0,
    Math.min(
      1,
      (scout.skills.psychologicalRead + scout.attributes.intuition) / 40,
    ),
  );
  const bands = ["low", "medium", "high"] as const;

  // Each statement is grounded in the hidden value, with an adjacent-band
  // misread still possible for inexperienced scouts.
  const hiddenIntel: string[] = selectedKeys.map((key) => {
    const value = youth.player.attributes[key];
    let bandIndex = value <= 7 ? 0 : value >= 14 ? 2 : 1;
    if (rng.chance(0.3 * (1 - reliability))) {
      bandIndex = Math.max(0, Math.min(2, bandIndex + (rng.chance(0.5) ? 1 : -1)));
    }
    const pool = HIDDEN_INTEL_POOLS[key];
    const bandPool = pool[bands[bandIndex]];
    return bandPool[rng.nextInt(0, bandPool.length - 1)];
  });

  const groundedCharacterNotes = youth.player.personalityTraits
    .map((trait) => PERSONALITY_CHARACTER_NOTES[trait])
    .filter((note): note is string => !!note);
  if (youth.buzzLevel >= 70) {
    groundedCharacterNotes.push(
      "The family is aware of interest from several clubs and wants a clear development plan.",
    );
  }
  const characterPool = groundedCharacterNotes.length > 0
    ? groundedCharacterNotes
    : [...CHARACTER_NOTE_POOL];
  const characterNote = characterPool[rng.nextInt(0, characterPool.length - 1)];

  return {
    hiddenIntel,
    characterNotes: [characterNote],
  };
}

/**
 * Maps a YouthVenueType to its corresponding ObservationContext.
 *
 * The venue types and observation contexts share string values; this function
 * makes the mapping explicit and intent-clear rather than relying on
 * implicit type casting at call sites.
 */
export function mapVenueTypeToContext(
  venueType: YouthVenueType,
): ObservationContext {
  switch (venueType) {
    case "schoolMatch":
      return "schoolMatch";
    case "grassrootsTournament":
      return "grassrootsTournament";
    case "streetFootball":
      return "streetFootball";
    case "academyTrialDay":
      return "academyTrialDay";
    case "youthFestival":
      return "youthFestival";
    case "followUpSession":
      return "followUpSession";
    case "parentCoachMeeting":
      return "parentCoachMeeting";
  }
}
