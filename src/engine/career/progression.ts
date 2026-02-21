/**
 * Career progression — performance reviews, job offer generation, reputation
 * management, and accepting offers.
 *
 * All functions are pure: they accept current state and return new state or
 * derived data without mutating their inputs.
 */

import type {
  Scout,
  ScoutReport,
  Club,
  JobOffer,
  PerformanceReview,
  CareerTier,
  Specialization,
  ScoutingPhilosophy,
  ConvictionLevel,
  WonderkidTier,
  NPCScout,
  ManagerRelationship,
  BoardDirective,
} from "@/engine/core/types";
import { RNG } from "@/engine/rng";

// ---------------------------------------------------------------------------
// Reputation event union
// ---------------------------------------------------------------------------

export type ReputationEvent =
  | { type: "reportSubmitted"; quality: number }
  | {
      type: "successfulSigning";
      convictionLevel: ConvictionLevel;
      playerPerformance: number;
    }
  | { type: "failedSigning"; convictionLevel: ConvictionLevel }
  | { type: "discoveryCredit"; wonderkidTier: WonderkidTier }
  | { type: "tablePoundSuccess" }
  | { type: "tablePoundFailure" }
  | { type: "seasonEnd"; reviewOutcome: string };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Minimum reputation to be eligible for each career tier */
const TIER_REPUTATION_REQUIREMENTS: Record<CareerTier, number> = {
  1: 0,
  2: 25,
  3: 50,
  4: 70,
  5: 90,
};

/** Weekly salary bands (£) per career tier */
const SALARY_BANDS: Record<CareerTier, { min: number; max: number }> = {
  1: { min: 0,     max: 0 },     // Freelance — no salary
  2: { min: 500,   max: 1500 },
  3: { min: 1500,  max: 4000 },
  4: { min: 4000,  max: 10000 },
  5: { min: 10000, max: 25000 },
};

/** Scouting philosophies that align well with each specialization */
const PHILOSOPHY_SPEC_AFFINITY: Record<ScoutingPhilosophy, Specialization[]> = {
  academyFirst:    ["youth", "regional"],
  winNow:          ["firstTeam", "data"],
  marketSmart:     ["data", "regional", "firstTeam"],
  globalRecruiter: ["regional", "data", "firstTeam"],
};

/** Role titles per specialization and tier */
const ROLE_TITLE_BY_SPEC: Record<Specialization, Record<CareerTier, string>> = {
  youth: {
    1: "Freelance Youth Scout",
    2: "Youth Scout",
    3: "Senior Youth Scout",
    4: "Head of Youth Scouting",
    5: "Youth Development Director",
  },
  firstTeam: {
    1: "Freelance Scout",
    2: "First Team Scout",
    3: "Senior Scout",
    4: "Chief Scout",
    5: "Director of Football",
  },
  regional: {
    1: "Freelance Regional Scout",
    2: "Regional Scout",
    3: "Senior Regional Scout",
    4: "Head of Regional Scouting",
    5: "Sporting Director",
  },
  data: {
    1: "Freelance Data Analyst",
    2: "Data Analyst",
    3: "Lead Data Analyst",
    4: "Head of Analysis",
    5: "Director of Football Analytics",
  },
};

// ---------------------------------------------------------------------------
// Reputation change deltas
// ---------------------------------------------------------------------------

const SIGNING_SUCCESS_DELTA: Record<ConvictionLevel, number> = {
  note:            1,
  recommend:       3,
  strongRecommend: 5,
  tablePound:      10,
};

const SIGNING_FAILURE_DELTA: Record<ConvictionLevel, number> = {
  note:            -0.5,
  recommend:       -2,
  strongRecommend: -5,
  tablePound:      -15,
};

// WonderkidTier values from the canonical types.ts:
// "generational" | "worldClass" | "qualityPro" | "journeyman"
const DISCOVERY_DELTA: Record<WonderkidTier, number> = {
  journeyman:   2,
  qualityPro:   5,
  worldClass:   15,
  generational: 30,
};

// ---------------------------------------------------------------------------
// Reputation update
// ---------------------------------------------------------------------------

/**
 * Apply a single reputation event and return an updated Scout.
 * Reputation is clamped to [0, 100].
 */
