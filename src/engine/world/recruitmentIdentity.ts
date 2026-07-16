/**
 * Explainable recruitment identities derived from authoritative world state.
 *
 * This module deliberately does not accept current or potential ability. Club
 * and regional behaviour is inferred from data the simulation can defend:
 * philosophy, academy investment, reputation, budget, roster ages, the active
 * brief, and the scout's authored report. A small seeded seasonal emphasis
 * creates run-to-run variation without allowing randomness to overwhelm need.
 */

import type {
  Club,
  ManagerProfile,
  Player,
  ScoutReport,
  ScoutingPhilosophy,
  Specialization,
  YouthBriefPriority,
  YouthRecruitmentBrief,
} from "@/engine/core/types";

export type RecruitmentFocus = YouthBriefPriority;

export type RegionRecruitmentArchetype =
  | "developmentCorridor"
  | "immediatePressureMarket"
  | "tradingMarket"
  | "internationalAccessHub";

export type ClubRecruitmentArchetype =
  | "academyBuilder"
  | "immediateImpact"
  | "valueTrader"
  | "crossBorderNetwork";

export type RecruitmentEvidencePreference = "live" | "data" | "network" | "balanced";
export type RecruitmentRiskTolerance = "low" | "medium" | "high";
export type RecruitmentReach = "local" | "regional" | "international" | "global";

/**
 * One authoritative, player-safe description of how a club recruits.
 *
 * Numeric traits are 0-100 and intentionally derive only from visible club,
 * manager, region, season, and run-seed facts. Consumers must not recreate
 * philosophy switches of their own; this contract keeps briefs, market bids,
 * tactical fit, development patience, and career affinity explainable.
 */
export interface ClubRecruitmentDoctrine {
  version: 1;
  clubId: string;
  archetype: ClubRecruitmentArchetype;
  preferredSeniorAgeRange: [number, number];
  academyIntakeAgeRange: [number, number];
  evidencePreference: RecruitmentEvidencePreference;
  riskTolerance: RecruitmentRiskTolerance;
  geographicReach: RecruitmentReach;
  adaptationTolerance: number;
  pathwayPatience: number;
  tacticalRoleRigidity: number;
  sellingPressure: number;
  managerInfluence: number;
  directorInfluence: number;
  minimumEvidenceQuality: number;
  seasonalObjective: RecruitmentFocus;
  specializationAffinity: Specialization[];
  reasons: string[];
}

export interface RegionRecruitmentIdentity {
  regionId: string;
  archetype: RegionRecruitmentArchetype;
  label: string;
  seasonalFocus: RecruitmentFocus;
  competitionIntensity: number;
  indicators: {
    clubCount: number;
    averageAcademyRating: number;
    averageReputation: number;
    youthRosterShare: number;
    dominantPhilosophy: ScoutingPhilosophy;
  };
  reasons: string[];
}

export interface ClubRecruitmentIdentity {
  clubId: string;
  archetype: ClubRecruitmentArchetype;
  label: string;
  primaryFocus: RecruitmentFocus;
  seasonalFocus: RecruitmentFocus;
  opportunityScore: number;
  doctrine: ClubRecruitmentDoctrine;
  reasons: string[];
  region?: RegionRecruitmentIdentity;
}

export interface RecruitmentIdentityFit {
  score: number;
  /** Bounded contribution to the existing brief-fit category. */
  adjustment: number;
  components: Record<"upside" | "readiness" | "value" | "adaptability" | "evidence", number>;
  reasons: string[];
}

type VisibleRosterPlayer = Pick<
  Player,
  "id" | "age" | "clubId" | "contractClubId"
>;

type VisibleCandidate = Pick<Player, "id" | "age" | "position" | "secondaryPositions">;

type AuthoredRecruitmentReport = Pick<
  ScoutReport,
  | "qualityScore"
  | "projectedRole"
  | "recommendedAction"
  | "estimatedWeeklyWage"
  | "riskFactors"
  | "categoryVerdicts"
  | "alternativePlayerIds"
