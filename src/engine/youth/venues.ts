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
  YouthVenueType,
  TournamentEvent,
} from "@/engine/core/types";
import { observePlayerLight } from "@/engine/scout/perception";
import { getScoutHomeCountry, isScoutAbroad } from "@/engine/world/travel";

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

const HIDDEN_INTEL_POOLS: Record<string, readonly string[]> = {
  injuryProneness: [
    "Rarely gets hurt — tough as nails",
    "Has a history of niggling injuries",
    "The family has concerns about a recurring knee issue",
  ],
  consistency: [
    "Performs at the same level every week, rain or shine",
    "Can be brilliant one day and invisible the next",
    "His teacher says the same — inconsistent effort",
  ],
  professionalism: [
    "First to arrive at training, last to leave",
    "The coach has had to have words about his attitude more than once",
    "Very mature for his age — takes his development seriously",
  ],
  bigGameTemperament: [
    "Thrives when the pressure is on — loves the big stage",
    "Went very quiet in the cup final",
    "Gets nervous before important matches but usually finds his feet",
  ],
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

const HIDDEN_ATTRIBUTE_KEYS = Object.keys(HIDDEN_INTEL_POOLS) as Array<keyof typeof HIDDEN_INTEL_POOLS>;

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
  const abroad = currentWeek != null && isScoutAbroad(scout, currentWeek);
  const scoutCountry = abroad
    ? scout.travelBooking!.destinationCountry.toLowerCase()
    : getScoutHomeCountry(scout);
  let filtered: UnsignedYouth[];

  switch (venueType) {
    case "schoolMatch":
      // Same country as scout's location, age 14-16, low visibility
      filtered = activeYouth.filter(
        (y) =>
          y.country === scoutCountry &&
          y.player.age >= 14 &&
          y.player.age <= 16 &&
          y.visibility < 30,
      );
      break;

    case "grassrootsTournament":
      // Same country, any age
      filtered = activeYouth.filter((y) => y.country === scoutCountry);
      break;

    case "streetFootball":
      // Same country as scout's location, specific sub-region (if provided), age 14-17, lower visibility
      filtered = activeYouth.filter(
        (y) =>
          y.country === scoutCountry &&
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
      filtered = activeYouth.filter((y) => y.country === scoutCountry && y.buzzLevel > 30);
      break;

    case "youthFestival":
      // Any region, age 14-17
      filtered = activeYouth.filter(
        (y) => y.player.age >= 14 && y.player.age <= 17,
      );
      break;
  }

  // Step 4: shuffle and slice to venue pool size range (equipment + tournament bonuses expand pool)
  const config = VENUE_POOL_SIZES[venueType];
  const bonusMultiplier = 1 + (youthDiscoveryBonus ?? 0);
  const tournamentMultiplier = tournament?.poolSizeMultiplier ?? 1.0;
  const poolSize = Math.round(rng.nextInt(config.minPoolSize, config.maxPoolSize) * bonusMultiplier * tournamentMultiplier);
  const shuffled = rng.shuffle(filtered);
  return shuffled.slice(0, poolSize);
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
  _scout: Scout,
  _youth: UnsignedYouth,
): { hiddenIntel: string[]; characterNotes: string[] } {
  // Pick 1-2 hidden attributes to reveal
  const attributeCount = rng.nextInt(1, 2);
  const availableKeys = rng.shuffle(HIDDEN_ATTRIBUTE_KEYS);
  const selectedKeys = availableKeys.slice(0, attributeCount);

  // For each selected attribute, pick a random description
  const hiddenIntel: string[] = selectedKeys.map((key) => {
    const pool = HIDDEN_INTEL_POOLS[key];
    return pool[rng.nextInt(0, pool.length - 1)];
  });

  // Pick 1 character note
  const characterNote =
    CHARACTER_NOTE_POOL[rng.nextInt(0, CHARACTER_NOTE_POOL.length - 1)];

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