export function updateReputation(scout: Scout, event: ReputationEvent): Scout {
  const delta = calculateReputationDelta(event);
  const newReputation = Math.max(0, Math.min(100, scout.reputation + delta));
  return { ...scout, reputation: newReputation };
}

function calculateReputationDelta(event: ReputationEvent): number {
  switch (event.type) {
    case "reportSubmitted": {
      // quality 0–100 → +0.5 to +2
      const normalised = Math.max(0, Math.min(100, event.quality)) / 100;
      return 0.5 + normalised * 1.5;
    }

    case "successfulSigning": {
      const base = SIGNING_SUCCESS_DELTA[event.convictionLevel];
      // playerPerformance 0–100 scales the base by ±25 %
      const perfFactor = (event.playerPerformance - 50) / 200; // -0.25 to +0.25
      return base * (1 + perfFactor);
    }

    case "failedSigning":
      return SIGNING_FAILURE_DELTA[event.convictionLevel];

    case "discoveryCredit":
      return DISCOVERY_DELTA[event.wonderkidTier];

    case "tablePoundSuccess":
      return 5;

    case "tablePoundFailure":
      return -10;

    case "seasonEnd": {
      switch (event.reviewOutcome) {
        case "excellent":  return 5;
        case "good":       return 2;
        case "acceptable": return 0;
        case "poor":       return -5;
        default:           return 0;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Performance review
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Tier-specific review context
// ---------------------------------------------------------------------------

/**
 * Extra context passed into the performance review for tier 3–5 scouts.
 * All fields are optional; the scorer only uses what is relevant for the tier.
 */
export interface TierReviewContext {
  // Tier 3 — international coverage
  /** Countries from which the scout submitted reports this season. */
  countriesScoutedThisSeason?: string[];
  /** Home country of the scout (reports from other countries count as international). */
  homeCountry?: string;

  // Tier 4 — NPC scout management
  /** NPC scouts under the player's management this season. */
  npcScouts?: NPCScout[];
  /** Active manager relationship at end of season. */
  managerRelationship?: ManagerRelationship;
  /** Number of manager directives fulfilled this season. */
  directivesFulfilled?: number;
  /** Total manager directives issued this season. */
  directivesIssued?: number;

  // Tier 5 — board directives
  /** Board directives that were active this season. */
  boardDirectives?: BoardDirective[];
  /** NPC scout reports generated across the whole department. */
  departmentReportCount?: number;
  /** Average NPC report quality across the department, 0–100. */
  departmentAverageQuality?: number;
}

/**
 * Calculate an end-of-season performance review from submitted reports.
 *
 * PerformanceReview shape from types.ts:
 *   { season, reportsSubmitted, averageQuality, successfulRecommendations,
 *     tablePoundsUsed, tablePoundsSuccessful, reputationChange,
 *     outcome: "promoted" | "retained" | "warning" | "fired" }
 *
 * Tiers 3-5 receive additional scoring criteria via the optional
 * `tierContext` parameter. Tier 1-2 behaviour is unchanged.
 */
export function calculatePerformanceReview(
  scout: Scout,
  reports: ScoutReport[],
  season: number,
  tierContext?: TierReviewContext,
): PerformanceReview {
  const seasonReports = reports.filter(
    (r) => r.submittedSeason === season && r.scoutId === scout.id,
  );

  const reportsSubmitted = seasonReports.length;

  const averageQuality =
    reportsSubmitted > 0
      ? seasonReports.reduce((sum, r) => sum + r.qualityScore, 0) /
        reportsSubmitted
      : 0;

  // Count table-pound reports
  const tablePoundReports = seasonReports.filter(
    (r) => r.conviction === "tablePound",
  );
  const tablePoundsUsed = tablePoundReports.length;

  // "Successful" table pounds: club acted on it (clubResponse === "signed")
  const tablePoundsSuccessful = tablePoundReports.filter(
    (r) => r.clubResponse === "signed",
  ).length;

  // Successful recommendations: any conviction level where club signed
  const successfulRecommendations = seasonReports.filter(
    (r) => r.clubResponse === "signed",
  ).length;

  // ---------------------------------------------------------------------------
  // Base composite score (tiers 1–2, and foundation for tiers 3–5)
  // Reports:      up to 25 pts (target = 10 reports)
  // Quality:      up to 40 pts (target = avg quality 75)
  // Signings:     up to 25 pts (target = 3 successful)
  // Table pounds: up to 10 pts bonus
  // ---------------------------------------------------------------------------
  const reportScore     = Math.min(25, (reportsSubmitted / 10) * 25);
  const qualityScore    = Math.min(40, (averageQuality / 75) * 40);
  const signingScore    = Math.min(25, (successfulRecommendations / 3) * 25);
  const tablePoundBonus = tablePoundsSuccessful >= 1 ? 10 : 0;
  let total = reportScore + qualityScore + signingScore + tablePoundBonus;

  // ---------------------------------------------------------------------------
  // Tier 3 — Full-time scout
  // Bonus:   international reports broaden coverage (+up to 10 pts)
  // Penalty: narrow regional coverage with no international work (−up to 10 pts)
  // ---------------------------------------------------------------------------
  if (scout.careerTier >= 3 && tierContext !== undefined) {
    const tierBonus = calculateTier3Bonus(tierContext);
    total += tierBonus;
  }

  // ---------------------------------------------------------------------------
  // Tier 4 — Head Scout
  // Bonus:   NPC management quality and manager satisfaction (+up to 15 pts)
  // ---------------------------------------------------------------------------
  if (scout.careerTier >= 4 && tierContext !== undefined) {
    const tierBonus = calculateTier4Bonus(tierContext);
    total += tierBonus;
  }

  // ---------------------------------------------------------------------------
  // Tier 5 — Director
  // Bonus:   board directive completion and department performance (+up to 20 pts)
  // ---------------------------------------------------------------------------
  if (scout.careerTier >= 5 && tierContext !== undefined) {
    const tierBonus = calculateTier5Bonus(tierContext);
    total += tierBonus;
  }

  // Cap total to 100 so stacking tier bonuses does not trivialise the outcome
  total = Math.min(100, total);

  const outcome =
    total >= 85 ? "promoted" :
    total >= 55 ? "retained" :
    total >= 30 ? "warning" :
    "fired";

  const reputationChange = calculateReputationDelta({
    type: "seasonEnd",
    reviewOutcome:
      outcome === "promoted" ? "excellent" :
      outcome === "retained" ? "good" :
      outcome === "warning"  ? "acceptable" :
      "poor",
  });

  return {
    season,
    reportsSubmitted,
    averageQuality: Math.round(averageQuality),
    successfulRecommendations,
    tablePoundsUsed,
    tablePoundsSuccessful,
    reputationChange,
    outcome,
  };
}

// ---------------------------------------------------------------------------
// Tier 3 scoring helper
// ---------------------------------------------------------------------------

/**
 * Returns a score modifier in the range [−10, +10] for tier 3 scouts.
 *
 * International coverage is rewarded because full-time scouts are expected to
 * broaden their scouting network beyond the domestic market.
 *
 * Scoring:
 *  - +2 pts per country beyond the home country (capped at +10)
 *  - −5 pts if every report came from a single country (narrow coverage)
 *  - An additional −5 pts if that single country is also the home country
 */
function calculateTier3Bonus(ctx: TierReviewContext): number {
  const countries = ctx.countriesScoutedThisSeason ?? [];
  const home      = ctx.homeCountry ?? "";

  if (countries.length === 0) return 0;

  const uniqueCountries     = new Set(countries);
  const internationalCount  = home
    ? [...uniqueCountries].filter((c) => c !== home).length
    : uniqueCountries.size;

  // Bonus for international breadth
  const bonus = Math.min(10, internationalCount * 2);

  // Penalty for overly narrow coverage
  let penalty = 0;
  if (uniqueCountries.size === 1) {
    penalty = 5;
    if (home && uniqueCountries.has(home)) {
      penalty = 10; // Entirely domestic-only at full-time level is worse
    }
  }

  return bonus - penalty;
}

// ---------------------------------------------------------------------------
// Tier 4 scoring helper
// ---------------------------------------------------------------------------

/**
 * Returns a score modifier in the range [0, +15] for tier 4 (Head Scout) scouts.
 *
 * Head scouts are judged on how well they manage their NPC scout network and
 * maintain their relationship with the club manager.
 *
 * Scoring:
 *  - NPC management (up to 8 pts): average NPC morale and report output
 *  - Manager satisfaction (up to 7 pts): trust level and directive fulfilment
 */
function calculateTier4Bonus(ctx: TierReviewContext): number {
  let npcScore = 0;
  const npcScouts = ctx.npcScouts ?? [];

  if (npcScouts.length > 0) {
    // Average morale across managed scouts (1–10 scale)
    const avgMorale =
      npcScouts.reduce((sum, n) => sum + n.morale, 0) / npcScouts.length;
    // Average report output (target = 5 reports each)
    const avgReports =
      npcScouts.reduce((sum, n) => sum + n.reportsSubmitted, 0) / npcScouts.length;

    // Morale contributes up to 4 pts (10/10 morale → 4 pts)
    const moraleScore  = Math.min(4, (avgMorale / 10) * 4);
    // Report volume contributes up to 4 pts (5+ reports per NPC → 4 pts)
    const reportVolume = Math.min(4, (avgReports / 5) * 4);
    npcScore = moraleScore + reportVolume;
  }

  let managerScore = 0;
  const rel = ctx.managerRelationship;
  if (rel !== undefined) {
    // Trust level (0–100) contributes up to 4 pts
    const trustScore = Math.min(4, (rel.trust / 100) * 4);

    // Directive fulfilment rate contributes up to 3 pts
    const issued    = ctx.directivesIssued ?? 0;
    const fulfilled = ctx.directivesFulfilled ?? 0;
    const fulfilRate = issued > 0 ? fulfilled / issued : 0;
    const directiveScore = Math.min(3, fulfilRate * 3);

    managerScore = trustScore + directiveScore;
  }

  return npcScore + managerScore;
}

// ---------------------------------------------------------------------------
// Tier 5 scoring helper
// ---------------------------------------------------------------------------

/**
 * Returns a score modifier in the range [−10, +20] for tier 5 (Director) scouts.
 *
 * Directors are accountable for department-wide outcomes and board mandate delivery.
 *
 * Scoring:
 *  - Board directive completion (up to 12 pts, −10 pts for failures)
 *  - Department performance — NPC report volume and quality (up to 8 pts)
 */
function calculateTier5Bonus(ctx: TierReviewContext): number {
  let boardScore = 0;
  const directives = ctx.boardDirectives ?? [];

  if (directives.length > 0) {
    const completed = directives.filter((d) => d.completed).length;
    const failed    = directives.filter((d) => !d.completed).length;

    // Each completed directive: proportional share of the 12-pt pool
    const completionRate = completed / directives.length;
    const completionBonus = Math.round(completionRate * 12);

    // Each failed directive applies its own reputation penalty, scaled to
    // a score impact: sum the penalty fields and scale to ≤10 pts deduction
    const totalPenaltyField = directives
      .filter((d) => !d.completed)
      .reduce((sum, d) => sum + d.penaltyReputation, 0);
    const failurePenalty = failed > 0
      ? Math.min(10, Math.round(totalPenaltyField / 5))
      : 0;

    boardScore = completionBonus - failurePenalty;
  }

  let departmentScore = 0;
  const deptCount   = ctx.departmentReportCount ?? 0;
  const deptQuality = ctx.departmentAverageQuality ?? 0;

  // Department report count: target = 20 reports across NPC scouts (4 pts)
  const volumeScore  = Math.min(4, (deptCount / 20) * 4);
  // Department quality: target = avg quality 70 (4 pts)
  const qualScore    = Math.min(4, (deptQuality / 70) * 4);
  departmentScore    = volumeScore + qualScore;

  return boardScore + departmentScore;
}

// ---------------------------------------------------------------------------
// Job offer generation
// ---------------------------------------------------------------------------

/**
 * Generate plausible job offers for a scout at end-of-season or when their
 * reputation crosses a tier threshold.
 *
 * For tiers 3-5, philosophy alignment is preferred but not required — the
 * pool falls back to any club in the reputation band when an aligned-only
 * search returns nothing. Tier 4+ scouts receive a minimum of 1 offer even if
 * no perfectly-aligned club exists, reflecting the narrower market at the top.
 */
export function generateJobOffers(
  rng: RNG,
  scout: Scout,
  clubs: Record<string, Club>,
  season: number,
): JobOffer[] {
  const offers: JobOffer[] = [];

  const targetTier = determineTargetTier(scout);
  if (targetTier === null) return offers;

  // Try aligned clubs first; fall back to any club in the band for tier 3+
  let candidateClubs = filterCandidateClubs(clubs, scout, targetTier, true);
  if (candidateClubs.length === 0 && targetTier >= 3) {
    candidateClubs = filterCandidateClubs(clubs, scout, targetTier, false);
  }
  if (candidateClubs.length === 0) return offers;

  // Offer count:
  //   Tier 1-2: 1–3 offers scaled by reputation
  //   Tier 3:   1–2 offers (smaller market)
  //   Tier 4-5: exactly 1 offer (very limited openings at the top)
  const offerCount =
    targetTier >= 4 ? 1 :
    targetTier === 3 ? rng.nextInt(1, 2) :
    rng.nextInt(1, Math.min(3, Math.ceil(scout.reputation / 30)));

  const shuffled = rng.shuffle(candidateClubs).slice(0, offerCount);

  for (const club of shuffled) {
    offers.push(buildJobOffer(rng, club, scout, targetTier, season));
  }

  return offers;
}

function determineTargetTier(scout: Scout): CareerTier | null {
  const nextTier = (scout.careerTier + 1) as CareerTier;
  if (nextTier > 5) return null;

  const required = TIER_REPUTATION_REQUIREMENTS[nextTier];
  if (scout.reputation < required) return null;

  return nextTier;
}

/**
 * Filter clubs to candidates for a job offer.
 *
 * @param requirePhilosophyAlignment - When true only returns clubs whose
 *   scouting philosophy aligns with the scout's specialization. When false,
 *   returns any club in the reputation band (fallback for higher tiers).
 */
function filterCandidateClubs(
  clubs: Record<string, Club>,
  scout: Scout,
  targetTier: CareerTier,
  requirePhilosophyAlignment: boolean,
): Club[] {
  return Object.values(clubs).filter((club) => {
    // Club reputation window for the target tier.
    // Tiers 4-5 have a wider window because elite clubs span a broader prestige
    // range and there are far fewer of them in the world.
    const window = targetTier >= 4 ? 30 : 20;
    const repMin = Math.max(0, (targetTier - 1) * window - 10);
    const repMax = Math.min(100, targetTier * window);
    if (club.reputation < repMin || club.reputation > repMax) return false;

    if (!requirePhilosophyAlignment) return true;

    const affinitySpecs = PHILOSOPHY_SPEC_AFFINITY[club.scoutingPhilosophy];
    return affinitySpecs.includes(scout.primarySpecialization);
  });
}

function buildJobOffer(
  rng: RNG,
  club: Club,
  scout: Scout,
  tier: CareerTier,
  season: number,
): JobOffer {
  const band = SALARY_BANDS[tier];

  // Base salary within the band
  const baseSalary = tier === 1 ? 0 : rng.nextInt(band.min, band.max);

  // Reputation premium: higher rep → up to 20 % bonus within the band
  const repPremium =
    Math.round(((scout.reputation - 25) / 75) * (band.max - band.min) * 0.2);
  const salary = Math.min(band.max, baseSalary + Math.max(0, repPremium));

  const role = ROLE_TITLE_BY_SPEC[scout.primarySpecialization][tier];
  const contractLength = rng.nextInt(1, 3);
  const expiresWeek = rng.nextInt(35, 38); // Last weeks of the season

  return {
    id: `offer_${club.id}_s${season}_${rng.nextInt(1000, 9999)}`,
    clubId: club.id,
    tier,
    role,
    salary,
    contractLength,
    expiresWeek,
  };
}

// ---------------------------------------------------------------------------
// Accept job offer
// ---------------------------------------------------------------------------

/**
 * Apply an accepted job offer to the scout and return the updated Scout.
 * Does not mutate the input.
 */
export function acceptJobOffer(scout: Scout, offer: JobOffer): Scout {
  return {
    ...scout,
    careerTier: offer.tier,
    currentClubId: offer.clubId,
    contractEndSeason: (scout.specializationLevel /* proxy for current season */ + offer.contractLength),
    salary: offer.salary,
    clubTrust: 50, // Start with neutral trust at a new employer
    // Reset season-specific stats on new job
    reportsSubmitted: 0,
    successfulFinds: 0,
  };
}