>;

const PHILOSOPHY_ORDER: ScoutingPhilosophy[] = [
  "academyFirst",
  "winNow",
  "marketSmart",
  "globalRecruiter",
];

const FOCUS_ORDER: RecruitmentFocus[] = [
  "highCeiling",
  "earlyReadiness",
  "resale",
  "character",
];

const ARCHETYPE_BY_PHILOSOPHY: Record<ScoutingPhilosophy, ClubRecruitmentArchetype> = {
  academyFirst: "academyBuilder",
  winNow: "immediateImpact",
  marketSmart: "valueTrader",
  globalRecruiter: "crossBorderNetwork",
};

const PRIMARY_FOCUS_BY_PHILOSOPHY: Record<ScoutingPhilosophy, RecruitmentFocus> = {
  academyFirst: "highCeiling",
  winNow: "earlyReadiness",
  marketSmart: "resale",
  globalRecruiter: "character",
};

interface DoctrineBase {
  preferredSeniorAgeRange: [number, number];
  academyIntakeAgeRange: [number, number];
  evidencePreference: RecruitmentEvidencePreference;
  riskTolerance: RecruitmentRiskTolerance;
  geographicReach: RecruitmentReach;
  adaptationTolerance: number;
  pathwayPatience: number;
  tacticalRoleRigidity: number;
  sellingPressure: number;
  managerInfluence: number;
  specializationAffinity: Specialization[];
}

const DOCTRINE_BASES: Record<ScoutingPhilosophy, DoctrineBase> = {
  academyFirst: {
    preferredSeniorAgeRange: [17, 23],
    academyIntakeAgeRange: [14, 16],
    evidencePreference: "live",
    riskTolerance: "high",
    geographicReach: "regional",
    adaptationTolerance: 62,
    pathwayPatience: 86,
    tacticalRoleRigidity: 38,
    sellingPressure: 34,
    managerInfluence: 44,
    specializationAffinity: ["youth", "regional"],
  },
  winNow: {
    preferredSeniorAgeRange: [24, 31],
    academyIntakeAgeRange: [16, 17],
    evidencePreference: "live",
    riskTolerance: "low",
    geographicReach: "international",
    adaptationTolerance: 36,
    pathwayPatience: 22,
    tacticalRoleRigidity: 78,
    sellingPressure: 18,
    managerInfluence: 72,
    specializationAffinity: ["firstTeam", "data"],
  },
  marketSmart: {
    preferredSeniorAgeRange: [21, 27],
    academyIntakeAgeRange: [15, 17],
    evidencePreference: "data",
    riskTolerance: "medium",
    geographicReach: "international",
    adaptationTolerance: 58,
    pathwayPatience: 61,
    tacticalRoleRigidity: 45,
    sellingPressure: 88,
    managerInfluence: 38,
    specializationAffinity: ["data", "regional", "firstTeam"],
  },
  globalRecruiter: {
    preferredSeniorAgeRange: [19, 29],
    academyIntakeAgeRange: [14, 17],
    evidencePreference: "network",
    riskTolerance: "medium",
    geographicReach: "global",
    adaptationTolerance: 84,
    pathwayPatience: 54,
    tacticalRoleRigidity: 34,
    sellingPressure: 55,
    managerInfluence: 48,
    specializationAffinity: ["regional", "data", "firstTeam"],
  },
};

const CLUB_LABELS: Record<ClubRecruitmentArchetype, string> = {
  academyBuilder: "Academy builder",
  immediateImpact: "Immediate-impact recruiter",
  valueTrader: "Value trader",
  crossBorderNetwork: "Cross-border network",
};

const REGION_LABELS: Record<RegionRecruitmentArchetype, string> = {
  developmentCorridor: "Development corridor",
  immediatePressureMarket: "Immediate-pressure market",
  tradingMarket: "Trading market",
  internationalAccessHub: "International access hub",
};

