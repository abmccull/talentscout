import type {
  CareerTier,
  Club,
  FinancialRecord,
  PerformanceReview,
  Scout,
  ScoutContractObjectives,
  Specialization,
} from "../core/types";

export type CareerOperatingModel = "club" | "independent" | "agency";

export type CareerAuthorityLevel =
  | "advisory"
  | "portfolio"
  | "department"
  | "executive"
  | "owner";

export interface CareerEmployerNeed {
  id: string;
  label: string;
  reason: string;
  objectiveAdjustments: Partial<ScoutContractObjectives>;
}

export interface CareerFailureMode {
  id:
    | "briefFailure"
    | "trustFailure"
    | "coverageFailure"
    | "leadershipFailure"
    | "boardFailure"
    | "pipelineFailure"
    | "cashFailure"
    | "clientConcentration"
    | "qualityDebt"
    | "reputationExposure";
  label: string;
  consequence: string;
}

export interface CareerPromotionImplication {
  nextTier?: CareerTier;
  nextOperatingModel?: CareerOperatingModel;
  nextRole?: string;
  requirements: string[];
  changes: string[];
}

export interface CareerRoleProfile {
  operatingModel: CareerOperatingModel;
  tier: CareerTier;
  title: string;
  authorityLevel: CareerAuthorityLevel;
  responsibilities: string[];
  authorities: string[];
  failureModes: CareerFailureMode[];
  employerNeeds: CareerEmployerNeed[];
  minimumTrustForRole: number;
  promotion: CareerPromotionImplication;
}

