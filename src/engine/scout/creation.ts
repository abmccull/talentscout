/**
 * Scout creation — initialises a new Scout entity from a NewGameConfig.
 *
 * Starting stats are shaped by the player's specialization choice, with small
 * Gaussian variation applied via the seeded RNG so no two scouts are identical.
 * All functions here are pure: given the same config + RNG state, the output
 * is always identical.
 */

import type {
  Scout,
  ScoutSkill,
  ScoutAttribute,
  NewGameConfig,
  Specialization,
  Position,
  CareerTier,
} from "@/engine/core/types";
import { RNG } from "@/engine/rng";

// ---------------------------------------------------------------------------
// Base skill profiles per specialization
// ---------------------------------------------------------------------------

/**
 * ScoutSkill canonical members (from types.ts):
 *   technicalEye | physicalAssessment | psychologicalRead
 *   | tacticalUnderstanding | dataLiteracy
 */
type SkillProfile = Record<ScoutSkill, number>;

export const BASE_SKILLS: Record<Specialization, SkillProfile> = {
  youth: {
    technicalEye: 7,
    physicalAssessment: 5,
    psychologicalRead: 6,
    tacticalUnderstanding: 5,
    dataLiteracy: 4,
    playerJudgment: 5,
    potentialAssessment: 7,
  },
  firstTeam: {
    technicalEye: 6,
    physicalAssessment: 6,
    psychologicalRead: 5,
    tacticalUnderstanding: 7,
    dataLiteracy: 5,
    playerJudgment: 7,
    potentialAssessment: 4,
  },
  regional: {
    technicalEye: 6,
    physicalAssessment: 5,
    psychologicalRead: 6,
    tacticalUnderstanding: 5,
    dataLiteracy: 5,
    playerJudgment: 5,
    potentialAssessment: 5,
  },
  data: {
    technicalEye: 4,
    physicalAssessment: 4,
    psychologicalRead: 4,
    tacticalUnderstanding: 5,
    dataLiteracy: 8,
    playerJudgment: 5,
    potentialAssessment: 4,
  },
};

export const SKILL_MINIMUMS: Record<Specialization, SkillProfile> = {
  youth: {
    technicalEye: 5,
    physicalAssessment: 3,
    psychologicalRead: 4,
    tacticalUnderstanding: 3,
    dataLiteracy: 2,
    playerJudgment: 3,
    potentialAssessment: 5,
  },
  firstTeam: {
    technicalEye: 4,
    physicalAssessment: 4,
    psychologicalRead: 3,
    tacticalUnderstanding: 5,
    dataLiteracy: 3,
    playerJudgment: 5,
    potentialAssessment: 2,
  },
  regional: {
    technicalEye: 4,
    physicalAssessment: 3,
    psychologicalRead: 4,
    tacticalUnderstanding: 3,
    dataLiteracy: 3,
    playerJudgment: 3,
    potentialAssessment: 3,
  },
  data: {
    technicalEye: 2,
    physicalAssessment: 2,
    psychologicalRead: 2,
    tacticalUnderstanding: 3,
    dataLiteracy: 6,
    playerJudgment: 3,
    potentialAssessment: 2,
  },
};

export const ALLOCATION_MAX = 12;
export const BONUS_POINTS = 8;

// ---------------------------------------------------------------------------
// Base personal attribute profiles per specialization
// ---------------------------------------------------------------------------

/**
 * ScoutAttribute canonical members (from types.ts):
 *   networking | persuasion | endurance | adaptability | memory | intuition
 */
type AttributeProfile = Record<ScoutAttribute, number>;

const BASE_ATTRIBUTES: Record<Specialization, AttributeProfile> = {
  youth: {
    memory: 7,
    intuition: 7,
    persuasion: 5,
    endurance: 5,
    networking: 5,
    adaptability: 5,
  },
  firstTeam: {
    memory: 5,
    intuition: 5,
    persuasion: 7,
    endurance: 6,
    networking: 5,
    adaptability: 6,
  },
  regional: {
    memory: 5,
    intuition: 5,
    persuasion: 6,
    endurance: 7,
    networking: 8,
    adaptability: 7,
  },
  data: {
    memory: 7,
    intuition: 5,
    persuasion: 3,
    endurance: 6,
    networking: 3,
    adaptability: 4,
  },
};

// ---------------------------------------------------------------------------
// Starting unlocked perks — one per specialization (level 1 perk)
// ---------------------------------------------------------------------------