const FOCUS_LABELS: Record<RecruitmentFocus, string> = {
  highCeiling: "long-term ceiling",
  earlyReadiness: "early readiness",
  resale: "value protection",
  character: "adaptability and character",
};

const CONFIDENCE_SCORE = { low: 30, medium: 66, high: 92 } as const;

function clamp(value: number, minimum = 0, maximum = 100): number {
  return Math.max(minimum, Math.min(maximum, Math.round(value)));
}

/** Stable unsigned 32-bit hash used only for deterministic tie-breaking. */
function hashSeed(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function seededUnit(seed: string): number {
  return hashSeed(seed) / 0x100000000;
}

function boundedSeasonalTrait(base: number, seed: string): number {
  return clamp(base + (seededUnit(seed) * 2 - 1) * 7);
}

export function getPhilosophyPreferredAgeRange(
  philosophy: ScoutingPhilosophy,
): [number, number] {
  return [...DOCTRINE_BASES[philosophy].preferredSeniorAgeRange];
}

export function getPhilosophyAcademyIntakeAgeRange(
  philosophy: ScoutingPhilosophy,
): [number, number] {
  return [...DOCTRINE_BASES[philosophy].academyIntakeAgeRange];
}

export function getPhilosophySpecializationAffinity(
  philosophy: ScoutingPhilosophy,
): Specialization[] {
  return [...DOCTRINE_BASES[philosophy].specializationAffinity];
}

/** Build the canonical recruitment doctrine used by every club-facing system. */
export function deriveClubRecruitmentDoctrine(input: {
  club: Club;
  seed: string;
  season: number;
  region?: RegionRecruitmentIdentity;
  manager?: ManagerProfile;
  seasonalObjective?: RecruitmentFocus;
}): ClubRecruitmentDoctrine {
  const { club } = input;
  const base = DOCTRINE_BASES[club.scoutingPhilosophy];
  const seedPrefix = `${input.seed}:${club.id}:s${input.season}:doctrine`;
  const seasonalObjective = input.seasonalObjective ?? weightedSeededPick(
    `${seedPrefix}:objective`,
    FOCUS_ORDER.map((focus) => ({
      value: focus,
      weight:
        focus === PRIMARY_FOCUS_BY_PHILOSOPHY[club.scoutingPhilosophy] ? 5
        : focus === input.region?.seasonalFocus ? 2.5
        : 1,
    })),
  );
  const managerSignal = input.manager
    ? Math.round((input.manager.reportInfluence - 0.5) * 24)
    : 0;
  const managerInfluence = clamp(
    boundedSeasonalTrait(base.managerInfluence, `${seedPrefix}:manager`) + managerSignal,
  );
  const directorInfluence = clamp(100 - managerInfluence);
  const minimumEvidenceQuality = clamp(
    38
      + club.reputation * 0.22
      + club.youthAcademyRating * 0.65
      + (base.riskTolerance === "low" ? 8 : base.riskTolerance === "high" ? -4 : 2),
    45,
    82,
  );

  return {
    version: 1,
    clubId: club.id,
    archetype: ARCHETYPE_BY_PHILOSOPHY[club.scoutingPhilosophy],
    preferredSeniorAgeRange: [...base.preferredSeniorAgeRange],
    academyIntakeAgeRange: [...base.academyIntakeAgeRange],
    evidencePreference: base.evidencePreference,
    riskTolerance: base.riskTolerance,
    geographicReach: base.geographicReach,
    adaptationTolerance: boundedSeasonalTrait(base.adaptationTolerance, `${seedPrefix}:adaptation`),
    pathwayPatience: boundedSeasonalTrait(base.pathwayPatience, `${seedPrefix}:patience`),
    tacticalRoleRigidity: boundedSeasonalTrait(base.tacticalRoleRigidity, `${seedPrefix}:roles`),
    sellingPressure: boundedSeasonalTrait(base.sellingPressure, `${seedPrefix}:selling`),
    managerInfluence,
    directorInfluence,
    minimumEvidenceQuality,
    seasonalObjective,
    specializationAffinity: [...base.specializationAffinity],
    reasons: [
      `${CLUB_LABELS[ARCHETYPE_BY_PHILOSOPHY[club.scoutingPhilosophy]]} doctrine favours ages ${base.preferredSeniorAgeRange[0]}-${base.preferredSeniorAgeRange[1]} and ${base.evidencePreference} evidence.`,
      `${base.pathwayPatience >= 70 ? "Patient" : base.pathwayPatience <= 35 ? "Immediate" : "Balanced"} pathway expectations sit alongside ${base.geographicReach} recruitment reach.`,
      `${managerInfluence >= directorInfluence ? "The manager" : "The recruitment leadership"} currently has the stronger voice; this season emphasises ${FOCUS_LABELS[seasonalObjective]}.`,
    ],
  };
}

/** 0-100 fit against the doctrine's preferred senior age window. */
export function scoreDoctrineAgeFit(age: number, doctrine: ClubRecruitmentDoctrine): number {
  const [minimum, maximum] = doctrine.preferredSeniorAgeRange;
  if (age >= minimum && age <= maximum) return 100;
  const yearsOutside = age < minimum ? minimum - age : age - maximum;
  return clamp(100 - yearsOutside * 5);
}

function weightedSeededPick<T extends string>(
  seed: string,
  entries: ReadonlyArray<{ value: T; weight: number }>,
): T {
  const total = entries.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0);
  if (total <= 0) return entries[0].value;
  let cursor = seededUnit(seed) * total;
  for (const entry of entries) {
    cursor -= Math.max(0, entry.weight);
    if (cursor <= 0) return entry.value;
  }
  return entries[entries.length - 1].value;
}