const CLUB_ROLE_TITLES: Record<Specialization, Record<CareerTier, string>> = {
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

const SPECIALISM_LABEL: Record<Specialization, string> = {
  youth: "Youth",
  firstTeam: "First-Team",
  regional: "Regional",
  data: "Data",
};

const MINIMUM_CLUB_TRUST: Record<CareerTier, number> = {
  1: 0,
  2: 25,
  3: 35,
  4: 50,
  5: 65,
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function careerTierFromState(
  scout: Scout,
  finances?: FinancialRecord,
): CareerTier {
  return Math.max(
    scout.careerTier,
    scout.independentTier ?? 1,
    finances?.independentTier ?? 1,
  ) as CareerTier;
}

/**
 * Agency is an operating model derived from the established independent path.
 * No third save-state path is needed: tier, staff, office, and client contracts
 * already provide a durable authority for whether the player runs an agency.
 */
export function deriveCareerOperatingModel(
  scout: Scout,
  finances?: FinancialRecord,
): CareerOperatingModel {
  if (scout.careerPath === "club") return "club";

  const tier = careerTierFromState(scout, finances);
  const hasAgencyFootprint = (finances?.employees.length ?? 0) > 0
    || (finances?.office.tier ?? "home") !== "home"
    || (finances?.retainerContracts.some(
      (contract) => contract.status === "active" || contract.status === "suspended",
    ) ?? false);
  return tier >= 3 || hasAgencyFootprint ? "agency" : "independent";
}

export function getCareerRoleTitle(
  specialization: Specialization,
  tier: CareerTier,
  operatingModel: CareerOperatingModel,
): string {
  if (operatingModel === "club") {
    return CLUB_ROLE_TITLES[specialization][tier];
  }

  const specialism = SPECIALISM_LABEL[specialization];
  if (operatingModel === "independent") {
    return tier === 1
      ? `Freelance ${specialism} Scout`
      : `Independent ${specialism} Specialist`;
  }

  if (tier <= 3) return `Boutique ${specialism} Agency Principal`;
  if (tier === 4) return `${specialism} Scouting Agency Director`;
  return `Global ${specialism} Agency Principal`;
}

function philosophyNeed(club?: Club): CareerEmployerNeed {
  switch (club?.scoutingPhilosophy) {
    case "academyFirst":
      return {
        id: "protectPathway",
        label: "Protect the academy pathway",
        reason: "The club values early conviction, patient projection, and evidence that survives development setbacks.",
        objectiveAdjustments: {
          reportsPerSeason: -2,
          minimumAverageQuality: 4,
        },
      };
    case "winNow":
      return {
        id: "readyNowDecisions",
        label: "Deliver ready-now decisions",
        reason: "The manager needs recommendations that can influence the current squad rather than a distant pipeline.",
        objectiveAdjustments: {
          reportsPerSeason: 1,
          minimumAverageQuality: 1,
          successfulRecommendations: 1,
        },
      };
    case "marketSmart":
      return {
        id: "decisionValue",
        label: "Create decision and resale value",
        reason: "The club expects disciplined evidence, price awareness, and calls that protect limited recruitment capital.",
        objectiveAdjustments: {
          reportsPerSeason: 2,
          minimumAverageQuality: 3,
        },
      };
    case "globalRecruiter":
      return {
        id: "globalCoverage",
        label: "Expand the live talent map",
        reason: "The club expects broader coverage without losing the evidence standard needed to act across borders.",
        objectiveAdjustments: {
          reportsPerSeason: 4,
        },
      };
    default:
      return {
        id: "defensibleDecisions",
        label: "Deliver defensible recruitment decisions",
        reason: "The employer needs reliable reports, calibrated recommendations, and clear follow-through.",
        objectiveAdjustments: {},
      };
  }
}

function specializationNeed(specialization: Specialization): CareerEmployerNeed {
  switch (specialization) {
    case "youth":
      return {
        id: "projectionDiscipline",
        label: "Separate long-term upside from early noise",
        reason: "Youth judgments must remain useful after growth, role, and environment change.",
        objectiveAdjustments: {
          reportsPerSeason: -1,
          minimumAverageQuality: 2,
        },
      };
    case "firstTeam":
      return {
        id: "squadImpact",
        label: "Find players who solve a current squad problem",
        reason: "Ready-now work is judged by whether recommendations become credible first-team options.",
        objectiveAdjustments: {
          successfulRecommendations: 1,
        },
      };
    case "regional":
      return {
        id: "territoryCoverage",
        label: "Own the territory rather than sample it",
        reason: "Regional authority comes from repeat coverage, local context, and fewer blind spots.",
        objectiveAdjustments: {
          reportsPerSeason: 2,
        },
      };
    case "data":
      return {
        id: "analyticalProof",
        label: "Turn patterns into testable football judgments",
        reason: "Analytical work must improve the quality of a decision, not merely add more numbers.",
        objectiveAdjustments: {
          reportsPerSeason: -1,
          minimumAverageQuality: 3,
        },
      };
  }
}

export function deriveClubEmployerNeeds(
  specialization: Specialization,
  club?: Club,
): CareerEmployerNeed[] {
  const needs = [philosophyNeed(club), specializationNeed(specialization)];
  if (club && (club.scoutingBudget ?? Math.round(club.budget * 0.01)) < 100_000) {
    needs.push({
      id: "resourceDiscipline",
      label: "Protect a limited scouting budget",
      reason: "The club cannot afford broad, low-conviction work that does not narrow a decision.",
      objectiveAdjustments: {
        reportsPerSeason: -1,
        minimumAverageQuality: 2,
      },
    });
  }
  return needs;
}

export function deriveContractObjectivesForRole(input: {
  specialization: Specialization;
  tier: CareerTier;
  club?: Club;
  currentObjectives?: ScoutContractObjectives;
  reviewOutcome?: PerformanceReview["outcome"];
}): ScoutContractObjectives {
  const baseline: ScoutContractObjectives = {
    reportsPerSeason: 10 + input.tier * 5,
    minimumAverageQuality: 42 + input.tier * 7,
    successfulRecommendations: Math.max(1, input.tier - 1),
  };
  const needs = deriveClubEmployerNeeds(input.specialization, input.club);
  const needAdjusted = needs.reduce<ScoutContractObjectives>(
    (objectives, need) => ({
      reportsPerSeason:
        objectives.reportsPerSeason + (need.objectiveAdjustments.reportsPerSeason ?? 0),
      minimumAverageQuality:
        objectives.minimumAverageQuality + (need.objectiveAdjustments.minimumAverageQuality ?? 0),
      successfulRecommendations:
        objectives.successfulRecommendations
        + (need.objectiveAdjustments.successfulRecommendations ?? 0),
    }),
    baseline,
  );

  const renewalBlend = input.currentObjectives
    ? {
        reportsPerSeason: Math.round(
          input.currentObjectives.reportsPerSeason * 0.6
          + needAdjusted.reportsPerSeason * 0.4,
        ),
        minimumAverageQuality: Math.round(
          input.currentObjectives.minimumAverageQuality * 0.6
          + needAdjusted.minimumAverageQuality * 0.4,
        ),
        successfulRecommendations: Math.round(
          input.currentObjectives.successfulRecommendations * 0.6
          + needAdjusted.successfulRecommendations * 0.4,
        ),
      }
    : needAdjusted;

  const reviewAdjustment = input.reviewOutcome === "promoted"
    ? { reports: 1, quality: 1, recommendations: 0 }
    : input.reviewOutcome === "warning"
      ? { reports: -2, quality: -1, recommendations: 0 }
      : { reports: 0, quality: 0, recommendations: 0 };

  return {
    reportsPerSeason: clamp(
      renewalBlend.reportsPerSeason + reviewAdjustment.reports,
      8,
      40,
    ),
    minimumAverageQuality: clamp(
      renewalBlend.minimumAverageQuality + reviewAdjustment.quality,
      45,
      90,
    ),
    successfulRecommendations: clamp(
      renewalBlend.successfulRecommendations + reviewAdjustment.recommendations,
      1,
      8,
    ),
  };
}

function responsibilitiesFor(
  operatingModel: CareerOperatingModel,
  tier: CareerTier,
): string[] {
  if (operatingModel === "club") {
    if (tier <= 2) return [
      "Answer assigned briefs with defensible evidence",
      "Escalate genuine targets without flooding the decision room",
      "Build trust through reliable follow-through",
    ];
    if (tier === 3) return [
      "Own a territory or specialist pipeline",
      "Decide which cases deserve repeat observation",
      "Translate evidence into actionable recruitment advice",
    ];
    if (tier === 4) return [
      "Set staff priorities and quality-control delegated work",
      "Maintain manager trust while challenging weak assumptions",
      "Prevent coverage gaps across the department",
    ];
    return [
      "Deliver the board recruitment mandate",
      "Shape the club's scouting identity and resource allocation",
      "Own department-wide decision quality and succession",
    ];
  }

  if (operatingModel === "independent") {
    return tier === 1
      ? [
          "Find cases worth funding with your own time and travel",
          "Turn useful evidence into paid work",
          "Build a reputation one accountable call at a time",
        ]
      : [
          "Build repeat client relationships without surrendering independence",
          "Balance paid briefs with speculative discovery",
          "Protect enough cash and time to follow promising cases",
        ];
  }

  if (tier <= 3) return [
    "Win recurring clients without overpromising delivery",
    "Turn staff leads into reviewed agency work",
    "Protect runway while establishing a distinct market position",
  ];
  if (tier === 4) return [
    "Allocate scarce staff capacity across competing clients",
    "Diversify revenue without lowering evidence standards",
    "Develop staff before quality debt damages the agency name",
  ];
  return [
    "Set the agency's global identity and client strategy",
    "Protect the firm from concentration, succession, and reputation shocks",
    "Choose where scale adds authority and where it weakens judgment",
  ];
}

function authoritiesFor(
  operatingModel: CareerOperatingModel,
  tier: CareerTier,
): string[] {
  if (operatingModel === "club") {
    if (tier <= 2) return ["Recommend follow-up", "Submit a formal verdict"];
    if (tier === 3) return [
      "Prioritize a specialist pipeline",
      "Request deeper observation and contact work",
      "Advocate for recruitment action",
    ];
    if (tier === 4) return [
      "Assign staff and territories",
      "Set departmental evidence standards",
      "Challenge or endorse manager requests",
    ];
    return [
      "Set recruitment policy",
      "Allocate department resources",
      "Represent scouting decisions to the board",
    ];
  }

  if (operatingModel === "independent") {
    return [
      "Choose clients, markets, and case priorities",
      "Set report pricing and exclusivity",
      "Walk away from work that compromises the read",
    ];
  }

  return tier <= 3
    ? [
        "Hire and assign a small team",
        "Choose retainers and consulting work",
        "Set an operating posture for the agency",
      ]
    : [
        "Allocate staff and office capacity",
        "Choose strategic client concentration",
        "Set agency-wide delivery and growth posture",
      ];
}

function failureModesFor(
  operatingModel: CareerOperatingModel,
  tier: CareerTier,
): CareerFailureMode[] {
  if (operatingModel === "club") {
    const modes: CareerFailureMode[] = [
      {
        id: "briefFailure",
        label: "The work does not answer the club's actual need",
        consequence: "Objectives are missed even if report volume looks healthy.",
      },
      {
        id: "trustFailure",
        label: "Stakeholders stop trusting the judgment",
        consequence: "Low club trust reduces review standing and blocks senior authority.",
      },
    ];
    if (tier >= 3) modes.push({
      id: "coverageFailure",
      label: "The assigned market develops blind spots",
      consequence: "Narrow coverage weakens senior review scores and future offers.",
    });
    if (tier >= 4) modes.push({
      id: "leadershipFailure",
      label: "Delegated work creates more noise than judgment",
      consequence: "Staff performance and manager confidence become personal accountability.",
    });
    if (tier >= 5) modes.push({
      id: "boardFailure",
      label: "The department misses the board mandate",
      consequence: "Failed directives can outweigh strong individual scouting work.",
    });
    return modes;
  }

  if (operatingModel === "independent") {
    return [
      {
        id: "pipelineFailure",
        label: "Paid work dries up",
        consequence: "The scout must fund speculative cases without salary protection.",
      },
      {
        id: "cashFailure",
        label: "Travel and living costs consume the runway",
        consequence: "Short-term cash pressure forces weaker case and client choices.",
      },
      {
        id: "reputationExposure",
        label: "One bad public call damages a small book",
        consequence: "There is no employer brand to absorb an avoidable mistake.",
      },
    ];
  }

  return [
    {
      id: "cashFailure",
      label: "The agency runs out of operating runway",
      consequence: "Growth commitments become layoffs, debt, or a forced retreat.",
    },
    {
      id: "clientConcentration",
      label: "One client can destabilize the whole firm",
      consequence: "Losing the dominant account removes both revenue and market credibility.",
    },
    {
      id: "qualityDebt",
      label: "Committed work exceeds review capacity",
      consequence: "Fatigue, shallow evidence, and missed delivery compound across the team.",
    },
    {
      id: "reputationExposure",
      label: "Staff output carries the agency name",
      consequence: "Poor delegated work can damage every client relationship, not one report.",
    },
  ];
}

function authorityLevelFor(
  operatingModel: CareerOperatingModel,
  tier: CareerTier,
): CareerAuthorityLevel {
  if (operatingModel === "independent") return "owner";
  if (operatingModel === "agency") return tier >= 5 ? "executive" : "owner";
  if (tier >= 5) return "executive";
  if (tier >= 4) return "department";
  if (tier >= 3) return "portfolio";
  return "advisory";
}

function promotionFor(
  scout: Scout,
  operatingModel: CareerOperatingModel,
  tier: CareerTier,
): CareerPromotionImplication {
  if (tier >= 5) {
    return {
      requirements: ["Sustain elite judgment under the role's full pressure"],
      changes: ["Progression becomes legacy, succession, and career-defining decisions"],
    };
  }

  const nextTier = (tier + 1) as CareerTier;
  const nextOperatingModel = operatingModel === "independent" && nextTier >= 3
    ? "agency"
    : operatingModel;
  const requirements = operatingModel === "club"
    ? [
        "Earn a promotion-level season review",
        "Hold the qualification required for the next tier",
        `Maintain at least ${MINIMUM_CLUB_TRUST[nextTier]} club trust for the larger mandate`,
      ]
    : nextOperatingModel === "agency"
      ? [
          "Meet the next independent business milestone",
          "Hold the qualification required for the next tier",
          "Build a strategically healthy agency rather than scaling a fragile one",
        ]
      : [
          "Meet the next independent reputation, work, and cash milestone",
          "Hold the qualification required for the next tier",
        ];

  return {
    nextTier,
    nextOperatingModel,
    nextRole: getCareerRoleTitle(
      scout.primarySpecialization,
      nextTier,
      nextOperatingModel,
    ),
    requirements,
    changes: responsibilitiesFor(nextOperatingModel, nextTier).slice(0, 2),
  };
}

export function deriveCareerRoleProfile(input: {
  scout: Scout;
  finances?: FinancialRecord;
  club?: Club;
  tier?: CareerTier;
  operatingModel?: CareerOperatingModel;
}): CareerRoleProfile {
  const operatingModel = input.operatingModel
    ?? deriveCareerOperatingModel(input.scout, input.finances);
  const tier = input.tier ?? careerTierFromState(input.scout, input.finances);
  const employerNeeds = operatingModel === "club"
    ? deriveClubEmployerNeeds(input.scout.primarySpecialization, input.club)
    : operatingModel === "independent"
      ? [{
          id: "repeatDemand",
          label: "Turn trusted judgment into repeat demand",
          reason: "An independent career survives when useful work creates the next client conversation.",
          objectiveAdjustments: {},
        }]
      : [{
          id: "portfolioDurability",
          label: "Build a client portfolio the team can deliver",
          reason: "Agency growth only creates value when revenue, capacity, and standards remain aligned.",
          objectiveAdjustments: {},
        }];

  return {
    operatingModel,
    tier,
    title: getCareerRoleTitle(
      input.scout.primarySpecialization,
      tier,
      operatingModel,
    ),
    authorityLevel: authorityLevelFor(operatingModel, tier),
    responsibilities: responsibilitiesFor(operatingModel, tier),
    authorities: authoritiesFor(operatingModel, tier),
    failureModes: failureModesFor(operatingModel, tier),
    employerNeeds,
    minimumTrustForRole: operatingModel === "club" ? MINIMUM_CLUB_TRUST[tier] : 0,
    promotion: promotionFor(input.scout, operatingModel, tier),
  };
}

/**
 * Active club contracts make trust a real pressure rather than flavour text.
 * Legacy club saves without a normalized contract retain their previous review
 * behaviour until they accept or renew a canonical employment agreement.
 */
export function calculateClubRolePressurePenalty(
  scout: Scout,
  tier: CareerTier = scout.careerTier,
): number {
  if (
    scout.careerPath !== "club"
    || scout.employmentContract?.status !== "active"
  ) return 0;

  const deficit = MINIMUM_CLUB_TRUST[tier] - clamp(scout.clubTrust, 0, 100);
  if (deficit <= 0) return 0;
  return -Math.min(15, Math.max(1, Math.round(deficit * 0.5)));
}

export function getMinimumClubTrustForRole(tier: CareerTier): number {
  return MINIMUM_CLUB_TRUST[tier];
}