const STARTING_PERKS: Record<Specialization, string[]> = {
  youth:     ["youth_academy_access"],
  firstTeam: ["firstteam_system_fit"],
  regional:  ["regional_local_network"],
  data:      ["data_statistical_baseline"],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Apply a Gaussian variation (σ ≈ stddev) to a base value, then
 * clamp the result to [1, 20].
 */
function varyAttribute(base: number, stddev: number, rng: RNG): number {
  const delta = Math.round(rng.gaussian(0, stddev));
  return clamp(base + delta, 1, 20);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a brand-new Scout from the player's new-game configuration.
 *
 * Deterministic given the same seed — safe to call in tests and game replays.
 */
export function createScout(config: NewGameConfig, rng: RNG): Scout {
  const { specialization } = config;
  const baseSkills = BASE_SKILLS[specialization];
  const baseAttrs = BASE_ATTRIBUTES[specialization];

  // Apply player allocations before Gaussian noise
  const alloc = config.skillAllocations ?? {};
  const skills: Record<ScoutSkill, number> = {} as Record<ScoutSkill, number>;
  for (const key of Object.keys(baseSkills) as ScoutSkill[]) {
    const allocated = baseSkills[key] + (alloc[key] ?? 0);
    const capped = Math.min(ALLOCATION_MAX, allocated);
    skills[key] = varyAttribute(capped, 0.8, rng);
  }

  // Personality attributes vary a little more (σ = 1.0)
  const attributes: Record<ScoutAttribute, number> = {
    memory:       varyAttribute(baseAttrs.memory, 1.0, rng),
    intuition:    varyAttribute(baseAttrs.intuition, 1.0, rng),
    persuasion:   varyAttribute(baseAttrs.persuasion, 1.0, rng),
    endurance:    varyAttribute(baseAttrs.endurance, 1.0, rng),
    networking:   varyAttribute(baseAttrs.networking, 1.0, rng),
    adaptability: varyAttribute(baseAttrs.adaptability, 1.0, rng),
  };

  const id = `scout_${config.worldSeed}_${rng.nextInt(100000, 999999)}`;

  // If the player chose to start employed at a club, begin as a tier-2 club
  // scout with a modest salary. Otherwise start freelance at tier 1.
  const startingClubId = config.startingClubId;
  const careerTier: CareerTier = startingClubId ? 2 : 1;
  const salary = startingClubId ? 800 : 0;

  return {
    id,
    firstName: config.scoutFirstName,
    lastName: config.scoutLastName,
    age: config.scoutAge,
    nationality: config.nationality,

    skills,
    attributes,

    primarySpecialization: specialization,
    specializationLevel: 1,
    unlockedPerks: [...STARTING_PERKS[specialization]],

    careerTier,
    reputation: 10,
    clubTrust: startingClubId ? 20 : 0,
    specializationReputation: 5,

    currentClubId: startingClubId,
    contractEndSeason: undefined,
    salary,
    savings: 5000,

    reportsSubmitted: 0,
    successfulFinds: 0,
    discoveryCredits: [],

    fatigue: 0,

    skillXp: {},
    attributeXp: {},

    // Phase 1 extensions
    npcScoutIds: [],
    countryReputations: {
      [config.startingCountry ?? "england"]: {
        country: config.startingCountry ?? "england",
        familiarity: 50,
        reportsSubmitted: 0,
        successfulFinds: 0,
        contactCount: 0,
      },
    },
    boardDirectives: [],
  };
}

// ---------------------------------------------------------------------------
// Utility — derive starting position specialisations
// ---------------------------------------------------------------------------

/**
 * Derive 0-2 starting position affinities based on the scout's specialization.
 * Data scouts start with no positional bias (they rely on statistics).
 * Not stored on Scout directly (Scout has no positionSpecialisations field in
 * the canonical types) — exported for use in any future UI hint or setup flow.
 */
export function deriveStartingPositionAffinities(
  specialization: Specialization,
  rng: RNG,
): Position[] {
  if (specialization === "data") return [];

  const attackingPositions: Position[] = ["ST", "LW", "RW", "CAM"];
  const midfieldPositions: Position[]  = ["CM", "CDM", "CAM"];
  const defensivePositions: Position[] = ["CB", "LB", "RB", "CDM"];

  if (specialization === "youth") {
    // Youth scouts gravitate toward attacking and creative midfielders
    return [rng.pick(attackingPositions), rng.pick(midfieldPositions)];
  }

  if (specialization === "firstTeam") {
    // Pick one complete position group at random
    const groups = [attackingPositions, midfieldPositions, defensivePositions];
    const group = rng.pick(groups);
    return [rng.pick(group)];
  }

  // Regional: broad coverage — one from each end of the pitch
  return [rng.pick(defensivePositions), rng.pick(attackingPositions)];
}

// ---------------------------------------------------------------------------
// Skill allocation validation
// ---------------------------------------------------------------------------

/**
 * Validate a player's bonus skill allocations against the rules:
 * - Total bonus points must equal BONUS_POINTS (8)
 * - No individual bonus may be negative
 * - Base + bonus must not drop below the specialization minimum
 * - Base + bonus must not exceed ALLOCATION_MAX (12)
 */
export function validateSkillAllocations(
  specialization: Specialization,
  allocations: Partial<Record<ScoutSkill, number>>,
): { valid: boolean; reason?: string } {
  const base = BASE_SKILLS[specialization];
  const mins = SKILL_MINIMUMS[specialization];

  let totalUsed = 0;
  for (const key of Object.keys(base) as ScoutSkill[]) {
    const bonus = allocations[key] ?? 0;
    if (bonus < 0) {
      return { valid: false, reason: `Negative bonus for ${key}` };
    }
    const result = base[key] + bonus;
    if (result < mins[key]) {
      return { valid: false, reason: `${key} (${result}) below minimum (${mins[key]})` };
    }
    if (result > ALLOCATION_MAX) {
      return { valid: false, reason: `${key} (${result}) exceeds maximum (${ALLOCATION_MAX})` };
    }
    totalUsed += bonus;
  }

  if (totalUsed > BONUS_POINTS) {
    return { valid: false, reason: `Used ${totalUsed} points, max is ${BONUS_POINTS}` };
  }

  return { valid: true };
}