function ownedByRegion(
  player: VisibleRosterPlayer,
  clubIds: ReadonlySet<string>,
): boolean {
  return clubIds.has(player.contractClubId ?? player.clubId);
}

function dominantPhilosophy(clubs: readonly Club[]): ScoutingPhilosophy {
  const counts = Object.fromEntries(
    PHILOSOPHY_ORDER.map((philosophy) => [philosophy, 0]),
  ) as Record<ScoutingPhilosophy, number>;
  for (const club of clubs) counts[club.scoutingPhilosophy]++;
  return [...PHILOSOPHY_ORDER].sort((left, right) =>
    counts[right] - counts[left]
    || PHILOSOPHY_ORDER.indexOf(left) - PHILOSOPHY_ORDER.indexOf(right)
  )[0];
}

/**
 * Derive a region's current recruitment character from its clubs and roster.
 * Close archetype races receive at most six seeded points of seasonal jitter;
 * the underlying state remains the dominant signal.
 */
export function deriveRegionRecruitmentIdentity(input: {
  regionId: string;
  clubs: readonly Club[];
  players: Record<string, VisibleRosterPlayer>;
  seed: string;
  season: number;
}): RegionRecruitmentIdentity {
  const clubs = [...input.clubs].sort((left, right) => left.id.localeCompare(right.id));
  if (clubs.length === 0) {
    return {
      regionId: input.regionId,
      archetype: "developmentCorridor",
      label: REGION_LABELS.developmentCorridor,
      seasonalFocus: "highCeiling",
      competitionIntensity: 0,
      indicators: {
        clubCount: 0,
        averageAcademyRating: 0,
        averageReputation: 0,
        youthRosterShare: 0,
        dominantPhilosophy: "academyFirst",
      },
      reasons: ["No active clubs are available, so the region has no live recruitment pressure."],
    };
  }

  const clubIds = new Set(clubs.map((club) => club.id));
  const roster = Object.values(input.players).filter((player) => ownedByRegion(player, clubIds));
  const averageAcademyRating = clubs.reduce((sum, club) => sum + club.youthAcademyRating, 0)
    / clubs.length;
  const averageReputation = clubs.reduce((sum, club) => sum + club.reputation, 0)
    / clubs.length;
  const youthRosterShare = roster.length > 0
    ? roster.filter((player) => player.age <= 21).length / roster.length
    : 0;
  const philosophyShares = Object.fromEntries(PHILOSOPHY_ORDER.map((philosophy) => [
    philosophy,
    clubs.filter((club) => club.scoutingPhilosophy === philosophy).length / clubs.length,
  ])) as Record<ScoutingPhilosophy, number>;

  const baseScores: Record<RegionRecruitmentArchetype, number> = {
    developmentCorridor:
      averageAcademyRating * 2.2
      + philosophyShares.academyFirst * 38
      + youthRosterShare * 28,
    immediatePressureMarket:
      averageReputation * 0.42
      + philosophyShares.winNow * 42
      + (1 - youthRosterShare) * 16,
    tradingMarket:
      philosophyShares.marketSmart * 58
      + averageAcademyRating * 1.2
      + youthRosterShare * 18,
    internationalAccessHub:
      philosophyShares.globalRecruiter * 60
      + averageReputation * 0.24
      + youthRosterShare * 14,
  };
  const archetypes = Object.keys(baseScores) as RegionRecruitmentArchetype[];
  const archetype = [...archetypes].sort((left, right) => {
    const leftScore = baseScores[left]
      + seededUnit(`${input.seed}:${input.regionId}:s${input.season}:${left}`) * 6;
    const rightScore = baseScores[right]
      + seededUnit(`${input.seed}:${input.regionId}:s${input.season}:${right}`) * 6;
    return rightScore - leftScore || left.localeCompare(right);
  })[0];
  const dominant = dominantPhilosophy(clubs);
  const archetypeFocus: Record<RegionRecruitmentArchetype, RecruitmentFocus> = {
    developmentCorridor: "highCeiling",
    immediatePressureMarket: "earlyReadiness",
    tradingMarket: "resale",
    internationalAccessHub: "character",
  };
  const seasonalFocus = weightedSeededPick(
    `${input.seed}:${input.regionId}:s${input.season}:focus`,
    FOCUS_ORDER.map((focus) => ({
      value: focus,
      weight:
        focus === archetypeFocus[archetype] ? 5
        : focus === PRIMARY_FOCUS_BY_PHILOSOPHY[dominant] ? 3
        : 1,
    })),
  );
  const competitionIntensity = clamp(
    clubs.length * 4
    + averageReputation * 0.45
    + Math.max(...Object.values(philosophyShares)) * 20,
  );

  return {
    regionId: input.regionId,
    archetype,
    label: REGION_LABELS[archetype],
    seasonalFocus,
    competitionIntensity,
    indicators: {
      clubCount: clubs.length,
      averageAcademyRating: Math.round(averageAcademyRating * 10) / 10,
      averageReputation: Math.round(averageReputation * 10) / 10,
      youthRosterShare: Math.round(youthRosterShare * 100) / 100,
      dominantPhilosophy: dominant,
    },
    reasons: [
      `${clubs.length} clubs average ${averageAcademyRating.toFixed(1)}/20 for academy investment and ${averageReputation.toFixed(1)}/100 reputation.`,
      `${Math.round(youthRosterShare * 100)}% of registered players are 21 or younger; ${dominant.replace(/([A-Z])/g, " $1").toLowerCase()} is the most common club philosophy.`,
      `This season's market emphasis is ${FOCUS_LABELS[seasonalFocus]}.`,
    ],
  };
}

/** Derive a club's live identity and its priority for receiving a new brief. */
export function deriveClubRecruitmentIdentity(input: {
  club: Club;
  players: Record<string, VisibleRosterPlayer>;
  seed: string;
  season: number;
  region?: RegionRecruitmentIdentity;
  manager?: ManagerProfile;
}): ClubRecruitmentIdentity {
  const { club, region } = input;
  const archetype = ARCHETYPE_BY_PHILOSOPHY[club.scoutingPhilosophy];
  const primaryFocus = PRIMARY_FOCUS_BY_PHILOSOPHY[club.scoutingPhilosophy];
  const seasonalFocus = weightedSeededPick(
    `${input.seed}:${club.id}:s${input.season}:focus`,
    FOCUS_ORDER.map((focus) => ({
      value: focus,
      weight:
        focus === primaryFocus ? 5
        : focus === region?.seasonalFocus ? 2.5
        : 1,
    })),
  );
  const squad = Object.values(input.players).filter(
    (player) => (player.contractClubId ?? player.clubId) === club.id,
  );
  const youthCount = squad.filter((player) => player.age <= 20).length;
  const averageAge = squad.length > 0
    ? squad.reduce((sum, player) => sum + player.age, 0) / squad.length
    : 24;
  const depthNeed = clamp(100 - youthCount * 11);
  const successionNeed = clamp(45 + (averageAge - 24) * 8);
  const academyCapacity = clamp((club.youthAcademyRating - 1) / 19 * 100);
  const regionAlignment = !region
    ? 50
    : region.seasonalFocus === seasonalFocus
      ? 78
      : region.seasonalFocus === primaryFocus
        ? 65
        : 42;
  const opportunityScore = clamp(
    depthNeed * 0.35
    + successionNeed * 0.2
    + academyCapacity * 0.25
    + regionAlignment * 0.12
    + seededUnit(`${input.seed}:${club.id}:s${input.season}:opportunity`) * 8,
  );
  const doctrine = deriveClubRecruitmentDoctrine({
    club,
    seed: input.seed,
    season: input.season,
    region,
    manager: input.manager,
    seasonalObjective: seasonalFocus,
  });

  return {
    clubId: club.id,
    archetype,
    label: CLUB_LABELS[archetype],
    primaryFocus,
    seasonalFocus,
    opportunityScore,
    doctrine,
    region,
    reasons: [
      `${club.name} has ${youthCount} registered players aged 20 or younger and a ${club.youthAcademyRating}/20 academy.`,
      `The registered squad's average age is ${averageAge.toFixed(1)}, producing ${depthNeed >= successionNeed ? "a depth need" : "succession pressure"}.`,
      `${CLUB_LABELS[archetype]} priorities make ${FOCUS_LABELS[seasonalFocus]} the current emphasis${region ? ` within a ${region.label.toLowerCase()}` : ""}.`,
    ],
  };
}

/**
 * Reconstruct the identity expressed by a persisted brief. This keeps club
 * decisions stable across save/reload: the brief, rather than mutable roster
 * state, is the authority once an opportunity has been issued.
 */
export function deriveBriefRecruitmentIdentity(
  club: Club,
  brief: YouthRecruitmentBrief,
): ClubRecruitmentIdentity {
  const archetype = ARCHETYPE_BY_PHILOSOPHY[club.scoutingPhilosophy];
  const doctrine = deriveClubRecruitmentDoctrine({
    club,
    seed: brief.id,
    season: brief.createdSeason,
    seasonalObjective: brief.developmentPriority,
  });
  return {
    clubId: club.id,
    archetype,
    label: CLUB_LABELS[archetype],
    primaryFocus: PRIMARY_FOCUS_BY_PHILOSOPHY[club.scoutingPhilosophy],
    seasonalFocus: brief.developmentPriority,
    opportunityScore: 0,
    doctrine,
    reasons: [
      `${CLUB_LABELS[archetype]} priorities are expressed in this brief through ${FOCUS_LABELS[brief.developmentPriority]}.`,
    ],
  };
}

function confidenceFor(
  report: AuthoredRecruitmentReport,
  category: "potential" | "roleFit" | "characterRisk",
): number {
  const confidence = report.categoryVerdicts?.[category]?.confidence;
  return confidence ? CONFIDENCE_SCORE[confidence] : 15;
}

function weightsFor(identity: ClubRecruitmentIdentity): RecruitmentIdentityFit["components"] {
  const weights: RecruitmentIdentityFit["components"] = {
    upside: 15,
    readiness: 15,
    value: 15,
    adaptability: 15,
    evidence: 20,
  };
  const primaryComponent = {
    highCeiling: "upside",
    earlyReadiness: "readiness",
    resale: "value",
    character: "adaptability",
  }[identity.primaryFocus] as keyof typeof weights;
  const seasonalComponent = {
    highCeiling: "upside",
    earlyReadiness: "readiness",
    resale: "value",
    character: "adaptability",
  }[identity.seasonalFocus] as keyof typeof weights;
  weights[primaryComponent] += 20;
  weights[seasonalComponent] += 15;
  return weights;
}

/**
 * Score a candidate using only the persisted brief and authored evidence.
 * Different identities reward different strengths, so a candidate can be a
 * strong match for one club and a poor one for another without changing truth.
 */
export function evaluateRecruitmentIdentityFit(input: {
  identity: ClubRecruitmentIdentity;
  candidate: VisibleCandidate;
  report: AuthoredRecruitmentReport;
  brief: YouthRecruitmentBrief;
  observationContextCount: number;
}): RecruitmentIdentityFit {
  const { identity, candidate, report, brief } = input;
  const potentialConfidence = confidenceFor(report, "potential");
  const roleConfidence = confidenceFor(report, "roleFit");
  const characterConfidence = confidenceFor(report, "characterRisk");
  const roleMatch = !brief.preferredRole || report.projectedRole === brief.preferredRole;
  const actionStrength = report.recommendedAction === "offerAcademyPlace"
    ? 100
    : report.recommendedAction === "inviteForTrial"
      ? 65
      : 25;
  const ageHeadroom = clamp((brief.maxAge - candidate.age + 1) * 28);
  const wage = report.estimatedWeeklyWage;
  const affordability = typeof wage === "number" && Number.isFinite(wage)
    ? clamp(brief.weeklyWageBudget / Math.max(1, wage) * 100)
    : 0;
  const comparisonDiscipline = clamp((report.alternativePlayerIds?.length ?? 0) * 34);
  const riskDisclosure = clamp(Math.min(3, report.riskFactors?.length ?? 0) * 30);
  const contextBreadth = clamp(input.observationContextCount * 28);
  const averageConfidence = (potentialConfidence + roleConfidence + characterConfidence) / 3;

  const components: RecruitmentIdentityFit["components"] = {
    upside: clamp(potentialConfidence * 0.72 + ageHeadroom * 0.28),
    readiness: clamp(roleConfidence * 0.45 + (roleMatch ? 30 : 5) + actionStrength * 0.25),
    value: clamp(affordability * 0.55 + comparisonDiscipline * 0.25 + potentialConfidence * 0.2),
    adaptability: clamp(
      characterConfidence * 0.52 + contextBreadth * 0.28 + riskDisclosure * 0.2,
    ),
    evidence: clamp(report.qualityScore * 0.55 + averageConfidence * 0.45),
  };
  const weights = weightsFor(identity);
  const totalWeight = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  const score = clamp(
    (Object.keys(components) as Array<keyof typeof components>)
      .reduce((sum, component) => sum + components[component] * weights[component], 0)
      / totalWeight,
  );
  const adjustment = clamp(Math.round((score - 55) * 0.36), -16, 16);
  const ranked = (Object.entries(components) as Array<[keyof typeof components, number]>)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  const strongest = ranked[0];
  const weakest = ranked[ranked.length - 1];
  const componentLabel = (component: keyof typeof components): string => ({
    upside: "ceiling evidence",
    readiness: "role readiness",
    value: "value discipline",
    adaptability: "adaptability evidence",
    evidence: "overall evidence quality",
  })[component];

  return {
    score,
    adjustment,
    components,
    reasons: [
      `${identity.label} fit ${score}/100 (${adjustment >= 0 ? "+" : ""}${adjustment} brief fit): this brief prioritises ${FOCUS_LABELS[identity.seasonalFocus]}.`,
      `Strongest: ${componentLabel(strongest[0])} ${strongest[1]}/100. Weakest: ${componentLabel(weakest[0])} ${weakest[1]}/100.`,
    ],
  };
}
